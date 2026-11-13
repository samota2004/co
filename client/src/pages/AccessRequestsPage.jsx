
import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock3,
  RefreshCw,
  FileCheck2,
  UserRound,
  AlertTriangle,
  Inbox,
  LockKeyhole,
} from 'lucide-react';

import { ConsoleHeader } from '../components/ConsoleHeader.jsx';
import { requestApi } from '../services/api.js';

const panel =
  'rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)]';

function StatusBadge({ status }) {
  const styles = {
    PENDING:
      'border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] text-[#D4AF37]',
    APPROVED:
      'border-[#67E8F9]/25 bg-[#67E8F9]/[0.08] text-[#67E8F9]',
    REJECTED:
      'border-red-400/25 bg-red-400/[0.08] text-red-300',
  };

  const currentStyle =
    styles[status] ||
    'border-white/10 bg-white/[0.04] text-[#A7B0BA]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${currentStyle}`}
    >
      {status === 'PENDING' ? (
        <Clock3 size={12} />
      ) : status === 'APPROVED' ? (
        <CheckCircle2 size={12} />
      ) : status === 'REJECTED' ? (
        <XCircle size={12} />
      ) : (
        <ShieldCheck size={12} />
      )}
      {status || 'UNKNOWN'}
    </span>
  );
}

function RequestCard({ request, busy, onDecide }) {
  const isPending = request.status === 'PENDING';

  const resourceName =
    request.resourceName ||
    request.resource?.name ||
    'Resource request';

  const userName =
    request.userName ||
    request.user?.name ||
    'employee';

  const reason =
    request.reason ||
    request.justification ||
    'No additional justification provided.';

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#050A10] p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#070C12] sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-[#67E8F9]/[0.025] blur-3xl transition-opacity group-hover:opacity-100" />

      <div className="relative">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.07] text-[#67E8F9]">
              <FileCheck2 size={20} />
            </div>

            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-[#F4F7FA] transition-colors group-hover:text-[#67E8F9]">
                {resourceName}
              </h2>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#7F8A96]">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={13} />
                  Requested by {userName}
                </span>
                <span className="hidden text-[#D4AF37] sm:inline">
                  ·
                </span>
                <StatusBadge status={request.status} />
              </div>
            </div>
          </div>

          {isPending && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(request, 'approve')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/[0.08] px-3.5 py-2.5 text-xs font-semibold text-[#67E8F9] transition hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 size={15} />
                Approve
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(request, 'reject')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.05] px-3.5 py-2.5 text-xs font-semibold text-red-300 transition hover:border-red-400/50 hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <XCircle size={15} />
                Reject
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#03070C]/70 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7F8A96]">
            Request justification
          </p>

          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#C5CDD5]">
            {reason}
          </p>
        </div>

        {isPending && (
          <div className="mt-4 flex items-center gap-2 text-[11px] text-[#7F8A96]">
            <LockKeyhole size={13} className="text-[#D4AF37]" />
            Awaiting authorized review
          </div>
        )}
      </div>
    </article>
  );
}

export function AccessRequestsPage({ fetchJson = requestApi }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setError('');

    try {
      const result = await fetchJson('/api/access-requests');
      setRequests(result.requests || []);
    } catch (failure) {
      setError(
        failure.message || 'Unable to load access requests.'
      );
    }
  }, [fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (request, decision) => {
    setBusyId(request.id);
    setError('');

    try {
      await fetchJson(
        `/api/access-requests/${encodeURIComponent(request.id)}/${decision}`,
        {
          method: 'POST',
          body: {
            notes: 'Reviewed in Access Requests.',
          },
        }
      );

      await load();
    } catch (failure) {
      setError(
        failure.message || 'Unable to review access request.'
      );
    } finally {
      setBusyId('');
    }
  };

  const pendingCount = requests.filter(
    (request) => request.status === 'PENDING'
  ).length;

  const approvedCount = requests.filter(
    (request) => request.status === 'APPROVED'
  ).length;

  const rejectedCount = requests.filter(
    (request) => request.status === 'REJECTED'
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-5 pb-10 sm:px-8 lg:px-12">
      <ConsoleHeader
        title="Access Requests"
        description="Review employee requests for protected company resources."
        kind="security"
      />

      {/* Page overview */}
      <section className={`${panel} relative overflow-hidden p-5 sm:p-6`}>
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#67E8F9]/[0.035] blur-3xl" />

        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.08] text-[#67E8F9]">
            <ShieldCheck size={22} />
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#F4F7FA]">
              Resource access review
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-7 text-[#A7B0BA]">
              Review recorded resource access requests. Approval rules
              and sensitivity requirements are enforced by the server.
              Only authorized reviewers should approve or reject
              pending requests.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="relative mt-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm leading-6 text-red-300"
          >
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[#7F8A96]">
            Server-enforced approval workflow
          </span>

          <button
            type="button"
            onClick={load}
            disabled={Boolean(busyId)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] px-4 py-2.5 text-xs font-semibold text-[#67E8F9] transition hover:border-[#67E8F9]/50 hover:bg-[#67E8F9]/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Refresh requests
          </button>
        </div>
      </section>

      {/* Request summary */}
      <section
        aria-label="Access request summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          {
            label: 'Pending requests',
            value: pendingCount,
            icon: Clock3,
            accent: 'gold',
          },
          {
            label: 'Approved requests',
            value: approvedCount,
            icon: CheckCircle2,
            accent: 'cyan',
          },
          {
            label: 'Rejected requests',
            value: rejectedCount,
            icon: XCircle,
            accent: 'red',
          },
        ].map((item) => {
          const Icon = item.icon;

          const iconStyle =
            item.accent === 'gold'
              ? 'border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] text-[#D4AF37]'
              : item.accent === 'red'
                ? 'border-red-400/20 bg-red-400/[0.07] text-red-300'
                : 'border-[#67E8F9]/20 bg-[#67E8F9]/[0.08] text-[#67E8F9]';

          const valueStyle =
            item.accent === 'gold'
              ? 'text-[#D4AF37]'
              : item.accent === 'red'
                ? 'text-red-300'
                : 'text-[#67E8F9]';

          return (
            <article
              key={item.label}
              className={`${panel} p-5 transition-all duration-200 hover:border-[#67E8F9]/20`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#7F8A96]">
                    {item.label}
                  </p>
                  <p
                    className={`mt-3 text-3xl font-semibold tabular-nums ${valueStyle}`}
                  >
                    {item.value}
                  </p>
                </div>

                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${iconStyle}`}
                >
                  <Icon size={20} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Request list */}
      <section aria-label="Access requests" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F4F7FA]">
              Recorded requests
            </h2>
            <p className="mt-1 text-xs text-[#7F8A96]">
              {requests.length} total request
              {requests.length === 1 ? '' : 's'} found
            </p>
          </div>

          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[#A7B0BA]">
            All statuses
          </span>
        </div>

        {requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                busy={Boolean(busyId)}
                onDecide={decide}
              />
            ))}
          </div>
        ) : (
          <div className={`${panel} px-5 py-12 text-center`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
              <Inbox size={25} />
            </div>

            <h3 className="mt-4 text-base font-semibold text-[#F4F7FA]">
              No access requests recorded
            </h3>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#7F8A96]">
              There are currently no resource access requests available
              for review.
            </p>

            <button
              type="button"
              onClick={load}
              disabled={Boolean(busyId)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/25 px-4 py-2.5 text-xs font-semibold text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.08] disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Reload requests
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
