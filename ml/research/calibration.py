"""Offline RF calibration audit on an existing, untouched experiment split.

This never replaces the active model or application policy. The validation
partition is split again: earlier days (or disjoint users) fit calibrators;
the remaining validation rows select method/threshold; test is measured once.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
    confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score)


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def split_validation(frame, strategy):
    if strategy not in ('chronological', 'employee-disjoint', 'future-unseen-employee'):
        raise ValueError('Unknown experiment split strategy.')
    key = 'date' if strategy in ('chronological', 'future-unseen-employee') else 'user_id'
    values = sorted(frame[key].unique())
    if len(values) < 4:
        raise ValueError('Calibration requires at least four validation dates/users.')
    first = frame[frame[key].isin(values[:len(values)//2])].copy()
    second = frame[frame[key].isin(values[len(values)//2:])].copy()
    if len(first) < 10 or len(second) < 10 or min(first.label.value_counts().reindex([0, 1], fill_value=0)) < 5 or min(second.label.value_counts().reindex([0, 1], fill_value=0)) < 5:
        raise ValueError('Calibration-fit and selection partitions each need ten rows and at least five examples per class.')
    return first, second


def fit_candidates(scores, labels):
    scores = np.asarray(scores, dtype=float)
    labels = np.asarray(labels, dtype=int)
    if len(scores) < 10 or len(scores) != len(labels) or not np.isfinite(scores).all() or ((scores < 0) | (scores > 1)).any():
        raise ValueError('Need at least ten finite RF positive-class scores in [0,1].')
    if min(np.bincount(labels, minlength=2)[:2]) < 5 or not set(labels).issubset({0, 1}):
        raise ValueError('Calibration-fit data must contain at least five examples from both classes.')
    sigmoid = LogisticRegression(random_state=0, solver='lbfgs').fit(scores.reshape(-1, 1), labels)
    isotonic = IsotonicRegression(out_of_bounds='clip').fit(scores, labels)
    return {'sigmoid': sigmoid, 'isotonic': isotonic}


def transform(model, method, scores):
    scores = np.asarray(scores, dtype=float)
    if not np.isfinite(scores).all() or ((scores < 0) | (scores > 1)).any():
        raise ValueError('Invalid uncalibrated RF scores.')
    values = model.predict_proba(scores.reshape(-1, 1))[:, 1] if method == 'sigmoid' else model.predict(scores)
    return np.clip(values, 0, 1)


def measure(labels, scores, threshold):
    labels, scores = np.asarray(labels, dtype=int), np.asarray(scores, dtype=float)
    if set(labels) != {0, 1}:
        raise ValueError('Evaluation requires positive and negative labels.')
    if not np.isfinite(scores).all() or ((scores < 0) | (scores > 1)).any():
        raise ValueError('Evaluation scores must be finite in [0,1].')
    predicted = (scores >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(labels, predicted, labels=[0, 1]).ravel()
    bins = np.minimum((scores * 10).astype(int), 9)
    reliability = [{'bin': i, 'count': int((bins == i).sum()),
                    'mean_score': float(scores[bins == i].mean()),
                    'positive_rate': float(labels[bins == i].mean())}
                   for i in range(10) if (bins == i).any()]
    return {'positives': int(labels.sum()), 'negatives': int(len(labels)-labels.sum()),
            'precision': float(precision_score(labels, predicted, zero_division=0)),
            'recall': float(recall_score(labels, predicted, zero_division=0)),
            'f1': float(f1_score(labels, predicted, zero_division=0)),
            'average_precision': float(average_precision_score(labels, scores)),
            'roc_auc': float(roc_auc_score(labels, scores)),
            'fpr': float(fp/(fp+tn)), 'fnr': float(fn/(fn+tp)),
            'confusion': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)},
            'brier': float(brier_score_loss(labels, scores)), 'reliability_bins': reliability}


def run(experiment_dir, output_dir, *, model_name='enhanced', max_validation_fpr=None):
    experiment, output = Path(experiment_dir), Path(output_dir)
    if output.exists():
        raise ValueError('Choose a new output directory.')
    config = json.loads((experiment / 'experiment-config.json').read_text(encoding='utf-8'))
    split_path = experiment / 'split-manifest.csv'
    if not config.get('split_manifest_sha256') or _sha(split_path) != config['split_manifest_sha256']:
        raise ValueError('Split manifest checksum is missing or mismatched; rerun the experiment before calibration.')
    source = Path(config['input'])
    if not source.is_file() or _sha(source) != config['input_sha256']:
        raise ValueError('Original experiment input is unavailable or changed.')
    model_dir = experiment / model_name
    metadata = json.loads((model_dir / 'multi_source_model_metadata.json').read_text(encoding='utf-8'))
    model_path = model_dir / 'multi_source_ueba_rf.joblib'
    if _sha(model_path) != metadata['model_artifact_sha256']:
        raise ValueError('Model artifact checksum mismatch.')
    features = json.loads((model_dir / 'multi_source_feature_schema.json').read_text(encoding='utf-8'))['feature_names']
    frame = pd.read_csv(source)
    membership = pd.read_csv(split_path)
    if membership.duplicated(['user_id', 'date']).any() or frame.duplicated(['user_id', 'date']).any():
        raise ValueError('Duplicate split or input user-day keys.')
    if not {'train', 'validation', 'test'}.issubset(set(membership.split)) or not set(membership.split).issubset({'train', 'validation', 'test', 'excluded'}):
        raise ValueError('Incomplete split manifest.')
    joined = frame.merge(membership, on=['user_id', 'date', 'label'], how='outer', validate='one_to_one', indicator=True)
    if not joined['_merge'].eq('both').all():
        raise ValueError('Split labels or membership do not match the original input.')
    validation, test = (joined[joined.split == name].copy() for name in ('validation', 'test'))
    fit, selection = split_validation(validation, config['split_strategy'])
    model = joblib.load(model_path)  # trusted local artifacts only
    if not hasattr(model, 'predict_proba') or 1 not in model.classes_:
        raise ValueError('Saved model lacks a positive-class probability output.')
    def raw(part):
        values = model.predict_proba(part[features])[:, list(model.classes_).index(1)]
        if not np.isfinite(values).all() or ((values < 0) | (values > 1)).any():
            raise ValueError('Saved model returned invalid positive-class scores.')
        return values
    fit_raw, selection_raw, test_raw = raw(fit), raw(selection), raw(test)
    candidates = fit_candidates(fit_raw, fit.label)
    selected_scores = {method: transform(candidate, method, selection_raw) for method, candidate in candidates.items()}
    selection_brier = {method: float(brier_score_loss(selection.label, values)) for method, values in selected_scores.items()}
    selected = min(selection_brier, key=lambda method: (selection_brier[method], method))
    if max_validation_fpr is not None and (not np.isfinite(max_validation_fpr) or max_validation_fpr < 0 or max_validation_fpr > 1):
        raise ValueError('max-validation-fpr must be between 0 and 1.')
    threshold_grid = np.linspace(.01, 1.0, 100)
    eligible = [value for value in threshold_grid if max_validation_fpr is None or
        float(((selected_scores[selected] >= value) & (selection.label.to_numpy() == 0)).sum()) /
        float((selection.label == 0).sum()) <= max_validation_fpr]
    if not eligible:
        raise ValueError('No validation threshold satisfies the declared false-positive constraint.')
    threshold = float(max(eligible, key=lambda value: (f1_score(selection.label, selected_scores[selected] >= value, zero_division=0), value)))
    test_calibrated = transform(candidates[selected], selected, test_raw)
    baseline = np.full(len(test), float(fit.label.mean()))
    report = {'created_at_utc': datetime.now(timezone.utc).isoformat(),
              'synthetic': config['synthetic'], 'scientific_validation': False,
              'source_experiment': str(experiment.resolve()), 'input_sha256': config['input_sha256'],
              'model_artifact_sha256': _sha(model_path), 'split_manifest_sha256': _sha(experiment / 'split-manifest.csv'),
              'model_name': model_name, 'features': features, 'split_strategy': config['split_strategy'],
              'calibration_fit_rows': len(fit), 'selection_rows': len(selection), 'test_rows': len(test),
              'selection_brier': selection_brier, 'selected_method': selected,
              'selected_threshold': threshold,
              'max_validation_fpr': max_validation_fpr,
              'threshold_objective': 'Highest validation-selection F1 on grid .01..1.00, optionally subject to a declared maximum false-positive rate; higher threshold breaks ties. This is research-only; operational policy unchanged.',
              'test': {'uncalibrated_rf': measure(test.label, test_raw, threshold),
                       'selected_calibration': measure(test.label, test_calibrated, threshold),
                       'constant_training_prevalence': measure(test.label, baseline, threshold)},
              'limitations': 'Research use requires independently verified labels and source mapping. The RF score is a positive-class vote estimate, not validated calibration. No active model or policy was changed.'}
    output.mkdir(parents=True)
    joblib.dump(candidates[selected], output / 'calibrator.joblib')
    test[['user_id', 'date', 'label']].assign(raw_rf_score=test_raw, calibrated_probability=test_calibrated,
        baseline_probability=baseline, predicted=(test_calibrated >= threshold).astype(int)).to_csv(output / 'test-predictions.csv', index=False)
    fit[['user_id', 'date', 'label']].assign(raw_rf_score=fit_raw).to_csv(output / 'calibration-fit.csv', index=False)
    selection[['user_id', 'date', 'label']].assign(raw_rf_score=selection_raw,
        sigmoid=selected_scores['sigmoid'], isotonic=selected_scores['isotonic']).to_csv(output / 'selection-predictions.csv', index=False)
    (output / 'calibration-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment-dir', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--model', choices=['baseline', 'enhanced'], default='enhanced')
    parser.add_argument('--max-validation-fpr', type=float, help='Optional predeclared security constraint on validation-selection false-positive rate')
    args = parser.parse_args()
    try:
        result = run(args.experiment_dir, args.output, model_name=args.model,
                     max_validation_fpr=args.max_validation_fpr)
        print(json.dumps({'output': args.output, 'synthetic': result['synthetic'], 'selected_method': result['selected_method'],
                          'scientific_validation': False}))
    except ValueError as error:
        parser.exit(2, str(error) + '\n')


if __name__ == '__main__':
    main()
