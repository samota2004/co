import argparse
from pathlib import Path
import tempfile
import unittest
import pandas as pd
from ml.research.experiment import BASE_FEATURES, CONTEXT_FEATURES, run


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
        with tempfile.TemporaryDirectory(prefix='orbit-research-validation-') as directory:
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


if __name__ == '__main__':
    unittest.main()
