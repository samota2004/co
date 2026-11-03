import React, { useCallback, useEffect, useState } from 'react';
import { requestApi } from '../services/api.js';

export function AccessRequestsPage({ fetchJson = requestApi }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const result = await fetchJson('/api/access-requests'); setRequests(result.requests || []); }
    catch (failure) { setError(failure.message || 'Unable to load access requests.'); }
  }, [fetchJson]);
  useEffect(() => { load(); }, [load]);
  const decide = async (request, decision) => {
    setBusyId(request.id); setError('');
    try { await fetchJson(`/api/access-requests/${encodeURIComponent(request.id)}/${decision}`, { method: 'POST', body: { notes: 'Reviewed in Access Requests.' } }); await load(); }
    catch (failure) { setError(failure.message || 'Unable to review access request.'); }
    finally { setBusyId(''); }
  };
  return <div className="mx-auto w-full max-w-[1200px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
    <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><h1 className="text-2xl font-semibold">Access Requests</h1><p className="mt-2 text-sm text-slate-400">Review recorded resource access requests. Approval rules and sensitivity requirements are enforced by the server.</p></section>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 p-4 text-sm text-red-300">{error}</p>}
    <section aria-label="Access requests" className="space-y-3">{requests.length ? requests.map(request => <article key={request.id} className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{request.resourceName || request.resource?.name || 'Resource request'}</h2><p className="mt-1 text-sm text-slate-400">Requested by {request.userName || request.user?.name || 'employee'} · {request.status}</p><p className="mt-3 text-sm">{request.reason || request.justification}</p></div>{request.status === 'PENDING' && <div className="flex gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => decide(request, 'approve')} className="rounded-lg border border-emerald-700 px-3 py-2 text-emerald-200">Approve</button><button type="button" disabled={Boolean(busyId)} onClick={() => decide(request, 'reject')} className="rounded-lg border border-red-700 px-3 py-2 text-red-200">Reject</button></div>}</div></article>) : <p className="rounded-2xl border border-white/10 bg-[#050A10] p-5 text-sm text-slate-400">No access requests are recorded.</p>}</section>
  </div>;
}
