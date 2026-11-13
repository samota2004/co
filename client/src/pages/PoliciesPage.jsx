
import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  SlidersHorizontal,
  Activity,
  History,
  RefreshCw,
  Save,
  Eye,
  LockKeyhole,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Info,
} from 'lucide-react';

import { ConsoleHeader } from '../components/ConsoleHeader.jsx';
import { requestApi } from '../services/api.js';

const sections = [
  {
    title: 'Risk bands and action thresholds',
    description:
      'These values control how the server maps a calculated risk score to monitoring, MFA, approval, restriction, and freeze.',
    icon: ShieldCheck,
    accent: 'cyan',
    keys: [
      'lowRiskMax',
      'mediumRiskMax',
      'highRiskMax',
      'veryHighRiskMax',
      'criticalThreshold',
      'mfaThreshold',
      'approvalThreshold',
      'restrictionThreshold',
      'freezeThreshold',
    ],
  },
  {
    title: 'Behavioral evidence',
    description:
      'Context penalties and configured volume boundary used by the risk engine. Missing observations are not treated as evidence.',
    icon: Activity,
    accent: 'gold',
    keys: [
      'crossDeptRiskPenalty',
      'untrustedDevicePenalty',
      'offHoursPenalty',
      'largeDownloadThresholdMB',
    ],
  },
  {
    title: 'Trust recovery',
    description:
      'Gradual recovery is applied only after the server validates recovery evidence and checks incident holds.',
    icon: CheckCircle2,
    accent: 'cyan',
    keys: ['adaptiveTrustRecoveryRate'],
  },
  {
    title: 'Automatic endpoint containment',
    description:
      'Off by default and enabled only by the Main Admin. A request requires fresh authenticated protected-resource access, a server-evaluated contextual score at the configured containment threshold, and independent evidence categories. Uncalibrated or unavailable RF output cannot authorize containment. Only recently connected enrolled Windows endpoints are supported; employee-mode macOS LaunchAgents cannot disable accounts. FROZEN appears only after endpoint OS confirmation.',
    icon: LockKeyhole,
    accent: 'gold',
    keys: [
      'autoFreezeOnCritical',
      'automaticContainmentMinEvidenceCategories',
      'automaticContainmentMaxEvidenceAgeSeconds',
    ],
  },
];

const titles = {
  lowRiskMax: 'LOW band ends at',
  mediumRiskMax: 'MEDIUM band ends at',
  highRiskMax: 'HIGH band ends at',
  veryHighRiskMax: 'VERY_HIGH band ends at',
  criticalThreshold: 'CRITICAL starts at',
  mfaThreshold: 'MFA starts at',
  approvalThreshold: 'Approval starts at',
  restrictionThreshold: 'Restriction starts at',
  freezeThreshold: 'Automatic containment starts at',
  crossDeptRiskPenalty: 'Cross-department factor points',
  untrustedDevicePenalty: 'Unverified device factor points',
  offHoursPenalty: 'Corroborating off-hours points',
  largeDownloadThresholdMB: 'Configured daily volume threshold (MB)',
  adaptiveTrustRecoveryRate: 'Trust recovery points per validated recovery',
  autoFreezeOnCritical: 'Enable Main Admin automatic containment policy',
  automaticContainmentMinEvidenceCategories:
    'Minimum independent evidence categories',
  automaticContainmentMaxEvidenceAgeSeconds:
    'Maximum evidence age (seconds)',
};

const panel =
  'rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)]';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#03070C] px-4 py-3 text-sm text-[#F4F7FA] outline-none transition placeholder:text-[#7F8A96] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10';

const getNumberLimits = (key) => ({
  min:
    key === 'automaticContainmentMinEvidenceCategories'
      ? 2
      : key === 'automaticContainmentMaxEvidenceAgeSeconds'
        ? 30
        : 0,
  max:
    key === 'largeDownloadThresholdMB'
      ? 1000000
      : key === 'automaticContainmentMinEvidenceCategories'
        ? 8
        : key === 'automaticContainmentMaxEvidenceAgeSeconds'
          ? 300
          : 100,
});

function SectionHeading({ section }) {
  const Icon = section.icon;
  const isGold = section.accent === 'gold';

  return (
    <div className="mb-6 flex items-start gap-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
          isGold
            ? 'border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#D4AF37]'
            : 'border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[#67E8F9]'
        }`}
      >
        <Icon size={20} />
      </div>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-[#F4F7FA]">
          {section.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#A7B0BA]">
          {section.description}
        </p>
      </div>
    </div>
  );
}

function PolicyField({ config, section, fieldKey, setValue }) {
  const isBoolean = typeof config[fieldKey] === 'boolean';
  const isGold = section.accent === 'gold';
  const limits = getNumberLimits(fieldKey);

  return (
    <label className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-white/[0.08] bg-[#03070C]/70 p-4 transition-all duration-200 hover:border-[#67E8F9]/25 hover:bg-[#070C12]">
      <span className="text-sm font-medium leading-5 text-[#C5CDD5] transition-colors group-hover:text-white">
        {titles[fieldKey] || fieldKey}
      </span>

      {isBoolean ? (
        <span className="mt-4 flex items-center justify-between gap-3">
          <span
            className={`text-xs font-semibold ${
              config[fieldKey] ? 'text-[#67E8F9]' : 'text-[#7F8A96]'
            }`}
          >
            {config[fieldKey] ? 'Enabled' : 'Disabled'}
          </span>

          <input
            aria-label={titles[fieldKey]}
            type="checkbox"
            checked={config[fieldKey]}
            onChange={(event) =>
              setValue(fieldKey, event.target.checked)
            }
            className="h-5 w-5 cursor-pointer rounded border-white/20 bg-[#03070C] accent-[#67E8F9]"
          />
        </span>
      ) : (
        <input
          aria-label={titles[fieldKey]}
          type="number"
          required
          min={limits.min}
          max={limits.max}
          step={1}
          value={config[fieldKey] ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            setValue(fieldKey, value === '' ? '' : Number(value));
          }}
          className={`${inputClass} mt-3 ${
            isGold
              ? 'focus:border-[#D4AF37]/60 focus:ring-[#D4AF37]/10'
              : ''
          }`}
        />
      )}
    </label>
  );
}

function StatusMessage({ type, children }) {
  const isError = type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${
        isError
          ? 'border-red-400/20 bg-red-400/[0.06] text-red-300'
          : 'border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#B8F5FC]'
      }`}
    >
      {isError ? (
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

export function PoliciesPage({ onRefreshData }) {
  const [config, setConfig] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewScore, setPreviewScore] = useState('60');
  const [preview, setPreview] = useState(null);

  async function load() {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const [policy, versions] = await Promise.all([
        requestApi('/api/policies'),
        requestApi('/api/policies/history'),
      ]);

      setConfig(policy.config);
      setHistory(versions.versions || []);
    } catch (e) {
      setError(e.message || 'Unable to load policy configuration.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();

    if (!config) return;

    setBusy(true);
    setNotice('');
    setError('');

    try {
      const result = await requestApi('/api/policies', {
        method: 'PATCH',
        body: config,
      });

      setConfig(result.config);
      setNotice(
        'Policy saved and audited. New server-side access evaluations use this configuration.'
      );

      const versions = await requestApi('/api/policies/history');
      setHistory(versions.versions || []);

      onRefreshData?.();
    } catch (e) {
      setError(e.message || 'Unable to save policy configuration.');
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    const score = Number(previewScore);

    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) {
      setError('Enter a risk score between 0 and 100.');
      return;
    }

    setBusy(true);
    setError('');
    setPreview(null);

    try {
      const result = await requestApi('/api/policies/preview', {
        method: 'POST',
        body: {
          riskScore: score,
          config,
        },
      });

      setPreview(result);
    } catch (e) {
      setError(e.message || 'Unable to preview policy outcome.');
    } finally {
      setBusy(false);
    }
  }

  const setValue = (key, value) => {
    setConfig((old) => ({
      ...old,
      [key]: value,
    }));
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-5 pb-10 sm:px-8 lg:px-12">
      <ConsoleHeader
        title="Zero Trust Policy Engine"
        description="Configure and review the server-enforced company policy."
        kind="security"
      />

      {/* Overview and notifications */}
      <section className={`${panel} relative overflow-hidden p-5 sm:p-6`}>
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#67E8F9]/[0.035] blur-3xl" />

        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.08] text-[#67E8F9]">
            <Info size={19} />
          </div>

          <div>
            <h2 className="font-semibold text-[#F4F7FA]">
              Policy configuration overview
            </h2>
            <p className="mt-2 max-w-5xl text-sm leading-7 text-[#A7B0BA]">
              Policy decisions are evaluated on the server. Preview is
              read-only and never changes a user, session, incident, or
              access decision. Saving records an audited policy version.
              Thresholds are operational defaults, not experimentally
              optimized values.
            </p>
          </div>
        </div>

        {error && (
          <div className="relative mt-5">
            <StatusMessage type="error">{error}</StatusMessage>
          </div>
        )}

        {notice && (
          <div className="relative mt-5">
            <StatusMessage type="success">{notice}</StatusMessage>
          </div>
        )}

        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/[0.07] px-4 py-2.5 text-sm font-semibold text-[#67E8F9] transition hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={busy ? 'animate-spin' : ''}
            />
            {busy ? 'Loading...' : 'Reload policy and history'}
          </button>

          <span className="text-xs text-[#7F8A96]">
            Server-enforced configuration
          </span>
        </div>
      </section>

      {/* Policy configuration */}
      {config && (
        <form onSubmit={save} className="space-y-5">
          {sections.map((section, index) => (
            <section
              key={section.title}
              className={`${panel} overflow-hidden p-5 transition-colors duration-200 hover:border-[#67E8F9]/20 sm:p-6`}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7F8A96]">
                  Policy group {String(index + 1).padStart(2, '0')}
                </span>

                {section.accent === 'gold' && (
                  <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                    Security control
                  </span>
                )}
              </div>

              <SectionHeading section={section} />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.keys.map((key) => (
                  <PolicyField
                    key={key}
                    config={config}
                    section={section}
                    fieldKey={key}
                    setValue={setValue}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Save policy */}
          <section className={`${panel} p-5 sm:p-6`}>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] text-[#D4AF37]">
                  <SlidersHorizontal size={19} />
                </div>

                <div>
                  <h3 className="font-semibold text-[#F4F7FA]">
                    Policy configuration
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[#A7B0BA]">
                    The legacy <code className="text-[#D4AF37]">mlWeight</code>{' '}
                    field is not exposed as an active control. The current
                    risk engine uses threshold-mapped RF evidence and does
                    not use that field as a fusion weight.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9] px-6 py-3 text-sm font-bold text-[#03070C] shadow-[0_6px_24px_rgba(103,232,249,0.12)] transition hover:bg-[#A5F3FC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={17} />
                {busy ? 'Saving...' : 'Save policy version'}
              </button>
            </div>
          </section>
        </form>
      )}

      {/* Read-only policy preview */}
      {config && (
        <section className={`${panel} overflow-hidden p-5 sm:p-6`}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.08] text-[#67E8F9]">
              <Eye size={20} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#F4F7FA]">
                Read-only policy preview
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#A7B0BA]">
                Evaluate a hypothetical score against the current draft.
                This does not invoke ML or persist a decision.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="w-full max-w-xs text-sm font-medium text-[#C5CDD5]">
              Hypothetical risk score
              <input
                aria-label="Preview risk score"
                type="number"
                min="0"
                max="100"
                step="1"
                value={previewScore}
                onChange={(event) => setPreviewScore(event.target.value)}
                className={`${inputClass} mt-2`}
              />
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={runPreview}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/[0.07] px-5 py-3 text-sm font-semibold text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.13] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Activity size={17} />
              Preview policy outcome
            </button>
          </div>

          {preview && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-bold tabular-nums text-[#67E8F9]">
                  {preview.riskScore}/100
                </span>

                <span className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] px-3 py-1 text-xs font-semibold text-[#D4AF37]">
                  {preview.riskLevel}
                </span>

                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#F4F7FA]">
                  {preview.action}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'MFA',
                    value: preview.requiresMfa ? 'Required' : 'Not required',
                  },
                  {
                    label: 'Approval',
                    value: preview.requiresApproval
                      ? 'Required'
                      : 'Not required',
                  },
                  {
                    label: 'Sensitive resource access',
                    value: preview.restrictsSensitiveAccess ? 'Restricted' : 'Allowed',
                  },
                  {
                    label: 'Policy freeze action',
                    value: preview.wouldFreeze ? 'Yes' : 'No',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-white/[0.08] bg-[#03070C]/70 p-4"
                  >
                    <p className="text-xs text-[#7F8A96]">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-[#F4F7FA]">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 flex items-center gap-2 text-xs text-[#7F8A96]">
                <LockKeyhole size={13} />
                Read-only preview; no user or account state was changed.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Policy version history */}
      <section className={`${panel} overflow-hidden p-5 sm:p-6`}>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] text-[#D4AF37]">
            <History size={20} />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#F4F7FA]">
              Policy version history
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#A7B0BA]">
              Latest 50 audited policy saves for this company.
            </p>
          </div>
        </div>

        {history.length > 0 ? (
          <div className="divide-y divide-white/[0.08]">
            {history.map((version) => (
              <details key={version.id} className="group py-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg transition hover:bg-white/[0.02]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                      <Clock3 size={16} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#F4F7FA]">
                        {new Date(version.timestamp).toLocaleString()}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#7F8A96]">
                        {version.actor} · {version.version.slice(0, 10)}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] px-3 py-1.5 text-xs font-medium text-[#67E8F9] transition group-open:border-[#D4AF37]/30 group-open:text-[#D4AF37]">
                    View configuration
                  </span>
                </summary>

                <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-white/[0.08] bg-[#03070C] p-4 text-xs leading-6 text-[#C5CDD5]">
                  {JSON.stringify(version.config, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#03070C]/60 px-5 py-10 text-center">
            <History
              size={25}
              className="mx-auto text-[#7F8A96]"
            />
            <p className="mt-3 text-sm font-medium text-[#C5CDD5]">
              No policy history available
            </p>
            <p className="mt-1 text-xs text-[#7F8A96]">
              No saved policy versions have been recorded yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
