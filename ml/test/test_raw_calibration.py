import argparse
import csv
import json
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from ml.research.calibration import fit_candidates, measure, run as calibrate, split_validation
from ml.research.experiment import run as experiment
from ml.research.raw_user_day import FEATURES, SCHEMA, stage, validate_label_mapping, parse_time
from ml.research.synthetic_fixture import generate_rows
from test_research import test_directory


class RawStagingTests(unittest.TestCase):
    def source(self, root, *, duplicate=False, malformed=False, reversed_order=False):
        root = Path(root)
        readme = root / 'README.txt'
        readme.write_text('Synthetic parser fixture; not an official CERT README.', encoding='utf-8')
        for name, required in SCHEMA.items():
            fields = sorted(required)
            rows = [{field: '' for field in fields} for _ in range(2)]
            for i, row in enumerate(rows):
                row.update(id=f'{name}-{i}', date=f'01/0{i+1}/2010 10:00:00', user='SYNTHETIC-U1', pc=f'PC-{i}')
                if name == 'file':
                    row.update(filename=f'synthetic-{i}.txt', content=f'file-content-{i}')
                elif name == 'http':
                    row.update(url=f'https://synthetic.invalid/{i}', content=f'http-content-{i}')
                elif name == 'email':
                    row.update(to=f'user-{i}@synthetic.invalid', size=str(100 + i), attachments=str(i))
            if malformed and name == 'logon':
                rows[0]['date'] = 'not-a-date'
            if duplicate and name == 'logon':
                rows.insert(1, rows[0].copy())
            if reversed_order and name == 'logon':
                rows.reverse()
            with (root / f'{name}.csv').open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fields)
                writer.writeheader()
                writer.writerows(rows)
        return readme

    def test_synthetic_staging_counts_and_no_fake_labels(self):
        with test_directory() as directory:
            readme = self.source(directory)
            result = stage(directory, Path(directory)/'out', release_readme=readme)
            self.assertTrue(result['not_model_ready'])
            rows = pd.read_csv(Path(directory)/'out'/'user-day-staging.csv')
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows.total_activity.tolist(), [5, 5])
            schema = json.loads(Path('ml/models/multi_source_feature_schema.json').read_text())
            actual = [column for column in rows if column in FEATURES]
            self.assertEqual(FEATURES, schema['feature_names'])
            self.assertEqual(actual, schema['feature_names'])
            self.assertEqual(rows.day_of_week.tolist(), [4, 5])
            self.assertEqual(rows.is_weekend.tolist(), [0, 1])
            self.assertEqual(rows.unique_files.tolist(), [1, 1])
            self.assertEqual(rows.file_content_events.tolist(), [1, 1])
            self.assertEqual(rows.unique_urls.tolist(), [1, 1])
            self.assertEqual(rows.unique_http_content.tolist(), [1, 1])
            self.assertEqual(rows.unique_recipients.tolist(), [1, 1])
            self.assertEqual(rows.email_size_total.tolist(), [100, 101])
            self.assertEqual(rows.attachments_total.tolist(), [0, 1])
            self.assertEqual(rows.cross_source_activity.tolist(), [5, 5])
            self.assertNotIn('label', rows.columns)

    def test_synthetic_staged_row_satisfies_saved_model_input_contract(self):
        """Compatibility plumbing only; synthetic rows are not model evaluation."""
        from ml.src.inference import FEATURE_NAMES, predict

        with test_directory() as directory:
            readme = self.source(directory)
            stage(directory, Path(directory)/'out', release_readme=readme)
            staged = pd.read_csv(Path(directory)/'out'/'user-day-staging.csv')
            row = staged.iloc[0]
            features = {name: float(row[name]) for name in FEATURES}
            self.assertEqual(FEATURES, FEATURE_NAMES)
            self.assertEqual(list(features), FEATURE_NAMES)
            result = predict(features)
            self.assertRegex(result['model_fingerprint'], r'^[a-f0-9]{64}$')
            self.assertIn(result['predicted_class'], (0, 1))

    def test_rejects_bad_duplicate_and_out_of_order_records_with_counts(self):
        for reason, flags in [('malformed_timestamp', {'malformed': True}),
                              ('duplicate_event', {'duplicate': True}),
                              ('out_of_order', {'reversed_order': True})]:
            with self.subTest(reason=reason), test_directory() as directory:
                readme = self.source(directory, **flags)
                output = Path(directory)/'out'
                with self.assertRaisesRegex(ValueError, 'records rejected'):
                    stage(directory, output, release_readme=readme)
                report = json.loads((output/'staging-manifest.json').read_text())
                self.assertEqual(report['sources']['logon']['counts'][reason], 1)
                self.assertFalse((output/'user-day-staging.csv').exists())

    def test_unsupported_header_rejected(self):
        with test_directory() as directory:
            readme = self.source(directory)
            (Path(directory)/'http.csv').write_text('id,date,user\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'unsupported headers'):
                stage(directory, Path(directory)/'out', release_readme=readme)

    def test_timestamp_offset_normalizes_to_utc_and_missing_identity_is_counted(self):
        self.assertEqual(parse_time('2010-01-01T01:00:00+02:00').isoformat(), '2009-12-31T23:00:00+00:00')
        with test_directory() as directory:
            root = Path(directory)
            readme = self.source(root)
            path = root/'logon.csv'
            with path.open(newline='', encoding='utf-8') as stream:
                rows = list(csv.DictReader(stream))
            rows[0]['user'] = ''
            with path.open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=sorted(SCHEMA['logon']))
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaisesRegex(ValueError, 'records rejected'):
                stage(root, root/'out', release_readme=readme)
            manifest = json.loads((root/'out'/'staging-manifest.json').read_text())
            self.assertEqual(manifest['sources']['logon']['counts']['invalid_record'], 1)

    def test_notebook_null_semantics_keep_event_but_skip_missing_feature_values(self):
        with test_directory() as directory:
            root = Path(directory)
            readme = self.source(root)
            file_path = root/'file.csv'
            with file_path.open(newline='', encoding='utf-8') as stream:
                rows = list(csv.DictReader(stream))
            rows[0]['pc'] = ''
            rows[0]['content'] = 'NA'
            with file_path.open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=sorted(SCHEMA['file']))
                writer.writeheader()
                writer.writerows(rows)
            stage(root, root/'out', release_readme=readme)
            staged = pd.read_csv(root/'out'/'user-day-staging.csv')
            self.assertEqual(staged.file_event_count.tolist(), [1, 1])
            self.assertEqual(staged.file_content_events.tolist(), [0, 1])
            self.assertEqual(staged.file_unique_pc_count.tolist(), [0, 1])

    def test_complete_independent_label_mapping_is_separate_and_deterministic(self):
        with test_directory() as directory:
            root = Path(directory)
            readme = self.source(root)
            labels = root/'reviewed-user-days.csv'
            labels.write_text('user_id,date,label\nSYNTHETIC-U1,2010-01-01,0\nSYNTHETIC-U1,2010-01-02,1\n', encoding='utf-8')
            first = stage(root, root/'first', release_readme=readme, label_file=labels,
                          label_source='Synthetic fixture mapping, independent of log features')
            second = stage(root, root/'second', release_readme=readme, label_file=labels,
                           label_source='Synthetic fixture mapping, independent of log features')
            self.assertFalse(first['research_evaluation_eligible'])
            self.assertEqual(first['label_input']['rows'], 2)
            self.assertEqual((root/'first'/'user-day-labelled-staging.csv').read_bytes(),
                             (root/'second'/'user-day-labelled-staging.csv').read_bytes())
            self.assertEqual(first['sources']['logon']['sha256'], second['sources']['logon']['sha256'])
            mapped = pd.read_csv(root/'first'/'user-day-labelled-staging.csv')
            self.assertEqual(mapped.label.tolist(), [0, 1])

    def test_label_mapping_rejects_missing_duplicate_malformed_and_extra_days(self):
        cases = [('user_id,date,label\nSYNTHETIC-U1,2010-01-01,1\n', 'coverage mismatch'),
                 ('user_id,date,label\nSYNTHETIC-U1,2010-01-01,1\nSYNTHETIC-U1,2010-01-01,0\n', 'Duplicate'),
                 ('user_id,date,label\nSYNTHETIC-U1,2010-01-01,2\n', 'binary label'),
                 ('user_id,date,label\nSYNTHETIC-U1,2010-01-01,0\nSYNTHETIC-U1,2010-01-02,1\nSYNTHETIC-U1,2010-01-03,0\n', 'coverage mismatch')]
        for content, error in cases:
            with self.subTest(error=error), test_directory() as directory:
                path = Path(directory)/'labels.csv'
                path.write_text(content, encoding='utf-8')
                with self.assertRaisesRegex(ValueError, error):
                    validate_label_mapping(path, {('SYNTHETIC-U1', '2010-01-01'), ('SYNTHETIC-U1', '2010-01-02')})


class CalibrationTests(unittest.TestCase):
    def test_invalid_scores_and_missing_class(self):
        with self.assertRaisesRegex(ValueError, 'both classes'):
            fit_candidates(np.linspace(0, 1, 10), np.zeros(10))
        with self.assertRaisesRegex(ValueError, 'finite'):
            fit_candidates(np.array([np.nan]*10), np.array([0, 1]*5))
        with self.assertRaisesRegex(ValueError, 'positive and negative'):
            measure(np.zeros(10), np.zeros(10), .5)

    def test_small_and_imbalanced_validation_rejected(self):
        tiny = pd.DataFrame({'date': ['2025-01-01']*10, 'user_id': range(10), 'label': [0]*9+[1]})
        with self.assertRaisesRegex(ValueError, 'four validation'):
            split_validation(tiny, 'chronological')
        few = pd.DataFrame({'date': np.repeat(pd.date_range('2025-01-01', periods=4).astype(str), 5),
                            'user_id': range(20), 'label': [0]*19+[1]})
        with self.assertRaisesRegex(ValueError, 'per class'):
            split_validation(few, 'chronological')

    def test_offline_calibration_uses_recorded_splits_and_unmodified_test(self):
        with test_directory() as directory:
            root = Path(directory)
            source = root/'synthetic.csv'
            pd.DataFrame(generate_rows(seed=37, employees=50, days=30)).to_csv(source, index=False)
            run_dir = root/'experiment'
            experiment(argparse.Namespace(input=str(source), output=str(run_dir), dataset_name='Synthetic plumbing test',
                                          synthetic=True, seed=9, trees=12, split_strategy='chronological'))
            calibrated = calibrate(run_dir, root/'calibration')
            self.assertTrue(calibrated['synthetic'])
            self.assertFalse(calibrated['scientific_validation'])
            manifest = pd.read_csv(run_dir/'split-manifest.csv')
            self.assertEqual(calibrated['test_rows'], int((manifest.split == 'test').sum()))
            predictions = pd.read_csv(root/'calibration'/'test-predictions.csv')
            self.assertEqual(set(predictions.label), {0, 1})
            self.assertTrue((root/'calibration'/'calibrator.joblib').exists())
            repeated = calibrate(run_dir, root/'calibration-repeat')
            self.assertEqual(calibrated['test'], repeated['test'])
            pd.testing.assert_frame_equal(predictions, pd.read_csv(root/'calibration-repeat'/'test-predictions.csv'))
            with self.assertRaisesRegex(ValueError, 'new output'):
                calibrate(run_dir, root/'calibration')
            changed = pd.read_csv(source)
            changed.loc[changed.index[-1], 'label'] = 1-changed.loc[changed.index[-1], 'label']
            changed.to_csv(source, index=False)
            with self.assertRaisesRegex(ValueError, 'unavailable or changed'):
                calibrate(run_dir, root/'tampered')

    def test_split_membership_tampering_cannot_move_test_labels_into_calibration(self):
        with test_directory() as directory:
            root = Path(directory)
            source = root/'synthetic.csv'
            pd.DataFrame(generate_rows(seed=37, employees=50, days=30)).to_csv(source, index=False)
            run_dir = root/'experiment'
            experiment(argparse.Namespace(input=str(source), output=str(run_dir), dataset_name='Synthetic tamper test',
                                          synthetic=True, seed=9, trees=8, split_strategy='chronological'))
            split_path = run_dir/'split-manifest.csv'
            membership = pd.read_csv(split_path)
            member = membership.index[membership.split == 'test'][0]
            membership.loc[member, 'split'] = 'validation'
            membership.to_csv(split_path, index=False)
            with self.assertRaisesRegex(ValueError, 'Split manifest checksum'):
                calibrate(run_dir, root/'must-not-exist')
            self.assertFalse((root/'must-not-exist').exists())


if __name__ == '__main__':
    unittest.main()
