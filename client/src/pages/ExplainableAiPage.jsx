import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BrainCircuit,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  UserRound,
  Activity,
  Clock3,
  Info,
  ChevronDown,
  Database,
} from "lucide-react";

import { useTheme } from "../context/ThemeContext";
import { requestApi } from "../services/api.js";

import {
  normalizeAttributions,
  formatNumber,
  formatShap,
  matchesExplanation,
} from "../services/xai.js";

export const ExplainableAiPage = ({
  users = [],
  events = [],
  fetchJson = requestApi,
  isRefreshing = false,
}) => {
  const { isDark } = useTheme();

  const [targetUserId, setTargetUserId] = useState("");
  const [record, setRecord] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useRef(null);
  const previousEvents = useRef(events);
  const previousRefreshing = useRef(isRefreshing);

  // CyberOrbit color palette.
  const colors = {
    cyan: "#67E8F9",
    gold: "#D4AF37",
    background: "#03070C",
    panel: "#050A10",
    text: "#F4F7FA",
    secondary: "#A7B0BA",
    muted: "#7F8A96",
  };

  // Prevent the previous employee's result from appearing
  // while a newly selected employee's analysis is loading.
  const analysis =
    record?.userId === targetUserId ? record : null;

  const targetUser = users.find(
    (user) => String(user.id) === targetUserId,
  );

  const panel = isDark
    ? "border-white/10 bg-[#050A10]"
    : "border-black/10 bg-white";

  const muted = isDark
    ? "text-[#A7B0BA]"
    : "text-slate-600";

  const section = `rounded-2xl border ${panel} p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)] transition-colors duration-300 sm:p-6 lg:p-7`;

  const inputClass = isDark
    ? "border-white/10 bg-[#03070C] text-[#F4F7FA] placeholder:text-[#596570]"
    : "border-black/10 bg-slate-50 text-slate-900 placeholder:text-slate-400";

  // Load recorded employee risk analysis.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let debounce;

    const controller = new AbortController();

    setRecord(null);
    setError("");
    setLastUpdated(null);
    setSearchQuery("");
    setLoading(false);

    if (!targetUserId) {
      refresh.current = null;
      return undefined;
    }

    const load = async () => {
      if (cancelled) return;

      if (inFlight) {
        queued = true;
        return;
      }

      inFlight = true;
      setLoading(true);

      try {
        const result = await fetchJson(
          `/api/risk/analysis/${encodeURIComponent(targetUserId)}`,
          { signal: controller.signal },
        );

        if (cancelled) return;

        if (
          !result?.success ||
          String(result.analysis?.userId) !== targetUserId ||
          !Array.isArray(result.analysis?.contributingFactors)
        ) {
          throw new Error(
            result?.error?.message ||
              result?.message ||
              (typeof result?.error === "string"
                ? result.error
                : "Unable to load employee explanations"),
          );
        }

        setRecord(result.analysis);
        setLastUpdated(new Date());
        setError("");
      } catch (failure) {
        if (!cancelled && failure?.name !== "AbortError") {
          setError(
            `${failure?.message || "Unable to load explanations"}. Previously loaded explanations may be out of date. Refresh to retry.`,
          );
        }
      } finally {
        inFlight = false;

        if (!cancelled) {
          setLoading(false);

          if (queued) {
            queued = false;
            load();
          }
        }
      }
    };

    refresh.current = load;

    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 300);
    };

    load();

    const timer = setInterval(load, 30000);

    window.addEventListener(
      "cyberorbit-endpoint-updated",
      schedule,
    );

    return () => {
      cancelled = true;
      controller.abort();
      refresh.current = null;

      clearTimeout(debounce);
      clearInterval(timer);

      window.removeEventListener(
        "cyberorbit-endpoint-updated",
        schedule,
      );
    };
  }, [targetUserId, fetchJson]);

  // Refresh when new endpoint events arrive or an external
  // refresh operation finishes. Skip the initial render.
  useEffect(() => {
    const eventsChanged = previousEvents.current !== events;
    const refreshFinished =
      previousRefreshing.current && !isRefreshing;

    previousEvents.current = events;
    previousRefreshing.current = isRefreshing;

    if (!isRefreshing && (eventsChanged || refreshFinished)) {
      refresh.current?.();
    }
  }, [isRefreshing, events]);

  // Clear selection if the employee no longer exists.
  useEffect(() => {
    if (
      targetUserId &&
      !users.some(
        (user) => String(user.id) === targetUserId,
      )
    ) {
      setTargetUserId("");
    }
  }, [targetUserId, users]);

  // Normalize saved model attributions.
  const {
    contributions,
    summaries,
    invalidCount,
  } = useMemo(
    () => normalizeAttributions(analysis?.ml?.reasons),
    [analysis],
  );

  const query = searchQuery.trim().toLowerCase();

  const factors = analysis?.contributingFactors || [];

  const filteredFactors = factors.filter((factor) =>
    matchesExplanation(
      [
        factor.factor,
        factor.category,
        factor.description,
        factor.scoreImpact,
      ],
      query,
    ),
  );

  const filteredContributions = contributions.filter((reason) =>
    matchesExplanation(
      [
        reason.feature,
        reason.value,
        reason.shap_value,
        reason.impact,
      ],
      query,
    ),
  );

  const filteredSummaries = summaries.filter((summary) =>
    matchesExplanation([summary], query),
  );

  const modelAvailable = analysis?.ml?.available === true;

  const probability = analysis?.ml?.probability;

  const probabilityRecorded =
    modelAvailable &&
    typeof probability === "number" &&
    Number.isFinite(probability) &&
    probability >= 0 &&
    probability <= 1;

  const hasSearchResults =
    filteredFactors.length > 0 ||
    filteredContributions.length > 0 ||
    filteredSummaries.length > 0;

  const formatTimestamp = (value) => {
    if (!value) return "Timestamp unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Timestamp unavailable"
      : date.toLocaleString();
  };

  return (
    <div
      className={`min-h-full overflow-x-hidden ${
        isDark
          ? "bg-[#03070C] text-[#F4F7FA]"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-10 pt-2 sm:px-6 lg:px-8">

        {/* Page hero */}
        <section
          className={`relative overflow-hidden rounded-2xl border ${
            isDark
              ? "border-[#67E8F9]/40 bg-[#050A10]"
              : "border-cyan-200 bg-white"
          } p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/65 sm:p-8`}
        >
          {isDark && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] opacity-30 lg:block"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(103,232,249,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.07) 1px, transparent 1px)",
                  backgroundSize: "64px 64px",
                }}
              />

              <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#67E8F9]/[0.05] blur-3xl" />

              <div className="pointer-events-none absolute right-[12%] top-1/2 hidden h-48 w-48 -translate-y-1/2 rounded-full border border-[#67E8F9]/10 lg:block" />

              <div className="pointer-events-none absolute right-[16%] top-1/2 hidden h-32 w-32 -translate-y-1/2 rounded-full border border-[#67E8F9]/15 lg:block" />

              <div className="pointer-events-none absolute right-[20%] top-1/2 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/25 bg-[#03070C] text-[#67E8F9] lg:flex">
                <BrainCircuit className="h-7 w-7" />
              </div>

              <div className="pointer-events-none absolute right-[9%] top-[25%] hidden h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.5)] lg:block" />

              <div className="pointer-events-none absolute right-[5%] bottom-[25%] hidden h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.5)] lg:block" />
            </>
          )}

          <div className="relative z-10">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#D4AF37]">
                ● EXPLAINABLE AI
              </span>

              <span className="text-[11px] uppercase tracking-wider text-[#7F8A96]">
                RECORDED EVIDENCE · MODEL INSIGHTS
              </span>
            </div>

            <h1 className="max-w-3xl text-3xl font-light tracking-tight sm:text-4xl lg:text-5xl">
              Why was this activity{" "}
              <span className="text-[#67E8F9]">
                considered risky?
              </span>
            </h1>

            <p className={`mt-4 max-w-3xl text-sm leading-6 ${muted}`}>
              Inspect contextual risk factors and the feature
              contributions from recorded CERT model predictions.
              Each explanation shows its source.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <label
                htmlFor="xai-employee"
                className={`text-[11px] uppercase tracking-[0.16em] ${muted}`}
              >
                Target employee
              </label>

              <select
                id="xai-employee"
                aria-label="Explainable AI employee"
                value={targetUserId}
                onChange={(event) =>
                  setTargetUserId(event.target.value)
                }
                disabled={!users.length}
                className={`min-w-[230px] rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10 disabled:cursor-not-allowed disabled:opacity-50 ${inputClass}`}
              >
                <option value="">
                  {users.length
                    ? "Select employee"
                    : "No employees available"}
                </option>

                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.employeeId || user.id}
                  </option>
                ))}
              </select>

              <button
                type="button"
                aria-label="Refresh explanations"
                disabled={!targetUserId || loading}
                onClick={() => refresh.current?.()}
                className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/[0.05] px-4 py-3 text-sm text-[#67E8F9] transition-all hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loading ? "animate-spin" : ""
                  }`}
                />

                {loading ? "Loading..." : "Refresh explanations"}
              </button>
            </div>
          </div>
        </section>
                {/* Employee explanation workspace */}
        <div
          aria-label="Employee risk explanations"
          aria-busy={loading}
          className="space-y-5"
        >
          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4 text-sm text-red-400"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

              <p>{error}</p>
            </div>
          )}

          {/* No employee selected */}
          {!targetUser ? (
            <section className={`${section} py-12 text-center`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] text-[#D4AF37]">
                <UserRound className="h-7 w-7" />
              </div>

              <h2 className="mt-5 text-xl font-medium">
                Select an employee
              </h2>

              <p className={`mx-auto mt-2 max-w-lg text-sm leading-6 ${muted}`}>
                Choose an employee to load their recorded risk
                factors and model explanations.
              </p>
            </section>
          ) : loading && !analysis ? (
            /* Loading state */
            <section className={`${section} py-12`}>
              <div className="flex flex-col items-center justify-center text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-[#67E8F9]" />

                <h2 className="mt-4 text-lg font-medium">
                  Loading explanations
                </h2>

                <p className={`mt-2 text-sm ${muted}`}>
                  Retrieving recorded analysis for {targetUser.name}...
                </p>
              </div>
            </section>
          ) : analysis ? (
            <>
              {/* Employee assessment summary */}
              <section
                className={section}
                aria-label="Explanation summary"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#67E8F9]">
                      EMPLOYEE ASSESSMENT
                    </span>

                    <h2 className="mt-1 text-xl font-medium text-[#F4F7FA]">
                      {targetUser.name} · Assessment summary
                    </h2>
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] px-3 py-2 text-[10px] uppercase tracking-wider text-[#67E8F9]">
                    <Activity className="h-3.5 w-3.5" />
                    Recorded analysis
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {/* Risk score */}
                  <article className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.035] p-5 transition-all hover:border-[#D4AF37]/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#A7B0BA]">
                        Observed risk · Last 24 hours
                      </p>

                      <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
                    </div>

                    <p className="mt-4 text-3xl font-light text-[#D4AF37]">
                      {analysis.riskScore === null ||
                      analysis.riskScore === undefined
                        ? "Not assessed"
                        : `${formatNumber(analysis.riskScore)} / 100`}
                    </p>

                    {analysis.riskLevel && (
                      <p className="mt-2 text-xs text-[#A7B0BA]">
                        Risk level: {analysis.riskLevel}
                      </p>
                    )}
                  </article>

                  {/* Trust score */}
                  <article className="rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.035] p-5 transition-all hover:border-[#67E8F9]/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#A7B0BA]">
                        Trust score
                      </p>

                      <ShieldCheck className="h-4 w-4 text-[#67E8F9]" />
                    </div>

                    <p className="mt-4 text-3xl font-light text-[#67E8F9]">
                      {analysis.trustScore === null ||
                      analysis.trustScore === undefined
                        ? "Unassessed"
                        : `${formatNumber(analysis.trustScore)} / 100`}
                    </p>

                    <p className="mt-2 text-xs text-[#7F8A96]">
                      {analysis.trustBasis === "ACCOUNT_BASELINE"
                        ? "Stored account baseline"
                        : "Recorded account trust"}
                    </p>
                  </article>

                  {/* Random Forest score */}
                  <article className="rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.035] p-5 transition-all hover:border-[#67E8F9]/40 sm:col-span-2 xl:col-span-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#A7B0BA]">
                        RF positive-class score
                      </p>

                      <BrainCircuit className="h-4 w-4 text-[#67E8F9]" />
                    </div>

                    <p className="mt-4 text-3xl font-light text-[#67E8F9]">
                      {probabilityRecorded
                        ? `${(probability * 100).toFixed(1)} / 100`
                        : "Awaiting inputs"}
                    </p>

                    <p className="mt-2 text-xs text-[#7F8A96]">
                      Uncalibrated model score
                    </p>

                    {probabilityRecorded && (
                      <p className="mt-2 text-[10px] leading-5 text-[#7F8A96]">
                        Prediction recorded:{" "}
                        {formatTimestamp(analysis.ml?.timestamp)}
                      </p>
                    )}
                  </article>
                </div>

                {lastUpdated && (
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4 text-xs text-[#7F8A96]">
                    <Clock3 className="h-3.5 w-3.5 text-[#67E8F9]" />

                    <span>
                      Last refreshed: {lastUpdated.toLocaleString()}.
                      Updates as new observations arrive.
                    </span>
                  </div>
                )}
              </section>

              {/* Search and explanation counts */}
              <section
                className={`${section} flex flex-col justify-between gap-4 lg:flex-row lg:items-center`}
              >
                <div className="w-full lg:max-w-md">
                  <label
                    htmlFor="xai-search"
                    className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-[#7F8A96]"
                  >
                    Search recorded explanations
                  </label>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />

                    <input
                      id="xai-search"
                      aria-label="Search explanations"
                      value={searchQuery}
                      onChange={(event) =>
                        setSearchQuery(event.target.value)
                      }
                      placeholder="Search risk factors or model features..."
                      className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10 ${inputClass}`}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-3 py-2">
                    <span className="text-sm font-medium text-[#D4AF37]">
                      {filteredFactors.length}
                    </span>

                    <span className="ml-2 text-[10px] text-[#A7B0BA]">
                      Contextual factors
                    </span>
                  </div>

                  <div className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.04] px-3 py-2">
                    <span className="text-sm font-medium text-[#67E8F9]">
                      {filteredContributions.length}
                    </span>

                    <span className="ml-2 text-[10px] text-[#A7B0BA]">
                      SHAP contributions
                    </span>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm font-medium text-[#F4F7FA]">
                      {filteredSummaries.length}
                    </span>

                    <span className="ml-2 text-[10px] text-[#A7B0BA]">
                      Saved summaries
                    </span>
                  </div>
                </div>
              </section>

              {/* Contextual risk explanations */}
              <section
                className={section}
                aria-label="Contextual risk explanations"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05]">
                      <ShieldCheck className="h-5 w-5 text-[#67E8F9]" />
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[#67E8F9]">
                        RULE-BASED ANALYSIS
                      </span>

                      <h2 className="text-xl font-medium text-[#F4F7FA]">
                        Contextual risk explanations
                      </h2>
                    </div>
                  </div>

                  <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#D4AF37]">
                    Recorded evidence
                  </span>
                </div>

                <p className={`mt-4 text-sm leading-6 ${muted}`}>
                  These contributions come from risk rules applied
                  to recorded activity. They are separate from
                  model-generated SHAP values.
                </p>

                {/* Risk factor cards */}
                {filteredFactors.map((factor, index) => (
                  <article
                    key={`${factor.category}-${index}`}
                    className="mt-4 rounded-xl border border-[#67E8F9]/15 bg-[#03070C] p-5 transition-all duration-300 hover:border-[#67E8F9]/35 hover:bg-[#070C12]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-base font-medium text-[#F4F7FA]">
                        {factor.factor}
                      </h3>

                      <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-3 py-1.5 text-xs font-medium text-[#D4AF37]">
                        Risk contribution: +
                        {formatNumber(factor.scoreImpact)}
                      </span>
                    </div>

                    <p className={`mt-3 text-sm leading-6 ${muted}`}>
                      {factor.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-[11px] text-[#7F8A96]">
                      <span>
                        Source: {analysis.source || "Unavailable"}
                      </span>

                      <span>
                        Category: {factor.category || "Context"}
                      </span>
                    </div>
                  </article>
                ))}

                {/* No contextual factors */}
                {!factors.length && (
                  <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#03070C] p-5">
                    <div className="flex items-start gap-3">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#67E8F9]" />

                      <p className={`text-sm leading-6 ${muted}`}>
                        {analysis.hasTelemetry
                          ? `${analysis.coverage?.interactiveEvents ?? 0} recorded interactive ${(analysis.coverage?.interactiveEvents ?? 0) === 1 ? "observation" : "observations"} reviewed. No elevated contextual factor was found in the available observations. Off-hours timing alone is not treated as elevated risk; unobserved activity remains unassessed.`
                          : "No activity is recorded for this employee in the last 24 hours."}
                      </p>
                    </div>
                  </div>
                )}

                {factors.length > 0 && !filteredFactors.length && (
                  <p className={`mt-5 text-sm ${muted}`}>
                    No contextual factors match your search.
                  </p>
                )}

                {analysis.coverage?.truncated && (
                  <p className="mt-4 flex items-start gap-2 rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-3 text-xs leading-5 text-[#D4AF37]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                    The analysis limit was reached. Contextual factors
                    use the bounded evidence described on Risk Analysis.
                  </p>
                )}
              </section>
                            {/* Model SHAP explanations */}
              <section
                className={section}
                aria-label="Model SHAP explanations"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05]">
                      <BrainCircuit className="h-5 w-5 text-[#67E8F9]" />
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[#67E8F9]">
                        MACHINE LEARNING
                      </span>

                      <h2 className="text-xl font-medium text-[#F4F7FA]">
                        Model explanations (SHAP)
                      </h2>
                    </div>
                  </div>

                  <span className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#67E8F9]">
                    CERT model
                  </span>
                </div>

                {!modelAvailable ? (
                  /* Model assessment unavailable */
                  <div
                    role="status"
                    className="mt-5 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.035] p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06]">
                        <AlertTriangle className="h-5 w-5 text-[#D4AF37]" />
                      </div>

                      <div>
                        <h3 className="text-lg font-medium text-[#D4AF37]">
                          CERT model assessment awaiting complete inputs
                        </h3>

                        <p className={`mt-2 text-sm leading-6 ${muted}`}>
                          {analysis.ml?.reason ||
                            "No approved model prediction is recorded. Complete daily login, device, file, web and email inputs are required."}
                        </p>

                        <p className={`mt-3 text-sm leading-6 ${muted}`}>
                          Contextual explanations above remain available
                          from recorded activity.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.035] p-4">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#67E8F9]" />

                      <p className={`text-xs leading-5 ${muted}`}>
                        Saved prediction:{" "}
                        {formatTimestamp(analysis.ml?.timestamp)}.
                        Positive SHAP values increase the model output;
                        negative values decrease it.
                      </p>
                    </div>

                    {/* Individual SHAP feature contributions */}
                    {filteredContributions.map((reason, index) => {
                      const positive =
                        typeof reason.shap_value === "number" &&
                        reason.shap_value > 0;

                      return (
                        <article
                          key={`${reason.feature}-${index}`}
                          className={`mt-4 rounded-xl border bg-[#03070C] p-5 transition-all duration-300 hover:bg-[#070C12] ${
                            positive
                              ? "border-[#D4AF37]/25 hover:border-[#D4AF37]/40"
                              : "border-[#67E8F9]/20 hover:border-[#67E8F9]/40"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7F8A96]">
                                MODEL FEATURE
                              </p>

                              <h3 className="mt-1 text-base font-medium text-[#F4F7FA]">
                                {String(reason.feature || "").replaceAll(
                                  "_",
                                  " ",
                                )}
                              </h3>
                            </div>

                            <span
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                                positive
                                  ? "border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#D4AF37]"
                                  : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]"
                              }`}
                            >
                              SHAP {formatShap(reason.shap_value)}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-white/[0.07] bg-[#050A10] p-3">
                              <p className="text-[10px] uppercase tracking-wider text-[#7F8A96]">
                                Model feature value
                              </p>

                              <p className="mt-2 text-sm font-medium text-[#F4F7FA]">
                                {formatNumber(reason.value)}
                              </p>
                            </div>

                            <div className="rounded-lg border border-white/[0.07] bg-[#050A10] p-3">
                              <p className="text-[10px] uppercase tracking-wider text-[#7F8A96]">
                                Contribution direction
                              </p>

                              <p
                                className={`mt-2 text-sm font-medium ${
                                  positive
                                    ? "text-[#D4AF37]"
                                    : "text-[#67E8F9]"
                                }`}
                              >
                                {reason.impact || "Not specified"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-[11px] text-[#7F8A96]">
                            <span>
                              Source: Recorded CERT model prediction
                            </span>

                            <span>
                              Feature: {reason.feature}
                            </span>
                          </div>
                        </article>
                      );
                    })}

                    {/* Saved explanation summaries */}
                    {filteredSummaries.map((summary, index) => (
                      <article
                        key={`summary-${index}`}
                        className="mt-4 rounded-xl border border-white/10 bg-[#03070C] p-5"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-[#67E8F9]" />

                          <h3 className="text-sm font-medium text-[#F4F7FA]">
                            Saved model explanation
                          </h3>
                        </div>

                        <p className={`mt-3 text-sm leading-6 ${muted}`}>
                          {summary}
                        </p>

                        <p className="mt-3 text-[11px] text-[#7F8A96]">
                          This saved summary contains no structured
                          SHAP value.
                        </p>
                      </article>
                    ))}

                    {/* Invalid attribution records */}
                    {invalidCount > 0 && (
                      <div
                        role="status"
                        className="mt-5 flex items-start gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4"
                      >
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />

                        <p className="text-sm leading-6 text-[#D4AF37]">
                          {invalidCount} saved attribution records lack
                          a valid feature name or numeric SHAP value
                          and cannot be displayed as contributions.
                        </p>
                      </div>
                    )}

                    {/* No usable saved model explanations */}
                    {!contributions.length &&
                      !summaries.length && (
                        <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#03070C] p-5">
                          <p className={`text-sm leading-6 ${muted}`}>
                            A model prediction is recorded, but no
                            usable SHAP contributions were saved
                            for that prediction.
                          </p>
                        </div>
                      )}

                    {/* Search returned no model results */}
                    {(contributions.length + summaries.length > 0) &&
                      !filteredContributions.length &&
                      !filteredSummaries.length && (
                        <p className={`mt-5 text-sm ${muted}`}>
                          No model explanations match your search.
                        </p>
                      )}
                  </>
                )}
              </section>

              {/* Combined search empty state */}
              {query && !hasSearchResults && (
                <section className={`${section} text-center`}>
                  <Search className="mx-auto h-7 w-7 text-[#7F8A96]" />

                  <h3 className="mt-3 text-base font-medium text-[#F4F7FA]">
                    No matching explanations
                  </h3>

                  <p className={`mt-2 text-sm ${muted}`}>
                    Try a different keyword to find recorded risk
                    factors or model contributions.
                  </p>

                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-4 rounded-lg border border-[#67E8F9]/25 px-4 py-2 text-xs text-[#67E8F9] transition-colors hover:bg-[#67E8F9]/[0.06]"
                  >
                    Clear search
                  </button>
                </section>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <p className="text-[11px] tracking-wide text-[#7F8A96]">
            CyberOrbit · Explainable AI
          </p>

          <p className="text-[11px] text-[#596570]">
            Contextual risk evidence · CERT model insights
          </p>
        </footer>
      </div>
    </div>
  );
};

export default ExplainableAiPage;