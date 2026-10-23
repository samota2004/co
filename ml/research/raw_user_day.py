"""Strict five-log user-day staging using the notebook's 21 feature formulas.

This reproduces the notebook's aggregation formulas for the verified columns;
it does not establish that a local dataset release has the same schema or that
the notebook's labels/splits were scientifically valid. The stage therefore
remains research-ineligible until source provenance and mapping are reviewed.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = {
    'logon': {'id', 'date', 'user', 'pc', 'activity'},
    'device': {'id', 'date', 'user', 'pc', 'activity'},
    'file': {'id', 'date', 'user', 'pc', 'filename', 'content'},
    'http': {'id', 'date', 'user', 'pc', 'url', 'content'},
    'email': {'id', 'date', 'user', 'pc', 'to', 'cc', 'bcc', 'from', 'size', 'attachments', 'content'},
}
VERSION = 'notebook-21-feature-formulas-staging-v2'
PANDAS_NA = {'', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan',
             '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None',
             'n/a', 'nan', 'null'}
FEATURES = ['logon_count', 'device_event_count', 'file_event_count',
            'http_event_count', 'email_event_count', 'day_of_week', 'is_weekend',
            'logon_unique_pc_count', 'device_unique_pc_count',
            'file_unique_pc_count', 'http_unique_pc_count',
            'email_unique_pc_count', 'unique_files', 'file_content_events',
            'unique_urls', 'unique_http_content', 'unique_recipients',
            'email_size_total', 'attachments_total', 'total_activity',
            'cross_source_activity']


def _present(value):
    """Match pandas read_csv's default empty/NA treatment used in the notebook."""
    return bool(value and value.strip() and value.strip() not in PANDAS_NA)


def validate_label_mapping(path, expected_keys):
    """Validate a complete, independently prepared user-day mapping.

    This cannot verify how an external answer key was converted to daily labels.
    Missing rows are rejected rather than silently declared benign.
    """
    labels = {}
    with Path(path).open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ['user_id', 'date', 'label']:
            raise ValueError('Label mapping must have exactly user_id,date,label columns in that order.')
        for line, row in enumerate(reader, 2):
            if None in row or any(row.get(field) is None for field in reader.fieldnames):
                raise ValueError(f'Malformed label mapping record at line {line}.')
            user, day, label = row['user_id'], row['date'], row['label']
            if not user.strip() or user != user.strip() or label not in ('0', '1'):
                raise ValueError(f'Invalid user or binary label at line {line}.')
            try:
                if datetime.strptime(day, '%Y-%m-%d').date().isoformat() != day:
                    raise ValueError()
            except ValueError:
                raise ValueError(f'Invalid UTC date in label mapping at line {line}.') from None
            key = (user, day)
            if key in labels:
                raise ValueError(f'Duplicate user-day label at line {line}.')
            labels[key] = int(label)
    expected = set(expected_keys)
    if set(labels) != expected:
        raise ValueError(f'Label mapping coverage mismatch: {len(expected - set(labels))} missing, {len(set(labels) - expected)} unexpected user-days.')
    return labels


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def parse_time(value):
    for fmt in ('%m/%d/%Y %H:%M:%S', '%Y-%m-%dT%H:%M:%S%z'):
        try:
            parsed = datetime.strptime(value, fmt)
            return (parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None
                    else parsed.astimezone(timezone.utc))
        except (ValueError, TypeError):
            pass
    raise ValueError('malformed_timestamp')


def _numeric_value(value, field):
    """Mirror notebook numeric conversion for valid inputs; reject bad source values."""
    if not _present(value):
        return 0.0
    try:
        number = float(value)
    except (ValueError, TypeError):
        raise ValueError(f'invalid_numeric_{field}') from None
    if number < 0 or number == float('inf') or number != number:
        raise ValueError(f'invalid_numeric_{field}')
    return number


def _read_source(path, source, counts, grouped):
    seen = {}
    previous = None
    with path.open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or set(reader.fieldnames) != SCHEMA[source] or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError(f'{source}: unsupported headers; inspect the official release README')
        for line, row in enumerate(reader, 2):
            counts['read'] += 1
            if None in row or any(row.get(k) is None for k in SCHEMA[source]) or any(not _present(row[k]) for k in ('id', 'date', 'user')):
                counts['invalid_record'] += 1
                continue
            try:
                when = parse_time(row['date'])
            except ValueError:
                counts['malformed_timestamp'] += 1
                continue
            try:
                email_size = _numeric_value(row['size'], 'size') if source == 'email' else 0
                attachments = _numeric_value(row['attachments'], 'attachments') if source == 'email' else 0
            except ValueError as error:
                counts[str(error)] += 1
                continue
            if previous and when < previous:
                counts['out_of_order'] += 1
                continue
            previous = when
            key = row['id']
            fingerprint = json.dumps(row, sort_keys=True)
            if key in seen:
                counts['duplicate_event' if seen[key] == fingerprint else 'conflicting_event_id'] += 1
                continue
            seen[key] = fingerprint
            bucket = grouped[(row['user'], when.date().isoformat())]
            bucket['counts'][source] += 1
            if _present(row['pc']):
                bucket['pcs'][source].add(row['pc'].strip())
            if source == 'file' and _present(row['filename']):
                bucket['files'].add(row['filename'].strip())
            if source == 'file' and _present(row['content']):
                bucket['file_content_events'] += 1
            if source == 'http' and _present(row['url']):
                bucket['urls'].add(row['url'].strip())
            if source == 'http' and _present(row['content']):
                bucket['http_content'].add(row['content'].strip())
            if source == 'email':
                if _present(row['to']):
                    bucket['recipients'].add(row['to'].strip())
                bucket['email_size_total'] += email_size
                bucket['attachments_total'] += attachments
            counts['accepted'] += 1


def stage(input_dir, output_dir, *, release_readme, label_file=None, label_source=None):
    source_dir, output = Path(input_dir), Path(output_dir)
    if output.exists():
        raise ValueError('Choose a new output directory; existing artifacts are not overwritten.')
    readme = Path(release_readme)
    if not readme.is_file():
        raise ValueError('The locally obtained release README is required for schema review.')
    paths = {name: source_dir / f'{name}.csv' for name in SCHEMA}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise ValueError('Missing official source candidates: ' + ', '.join(missing))
    grouped = defaultdict(lambda: {'counts': Counter(), 'pcs': defaultdict(set), 'files': set(),
                                   'file_content_events': 0, 'urls': set(), 'http_content': set(),
                                   'recipients': set(), 'email_size_total': 0.0,
                                   'attachments_total': 0.0})
    counts = {}
    output.mkdir(parents=True)
    try:
        for name, path in paths.items():
            counts[name] = Counter()
            _read_source(path, name, counts[name], grouped)
        rejected = sum(v for counter in counts.values() for k, v in counter.items() if k not in ('read', 'accepted'))
        manifest = {'schema_version': VERSION, 'release_candidate': 'CERT r4.2 (unverified local source)',
                    'usage_restrictions_reviewed': False, 'research_evaluation_eligible': False,
                    'release_readme': {'path': str(readme.resolve()), 'sha256': digest(readme)},
                    'sources': {name: {'path': str(path.resolve()), 'sha256': digest(path), 'counts': dict(counts[name])} for name, path in paths.items()},
                    'rejected_records': rejected, 'rows': len(grouped), 'feature_names': FEATURES,
                    'not_model_ready': True, 'reason': 'The 21 feature formulas match the available notebook code, but official source provenance, exact release schema, label derivation, seven contextual features, and observation-time assumptions are not independently verified.'}
        labels = None
        if label_file:
            if not label_source:
                raise ValueError('An independent label-source description is required.')
            label_path = Path(label_file)
            if not label_path.is_file():
                raise ValueError('Label file is unavailable.')
            labels = validate_label_mapping(label_path, grouped)
            manifest['label_input'] = {'path': str(label_path.resolve()), 'sha256': digest(label_path), 'definition': label_source,
                                       'rows': len(labels), 'status': 'complete provided mapping; answer-key derivation not independently certified'}
        (output / 'staging-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        if rejected:
            raise ValueError(f'{rejected} records rejected; see staging-manifest.json. No features were emitted.')
        generated = []
        with (output / 'user-day-staging.csv').open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=['user_id', 'date', 'feature_available_at'] + FEATURES)
            writer.writeheader()
            for (user, day), data in sorted(grouped.items(), key=lambda pair: (pair[0][1], pair[0][0])):
                date = datetime.fromisoformat(day)
                row = {'user_id': user, 'date': day, 'feature_available_at': day + 'T23:59:59Z',
                       'day_of_week': date.weekday(), 'is_weekend': int(date.weekday() >= 5),
                       'unique_files': len(data['files']), 'file_content_events': data['file_content_events'],
                       'unique_urls': len(data['urls']), 'unique_http_content': len(data['http_content']),
                       'unique_recipients': len(data['recipients']),
                       'email_size_total': data['email_size_total'],
                       'attachments_total': data['attachments_total'],
                       'total_activity': sum(data['counts'].values()),
                       'cross_source_activity': sum(bool(data['counts'][source]) for source in SCHEMA)}
                for source in SCHEMA:
                    row['logon_count' if source == 'logon' else f'{source}_event_count'] = data['counts'][source]
                    row[f'{source}_unique_pc_count'] = len(data['pcs'][source])
                writer.writerow(row)
                if labels is not None:
                    generated.append({**row, 'label': labels[(user, day)]})
        if labels is not None:
            with (output / 'user-day-labelled-staging.csv').open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=['user_id', 'date', 'label', 'feature_available_at'] + FEATURES)
                writer.writeheader()
                writer.writerows(generated)
        return manifest
    except Exception:
        # The manifest is retained when validation rejects source rows; partial
        # feature output is never presented as a valid extraction.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--release-readme', required=True)
    parser.add_argument('--label-file', help='Independent answer-key mapping; recorded but never guessed or merged')
    parser.add_argument('--label-source', help='Documented provenance and user-day definition for --label-file')
    args = parser.parse_args()
    try:
        result = stage(args.input_dir, args.output, release_readme=args.release_readme,
                       label_file=args.label_file, label_source=args.label_source)
        print(json.dumps({'rows': result['rows'], 'output': args.output, 'model_ready': False}))
    except ValueError as error:
        parser.exit(2, str(error) + '\n')


if __name__ == '__main__':
    main()
