"""Paired, chronological baseline/enhanced experiments on authorized aggregates.

This does not download CERT data or invent missing source/context features.
Run with --help for input columns and output directories.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform

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
    df = pd.read_csv(source)
    required = ['user_id', 'date', 'label'] + BASE_FEATURES + CONTEXT_FEATURES
    missing = set(required) - set(df.columns)
    if missing:
        raise ValueError('Missing required columns: ' + ', '.join(sorted(missing)))
    df['date'] = pd.to_datetime(df['date'], errors='raise', utc=True).dt.normalize()
    if df[['user_id', 'date']].duplicated().any() or df.user_id.isna().any() or df.user_id.astype(str).str.strip().eq('').any():
        raise ValueError('Input must contain one row per nonempty user_id/UTC date.')
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
    dates = sorted(df.date.unique())
    if len(dates) < 10:
        raise ValueError('At least 10 distinct UTC days are required.')
    train_end, val_end = dates[int(len(dates) * .6)], dates[int(len(dates) * .8)]
    splits = [df[df.date < train_end], df[(df.date >= train_end) & (df.date < val_end)], df[df.date >= val_end]]
    if any(set(s.label) != {0, 1} for s in splits):
        raise ValueError('Each chronological split needs both classes. Choose an appropriate dataset/window.')
    output.mkdir(parents=True)
    report = {'dataset': args.dataset_name, 'synthetic': args.synthetic,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'split': 'Chronological UTC days: 60% train, 20% validation, 20% test. Both models use identical rows.',
        'seed': args.seed, 'training_rows': len(splits[0]), 'validation_rows': len(splits[1]), 'test_rows': len(splits[2]),
        'train_before': str(train_end), 'validation_before': str(val_end),
        'versions': {'python': platform.python_version(), 'sklearn': sklearn.__version__, 'pandas': pd.__version__},
        'limitations': 'User overlap is permitted across chronological splits. Context must be calculated from prior observations only. Synthetic results are smoke tests, not CERT performance.',
        'models': {}}
    for name, features in [('baseline', BASE_FEATURES), ('enhanced', BASE_FEATURES + CONTEXT_FEATURES)]:
        model = RandomForestClassifier(n_estimators=args.trees, class_weight='balanced', min_samples_leaf=3, random_state=args.seed, n_jobs=2)
        train, val, test = splits
        model.fit(train[features], train.label)
        validation_p = model.predict_proba(val[features])[:, list(model.classes_).index(1)]
        # Threshold selection uses validation labels only, never test labels.
        thresholds = np.linspace(.05, .95, 91)
        threshold = float(max(thresholds, key=lambda t: f1_score(val.label, validation_p >= t, zero_division=0)))
        probability = model.predict_proba(test[features])[:, list(model.classes_).index(1)]
        measured = metrics(test.label, probability, threshold)
        model_dir = output / name
        model_dir.mkdir()
        joblib.dump(model, model_dir / 'multi_source_ueba_rf.joblib')
        schema = {'feature_names': features, 'feature_count': len(features), 'model_type': 'RandomForestClassifier', 'feature_representation': 'approved user-day aggregate'}
        (model_dir / 'multi_source_feature_schema.json').write_text(json.dumps(schema, indent=2))
        metadata = {**{k:v for k,v in report.items() if k != 'models'}, 'model_name': f'{name.title()} UEBA Random Forest', 'feature_count': len(features), 'aggregation_level': 'user-day', 'operating_threshold': threshold, 'test_metrics': measured}
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
    return p


if __name__ == '__main__':
    try:
        run(parser().parse_args())
    except ValueError as error:
        raise SystemExit(str(error)) from None
