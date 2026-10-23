"""Paired, chronological baseline/enhanced experiments on authorized aggregates.

This does not download CERT data or invent missing source/context features.
Run with --help for input columns and output directories.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
from datetime import datetime, timezone

import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, average_precision_score,
    confusion_matrix, f1_score, precision_score, recall_score,
    roc_auc_score, roc_curve, precision_recall_curve)
from .provenance import load_provenance, audit_features

BASE_FEATURES = json.loads((Path(__file__).resolve().parents[1] / 'models' /
    'multi_source_feature_schema.json').read_text())['feature_names']
CONTEXT_FEATURES = ['device_trust', 'cross_department', 'is_off_hours',
    'failed_logins', 'download_volume_mb', 'resource_sensitivity', 'unusual_location']


def metrics(y, probability, threshold):
    predicted = (probability >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    return {'Accuracy': accuracy_score(y, predicted),
        'Precision': precision_score(y, predicted, zero_division=0),
        'Recall': recall_score(y, predicted, zero_division=0),
        'F1': f1_score(y, predicted, zero_division=0),
        'ROC_AUC': roc_auc_score(y, probability),
        'PR_AUC': average_precision_score(y, probability),
        'FPR': fp / (fp + tn), 'FNR': fn / (fn + tp),
        'TP': int(tp), 'FP': int(fp), 'TN': int(tn), 'FN': int(fn)}


def run(args):
    source = Path(args.input)
    output = Path(args.output)
    if output.exists():
        raise ValueError('Choose a new output directory. Existing artifacts are never overwritten.')
    provenance = load_provenance(getattr(args, 'source_manifest', None), source, args.synthetic)
    df = pd.read_csv(source)
    required = ['user_id', 'date', 'label'] + BASE_FEATURES + CONTEXT_FEATURES
    missing = set(required) - set(df.columns)
    if missing:
        raise ValueError('Missing required columns: ' + ', '.join(sorted(missing)))
    unexpected = set(df.columns) - set(required) - {'feature_available_at', 'decision_at'}
    if unexpected:
        raise ValueError('Unexpected columns may conceal target or post-event information: ' + ', '.join(sorted(unexpected)))
    if not args.synthetic and df.user_id.astype(str).str.startswith('SYNTHETIC-').any():
        raise ValueError('Synthetic identifiers cannot be evaluated as real data.')
    df['date'] = pd.to_datetime(df['date'], errors='raise', utc=True).dt.normalize()
    if df[['user_id', 'date']].duplicated().any() or df.user_id.isna().any() or df.user_id.astype(str).str.strip().eq('').any():
        raise ValueError('Input must contain one row per nonempty user_id/UTC date.')
    if not df.date.is_monotonic_increasing:
        raise ValueError('Input user-day rows must be in nondecreasing UTC date order.')
    for col in BASE_FEATURES + CONTEXT_FEATURES:
        if not pd.api.types.is_numeric_dtype(df[col]) or not np.isfinite(df[col]).all() or (df[col] < 0).any():
            raise ValueError(f'{col} must contain finite nonnegative numeric values. Missing values are not imputed.')
    if not df.label.isin([0, 1]).all() or not df.day_of_week.isin(range(7)).all() or not df.is_weekend.isin([0, 1]).all():
        raise ValueError('Invalid label or calendar value.')
    if not df.day_of_week.eq(df.date.dt.dayofweek).all() or not df.is_weekend.eq(df.date.dt.dayofweek.ge(5).astype(int)).all():
        raise ValueError('Calendar features must match the row UTC date.')
    if (df.device_trust > 100).any() or not df.resource_sensitivity.isin([0, 1, 2, 3]).all():
        raise ValueError('Invalid trust or sensitivity encoding.')
    for col in ['cross_department', 'is_off_hours', 'unusual_location']:
        if not df[col].isin([0, 1]).all():
            raise ValueError(f'{col} must be 0 or 1')
    leakage = audit_features(df, BASE_FEATURES + CONTEXT_FEATURES, require_availability=not args.synthetic)
    df = df.sort_values(['date', 'user_id'], kind='stable').reset_index(drop=True)
    dates = sorted(df.date.unique())
    if len(dates) < 10:
        raise ValueError('At least 10 distinct UTC days are required.')
    strategy = getattr(args, 'split_strategy', 'chronological')
    train_end, val_end = dates[int(len(dates) * .6)], dates[int(len(dates) * .8)]
    if strategy == 'chronological':
        splits = [df[df.date < train_end], df[(df.date >= train_end) & (df.date < val_end)], df[df.date >= val_end]]
    elif strategy in ('employee-disjoint', 'future-unseen-employee'):
        users = np.array(sorted(df.user_id.unique()))
        if len(users) < 10:
            raise ValueError('Employee-disjoint evaluation needs at least ten users.')
        np.random.default_rng(args.seed).shuffle(users)
        first, second = int(len(users) * .6), int(len(users) * .8)
        splits = [df[df.user_id.isin(part)] for part in (users[:first], users[first:second], users[second:])]
        if strategy == 'future-unseen-employee':
            splits = [splits[0][splits[0].date < train_end],
                      splits[1][(splits[1].date >= train_end) & (splits[1].date < val_end)],
                      splits[2][splits[2].date >= val_end]]
    else:
        raise ValueError('Unknown split strategy.')
    if strategy in ('chronological', 'future-unseen-employee') and (set(splits[0].date) & set(splits[1].date) or
        set(splits[0].date) & set(splits[2].date) or set(splits[1].date) & set(splits[2].date)):
        raise ValueError('Chronological split contamination detected.')
    if strategy in ('employee-disjoint', 'future-unseen-employee') and (set(splits[0].user_id) & set(splits[1].user_id) or
        set(splits[0].user_id) & set(splits[2].user_id) or set(splits[1].user_id) & set(splits[2].user_id)):
        raise ValueError('Employee split contamination detected.')
    if any(set(s.label) != {0, 1} for s in splits):
        raise ValueError('Each split needs both classes. Choose an appropriate dataset/window.')
    output.mkdir(parents=True)
    assigned = pd.concat([part.assign(split=name) for name, part in zip(('train','validation','test'), splits)])
    excluded_rows = 0
    if strategy == 'future-unseen-employee':
        assigned_keys = set(zip(assigned.user_id, assigned.date))
        excluded = df[[key not in assigned_keys for key in zip(df.user_id, df.date)]].assign(split='excluded')
        excluded_rows = len(excluded)
        assigned = pd.concat([assigned, excluded])
    split_path = output / 'split-manifest.csv'
    assigned[['user_id','date','label','split']].assign(date=lambda x:x.date.dt.strftime('%Y-%m-%d')).to_csv(split_path, index=False)
    (output / 'leakage-audit.json').write_text(json.dumps(leakage, indent=2), encoding='utf-8')
    config = {'input': str(source.resolve()), 'input_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'split_manifest_sha256': hashlib.sha256(split_path.read_bytes()).hexdigest(),
              'output_artifact_dir': str(output.resolve()),
              'dataset_name': args.dataset_name, 'synthetic': args.synthetic, 'source_provenance': provenance,
              'features': {'baseline': BASE_FEATURES, 'enhanced': BASE_FEATURES + CONTEXT_FEATURES},
              'feature_preprocessing': 'No data-dependent transforms or feature selection; numeric validation only.',
              'seed': args.seed, 'trees': args.trees, 'split_strategy': strategy,
              'random_forest_parameters': {'n_estimators': args.trees, 'class_weight': 'balanced',
                                           'min_samples_leaf': 3, 'random_state': args.seed, 'n_jobs': 1},
              'threshold_selection': 'Validation F1 on grid 0.05..0.95; test labels never used.',
              'started_at_utc': datetime.now(timezone.utc).isoformat()}
    (output / 'experiment-config.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    report = {'dataset': args.dataset_name, 'synthetic': args.synthetic,
        'research_evaluation_eligible': provenance['evaluation_eligible'],
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'split': {'chronological': 'Chronological UTC days', 'employee-disjoint': 'Employee-disjoint seeded user partition',
                  'future-unseen-employee': 'Chronological UTC days AND employee-disjoint seeded user partition'}[strategy]+
                 ': 60%/20%/20% date and/or user partitions. Both models use identical rows; combined strategy excludes unused user-date cells.',
        'seed': args.seed, 'training_rows': len(splits[0]), 'validation_rows': len(splits[1]), 'test_rows': len(splits[2]),
        'excluded_rows': excluded_rows,
        'train_before': str(train_end), 'validation_before': str(val_end),
        'versions': {'python': platform.python_version(), 'sklearn': sklearn.__version__, 'pandas': pd.__version__},
        'limitations': 'Aggregate source feature construction and label provenance require external review. Synthetic results are smoke tests, not CERT performance. Chronological splits may share users; employee-disjoint splits may share dates.',
        'leakage_audit': leakage,
        'models': {}}
    for name, features in [('baseline', BASE_FEATURES), ('enhanced', BASE_FEATURES + CONTEXT_FEATURES)]:
        model = RandomForestClassifier(n_estimators=args.trees, class_weight='balanced', min_samples_leaf=3, random_state=args.seed, n_jobs=1)
        train, val, test = splits
        model.fit(train[features], train.label)
        validation_p = model.predict_proba(val[features])[:, list(model.classes_).index(1)]
        # Threshold selection uses validation labels only, never test labels.
        thresholds = np.linspace(.05, .95, 91)
        threshold = float(max(thresholds, key=lambda t: f1_score(val.label, validation_p >= t, zero_division=0)))
        probability = model.predict_proba(test[features])[:, list(model.classes_).index(1)]
        predictions = pd.concat([
            val[['user_id','date','label']].assign(split='validation',score=validation_p,predicted=(validation_p>=threshold).astype(int)),
            test[['user_id','date','label']].assign(split='test',score=probability,predicted=(probability>=threshold).astype(int))
        ])
        predictions.assign(date=lambda x:x.date.dt.strftime('%Y-%m-%d')).to_csv(output / f'{name}-predictions.csv', index=False)
        measured = metrics(test.label, probability, threshold)
        model_dir = output / name
        model_dir.mkdir()
        artifact = model_dir / 'multi_source_ueba_rf.joblib'
        joblib.dump(model, artifact)
        schema = {'feature_names': features, 'feature_count': len(features), 'model_type': 'RandomForestClassifier', 'feature_representation': 'approved user-day aggregate'}
        (model_dir / 'multi_source_feature_schema.json').write_text(json.dumps(schema, indent=2))
        metadata = {**{k:v for k,v in report.items() if k != 'models'}, 'model_name': f'{name.title()} UEBA Random Forest',
                    'feature_count': len(features), 'aggregation_level': 'user-day',
                    'feature_generation_version': provenance['feature_generation_version'],
                    'label_definition': provenance.get('label_definition', 'Synthetic latent scenario only'),
                    'model_artifact_path': str(artifact.relative_to(output)),
                    'model_artifact_sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
                    'operating_threshold': threshold, 'test_metrics': measured}
        (model_dir / 'multi_source_model_metadata.json').write_text(json.dumps(metadata, indent=2))
        importance = sorted(zip(features, model.feature_importances_), key=lambda pair: pair[1], reverse=True)
        fpr, tpr, _ = roc_curve(test.label, probability)
        precision, recall, _ = precision_recall_curve(test.label, probability)
        curves = {'roc': [{'fpr': float(x), 'tpr': float(y)} for x,y in zip(fpr,tpr)], 'pr': [{'recall': float(x), 'precision': float(y)} for x,y in zip(recall,precision)]}
        report['models'][name] = {**metadata, 'feature_importance': [{'feature': k, 'importance': float(v)} for k,v in importance], 'curves': curves}
        fig, axes = plt.subplots(1, 3, figsize=(13, 4))
        axes[0].plot(fpr, tpr); axes[0].set(xlabel='False positive rate', ylabel='True positive rate', title=f'{name} ROC')
        axes[1].plot(recall, precision); axes[1].set(xlabel='Recall', ylabel='Precision', title=f'{name} precision–recall')
        axes[2].barh([k for k,v in importance[:8]][::-1], [v for k,v in importance[:8]][::-1]); axes[2].set(title='Feature importance')
        fig.tight_layout(); fig.savefig(output / f'{name}-evaluation.png', dpi=160); plt.close(fig)
    b, e = report['models']['baseline']['test_metrics'], report['models']['enhanced']['test_metrics']
    report['comparison'] = {metric: e[metric] - b[metric] for metric in ['Accuracy', 'Precision', 'Recall', 'F1', 'FPR', 'FNR', 'ROC_AUC', 'PR_AUC']}
    report['comparison_units'] = 'Absolute enhanced minus baseline metric differences; no guaranteed improvement.'
    (output / 'experiment-report.json').write_text(json.dumps(report, indent=2))
    print(f'Experiment artifacts written to {output}. Synthetic={args.synthetic}. Existing active model unchanged.')


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', required=True, help='Authorized user-day CSV with user_id,date,label, all 21 schema features and seven documented context features.')
    p.add_argument('--output', required=True, help='New artifact directory')
    p.add_argument('--dataset-name', required=True)
    p.add_argument('--synthetic', action='store_true', help='Required when evaluating generated demo data')
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--trees', type=int, default=200)
    p.add_argument('--source-manifest', help='Required for non-synthetic runs: checked aggregate/source files, version, usage and label provenance.')
    p.add_argument('--split-strategy', choices=['chronological','employee-disjoint','future-unseen-employee'], default='chronological')
    return p


if __name__ == '__main__':
    try:
        run(parser().parse_args())
    except ValueError as error:
        raise SystemExit(str(error)) from None
