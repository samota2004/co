import argparse
import json
from pathlib import Path
from contextlib import contextmanager
import shutil
import unittest
from unittest.mock import patch
from uuid import uuid4
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from ml.research.experiment import BASE_FEATURES, CONTEXT_FEATURES, run
from ml.research.provenance import audit_features, load_provenance, sha256
from ml.research.synthetic_fixture import generate_rows

WORK_DIR = Path(__file__).resolve().parents[1] / 'experiments'


@contextmanager
def test_directory():
    WORK_DIR.mkdir(exist_ok=True)
    path = WORK_DIR / f'unit-{uuid4().hex}'
    path.mkdir()
    try:
        yield str(path)
    finally:
        if path.resolve().is_relative_to(WORK_DIR.resolve()) and path.name.startswith('unit-'):
            shutil.rmtree(path)


class ResearchValidationTests(unittest.TestCase):
    def rows(self):
        rows = []
        for day in pd.date_range('2025-01-01', periods=10, tz='UTC'):
            for label in (0, 1):
                row = dict.fromkeys(BASE_FEATURES + CONTEXT_FEATURES, 0)
                row.update(user_id=f'SYNTHETIC-{label}', date=day.isoformat(), label=label,
                           day_of_week=day.dayofweek, is_weekend=int(day.dayofweek >= 5))
                rows.append(row)
        return rows

    def rejected(self, rows, message):
        with test_directory() as directory:
            source = Path(directory) / 'synthetic.csv'
            output = Path(directory) / 'no-artifacts'
            pd.DataFrame(rows).to_csv(source, index=False)
            args = argparse.Namespace(input=str(source), output=str(output), dataset_name='Synthetic validation only', synthetic=True, seed=42, trees=1)
            with self.assertRaisesRegex(ValueError, message):
                run(args)
            self.assertFalse(output.exists(), 'Invalid inputs must not export a model or report')

    def test_duplicate_user_day_after_utc_normalization(self):
        rows = self.rows()
        rows.append({**rows[0], 'date': '2025-01-01T14:00:00+00:00'})
        self.rejected(rows, 'one row')

    def test_calendar_must_describe_aggregate_date(self):
        rows = self.rows()
        rows[0]['day_of_week'] = 0
        self.rejected(rows, 'Calendar features must match')

    def test_missing_observations_are_not_imputed(self):
        rows = self.rows()
        rows[0]['unique_recipients'] = None
        self.rejected(rows, 'finite nonnegative')

    def test_unexpected_target_or_post_event_column_rejected(self):
        rows = self.rows()
        for row in rows:
            row['incident_outcome'] = row['label']
        self.rejected(rows, 'Unexpected columns')

    def test_out_of_order_record(self):
        rows = self.rows()
        rows[0], rows[-1] = rows[-1], rows[0]
        self.rejected(rows, 'nondecreasing')

    def test_real_run_needs_provenance(self):
        rows = self.rows()
        with test_directory() as directory:
            source=Path(directory)/'input.csv'
            pd.DataFrame(rows).to_csv(source,index=False)
            with self.assertRaisesRegex(ValueError, 'source-manifest'):
                run(argparse.Namespace(input=str(source),output=str(Path(directory)/'output'),dataset_name='CERT r4.2',synthetic=False,seed=42,trees=1))

    def test_checked_manifest_does_not_certify_unreviewed_feature_or_label_mapping(self):
        with test_directory() as directory:
            root=Path(directory)
            source=root/'prepared.csv'
            answer=root/'synthetic-answer-fixture.txt'
            source.write_text('fixture only', encoding='utf-8')
            answer.write_text('fixture only', encoding='utf-8')
            manifest=root/'manifest.json'
            manifest.write_text(json.dumps({'dataset_name':'CERT fixture only','dataset_version':'r4.2 fixture',
                'label_definition':'Unverified fixture', 'label_source':'Fixture',
                'feature_generation_version':'unverified','usage_restrictions':'fixture only',
                'source_files':[{'path':str(source),'sha256':sha256(source)}],
                'answer_key_file':{'path':str(answer),'sha256':sha256(answer)}}),encoding='utf-8')
            result=load_provenance(manifest,source,synthetic=False)
            self.assertTrue(result['provenance_gate_passed'])
            self.assertFalse(result['evaluation_eligible'])

    def test_leakage_audit_and_label_independence(self):
        rows = generate_rows(seed=42)
        original = pd.DataFrame(rows)
        modified = original.copy()
        modified['label'] = 1-modified['label']
        pd.testing.assert_frame_equal(original.drop(columns='label'), modified.drop(columns='label'))
        with self.assertRaisesRegex(ValueError, 'Forbidden model inputs'):
            audit_features(original, ['label'])
        leaking=original[['label']].copy()
        leaking['copied_target']=leaking.label
        flagged=audit_features(leaking, ['copied_target'])
        self.assertEqual(flagged['suspicious_features'][0]['feature'],'copied_target')
        self.assertFalse(audit_features(original, BASE_FEATURES + CONTEXT_FEATURES)['forbidden_inputs'])

    def test_feature_availability_requires_completed_day_and_decision_time(self):
        rows=pd.DataFrame(self.rows())
        rows['date']=pd.to_datetime(rows['date'],utc=True)
        rows['feature_available_at']=rows['date']+pd.Timedelta(hours=12)
        rows['decision_at']=rows['date']+pd.Timedelta(days=1)
        with self.assertRaisesRegex(ValueError,'after UTC day end'):
            audit_features(rows, BASE_FEATURES, require_availability=True)
        rows['feature_available_at']=rows['date']+pd.Timedelta(days=1)
        self.assertTrue(audit_features(rows, BASE_FEATURES, require_availability=True)['availability_checked'])
        rows['decision_at']=rows['date']+pd.Timedelta(hours=12)
        with self.assertRaisesRegex(ValueError,'no later than the decision'):
            audit_features(rows, BASE_FEATURES, require_availability=True)
        rows=rows.drop(columns='decision_at')
        with self.assertRaisesRegex(ValueError,'requires feature_available_at and decision_at'):
            audit_features(rows, BASE_FEATURES, require_availability=True)

    def test_repeated_synthetic_run_has_same_predictions_and_splits(self):
        with test_directory() as directory:
            root=Path(directory)
            input_path=root/'fixture.csv'
            pd.DataFrame(generate_rows(seed=17,employees=20,days=15)).to_csv(input_path,index=False)
            reports=[]
            fitted_rows=[]
            original_fit=RandomForestClassifier.fit
            def checked_fit(model, features, labels, *args, **kwargs):
                fitted_rows.append(len(features))
                return original_fit(model, features, labels, *args, **kwargs)
            for index in (1,2):
                output=root/f'run{index}'
                with patch.object(RandomForestClassifier,'fit',checked_fit):
                    run(argparse.Namespace(input=str(input_path),output=str(output),dataset_name='Synthetic test only',synthetic=True,seed=9,trees=8,split_strategy='chronological'))
                reports.append(json.loads((output/'experiment-report.json').read_text()))
                self.assertTrue((output/'experiment-config.json').exists())
                self.assertTrue((output/'leakage-audit.json').exists())
                manifest=pd.read_csv(output/'split-manifest.csv')
                self.assertEqual(len(manifest),len(pd.read_csv(input_path)))
                self.assertEqual(fitted_rows[-2:],[len(manifest[manifest.split=='train'])]*2)
                self.assertLess(manifest[manifest.split=='train'].date.max(),manifest[manifest.split=='validation'].date.min())
                self.assertLess(manifest[manifest.split=='validation'].date.max(),manifest[manifest.split=='test'].date.min())
                predictions=pd.read_csv(output/'enhanced-predictions.csv')
                self.assertEqual(set(predictions.split),{'validation','test'})
                self.assertEqual(len(predictions),len(manifest[manifest.split!='train']))
                test=predictions[predictions.split=='test']
                self.assertEqual(int(((test.label==1)&(test.predicted==1)).sum()),reports[-1]['models']['enhanced']['test_metrics']['TP'])
            for name in ('baseline','enhanced'):
                self.assertEqual(reports[0]['models'][name]['test_metrics'],reports[1]['models'][name]['test_metrics'])
                pd.testing.assert_frame_equal(pd.read_csv(root/'run1'/f'{name}-predictions.csv'),pd.read_csv(root/'run2'/f'{name}-predictions.csv'))
            self.assertEqual((root/'run1'/'split-manifest.csv').read_bytes(),(root/'run2'/'split-manifest.csv').read_bytes())

    def test_employee_disjoint_users(self):
        with test_directory() as directory:
            root=Path(directory)
            input_path=root/'fixture.csv'
            pd.DataFrame(generate_rows(seed=21,employees=20,days=15)).to_csv(input_path,index=False)
            output=root/'run'
            run(argparse.Namespace(input=str(input_path),output=str(output),dataset_name='Synthetic test only',synthetic=True,seed=9,trees=4,split_strategy='employee-disjoint'))
            manifest=pd.read_csv(output/'split-manifest.csv')
            groups=[set(manifest[manifest.split==name].user_id) for name in ('train','validation','test')]
            self.assertFalse(groups[0]&groups[1] or groups[0]&groups[2] or groups[1]&groups[2])

    def test_future_unseen_employee_split_excludes_unused_cells(self):
        with test_directory() as directory:
            root=Path(directory)
            input_path=root/'fixture.csv'
            pd.DataFrame(generate_rows(seed=37,employees=50,days=30)).to_csv(input_path,index=False)
            output=root/'run'
            run(argparse.Namespace(input=str(input_path),output=str(output),dataset_name='Synthetic split test only',
                                   synthetic=True,seed=9,trees=4,split_strategy='future-unseen-employee'))
            manifest=pd.read_csv(output/'split-manifest.csv')
            groups=[manifest[manifest.split==name] for name in ('train','validation','test')]
            self.assertLess(groups[0].date.max(),groups[1].date.min())
            self.assertLess(groups[1].date.max(),groups[2].date.min())
            users=[set(group.user_id) for group in groups]
            self.assertFalse(users[0]&users[1] or users[0]&users[2] or users[1]&users[2])
            self.assertGreater(int((manifest.split=='excluded').sum()),0)
            self.assertEqual(len(manifest),len(pd.read_csv(input_path)))


if __name__ == '__main__':
    unittest.main()
