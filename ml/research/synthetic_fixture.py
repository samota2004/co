"""Generate labelled smoke-test aggregates, never evidence of CERT performance."""
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from .experiment import BASE_FEATURES, CONTEXT_FEATURES


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True)
    args = p.parse_args()
    target = Path(args.output)
    if target.exists():
        raise SystemExit('Existing input will not be overwritten.')
    rng = np.random.default_rng(42)
    rows = []
    for day in pd.date_range('2025-01-01', periods=30, tz='UTC'):
        for employee in range(20):
            threat = int(employee % 7 == 0)
            row = {k: int(rng.poisson(2 + 4 * threat)) for k in BASE_FEATURES}
            row.update(user_id=f'SYNTHETIC-{employee}', date=day.date().isoformat(), label=threat, day_of_week=day.dayofweek, is_weekend=int(day.dayofweek >= 5))
            row.update(device_trust=90-60*threat, cross_department=threat, is_off_hours=threat, failed_logins=3*threat,
                download_volume_mb=15+500*threat, resource_sensitivity=3*threat, unusual_location=threat)
            rows.append(row)
    target.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(target, index=False)
    print('600 synthetic fixture rows written; not collected telemetry or research evidence.')


if __name__ == '__main__':
    main()
