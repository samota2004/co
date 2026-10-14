import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Search, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { requestApi } from '../services/api.js';
import { normalizeAttributions, formatNumber, formatShap, matchesExplanation } from '../services/xai.js';

export const ExplainableAiPage = ({ users = [], events = [], fetchJson = requestApi, isRefreshing = false }) => {
  const { isDark } = useTheme();
  const [targetUserId, setTargetUserId] = useState('');
  const [record, setRecord] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const refresh = useRef(null);
  // Never show the previous employee's result during a selection change.
  const analysis = record?.userId === targetUserId ? record : null;
  const targetUser = users.find(user => String(user.id) === targetUserId);

  useEffect(() => {
    let cancelled = false, inFlight = false, queued = false, debounce;
    const controller = new AbortController();
    setRecord(null); setError(''); setLastUpdated(null); setSearchQuery(''); setLoading(false);
    if (!targetUserId) return;
    const load = async () => {
      if (cancelled) return;
      if (inFlight) { queued = true; return; }
      inFlight = true; setLoading(true);
      try {
        const result = await fetchJson(`/api/risk/analysis/${encodeURIComponent(targetUserId)}`, { signal: controller.signal });
        if (cancelled) return;
        if (!result?.success || result.analysis?.userId !== targetUserId || !Array.isArray(result.analysis?.contributingFactors)) {
          throw new Error(result?.error?.message || result?.message || (typeof result?.error === 'string' ? result.error : 'Unable to load employee explanations'));
        }
        setRecord(result.analysis); setLastUpdated(new Date()); setError('');
      } catch (failure) {
        if (!cancelled) setError(`${failure.message}. Previously loaded explanations may be out of date. Refresh to retry.`);
      } finally {
        inFlight = false;
        if (!cancelled) { setLoading(false); if (queued) { queued = false; load(); } }
      }
    };
    refresh.current = load;
    const schedule = () => { clearTimeout(debounce); debounce = setTimeout(load, 300); };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('cyberorbit-endpoint-updated', schedule);
    return () => {
      cancelled = true; controller.abort(); refresh.current = null;
      clearTimeout(debounce); clearInterval(timer);
      window.removeEventListener('cyberorbit-endpoint-updated', schedule);
    };
  }, [targetUserId, fetchJson]);

  useEffect(() => { if (!isRefreshing) refresh.current?.(); }, [isRefreshing, events]);
  useEffect(() => {
    if (targetUserId && !users.some(user => String(user.id) === targetUserId)) setTargetUserId('');
  }, [targetUserId, users]);

  const { contributions, summaries, invalidCount } = useMemo(() => normalizeAttributions(analysis?.ml?.reasons), [analysis]);
  const query = searchQuery.trim().toLowerCase();
  const factors = analysis?.contributingFactors || [];
  const filteredFactors = factors.filter(factor => matchesExplanation([factor.factor, factor.category, factor.description, factor.scoreImpact], query));
  const filteredContributions = contributions.filter(reason => matchesExplanation([reason.feature, reason.value, reason.shap_value, reason.impact], query));
  const filteredSummaries = summaries.filter(summary => matchesExplanation([summary], query));
  const modelAvailable = analysis?.ml?.available === true;
  const probability = analysis?.ml?.probability;
  const probabilityRecorded = modelAvailable && typeof probability === 'number' && Number.isFinite(probability) && probability >= 0 && probability <= 1;
  const panel = isDark ? 'border-white/10 bg-[#050A10]' : 'border-black/10 bg-white';
  const muted = isDark ? 'text-[#A7B0BA]' : 'text-slate-600';
  const section = `rounded-2xl border ${panel} p-6 sm:p-8`;

  return <div className={`min-h-full overflow-x-hidden ${isDark ? 'bg-[#03070C] text-[#F4F7FA]' : 'bg-slate-50 text-slate-900'}`}>
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
      <section className={`console-hero ${section}`}>
        <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">Explainable AI · Recorded evidence</p>
        <h1 className="mt-5 text-4xl font-light tracking-tight">Why was this activity <span className="text-[#67E8F9]">considered risky?</span></h1>
        <p className={`mt-4 max-w-3xl text-sm leading-6 ${muted}`}>Inspect contextual risk factors and the feature contributions from recorded CERT model predictions. Each explanation shows its source.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label htmlFor="xai-employee" className={`text-xs uppercase tracking-wider ${muted}`}>Employee</label>
          <select id="xai-employee" aria-label="Explainable AI employee" value={targetUserId} onChange={event => setTargetUserId(event.target.value)} disabled={!users.length} className={`min-w-[240px] rounded-lg border px-3 py-2 ${isDark ? 'border-white/10 bg-[#03070C]' : 'border-black/10 bg-white'}`}>
            <option value="">{users.length ? 'Select employee' : 'No employees available'}</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name} — {user.employeeId || user.id}</option>)}
          </select>
          <button type="button" aria-label="Refresh explanations" disabled={!targetUserId || loading} onClick={() => refresh.current?.()} className="flex items-center gap-2 rounded-lg border border-cyan-500/30 px-3 py-2 text-sm text-cyan-500 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Loading...' : 'Refresh explanations'}
          </button>
        </div>
      </section>
      <div aria-label="Employee risk explanations" aria-busy={loading} className="space-y-5">
        {error && <p role="alert" className="rounded-xl border border-red-500/25 p-4 text-sm text-red-400">{error}</p>}
        {!targetUser ? <section className={`${section} text-center`}><BrainCircuit className="mx-auto h-8 w-8 text-cyan-400" /><h2 className="mt-4 text-xl">Select an employee</h2><p className={`mt-2 text-sm ${muted}`}>Choose an employee to load their recorded risk factors and model explanations.</p></section> : loading && !analysis ? <section className={section}><p role="status">Loading explanations for {targetUser.name}...</p></section> : analysis && <>
          <section className={section} aria-label="Explanation summary">
            <h2 className="text-xl">{targetUser.name} · Assessment summary</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <div><p className={`text-xs uppercase tracking-wide ${muted}`}>Observed risk · Last 24 hours</p><p className="mt-2 text-2xl text-[#D4AF37]">{analysis.riskScore === null ? 'Not assessed' : `${formatNumber(analysis.riskScore)} / 100 · ${analysis.riskLevel}`}</p></div>
              <div><p className={`text-xs uppercase tracking-wide ${muted}`}>Trust score</p><p className="mt-2 text-2xl">{analysis.trustScore === null ? 'Unassessed' : `${formatNumber(analysis.trustScore)} / 100`}</p><p className={`mt-1 text-xs ${muted}`}>{analysis.trustBasis === 'ACCOUNT_BASELINE' ? 'Stored account baseline' : 'Recorded account trust'}</p></div>
              <div><p className={`text-xs uppercase tracking-wide ${muted}`}>CERT model threat probability</p><p className="mt-2 text-2xl text-cyan-400">{probabilityRecorded ? `${(probability * 100).toFixed(1)}%` : 'Awaiting inputs'}</p>{probabilityRecorded && <p className={`mt-1 text-xs ${muted}`}>Prediction recorded: {new Date(analysis.ml.timestamp).toLocaleString()}</p>}</div>
            </div>
            {lastUpdated && <p className={`mt-5 text-xs ${muted}`}>Last refreshed: {lastUpdated.toLocaleString()}. Updates as new observations arrive.</p>}
          </section>
          <section className={`${section} flex flex-wrap items-center justify-between gap-4`}>
            <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" /><input aria-label="Search explanations" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search risk factors or model features..." className={`w-full rounded-lg border py-3 pl-10 pr-3 text-sm ${isDark ? 'border-white/10 bg-[#03070C]' : 'border-black/10 bg-slate-50'}`} /></div>
            <p className={`text-xs ${muted}`}>{filteredFactors.length} contextual factors · {filteredContributions.length} SHAP contributions · {filteredSummaries.length} saved summaries</p>
          </section>
          <section className={section} aria-label="Contextual risk explanations">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-cyan-400" /><h2 className="text-xl">Contextual risk explanations</h2></div>
            <p className={`mt-2 text-sm leading-6 ${muted}`}>These contributions come from risk rules applied to recorded activity. They are separate from model-generated SHAP values.</p>
            {filteredFactors.map((factor, index) => <article key={`${factor.category}-${index}`} className="mt-5 rounded-xl border border-cyan-500/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg">{factor.factor}</h3><span className="text-sm text-[#D4AF37]">Risk contribution: +{formatNumber(factor.scoreImpact)}</span></div>
              <p className={`mt-3 text-sm leading-6 ${muted}`}>{factor.description}</p>
              <p className={`mt-3 text-xs ${muted}`}>Source: {analysis.source} · Category: {factor.category || 'Context'}</p>
            </article>)}
            {!factors.length && <p className={`mt-5 text-sm ${muted}`}>{analysis.hasTelemetry ? 'No elevated contextual factor was found in the available observations. Unobserved activity remains unassessed.' : 'No activity is recorded for this employee in the last 24 hours.'}</p>}
            {factors.length > 0 && !filteredFactors.length && <p className={`mt-5 text-sm ${muted}`}>No contextual factors match your search.</p>}
            {analysis.coverage?.truncated && <p className="mt-4 text-sm text-[#D4AF37]">The analysis limit was reached. Contextual factors use the bounded evidence described on Risk Analysis.</p>}
          </section>
          <section className={section} aria-label="Model SHAP explanations">
            <div className="flex items-center gap-3"><BrainCircuit className="h-5 w-5 text-cyan-400" /><h2 className="text-xl">Model explanations (SHAP)</h2></div>
            {!modelAvailable ? <div role="status" className="mt-5 rounded-xl border border-[#D4AF37]/25 p-5"><h3 className="text-lg text-[#D4AF37]">CERT model assessment awaiting complete inputs</h3><p className={`mt-2 text-sm leading-6 ${muted}`}>{analysis.ml?.reason || 'No approved model prediction is recorded. Complete daily login, device, file, web and email inputs are required.'}</p><p className={`mt-2 text-sm ${muted}`}>Contextual explanations above remain available from recorded activity.</p></div> : <>
              <p className={`mt-2 text-sm ${muted}`}>Saved prediction: {new Date(analysis.ml.timestamp).toLocaleString()}. Positive values increase the model output; negative values decrease it.</p>
              {filteredContributions.map((reason, index) => <article key={`${reason.feature}-${index}`} className={`mt-5 rounded-xl border p-5 ${reason.shap_value > 0 ? 'border-red-500/25' : 'border-cyan-500/20'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg">{reason.feature.replaceAll('_', ' ')}</h3><span className={reason.shap_value > 0 ? 'text-red-400' : 'text-cyan-400'}>SHAP {formatShap(reason.shap_value)}</span></div>
                <div className={`mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm ${muted}`}><p>Model feature value: {formatNumber(reason.value)}</p><p>{reason.impact}</p></div>
                <p className={`mt-3 text-xs ${muted}`}>Source: Recorded CERT model prediction · Feature: {reason.feature}</p>
              </article>)}
              {filteredSummaries.map((summary, index) => <article key={index} className="mt-5 rounded-xl border border-white/10 p-5"><h3 className="text-sm">Saved model explanation</h3><p className={`mt-2 text-sm ${muted}`}>{summary}</p><p className={`mt-2 text-xs ${muted}`}>This saved summary contains no structured SHAP value.</p></article>)}
              {invalidCount > 0 && <p role="status" className="mt-4 text-sm text-[#D4AF37]">{invalidCount} saved attribution records lack a valid feature name or numeric SHAP value and cannot be displayed as contributions.</p>}
              {!contributions.length && !summaries.length && <p className={`mt-5 text-sm ${muted}`}>A model prediction is recorded, but no usable SHAP contributions were saved for that prediction.</p>}
              {(contributions.length + summaries.length > 0) && !filteredContributions.length && !filteredSummaries.length && <p className={`mt-5 text-sm ${muted}`}>No model explanations match your search.</p>}
            </>}
          </section>
        </>}
      </div>
    </div>
  </div>;
};
export default ExplainableAiPage;
