// ======================================================
// IMPORTS
// ======================================================

import React, { useState, useEffect, useMemo, useRef } from "react";

import {
  BrainCircuit,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  RefreshCw,
} from "lucide-react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";


// ======================================================
// MAIN COMPONENT
// ======================================================

export const AiRiskAnalysisPage = ({
  users = [],
  events = [],
  fetchJson,
  isRefreshing = false,
}) => {

  // ======================================================
  // THEME TOKENS
  // ======================================================

  const pageBackground = "#03070C";
  const primaryText = "#F4F7FA";
  const panelClass = "bg-[#050A10]";

  // ======================================================
  // TARGET USER
  // ======================================================

  // Manual selection only. The page always opens with no employee selected.
  const [targetUserId, setTargetUserId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshTelemetry = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let debounce;
    setAnalysis(null);
    setTelemetryError("");
    setLastUpdated(null);
    setTelemetryLoading(false);
    if (!targetUserId || !fetchJson) return;

    const loadAnalysis = async () => {
      if (cancelled) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      setTelemetryLoading(true);
      try {
        const result = await fetchJson(`/api/risk/analysis/${encodeURIComponent(targetUserId)}`);
        if (cancelled) return;
        if (!result?.success || result.analysis?.userId !== targetUserId || !Array.isArray(result.analysis?.history)) {
          throw new Error(result?.error?.message || result?.message || (typeof result?.error === "string" ? result.error : "Unable to load risk analysis"));
        }
        setAnalysis(result.analysis);
        setTelemetryError("");
        setLastUpdated(new Date());
      } catch (error) {
        if (!cancelled) setTelemetryError(`${error.message}. Previously loaded analysis may be out of date. Refresh to retry.`);
      } finally {
        inFlight = false;
        if (!cancelled) {
          setTelemetryLoading(false);
          if (queued) { queued = false; loadAnalysis(); }
        }
      }
    };
    refreshTelemetry.current = loadAnalysis;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(loadAnalysis, 300);
    };
    loadAnalysis();
    const timer = setInterval(loadAnalysis, 30000);
    window.addEventListener("cyberorbit-endpoint-updated", scheduleRefresh);
    return () => {
      cancelled = true;
      refreshTelemetry.current = null;
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("cyberorbit-endpoint-updated", scheduleRefresh);
    };
  }, [targetUserId, fetchJson]);

  useEffect(() => {
    if (!isRefreshing) refreshTelemetry.current?.();
  }, [isRefreshing, events]);

  useEffect(() => {
    if (targetUserId && !users.some(user => String(user.id) === targetUserId)) setTargetUserId("");
  }, [users, targetUserId]);

  const targetUser = useMemo(() => users.find(user => String(user.id) === targetUserId) || null, [users, targetUserId]);
  const hasTelemetry = analysis?.hasTelemetry === true;
  const riskScore = analysis?.riskScore ?? null;
  const trustScore = analysis?.trustScore ?? null;
  const rfProbability = analysis?.ml?.probability ?? null;
  const riskFactors = (analysis?.contributingFactors || []).map(factor => ({
    name: factor.factor, score: factor.scoreImpact, description: factor.description,
  }));
  const riskHistory = analysis?.history || [];
  const formatScore = value => typeof value === "number" && Number.isFinite(value) ? value.toFixed(Number.isInteger(value) ? 0 : 1) : "N/A";
  const formatProbability = value => typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
  // ======================================================
  // MAIN PAGE
  // ======================================================

  return (
    <div
      className="min-h-full overflow-x-hidden"
      style={{
        backgroundColor: pageBackground,
        color: primaryText,
      }}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
        {/* ==================================================
            TOP BANNER
            ================================================== */}

        <section className="console-hero group relative min-h-[255px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
          {/* Master SettingsPage corner accents */}
          <div className="pointer-events-none absolute left-0 top-0 z-20 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.35)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 z-20 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.35)]" />

          {/* Integrated AI / Risk Visualization */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] overflow-hidden lg:block">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(103,232,249,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.07) 1px, transparent 1px)",
                backgroundSize: "78px 78px",
              }}
            />
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050A10] to-transparent" />
            <div className="absolute right-[12%] top-1/2 h-[250px] w-[250px] -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
            <div className="absolute right-[18%] top-1/2 h-[190px] w-[190px] -translate-y-1/2 rounded-full border border-[#D4AF37]/20" />
            <div className="absolute right-[24%] top-1/2 h-[132px] w-[132px] -translate-y-1/2 rounded-full border border-[#67E8F9]/20" />
            <div className="absolute right-[30%] top-1/2 flex h-[82px] w-[82px] -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/35 bg-[#050A10]/90 shadow-[0_0_35px_rgba(103,232,249,0.08)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#070C12] text-[#67E8F9]">
                <BrainCircuit className="h-7 w-7" strokeWidth={1.4} />
              </div>
            </div>
            <div className="absolute right-[14%] top-[18%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.55)]" />
            <div className="absolute right-[8%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.55)]" />
            <div className="absolute bottom-[17%] right-[31%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.55)]" />
            <div className="absolute right-[7%] top-[25%] rounded-lg border border-[#67E8F9]/15 bg-[#050A10]/80 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">
              <span className="mr-2 text-[#67E8F9]">◈</span> AI ENGINE
            </div>
            <div className="absolute bottom-[18%] right-[10%] rounded-lg border border-[#D4AF37]/20 bg-[#050A10]/80 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">
              <span className="mr-2 text-[#D4AF37]">◆</span> RISK MATRIX
            </div>
          </div>

          <div className="relative z-10 flex min-h-[255px] items-center px-6 py-7 sm:px-8 lg:px-9">
            <div className="w-full max-w-[74%]">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                    ● MATHEMATICAL EVALUATION
                  </span>

                  <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                    BEHAVIORAL EVIDENCE · RISK INSIGHTS
                  </span>
                </div>

                <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                  AI <span className="text-[#67E8F9]">Risk Analysis</span>
                </h1>

                <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
                  Risk scores, contributing evidence, and behavioral trends calculated from recorded activity.
                </p>
              </div>

              {/* Manual Employee Selector */}
              <div className="absolute bottom-7 right-8 z-20 flex items-center gap-3 sm:right-9">
                <span className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  TARGET
                </span>

                <select
                  aria-label="Risk analysis employee"
                  value={targetUserId}
                  onChange={(e) => {
                    setTargetUserId(e.target.value);
                  }}
                  disabled={users.length === 0}
                  className="h-10 min-w-[240px] rounded-xl border border-white/10 bg-[#03070C] px-3 text-[13px] text-[#F4F7FA] outline-none transition-all duration-200 hover:border-[#67E8F9]/30 hover:bg-[#070C12] focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10"
                >
                  <option value="">
                    Select Employee
                  </option>
                  {users.map((user) => (
  <option key={user.id} value={user.id}>
    {user.name} — {user.employeeId || user.id}
  </option>
))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {targetUser && (
          <section aria-label="Risk analysis summary" aria-busy={telemetryLoading} className="rounded-2xl border border-white/10 bg-[#050A10] p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl text-[#F4F7FA]">Behavioral risk assessment</h2>
                <p className="mt-1 text-sm text-[#7F8A96]">Last 24 hours · {analysis?.coverage ? `${analysis.coverage.endpointEvents + analysis.coverage.securityEvents} recorded observations reviewed` : "Analysing recorded observations"}</p>
              </div>
              <button type="button" aria-label="Refresh risk analysis" disabled={telemetryLoading} onClick={() => refreshTelemetry.current?.()} className="flex items-center gap-2 rounded-lg border border-[#67E8F9]/25 px-3 py-2 text-sm text-[#67E8F9] disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${telemetryLoading ? "animate-spin" : ""}`} />
                {telemetryLoading ? "Analysing..." : "Refresh analysis"}
              </button>
            </div>
            {telemetryError && <p role="alert" className="text-sm text-red-300">{telemetryError}</p>}
            {hasTelemetry && <>
              <p className="text-[#A7B0BA]"><span className="font-semibold text-[#D4AF37]">{analysis.riskLevel} RISK</span> · {analysis.explanation}</p>
              <p className="text-sm text-[#67E8F9]">Recommendation: {analysis.recommendation}</p>
            </>}
            {lastUpdated && <p className="text-xs text-[#7F8A96]">Last analysed: {lastUpdated.toLocaleString()}. Updates as new observations arrive.</p>}
          </section>
        )}
        {!targetUser ? (
          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#D4AF37]">
              <UserCheck className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="mt-5 text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">NO EMPLOYEE SELECTED</div>
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">Select an employee from the TARGET list above to inspect recorded security telemetry.</p>
          </section>
        ) : telemetryLoading && !hasTelemetry ? (
  <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center sm:p-12">
    <div className="text-[13px] font-semibold text-[#67E8F9]">
      ANALYSING RECORDED ACTIVITY...
    </div>
    <p className="mt-2 text-[13px] text-[#7F8A96]">
      Evaluating behavioral risk for {targetUser.name}.
    </p>
  </section>
) : telemetryError && !hasTelemetry ? (
  <section className="rounded-2xl border border-red-500/20 bg-[#050A10] p-8 text-center sm:p-12">
    <div className="text-[13px] font-semibold text-red-400">
      RISK ANALYSIS UNAVAILABLE
    </div>
    <p className="mt-2 text-[13px] text-[#7F8A96]">
      {telemetryError}
    </p>
  </section>
) : !hasTelemetry ? (
          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#D4AF37]">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="mt-5 text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">NO TELEMETRY AVAILABLE</div>
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">No recorded activity is available for {targetUser.name} in the last 24 hours.</p>
          </section>
        ) : (
          <>
        {/* ==================================================
            TOP 4 REQUIRED METRICS
            ================================================== */}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Risk Score */}

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
            <div className="flex items-start justify-between">
              <span className="text-[12px] font-medium tracking-[0.12em] text-[#A7B0BA]">
                OBSERVED RISK SCORE
              </span>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#D4AF37]">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="mt-5 text-4xl font-light tracking-[-0.04em] text-[#D4AF37]">
              {formatScore(riskScore)} <span className="text-sm text-[#7F8A96]">/ 100</span>
            </div>

            <span className="mt-2 block text-[12px] text-[#7F8A96]">
              Highest observed risk in the last 24 hours · {analysis?.riskLevel}
            </span>
          </div>

          {/* 2. Trust Score */}

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
            <div className="flex items-start justify-between">
              <span className="text-[12px] font-medium tracking-[0.12em] text-[#A7B0BA]">
                TRUST SCORE
              </span>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="mt-5 text-4xl font-light tracking-[-0.04em]">
              {formatScore(trustScore)} <span className="text-sm text-[#7F8A96]">/ 100</span>
            </div>

            <span className="mt-2 block text-[12px] text-[#7F8A96]">
              {analysis?.trustTimestamp ? `Latest recorded trust · ${new Date(analysis.trustTimestamp).toLocaleString()}` : "No recorded trust assessment"}
            </span>
          </div>

          {/* 3. ML Anomaly Probability */}

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
            <div className="flex items-start justify-between">
              <span className="max-w-[180px] text-[12px] font-medium leading-4 tracking-[0.12em] text-[#A7B0BA]">
                ML THREAT PROBABILITY
              </span>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                <BrainCircuit className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="mt-5 text-4xl font-light tracking-[-0.04em]">
              {formatProbability(rfProbability)}
            </div>

            <span className="mt-2 block text-[12px] text-[#7F8A96]">
              {analysis?.ml?.available ? `Recorded model prediction · ${new Date(analysis.ml.timestamp).toLocaleString()}` : "Complete model inputs unavailable"}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><p className="text-xs tracking-wider text-[#A7B0BA]">ANALYSIS BASIS</p><p className="mt-4 text-sm text-[#67E8F9]">{analysis?.source}</p><p className="mt-3 text-xs leading-5 text-[#7F8A96]">Coverage: {analysis?.coverage?.status}. {analysis?.baselineBasis}: {analysis?.window?.normalStartHour}:00–{analysis?.window?.normalEndHour}:00 ({analysis?.window?.timezone}). Unobserved activity remains unassessed.</p></div>
        </section>

        {/* ==================================================
            COMPONENT ANALYSIS
            ================================================== */}

        <section
          className={`
            rounded-2xl
            border
            ${panelClass}
            p-5
            sm:p-6
            lg:p-7
            shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)]
          `}
        >
          <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                COMPONENT ANALYSIS
              </span>

              <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Contributing Risk Factors
              </h3>
            </div>

            <span className="text-[12px] text-[#7F8A96]">
              NORMALIZED SCALE (0-100)
            </span>
          </div>

          <div className="mt-7 space-y-7">
            {riskFactors.length === 0 && <p className="text-sm text-[#A7B0BA]">No elevated factors were found in the available evidence. Missing inputs are listed in Evidence Coverage.</p>}
            {riskFactors.map((factor, idx) => (
              <div key={idx} className="space-y-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium text-[#F4F7FA]">
                      {factor.name}
                    </span>

                    <span className="rounded-md border border-[#D4AF37]/20 bg-[#D4AF37]/[0.035] px-1.5 py-0.5 text-[12px] text-[#D4AF37]">
                      Observed contribution: +{factor.score}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#67E8F9]">
                      {factor.score !== null ? `${formatScore(factor.score)} / 100` : "N/A"}
                    </span>
                  </div>
                </div>

                <p className="text-xs leading-5 text-[#7F8A96]">{factor.description}</p>

                {/* Elegant Visual Bar */}

                <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.045]">
                  <div
                    className="h-full rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.25)] transition-all duration-700 ease-out"
                    style={{
                      width: `${factor.score !== null ? factor.score : 0}%`,
                    }}
                  />

                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[#D4AF37]/20"
                    style={{
                      width: `${Math.min(factor.score, 20)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ==================================================
            RADAR ANALYSIS & HISTORICAL TIME-SERIES
            ================================================== */}

        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* ==================================================
              RISK & ML EVOLUTION
              ================================================== */}

          <div
            className={`
              rounded-2xl
              border
              ${panelClass}
              p-6
              sm:p-8
              lg:col-span-7
              shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)]
            `}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                  CHRONOLOGY
                </span>

                <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Risk Trend · Last 24 Hours
                </h3>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-[#7F8A96]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
                Risk
                {analysis?.ml?.available && <><span className="ml-2 h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />ML</>}
              </div>
            </div>

            <div className="h-64 w-full">
              {riskHistory.every(point => point.score === null && point.mlProb === null) ? <p className="flex h-full items-center justify-center text-center text-sm text-[#7F8A96]">No scored interactive observations or security assessments are available for this window.</p> :
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={riskHistory}
                  margin={{
                    top: 8,
                    right: 8,
                    left: -18,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient id="aiCyanArea" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#67E8F9"
                        stopOpacity={0.24}
                      />

                      <stop offset="95%" stopColor="#67E8F9" stopOpacity={0} />
                    </linearGradient>

                    <linearGradient id="aiGoldArea" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#D4AF37"
                        stopOpacity={0.14}
                      />

                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <XAxis
                    dataKey="time"
                    tickFormatter={value => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    stroke="#596570"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{
                      stroke: "rgba(255,255,255,0.07)",
                    }}
                  />

                  <YAxis
                    stroke="#596570"
                    fontSize={10}
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={{
                      stroke: "rgba(255,255,255,0.07)",
                    }}
                  />

                  <Tooltip
                    labelFormatter={value => new Date(value).toLocaleString()}
                    contentStyle={{
                      backgroundColor: "#050A10",
                      borderColor: "rgba(103,232,249,0.25)",
                      borderWidth: "1px",
                      borderRadius: "10px",
                      color: "#F4F7FA",
                      fontSize: "0.75rem",
                    }}
                    labelStyle={{
                      color: "#67E8F9",
                      marginBottom: "4px",
                    }}
                    itemStyle={{
                      color: "#A7B0BA",
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#67E8F9"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#aiCyanArea)"
                    name="Observed risk"
                  />

                  {analysis?.ml?.available && <Area
                    type="monotone"
                    dataKey="mlProb"
                    stroke="#D4AF37"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#aiGoldArea)"
                    name="Model threat probability %"
                  />}
                </AreaChart>
              </ResponsiveContainer>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#050A10] p-6 sm:p-8 lg:col-span-5">
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">EVIDENCE COVERAGE</span>
            <h3 className="mt-1 text-2xl font-light text-[#F4F7FA]">What this assessment covers</h3>
            <div className="mt-5 space-y-4">
              {(analysis?.vectors || []).map(vector => <div key={vector.name} className="border-b border-white/10 pb-3">
                <div className="flex justify-between gap-3"><p className="text-sm font-medium">{vector.name}</p><span className={`text-xs ${vector.status === "Observed" ? "text-[#67E8F9]" : "text-[#7F8A96]"}`}>{vector.status}</span></div>
                <p className="mt-1 text-xs leading-5 text-[#7F8A96]">{vector.detail}</p>
              </div>)}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#7F8A96]">{analysis?.coverage?.verifiedEvents} observations attributed to the employee; {analysis?.coverage?.deviceWideEvents} device-wide observations. Device-wide evidence describes activity on assigned laptops, without identifying the operator.</p>
            {analysis?.coverage?.truncated && <p role="status" className="mt-3 text-sm text-[#D4AF37]">The analysis limit was reached. Scores and trends use the latest 5,000 interactive observations and 5,000 security assessments; totals include all stored observations in the window.</p>}
          </div>
        </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AiRiskAnalysisPage;
