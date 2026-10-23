"""Input provenance and conservative leakage checks for research runs."""
import hashlib
import json
from pathlib import Path

import pandas as pd


FORBIDDEN_INPUTS = {'label', 'threat', 'is_threat', 'scenario', 'scenario_id',
                    'incident_status', 'incident_outcome', 'resolved_at',
                    'future_activity', 'answer_key', 'user_id', 'date'}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_provenance(path, source, synthetic):
    if synthetic:
        return {'type': 'synthetic-development', 'label_source': 'documented latent event scenario',
                'source_files': [{'path': str(source), 'sha256': sha256(source)}],
                'feature_generation_version': 'synthetic_fixture_v2',
                'evaluation_eligible': False}
    if not path:
        raise ValueError('Real-data runs require --source-manifest with checked source and label provenance.')
    manifest_path = Path(path)
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    for field in ('dataset_name', 'dataset_version', 'label_definition', 'label_source',
                  'feature_generation_version', 'source_files', 'usage_restrictions'):
        if not data.get(field):
            raise ValueError(f'Source manifest is missing {field}.')
    if not isinstance(data['source_files'], list) or not data['source_files']:
        raise ValueError('Source manifest needs checked source files.')
    checked = []
    for item in data['source_files']:
        file = Path(item['path'])
        if not file.is_file() or not isinstance(item.get('sha256'), str) or sha256(file) != item['sha256']:
            raise ValueError(f'Source checksum unavailable or mismatched: {file}')
        checked.append({'path': str(file), 'sha256': item['sha256']})
    if not any(Path(item['path']).resolve() == Path(source).resolve() for item in checked):
        raise ValueError('The input aggregate CSV must be listed in source_files.')
    if data['dataset_name'].lower().startswith('cert') and not data.get('answer_key_file'):
        raise ValueError('CERT evaluation requires a checked answer-key source.')
    if data.get('answer_key_file'):
        answer = data['answer_key_file']
        if not Path(answer['path']).is_file() or sha256(answer['path']) != answer.get('sha256'):
            raise ValueError('Answer-key checksum unavailable or mismatched.')
    # Checksums prove byte identity, not that the 21 features or user-day labels
    # were correctly derived from those bytes. Do not turn a self-authored
    # manifest into a scientific-validity flag.
    return {**data, 'source_manifest_sha256': sha256(manifest_path),
            'provenance_gate_passed': True, 'evaluation_eligible': False,
            'mapping_review_status': 'Original feature and answer-key transformations not independently verified.'}


def audit_features(frame, feature_names, *, require_availability=False):
    forbidden = sorted(FORBIDDEN_INPUTS.intersection(feature_names))
    if forbidden:
        raise ValueError('Forbidden model inputs: ' + ', '.join(forbidden))
    if require_availability:
        if 'feature_available_at' not in frame or 'decision_at' not in frame:
            raise ValueError('Real-data input requires feature_available_at and decision_at for each user-day.')
        available = pd.to_datetime(frame['feature_available_at'], errors='raise', utc=True)
        decision = pd.to_datetime(frame['decision_at'], errors='raise', utc=True)
        cutoff = frame['date'] + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        # These columns summarize the *entire* UTC day. A timestamp earlier
        # than the end of that day would claim access to future observations.
        if (available.isna().any() or decision.isna().any() or
                (available < cutoff).any() or (decision < available).any()):
            raise ValueError('Completed user-day features must exist after UTC day end and no later than the decision.')
    findings = []
    # Disjoint value supports are a warning, not proof of leakage; true signals
    # can also separate a tiny fixture. Human source/time review remains required.
    if len(frame) >= 10 and frame['label'].nunique() == 2:
        for name in feature_names:
            values = frame[name]
            if values.nunique() > 1 and values.nunique() <= min(20, len(frame) // 2):
                benign = set(values[frame.label == 0])
                threat = set(values[frame.label == 1])
                if benign.isdisjoint(threat):
                    findings.append({'feature': name, 'finding': 'disjoint label-conditional values; inspect upstream generation and availability'})
    return {'forbidden_inputs': forbidden, 'suspicious_features': findings,
            'limitations': 'Univariate checks miss interactions, identity/time proxies and upstream label contamination. Source and temporal review are required.',
            'availability_checked': require_availability}
