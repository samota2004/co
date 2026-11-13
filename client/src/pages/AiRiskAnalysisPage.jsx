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

export const AiRiskAnalysisPage = ({
  users = [],
  events = [],
  fetchJson,
  isRefreshing = false,
}) => {
  // ======================================================
  // THEME
  // ======================================================

  const pageBackground = "#03070C";
  const primaryText = "#F4F7FA";
  const panelClass = "bg-[#050A10]";

  // ======================================================
  // STATE
  // ======================================================

  const [targetUserId, setTargetUserId] = useState("");
  const [historyRange, setHistoryRange] = useState("24h");
  const [analysis, setAnalysis] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshTelemetry = useRef(null);
  const previousEvents = useRef(events);

  // ======================================================
  // TELEMETRY FETCHING AND AUTO REFRESH
  // ======================================================

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let debounce;

    setAnalysis(null);
    setTelemetryError("");
    setLastUpdated(null);
    setTelemetryLoading(false);

    if (!targetUserId || !fetchJson) {
      refreshTelemetry.current = null;
      return undefined;
    }

    const loadAnalysis = async () => {
      if (cancelled) return;

      if (inFlight) {
        queued = true;
        return;
      }

      inFlight = true;
      setTelemetryLoading(true);

      try {
        const result = await fetchJson(
          `/api/risk/analysis/${encodeURIComponent(
            targetUserId,
          )}?range=${historyRange}`,
        );

        if (cancelled) return;

        if (
          !result?.success ||
          result.analysis?.userId !== targetUserId ||
          !Array.isArray(result.analysis?.history)
        ) {
          throw new Error(
            result?.error?.message ||
              result?.message ||
              (typeof result?.error === "string"
                ? result.error
                : "Unable to load risk analysis"),
          );
        }

        setAnalysis(result.analysis);
        setTelemetryError("");
        setLastUpdated(new Date());
      } catch (error) {
        if (!cancelled) {
          setTelemetryError(
            `${error?.message || "Unknown error"}. Previously loaded analysis may be out of date. Refresh to retry.`,
          );
        }
      } finally {
        inFlight = false;

        if (!cancelled) {
          setTelemetryLoading(false);

          if (queued) {
            queued = false;
            loadAnalysis();
          }
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

    window.addEventListener(
      "cyberorbit-endpoint-updated",
      scheduleRefresh,
    );

    return () => {
      cancelled = true;
      refreshTelemetry.current = null;

      clearTimeout(debounce);
      clearInterval(timer);

      window.removeEventListener(
        "cyberorbit-endpoint-updated",
        scheduleRefresh,
      );
    };
  }, [targetUserId, fetchJson, historyRange]);

  // ======================================================
  // EXTERNAL REFRESH HANDLING
  // Avoid an unnecessary extra fetch on initial render.
  // ======================================================

  useEffect(() => {
    const eventsChanged = previousEvents.current !== events;
    previousEvents.current = events;

    if (eventsChanged && !isRefreshing) {
      refreshTelemetry.current?.();
    }
  }, [events, isRefreshing]);

  // ======================================================
  // VALIDATE SELECTED USER
  // ======================================================

  useEffect(() => {
    if (
      targetUserId &&
      !users.some((user) => String(user.id) === targetUserId)
    ) {
      setTargetUserId("");
    }
  }, [users, targetUserId]);

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const targetUser = useMemo(
    () =>
      users.find((user) => String(user.id) === targetUserId) || null,
    [users, targetUserId],
  );

  const hasTelemetry = analysis?.hasTelemetry === true;

  const trustScore = analysis?.trustScore ?? null;
  const rfScore = analysis?.ml?.probability ?? null;

  const riskFactors = Array.isArray(analysis?.contributingFactors)
  ? analysis.contributingFactors.map((factor) => ({
      name: factor?.factor || "Unknown factor",
      score: factor?.scoreImpact ?? null,
      description: factor?.description || "No description available.",
    }))
  : [];

  const riskHistory = Array.isArray(analysis?.history)
    ? analysis.history
    : [];

  const windowLabel =
    historyRange === "24h"
      ? "last 24 hours"
      : `last ${historyRange}`;

  const formatScore = (value) =>
    typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(Number.isInteger(value) ? 0 : 1)
      : "N/A";

  const formatRfScore = (value) =>
    typeof value === "number" && Number.isFinite(value)
      ? `${(value * 100).toFixed(1)} / 100`
      : "N/A";

  const hasScoredHistory = riskHistory.some(
  (point) =>
    point &&
    [point.score, point.trust, point.mlProb].some(
      (value) =>
        typeof value === "number" && Number.isFinite(value),
    ),
);

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

<section className="group relative min-h-[210px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">

  {/* Subtle right-side background artwork */}
  <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] overflow-hidden lg:block">

    <div
      className="absolute inset-0 opacity-40"
      style={{
        backgroundImage:
          "linear-gradient(rgba(103,232,249,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.055) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
      }}
    />

    <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#050A10] to-transparent" />

    <div className="absolute right-[20%] top-1/2 h-[210px] w-[210px] -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />

    <div className="absolute right-[25%] top-1/2 h-[155px] w-[155px] -translate-y-1/2 rounded-full border border-[#D4AF37]/15" />

    <div className="absolute right-[30%] top-1/2 flex h-[82px] w-[82px] -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/25 bg-[#050A10]">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#070C12] text-[#67E8F9]">
        <BrainCircuit className="h-7 w-7" strokeWidth={1.4} />
      </div>
    </div>

    <div className="absolute right-[18%] top-[23%] h-2 w-2 rounded-full bg-[#D4AF37]" />

    <div className="absolute right-[12%] bottom-[25%] h-2 w-2 rounded-full bg-[#67E8F9]" />

    <div className="absolute right-[7%] top-[24%] rounded-lg border border-white/10 bg-[#050A10]/90 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#7F8A96]">
      <span className="mr-2 text-[#67E8F9]">◈</span>
      AI ENGINE
    </div>
  </div>

  {/* Main content */}
  <div className="relative z-10 flex min-h-[210px] flex-col justify-between gap-7 px-6 py-7 sm:px-8 lg:flex-row lg:items-end lg:px-9">

    <div className="max-w-2xl">

      <div className="mb-4 flex flex-wrap items-center gap-3">

        <span className="text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
          ● MATHEMATICAL EVALUATION
        </span>

        <span className="text-[12px] uppercase tracking-wider text-[#7F8A96]">
          BEHAVIORAL EVIDENCE · RISK INSIGHTS
        </span>

      </div>

      <h1 className="text-4xl font-light leading-[1.05] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
        AI <span className="text-[#67E8F9]">Risk Analysis</span>
      </h1>

      <p className="mt-4 max-w-xl text-[14px] leading-6 text-[#A7B0BA]">
        Risk scores, contributing evidence, and behavioral trends calculated from recorded activity.
      </p>

    </div>

    {/* Employee selector */}
    <div className="relative z-20 flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:min-w-[320px]">

      <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">
        TARGET EMPLOYEE
      </span>

      <select
        aria-label="Risk analysis employee"
        value={targetUserId}
        onChange={(e) => setTargetUserId(e.target.value)}
        disabled={users.length === 0}
        className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#03070C] px-4 text-[13px] text-[#F4F7FA] outline-none transition-all duration-300 hover:border-[#67E8F9]/40 focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[210px]"
      >
        <option value="">Select Employee</option>

        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {user.employeeId || user.id}
          </option>
        ))}
      </select>

    </div>

  </div>
</section>


        {/* ==================================================
            BEHAVIORAL RISK ASSESSMENT SUMMARY
        ================================================== */}

        {targetUser && (
          <section
            aria-label="Risk analysis summary"
            aria-busy={telemetryLoading}
            className="rounded-2xl border border-white/10 bg-[#050A10] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl text-[#F4F7FA]">
                  Behavioral risk assessment
                </h2>

                <p className="mt-1 text-sm text-[#7F8A96]">
                  {windowLabel} ·{" "}
                  {analysis?.coverage
                    ? `${
                        (analysis.coverage.endpointEvents || 0) +
                        (analysis.coverage.securityEvents || 0)
                      } recorded observations reviewed`
                    : "Analysing recorded observations"}
                </p>
              </div>

              <button
                type="button"
                aria-label="Refresh risk analysis"
                disabled={telemetryLoading}
                onClick={() => refreshTelemetry.current?.()}
                className="flex items-center gap-2 rounded-lg border border-[#67E8F9]/25 px-3 py-2 text-sm text-[#67E8F9] transition-all duration-300 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/[0.06] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    telemetryLoading ? "animate-spin" : ""
                  }`}
                />

                {telemetryLoading ? "Analysing..." : "Refresh analysis"}
              </button>
            </div>

            {telemetryError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3 text-sm text-red-300"
              >
                {telemetryError}
              </p>
            )}

            {hasTelemetry && (
              <>
                <p className="mt-3 text-[#A7B0BA]">
                  <span className="font-semibold text-[#D4AF37]">
                    {analysis.riskScore === null
                      ? "ACTIVITY OBSERVED"
                      : `${analysis.riskLevel} RISK`}
                  </span>{" "}
                  · {analysis.activitySummary || analysis.explanation}
                </p>

                <p className="mt-2 text-sm text-[#67E8F9]">
                  Recommendation: {analysis.recommendation}
                </p>
              </>
            )}

            {lastUpdated && (
              <p className="mt-3 text-xs text-[#7F8A96]">
                Last analysed: {lastUpdated.toLocaleString()}. Updates as
                new observations arrive.
              </p>
            )}
          </section>
        )}

        {/* ==================================================
            EMPLOYEE SELECTION AND DATA STATES
        ================================================== */}

        {!targetUser ? (
          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#070C12] sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#D4AF37]">
              <UserCheck className="h-6 w-6" strokeWidth={1.5} />
            </div>

            <div className="mt-5 text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              NO EMPLOYEE SELECTED
            </div>

            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">
              Select an employee from the TARGET list above to inspect
              recorded security telemetry.
            </p>
          </section>
        ) : telemetryLoading && !hasTelemetry ? (
          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-12">
            <div className="text-[13px] font-semibold text-[#67E8F9]">
              ANALYSING RECORDED ACTIVITY...
            </div>

            <p className="mt-2 text-[13px] text-[#7F8A96]">
              Evaluating behavioral risk for {targetUser.name}.
            </p>
          </section>
        ) : telemetryError && !hasTelemetry ? (
          <section className="rounded-2xl border border-red-500/20 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-12">
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

            <div className="mt-5 text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              NO ATTRIBUTED RISK EVIDENCE
            </div>

            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">
              No employee-attributed interactive activity or scored security
              assessment is available for {targetUser.name} in the{" "}
              {windowLabel}. Assigned-device observations remain visible
              separately and do not prove this employee acted.
            </p>
          </section>
        ) : (
          <>
                      {/* ==================================================
                TOP METRICS
            ================================================== */}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

              {/* CURRENT POLICY RISK */}

              <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
                <div className="flex items-start justify-between">
                  <span className="text-[12px] font-medium tracking-[0.12em] text-[#A7B0BA]">
                    CURRENT POLICY RISK
                  </span>

                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#D4AF37]">
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                </div>

                <div className="mt-5 text-4xl font-light tracking-[-0.04em] text-[#D4AF37]">
                  {typeof analysis?.accountRisk?.score !== "number" ||
!Number.isFinite(analysis.accountRisk.score)
  ? "Not assessed"
  : (
      <>
        {formatScore(analysis.accountRisk.score)}{" "}
        <span className="text-sm text-[#7F8A96]">
          / 100
        </span>
      </>
    )}
                </div>

                <span className="mt-2 block text-[12px] text-[#7F8A96]">
                  {typeof analysis?.accountRisk?.score !== "number" ||
!Number.isFinite(analysis.accountRisk.score)
  ? "No recorded account risk assessment yet"
  : `Saved account score used for policy decisions · ${analysis.accountRisk.level || "Level unavailable"}`}
                </span>

                <span className="mt-2 block text-[12px] text-[#A7B0BA]">
                  Recent activity:{" "}
                  {analysis?.activityDetected
                    ? analysis?.observedRiskScore === null
                      ? "detected; no additional qualifying endpoint risk evidence"
                      : "qualifying evidence detected and recorded"
                    : `none attributed in the ${windowLabel}`}
                  . This card shows the latest persisted account score used by
                  policy.
                </span>
              </div>

              {/* TRUST SCORE */}

              <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
                <div className="flex items-start justify-between">
                  <span className="text-[12px] font-medium tracking-[0.12em] text-[#A7B0BA]">
                    TRUST SCORE
                  </span>

                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                </div>

                <div className="mt-5 text-4xl font-light tracking-[-0.04em] text-[#F4F7FA]">
                  {trustScore == null ? (
                    <span className="text-2xl">Unassessed</span>
                  ) : (
                    <>
                      {formatScore(trustScore)}{" "}
                      <span className="text-sm text-[#7F8A96]">
                        / 100
                      </span>
                    </>
                  )}
                </div>

                <span className="mt-2 block text-[12px] text-[#7F8A96]">
                  {analysis?.trustBasis === "ACCOUNT_BASELINE"
                    ? "Stored account baseline · no adaptive assessment yet"
                    : analysis?.trustTimestamp
                      ? `Latest recorded trust · ${new Date(
                          analysis.trustTimestamp,
                        ).toLocaleString()}`
                      : "No stored trust score"}
                </span>
              </div>

              {/* RANDOM FOREST SCORE */}

              <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
                <div className="flex items-start justify-between">
                  <span className="max-w-[180px] text-[12px] font-medium leading-4 tracking-[0.12em] text-[#A7B0BA]">
                    RF SCORE (UNCALIBRATED)
                  </span>

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                    <BrainCircuit className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                </div>

                <div className="mt-5 text-4xl font-light tracking-[-0.04em] text-[#F4F7FA]">
                  {analysis?.ml?.available ? (
                    formatRfScore(rfScore)
                  ) : (
                    <span className="text-2xl">Awaiting inputs</span>
                  )}
                </div>

                <span className="mt-2 block text-[12px] text-[#7F8A96]">
                  {analysis?.ml?.available
                    ? `Recorded uncalibrated RF score · ${
                        analysis.ml.timestamp
                          ? new Date(analysis.ml.timestamp).toLocaleString()
                          : "timestamp unavailable"
                      }`
                    : analysis?.ml?.reason || "Model inputs unavailable"}
                </span>
              </div>

              {/* ANALYSIS BASIS */}

              <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:bg-[#070C12] sm:p-6 lg:p-7">
                <p className="text-xs tracking-wider text-[#A7B0BA]">
                  ANALYSIS BASIS
                </p>

                <p className="mt-4 text-sm text-[#67E8F9]">
                  {analysis?.source || "Not available"}
                </p>

                <p className="mt-3 text-xs leading-5 text-[#7F8A96]">
                  Coverage: {analysis?.coverage?.status || "Not available"}.{" "}
                  {analysis?.baselineBasis || "Baseline unavailable"}:{" "}
                  {analysis?.window?.normalStartHour ?? "--"}:00–
                  {analysis?.window?.normalEndHour ?? "--"}:00 (
                  {analysis?.window?.timezone || "Timezone unavailable"}).
                  Unobserved activity remains unassessed.
                </p>
              </div>
            </section>

            {/* ==================================================
                CONTRIBUTING RISK FACTORS
            ================================================== */}

            <section
              className={`
                rounded-2xl
                border border-white/10
                ${panelClass}
                p-5 sm:p-6 lg:p-7
                shadow-[0_18px_60px_rgba(0,0,0,0.18)]
                transition-all duration-300
                hover:-translate-y-0.5
                hover:border-[#67E8F9]/35
                hover:bg-[#070C12]
                hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)]
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
                {riskFactors.length === 0 && (
                  <p className="text-sm text-[#A7B0BA]">
                    No elevated factors were found in the available evidence.
                    Missing inputs are listed in Evidence Coverage.
                  </p>
                )}

                {riskFactors.map((factor, idx) => {
                  const validScore =
                    typeof factor.score === "number" &&
                    Number.isFinite(factor.score);

                  const barWidth = validScore
                    ? Math.min(Math.max(factor.score, 0), 100)
                    : 0;

                  const goldWidth = validScore
                    ? Math.min(Math.max(factor.score, 0), 20)
                    : 0;

                  return (
                    <div key={`${factor.name}-${idx}`} className="space-y-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-[#F4F7FA]">
                            {factor.name}
                          </span>

                          <span className="rounded-md border border-[#D4AF37]/20 bg-[#D4AF37]/[0.035] px-1.5 py-0.5 text-[12px] text-[#D4AF37]">
                            Observed contribution:{" "}
                            {validScore ? `+${factor.score}` : "N/A"}
                          </span>
                        </div>

                        <span className="text-sm font-semibold text-[#67E8F9]">
                          {validScore
                            ? `${formatScore(factor.score)} / 100`
                            : "N/A"}
                        </span>
                      </div>

                      <p className="text-xs leading-5 text-[#7F8A96]">
                        {factor.description || "No description available."}
                      </p>

                      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.045]">
                        <div
                          className="h-full rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.25)] transition-all duration-700 ease-out"
                          style={{ width: `${barWidth}%` }}
                        />

                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-[#D4AF37]/20"
                          style={{ width: `${goldWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
                        {/* ==================================================
                HISTORICAL RISK AND TRUST ANALYSIS
            ================================================== */}

            <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">

              {/* RISK & ML EVOLUTION */}

              <div
                className={`
                  rounded-2xl
                  border border-white/10
                  ${panelClass}
                  p-6 sm:p-8
                  lg:col-span-7
                  shadow-[0_18px_60px_rgba(0,0,0,0.18)]
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#67E8F9]/35
                  hover:bg-[#070C12]
                  hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)]
                `}
              >
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                      CHRONOLOGY
                    </span>

                    <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                      Risk &amp; Trust Trend · {historyRange.toUpperCase()}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#7F8A96]">
                    <label className="flex items-center gap-1">
                      Window

                      <select
                        aria-label="Risk analysis history range"
                        value={historyRange}
                        onChange={(event) =>
                          setHistoryRange(event.target.value)
                        }
                        className="ml-1 rounded-lg border border-white/15 bg-[#03070C] p-2 text-[#F4F7FA] outline-none transition-all hover:border-[#67E8F9]/40 focus:border-[#67E8F9]"
                      >
                        <option value="24h">24 hours</option>
                        <option value="7d">7 days</option>
                        <option value="30d">30 days</option>
                        <option value="90d">90 days</option>
                      </select>
                    </label>

                    <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
                    Risk

                    {analysis?.ml?.available && (
                      <>
                        <span className="ml-2 h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                        ML
                      </>
                    )}
                  </div>
                </div>

                <div className="h-64 w-full">
                  {!hasScoredHistory ? (
                    <p className="flex h-full items-center justify-center text-center text-sm text-[#7F8A96]">
                      No scored risk or trust history is available for this
                      window.
                    </p>
                  ) : (
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
                          <linearGradient
                            id="aiCyanArea"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#67E8F9"
                              stopOpacity={0.24}
                            />

                            <stop
                              offset="95%"
                              stopColor="#67E8F9"
                              stopOpacity={0}
                            />
                          </linearGradient>

                          <linearGradient
                            id="aiGoldArea"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#D4AF37"
                              stopOpacity={0.14}
                            />

                            <stop
                              offset="95%"
                              stopColor="#D4AF37"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>

                        <XAxis
                          dataKey="time"
                          tickFormatter={(value) =>
                            new Date(value).toLocaleString(
                              [],
                              historyRange === "24h"
                                ? {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                : {
                                    month: "short",
                                    day: "numeric",
                                  },
                            )
                          }
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
                          labelFormatter={(value) =>
                            new Date(value).toLocaleString()
                          }
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
                          connectNulls={false}
                        />

                        <Area
                          type="monotone"
                          dataKey="trust"
                          stroke="#D4AF37"
                          strokeWidth={1.5}
                          fillOpacity={0}
                          name="Recorded trust"
                          connectNulls={false}
                        />

                        {analysis?.ml?.available && (
                          <Area
                            type="monotone"
                            dataKey="mlProb"
                            stroke="#D4AF37"
                            strokeWidth={1.5}
                            fillOpacity={1}
                            fill="url(#aiGoldArea)"
                            name="Uncalibrated RF score × 100"
                            connectNulls={false}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
                            {/* ==================================================
                  EVIDENCE COVERAGE
              ================================================== */}

              <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(212,175,55,0.06)] sm:p-8 lg:col-span-5">
                <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                  EVIDENCE COVERAGE
                </span>

                <h3 className="mt-1 text-2xl font-light text-[#F4F7FA]">
                  What this assessment covers
                </h3>

                <div className="mt-5 space-y-4">
                 {(Array.isArray(analysis?.vectors) ? analysis.vectors : []).map(
  (vector, index) => ( 
                    <div
                      key={vector.name || index}
                      className="border-b border-white/10 pb-3 transition-colors duration-300 hover:border-[#67E8F9]/25"
                    >
                      <div className="flex justify-between gap-3">
                        <p className="text-sm font-medium text-[#F4F7FA]">
                          {vector.name || "Unnamed evidence"}
                        </p>

                        <span
                          className={`text-xs ${
                            vector.status === "Observed"
                              ? "text-[#67E8F9]"
                              : "text-[#7F8A96]"
                          }`}
                        >
                          {vector.status || "Unknown"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-5 text-[#7F8A96]">
                        {vector.detail || "No additional details available."}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-xs leading-5 text-[#7F8A96]">
                  {analysis?.coverage?.verifiedEvents ?? 0} observations
                  attributed to the employee;{" "}
                  {analysis?.coverage?.deviceWideEvents ?? 0} device-wide
                  observations. Device-wide evidence describes activity on
                  assigned laptops, without identifying the operator.
                </p>

                {analysis?.coverage?.truncated && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-3 text-sm text-[#D4AF37]"
                  >
                    The analysis limit was reached. Scores and trends use
                    the latest 5,000 interactive observations and 5,000
                    security assessments; totals include all stored
                    observations in the window.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AiRiskAnalysisPage;