"""Generate labelled smoke-test aggregates, never evidence of CERT performance."""
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from .experiment import BASE_FEATURES


def generate_rows(seed=42, employees=30, days=30):
    """Latent scenario affects noisy events; the target is assigned after features.

    The scenario schedule is deterministic for testing and is never a model
    column. Background shifts also occur on benign days. This is not an
    enterprise data simulator or an estimate of real detection performance.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for day_index, day in enumerate(pd.date_range('2025-01-01', periods=days, tz='UTC')):
        for employee in range(employees):
            scenario = (day_index - employee % 5) % 10 in (0, 1)
            background_shift = rng.random() < .15
            activity_rate = 2 + employee % 4 + (2 if scenario else 0) + (2 if background_shift else 0)
            row = {k: int(rng.poisson(activity_rate)) for k in BASE_FEATURES}
            for source in ('logon','device','file','http','email'):
                row[f'{source}_unique_pc_count'] = int(rng.integers(0, row[f'{source}_event_count']+1)) if source != 'logon' else int(rng.integers(0, row['logon_count']+1))
            row['unique_files'] = int(rng.integers(0, row['file_event_count']+1))
            row['file_content_events'] = int(rng.integers(0, row['file_event_count']+1))
            row['unique_urls'] = int(rng.integers(0, row['http_event_count']+1))
            row['unique_http_content'] = int(rng.integers(0, row['http_event_count']+1))
            row['unique_recipients'] = int(rng.integers(0, row['email_event_count']+1))
            row['attachments_total'] = int(rng.poisson(row['email_event_count']*.4))
            row['email_size_total'] = int(rng.poisson(max(1,row['email_event_count'])*80))
            source_counts=[row['logon_count'],row['device_event_count'],row['file_event_count'],row['http_event_count'],row['email_event_count']]
            row['total_activity']=sum(source_counts)
            row['cross_source_activity']=sum(source_counts) if sum(count>0 for count in source_counts)>1 else 0
            row.update(user_id=f'SYNTHETIC-{employee}', date=day.date().isoformat(),
                       day_of_week=day.dayofweek, is_weekend=int(day.dayofweek >= 5))
            row.update(device_trust=int(np.clip(rng.normal(82-12*scenario-8*background_shift, 12), 0, 100)),
                       cross_department=int(rng.random() < (.28 if scenario else .18)),
                       is_off_hours=int(rng.random() < (.35 if scenario else .22)),
                       failed_logins=int(rng.poisson(1.7 if scenario else .8)),
                       download_volume_mb=float(round(rng.gamma(2.5, 34 if scenario else 22), 2)),
                       resource_sensitivity=int(rng.integers(0, 4)),
                       unusual_location=int(rng.random() < (.2 if scenario else .12)))
            row['label'] = int(scenario)
            rows.append(row)
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True)
    p.add_argument('--seed', type=int, default=42)
    args = p.parse_args()
    target = Path(args.output)
    if target.exists():
        raise SystemExit('Existing input will not be overwritten.')
    rows = generate_rows(seed=args.seed)
    target.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(target, index=False)
    print(f'{len(rows)} synthetic fixture rows written; not collected telemetry or research evidence.')


if __name__ == '__main__':
    main()
