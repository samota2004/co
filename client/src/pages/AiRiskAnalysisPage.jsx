// ======================================================
// IMPORTS
// ======================================================

import React, { useState, useEffect, useMemo } from "react";

import {
  Layers,
  BrainCircuit,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  UserCheck,
} from "lucide-react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";


// ======================================================
// MAIN COMPONENT
// ======================================================

export const AiRiskAnalysisPage = ({
  users = [],
  events = [],
  fetchJson,
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
const [employeeEvents, setEmployeeEvents] = useState([]);
const [telemetryLoading, setTelemetryLoading] = useState(false);
const [telemetryError, setTelemetryError] = useState("");

useEffect(() => {
  let cancelled = false;

  if (!targetUserId || !fetchJson) {
    setEmployeeEvents([]);
    setTelemetryError("");
    setTelemetryLoading(false);
    return;
  }

  setEmployeeEvents([]);
  setTelemetryError("");
  setTelemetryLoading(true);

  const loadTelemetry = async () => {
    try {
      const result = await fetchJson(
        `/api/users/${encodeURIComponent(targetUserId)}`
      );

      if (cancelled) return;

      if (!result?.success) {
        throw new Error(result?.message || "Unable to load employee telemetry");
      }

      setEmployeeEvents(
        Array.isArray(result.events) ? result.events : []
      );
    } catch (error) {
      if (!cancelled) {
        setTelemetryError(error.message);
        setEmployeeEvents([]);
      }
    } finally {
      if (!cancelled) setTelemetryLoading(false);
    }
  };

  loadTelemetry();

  return () => {
    cancelled = true;
  };
}, [targetUserId, fetchJson]);
  useEffect(() => {
    if (targetUserId && !users.some((user) => user.id === targetUserId)) {
      setTargetUserId("");
    }
  }, [users, targetUserId]);

  const targetUser = useMemo(() => {
    if (!targetUserId) return null;
    return (
      users.find((user) => String(user.id) === String(targetUserId)) || null
    );
  }, [users, targetUserId]);

  // ======================================================
  // ACTUAL TELEMETRY
  // ======================================================

  const userEvents = useMemo(() => {
  if (!targetUser) return [];

  return employeeEvents
    .filter(
      (event) =>
        String(event.userId ?? "") === String(targetUser.id)
    )
    .sort((a, b) => {
      const dateA = new Date(
        a.timestamp || a.createdAt || a.time || 0
      ).getTime();

      const dateB = new Date(
        b.timestamp || b.createdAt || b.time || 0
      ).getTime();

      return dateB - dateA;
    });
}, [employeeEvents, targetUser]);

  // Generic application events are not automatically AI telemetry.
  // The analysis branch opens only when at least one selected-user event
  // contains an actual AI/risk signal.
  const isAiTelemetryEvent = (event) => {
    if (!event) return false;

    const sources = [
  event,
  event.metadata,
  event.metadata?.evaluation,
  event.ml,
  event.evaluation,
  event.decision?.evaluation,
].filter(Boolean);

    const aiKeys = [
      "riskScore",
      "riskContribution",
      "trustScore",
      "supervisedProbability",
      "rfProbability",
      "isolationForestScore",
      "iforestScore",
      "authenticationRisk",
      "authRisk",
      "deviceRisk",
      "networkRisk",
      "dataTransferRisk",
    ];

    return sources.some((source) =>
      aiKeys.some((key) => {
        const value = source?.[key];
        return (
          typeof value === "number" && Number.isFinite(value)
        ) || (
          typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
        );
      })
    );
  };

  const aiTelemetryEvents = userEvents.filter(isAiTelemetryEvent);
  const hasTelemetry = aiTelemetryEvents.length > 0;
  const latestEvent = aiTelemetryEvents[0] || null;

  const getNumber = (...values) => {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };

  const normalizeScore = (...values) => {
    const value = getNumber(...values);
    return value === null ? null : Math.min(100, Math.max(0, value));
  };
  const evaluation = latestEvent?.metadata?.evaluation || latestEvent?.evaluation || latestEvent;
  const riskScore = normalizeScore(evaluation?.riskScore, latestEvent?.riskContribution);
  const trustScore = normalizeScore(evaluation?.trustScore);
  const rfProbability = getNumber(latestEvent?.metadata?.ml?.threat_probability, latestEvent?.mlThreatProbability);
  const riskFactors = (evaluation?.contributingFactors || []).map(factor => ({
    name: factor.factor, score: factor.scoreImpact, description: factor.description
  }));

  const radarData = riskFactors
    .filter((factor) => factor.score !== null)
    .map((factor) => ({ subject: factor.name.replace(" Risk", ""), value: factor.score, fullMark: 100 }));

  // Historical chart is built only from real recorded events.
  const riskHistory = aiTelemetryEvents
    .map((event, index) => {
      const eventRisk = normalizeScore(
        event?.metadata?.evaluation?.riskScore, event?.riskScore, event?.riskContribution,
        event?.metadata?.riskContribution, event?.evaluation?.riskScore,
        event?.decision?.evaluation?.riskScore
      );
      const eventMlProbability = getNumber(event?.metadata?.ml?.threat_probability, event?.mlThreatProbability);
      if (eventRisk === null && eventMlProbability === null) return null;
      return {
        time: event.timestamp || event.createdAt || event.time || `Event ${index + 1}`,
        score: eventRisk,
        mlProb: eventMlProbability === null ? null : Math.min(100, Math.max(0, eventMlProbability <= 1 ? eventMlProbability * 100 : eventMlProbability)),
      };
    })
    .filter(Boolean)
    .reverse()
    .slice(-20);

  const formatScore = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
    return Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1);
  };

  const formatProbability = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
    const normalized = Number(value) <= 1 ? Number(value) * 100 : Number(value);
    return `${Math.min(100, Math.max(0, normalized)).toFixed(1)}%`;
  };

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
                    STORED CONTEXT · APPROVED MODEL INPUTS
                  </span>
                </div>

                <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                  AI <span className="text-[#67E8F9]">Risk Analysis</span>
                </h1>

                <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
                  Recorded contextual risk factors and real supervised model predictions, when complete model inputs are available.
                </p>
              </div>

              {/* Manual Employee Selector */}
              <div className="absolute bottom-7 right-8 z-20 flex items-center gap-3 sm:right-9">
                <span className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  TARGET
                </span>

                <select
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

        {!targetUser ? (
          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#D4AF37]">
              <UserCheck className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="mt-5 text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">NO EMPLOYEE SELECTED</div>
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">Select an employee from the TARGET list above to inspect recorded security telemetry.</p>
          </section>
        ) : telemetryLoading ? (
  <section className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center sm:p-12">
    <div className="text-[13px] font-semibold text-[#67E8F9]">
      LOADING EMPLOYEE TELEMETRY...
    </div>
    <p className="mt-2 text-[13px] text-[#7F8A96]">
      Fetching recorded security events for {targetUser.name}.
    </p>
  </section>
) : telemetryError ? (
  <section className="rounded-2xl border border-red-500/20 bg-[#050A10] p-8 text-center sm:p-12">
    <div className="text-[13px] font-semibold text-red-400">
      TELEMETRY LOAD FAILED
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
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-5 text-[#7F8A96]">{targetUser.name} has no recorded security telemetry yet.</p>
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
                RISK SCORE
              </span>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#D4AF37]">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="mt-5 text-4xl font-light tracking-[-0.04em] text-[#D4AF37]">
              {formatScore(riskScore)} <span className="text-sm text-[#7F8A96]">/ 100</span>
            </div>

            <span className="mt-2 block text-[12px] text-[#7F8A96]">
              Stored contextual risk, 0–100
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
              Recorded adaptive trust
            </span>
          </div>

          {/* 3. ML Anomaly Probability */}

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7">
            <div className="flex items-start justify-between">
              <span className="max-w-[180px] text-[12px] font-medium leading-4 tracking-[0.12em] text-[#A7B0BA]">
                ML ANOMALY PROBABILITY
              </span>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                <BrainCircuit className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="mt-5 text-4xl font-light tracking-[-0.04em]">
              {formatProbability(rfProbability)}
            </div>

            <span className="mt-2 block text-[12px] text-[#7F8A96]">
              Random Forest supervised tree probability
            </span>
          </div>

          <div className="rounded-xl border border-cyan-900 p-5"><p>Assessment sources</p><p className="mt-4">Contextual rules and historical baseline. Random Forest inference is available only for complete approved user-day inputs. No Isolation Forest is deployed.</p></div>
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
                Risk Vectors &amp; Mathematical Bars
              </h3>
            </div>

            <span className="text-[12px] text-[#7F8A96]">
              NORMALIZED SCALE (0-100)
            </span>
          </div>

          <div className="mt-7 space-y-7">
            {riskFactors.length === 0 && <p>No elevated factors were recorded for this assessment.</p>}
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
                    <span className="hidden max-w-[600px] truncate text-[12px] text-[#7F8A96] xl:inline">
                      {factor.description}
                    </span>

                    <span className="text-sm font-semibold text-[#67E8F9]">
                      {factor.score !== null ? `${formatScore(factor.score)} / 100` : "N/A"}
                    </span>
                  </div>
                </div>

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
                  Risk &amp; ML Evolution
                </h3>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-[#7F8A96]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
                Risk
                <span className="ml-2 h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                ML
              </div>
            </div>

            <div className="h-64 w-full">
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
                    name="Composite Risk"
                  />

                  <Area
                    type="monotone"
                    dataKey="mlProb"
                    stroke="#D4AF37"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#aiGoldArea)"
                    name="ML Prob %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ==================================================
              MULTI-VECTOR RADAR
              ================================================== */}

          <div
            className={`
              flex
              flex-col
              justify-between
              rounded-2xl
              border
              ${panelClass}
              p-6
              sm:p-8
              lg:col-span-5
              shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.07)]
            `}
          >
            <div>
              <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                GEOMETRIC SURFACE
              </span>

              <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Multi-Vector Radar
              </h3>
            </div>

            <div className="my-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid
                    stroke="rgba(103,232,249,0.12)"
                  />

                  <PolarAngleAxis
                    dataKey="subject"
                    stroke="#A7B0BA"
                    fontSize={9}
                  />

                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    stroke="#596570"
                    fontSize={8}
                  />

                  <Tooltip
                    shared={false}
                    cursor={false}
                    contentStyle={{
                      backgroundColor: "#050A10",
                      borderColor: "rgba(103,232,249,0.35)",
                      borderWidth: "1px",
                      borderRadius: "10px",
                      color: "#F4F7FA",
                      fontSize: "12px",
                      padding: "10px 12px",
                    }}
                    labelStyle={{
                      color: "#67E8F9",
                      marginBottom: "4px",
                      fontSize: "12px",
                    }}
                    itemStyle={{
                      color: "#D4AF37",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${value} / 100`, "Risk Level"]}
                  />

                  <Radar
                    name="Risk Level"
                    dataKey="value"
                    stroke="#67E8F9"
                    fill="#67E8F9"
                    fillOpacity={0.14}
                    strokeWidth={2}
                    strokeDasharray="0"
                    dot={{
                      r: 0,
                      fill: "transparent",
                      stroke: "transparent",
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 5,
                      fill: "#F4F7FA",
                      stroke: "#67E8F9",
                      strokeWidth: 2,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="border-t border-white/[0.07] pt-4 text-center text-[12px] text-[#7F8A96]">
              User: <span className="text-[#A7B0BA]">{targetUser?.name}</span> •
              ID:{" "}
              <span className="text-[#67E8F9]">{targetUser?.employeeId}</span>
            </div>
          </div>
        </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AiRiskAnalysisPage;
