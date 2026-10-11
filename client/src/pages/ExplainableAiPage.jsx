// ======================================================
// IMPORTS
// ======================================================

import React, { useEffect, useMemo, useState } from "react";

import {
  BrainCircuit,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { useTheme } from "../context/ThemeContext";

// ======================================================
// MAIN COMPONENT
// ======================================================

export const ExplainableAiPage = ({
  users = [],
  events = [],
  incidents = [],
  onSelectUser,
}) => {
  const { isDark } = useTheme();

  const [searchQuery, setSearchQuery] = useState("");

  const [xaiReasons, setXaiReasons] = useState([]);

  const [prediction, setPrediction] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // ======================================================
  // LATEST ML DATA
  // ======================================================

  const latestMLData = useMemo(() => {
    const mlEvents = events
      .filter(
        (event) =>
          Array.isArray(event.xaiReasons) && event.xaiReasons.length > 0,
      )
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    return mlEvents[0] || null;
  }, [events]);

  // ======================================================
  // ML PREDICTION STATE
  // ======================================================

  useEffect(() => {
    if (latestMLData?.xaiReasons) {
      setXaiReasons(latestMLData.xaiReasons);

      setPrediction({
        riskScore: latestMLData.riskScore,

        threatProbability:
          latestMLData.mlThreatProbability ?? latestMLData.mlAnomalyScore,

        contextualRiskScore: latestMLData.contextualRiskScore,

        trustScore: latestMLData.trustScore,

        policyAction: latestMLData.policyAction,

        policyReason: latestMLData.policyReason,
      });
    } else {
      setXaiReasons([]);
      setPrediction(null);
    }
  }, [latestMLData]);

  // ======================================================
  // FILTERED EXPLANATIONS
  // ======================================================

  const filteredReasons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return xaiReasons;
    }

    return xaiReasons.filter((reason) => {
      const feature = String(reason.feature || "").toLowerCase();

      const value = String(reason.value ?? "").toLowerCase();

      const impact = String(reason.impact || "").toLowerCase();

      const shapValue = String(reason.shap_value ?? "").toLowerCase();

      return (
        feature.includes(query) ||
        value.includes(query) ||
        impact.includes(query) ||
        shapValue.includes(query)
      );
    });
  }, [xaiReasons, searchQuery]);

  // ======================================================
  // FORMAT HELPERS
  // ======================================================

  const formatFeatureName = (feature) => {
    if (!feature) {
      return "Unknown Feature";
    }

    return String(feature)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) {
      return "N/A";
    }

    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toString() : value.toFixed(4);
    }

    return String(value);
  };

  const formatShapValue = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "N/A";
    }

    return `${numericValue >= 0 ? "+" : ""}${numericValue.toFixed(4)}`;
  };

  const isIncreasingThreat = (reason) => {
    return reason?.impact === "increases threat";
  };

  const hasMLData = xaiReasons.length > 0;

  // ======================================================
  // THEME
  // ======================================================

  const pageBackground = isDark ? "#03070C" : "#F8F9FA";

  const panelBackground = isDark ? "#050A10" : "#FFFFFF";

  const secondaryPanel = isDark ? "#070C12" : "#F5F7F8";

  const primaryText = isDark ? "#F4F7FA" : "#111827";

  const secondaryText = isDark ? "#A7B0BA" : "#5F6872";

  const mutedText = isDark ? "#697581" : "#7A838D";

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
            PAGE HEADER
            ================================================== */}

        <section
          className={`console-hero 
            group relative min-h-[250px] overflow-hidden rounded-2xl border
            ${isDark ? "border-[#67E8F9]/55 bg-[#050A10]" : "border-[#67E8F9]/45 bg-white"}
            shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300
            hover:-translate-y-0.5 hover:border-[#67E8F9]/85
            hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]
          `}
        >
          <div className="pointer-events-none absolute left-0 top-0 h-10 w-[4px] rounded-br-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.35)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-[4px] rounded-tl-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.35)]" />

          {/* XAI Security Intelligence Visual */}

          <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-[54%] overflow-hidden lg:block">
            <div className="absolute inset-0 opacity-70">
              <div className="absolute right-0 top-[24%] h-px w-full bg-[#67E8F9]/10" />
              <div className="absolute right-0 top-[50%] h-px w-full bg-[#67E8F9]/10" />
              <div className="absolute right-0 top-[76%] h-px w-full bg-[#67E8F9]/10" />
              <div className="absolute right-[18%] top-0 h-full w-px bg-[#67E8F9]/10" />
              <div className="absolute right-[42%] top-0 h-full w-px bg-[#67E8F9]/10" />
              <div className="absolute right-[66%] top-0 h-full w-px bg-[#67E8F9]/10" />
            </div>

            <div className="absolute right-[4%] top-1/2 h-[310px] w-[470px] -translate-y-1/2">
              <div className="absolute left-1/2 top-1/2 h-[290px] w-[290px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
              <div className="absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/18" />
              <div className="absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/16" />
              <div className="absolute left-1/2 top-1/2 h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/20" />

              <div className="absolute left-1/2 top-[7%] h-[86%] w-px bg-[#67E8F9]/10" />
              <div className="absolute left-[7%] top-1/2 h-px w-[86%] bg-[#67E8F9]/10" />

              <div className="absolute left-1/2 top-1/2 flex h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/40 bg-[#050A10]/90 shadow-[0_0_40px_rgba(103,232,249,0.10)]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#D4AF37]/30 bg-[#070C12] shadow-[inset_0_0_18px_rgba(212,175,55,0.05)]">
                  <BrainCircuit
                    className="h-7 w-7 text-[#67E8F9]"
                    strokeWidth={1.3}
                  />
                </div>
              </div>

              <div className="absolute left-1/2 top-[3%] h-2 w-2 -translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.75)]" />
              <div className="absolute bottom-[4%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_16px_rgba(103,232,249,0.75)]" />
              <div className="absolute left-[8%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.7)]" />
              <div className="absolute right-[8%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.7)]" />

              <div className="absolute left-[8%] top-[22%] rounded-lg border border-[#67E8F9]/20 bg-[#050A10]/80 px-3 py-2 backdrop-blur-sm">
                <span className="block text-[10px] uppercase tracking-[0.16em] text-[#67E8F9]">
                  SHAP
                </span>
                <span className="mt-1 block text-[10px] text-[#7F8A96]">
                  FEATURE WEIGHT
                </span>
              </div>

              <div className="absolute bottom-[17%] right-[4%] rounded-lg border border-[#D4AF37]/20 bg-[#050A10]/80 px-3 py-2 backdrop-blur-sm">
                <span className="block text-[10px] uppercase tracking-[0.16em] text-[#D4AF37]">
                  XAI
                </span>
                <span className="mt-1 block text-[10px] text-[#7F8A96]">
                  ATTRIBUTION
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
            <div className="w-full">
              <div>
                {/* Header Meta */}

                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />
                    EXPLAINABLE AI (XAI)
                  </span>

                  <span
                    className="text-[12px]"
                    style={{
                      color: mutedText,
                    }}
                  >
                    SHAP / TREE ATTRIBUTION ENGINE
                  </span>
                </div>

                {/* Original Heading */}

                <h1 className="max-w-[74%] text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                  Why was this activity
                  <br />
                  <span className="text-[#67E8F9]">considered risky?</span>
                </h1>

                {/* Original Description */}

                <p
                  className="mt-4 max-w-2xl text-[14px] leading-6"
                  style={{
                    color: secondaryText,
                  }}
                >
                  Risk predictions are explained using the feature contributions
                  generated by the machine learning model.
                </p>
              </div>

              {/* Evaluated Factors */}

              <div className="absolute bottom-7 right-8 z-20 min-w-[165px] rounded-xl border border-[#67E8F9]/20 bg-[#050A10]/85 px-5 py-3.5 shadow-[0_12px_35px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                <span
                  className="block text-[12px] font-medium tracking-[0.14em]"
                  style={{
                    color: mutedText,
                  }}
                >
                  EVALUATED FACTORS
                </span>

                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-lg font-medium text-[#67E8F9]">
                    {xaiReasons.length}
                  </span>

                  <span
                    className="text-[12px] font-medium tracking-[0.1em]"
                    style={{
                      color: mutedText,
                    }}
                  >
                    FACTORS
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================
            PREDICTION SUMMARY
            ================================================== */}

        {prediction && (
          <section
            className={`
              mt-5
              group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7
            `}
          >
            <div className="mb-5 flex items-center justify-between border-b border-white/[0.07] pb-4">
              <div>
                <span className="text-[12px] font-medium tracking-[0.14em] text-[#67E8F9]">
                  MODEL OUTPUT
                </span>

                <h2 className="mt-2 text-2xl font-light tracking-[-0.035em]">
                  Prediction Summary
                </h2>
              </div>

              <BrainCircuit
                className="h-5 w-5 text-[#67E8F9]"
                strokeWidth={1.5}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Risk Score */}

              <div
                className={`
                  rounded-xl
                  border
                  ${
                    isDark
                      ? "border-white/10 bg-[#070C12]"
                      : "border-black/10 bg-[#F7F8F9]"
                  }
                  p-5
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#67E8F9]/35
                  hover:bg-[#0A1118]
                  hover:shadow-[0_16px_45px_rgba(103,232,249,0.08)]
                `}
              >
                <span
                  className="text-[12px] font-medium tracking-[0.12em]"
                  style={{
                    color: mutedText,
                  }}
                >
                  RISK SCORE
                </span>

                <p className="mt-3 text-3xl font-light tracking-[-0.04em] text-[#D4AF37]">
                  {Number.isFinite(Number(prediction.riskScore))
                    ? Number(prediction.riskScore).toFixed(2)
                    : "N/A"}
                </p>
              </div>

              {/* Threat Probability */}

              <div
                className={`
                  rounded-xl
                  border
                  ${
                    isDark
                      ? "border-white/10 bg-[#070C12]"
                      : "border-black/10 bg-[#F7F8F9]"
                  }
                  p-5
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#67E8F9]/35
                  hover:bg-[#0A1118]
                  hover:shadow-[0_16px_45px_rgba(103,232,249,0.08)]
                `}
              >
                <span
                  className="text-[12px] font-medium tracking-[0.12em]"
                  style={{
                    color: mutedText,
                  }}
                >
                  THREAT PROBABILITY
                </span>

                <p className="mt-3 text-3xl font-light tracking-[-0.04em] text-[#67E8F9]">
                  {Number.isFinite(Number(prediction.threatProbability))
                    ? (Number(prediction.threatProbability) * 100).toFixed(2) +
                      "%"
                    : "N/A"}
                </p>
              </div>

              {/* Trust Score */}

              <div
                className={`
                  rounded-xl
                  border
                  ${
                    isDark
                      ? "border-white/10 bg-[#070C12]"
                      : "border-black/10 bg-[#F7F8F9]"
                  }
                  p-5
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#67E8F9]/35
                  hover:bg-[#0A1118]
                  hover:shadow-[0_16px_45px_rgba(103,232,249,0.08)]
                `}
              >
                <span
                  className="text-[12px] font-medium tracking-[0.12em]"
                  style={{
                    color: mutedText,
                  }}
                >
                  TRUST SCORE
                </span>

                <p className="mt-3 text-3xl font-light tracking-[-0.04em] text-[#67E8F9]">
                  {Number.isFinite(Number(prediction.trustScore))
                    ? Number(prediction.trustScore).toFixed(2)
                    : "N/A"}
                </p>
              </div>

              {/* Policy Action */}

              <div
                className={`
                  rounded-xl
                  border
                  ${
                    isDark
                      ? "border-white/10 bg-[#070C12]"
                      : "border-black/10 bg-[#F7F8F9]"
                  }
                  p-5
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:border-[#67E8F9]/35
                  hover:bg-[#0A1118]
                  hover:shadow-[0_16px_45px_rgba(103,232,249,0.08)]
                `}
              >
                <span
                  className="text-[12px] font-medium tracking-[0.12em]"
                  style={{
                    color: mutedText,
                  }}
                >
                  POLICY ACTION
                </span>

                <p className="mt-3 text-sm font-semibold uppercase text-[#D4AF37]">
                  {prediction.policyAction || "N/A"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            SEARCH / FILTER BAR
            ================================================== */}

        <section
          className={`
            mt-5
            flex
            flex-col
            items-center
            justify-between
            gap-4
            group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6
            sm:flex-row
          `}
        >
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ML features..."
              className={`
                h-11
                w-full
                rounded-lg
                border
                ${
                  isDark
                    ? "border-white/10 bg-[#03070C] text-white placeholder:text-[#596570]"
                    : "border-black/10 bg-[#F8F9FA] text-black placeholder:text-gray-400"
                }
                pl-10
                pr-3
                text-sm
                outline-none
                transition-colors
                focus:border-[#67E8F9]/50
              `}
            />

            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />
          </div>

          <div
            className="text-[12px] font-medium tracking-[0.1em]"
            style={{
              color: mutedText,
            }}
          >
            {filteredReasons.length} MODEL CONTRIBUTION
            {filteredReasons.length === 1 ? "" : "S"}
          </div>
        </section>

        {/* ==================================================
            EMPTY STATE - NO ML DATA
            ================================================== */}

        {!hasMLData && (
          <section
            className={`
              mt-5
              rounded-2xl
              border
              ${
                isDark
                  ? "border-white/10 bg-[#050A10]"
                  : "border-black/10 bg-white"
              }
              px-6
              py-16
              text-center
              shadow-[0_18px_60px_rgba(0,0,0,0.12)]
              transition-all duration-300
              hover:-translate-y-0.5
              hover:border-[#67E8F9]/30
              hover:bg-[#070C12]
              hover:shadow-[0_18px_55px_rgba(103,232,249,0.06)]
            `}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.04]">
              <BrainCircuit
                className="h-7 w-7 text-[#67E8F9]"
                strokeWidth={1.5}
              />
            </div>

            <h3 className="mt-5 text-2xl font-light tracking-[-0.035em]">
              No XAI data available
            </h3>

            <p
              className="mx-auto mt-2 max-w-lg text-sm leading-6"
              style={{
                color: mutedText,
              }}
            >
              SHAP explanations will appear here when the ML service generates
              prediction data.
            </p>
          </section>
        )}

        {/* ==================================================
            EMPTY SEARCH STATE
            ================================================== */}

        {hasMLData && filteredReasons.length === 0 && (
          <section
            className={`
                mt-5
                rounded-2xl
                border
                ${
                  isDark
                    ? "border-white/10 bg-[#050A10]"
                    : "border-black/10 bg-white"
                }
                px-6
                py-16
                text-center
                shadow-[0_18px_60px_rgba(0,0,0,0.12)]
              `}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.04]">
              <Search className="h-6 w-6 text-[#67E8F9]" strokeWidth={1.5} />
            </div>

            <h3 className="mt-5 text-2xl font-light tracking-[-0.035em]">
              No matching ML factors
            </h3>

            <p
              className="mt-2 text-sm"
              style={{
                color: mutedText,
              }}
            >
              Try another feature or value.
            </p>
          </section>
        )}

        {/* ==================================================
            XAI CONTRIBUTION CARDS
            ================================================== */}

        <section className="mt-5 space-y-4">
          {filteredReasons.map((reason, index) => {
            const increasesThreat = isIncreasingThreat(reason);

            return (
              <article
                key={`${reason.feature}-${index}`}
                className={`
                    group relative overflow-hidden rounded-2xl border
                    ${increasesThreat ? "border-red-500/25" : "border-white/10"}
                    bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300
                    ${
                      increasesThreat
                        ? "hover:border-red-500/45"
                        : "hover:border-[#67E8F9]/25"
                    }
                    sm:p-6 lg:p-7
                  `}
              >
                {/* ==================================================
                      CONTRIBUTION HEADER
                      ================================================== */}

                <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {/* Index */}

                    <span
                      className={`
                          flex
                          h-9
                          w-9
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          border
                          ${
                            increasesThreat
                              ? "border-red-500/30 bg-red-500/[0.04] text-red-400"
                              : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.04] text-[#67E8F9]"
                          }
                          text-[12px]
                          font-semibold
                        `}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div>
                      <h3 className="text-xl font-light tracking-[-0.025em] sm:text-2xl">
                        {formatFeatureName(reason.feature)}
                      </h3>

                      <span
                        className="mt-1 block text-[12px]"
                        style={{
                          color: mutedText,
                        }}
                      >
                        FEATURE: {reason.feature || "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* SHAP + Impact */}

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span
                      className={`
                          rounded-md
                          border
                          px-2.5
                          py-1.5
                          text-xs
                          font-semibold
                          ${
                            increasesThreat
                              ? "border-red-500/25 bg-red-500/[0.05] text-red-400"
                              : "border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#D4AF37]"
                          }
                        `}
                    >
                      SHAP {formatShapValue(reason.shap_value)}
                    </span>

                    <span
                      className={`
                          rounded-md
                          border
                          px-2.5
                          py-1.5
                          text-[12px]
                          font-semibold
                          uppercase
                          ${
                            increasesThreat
                              ? "border-red-500/30 bg-red-500/[0.05] text-red-400"
                              : "border-white/10 bg-white/[0.03] text-[#A7B0BA]"
                          }
                        `}
                    >
                      {reason.impact || "N/A"}
                    </span>
                  </div>
                </div>

                {/* ==================================================
                      CONTRIBUTION DETAILS
                      ================================================== */}

                <div className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
                  {/* Model Feature Value */}

                  <div
                    className={`
                        rounded-xl
                        border
                        ${
                          isDark
                            ? "border-white/[0.08] bg-[#070C12]"
                            : "border-black/[0.08] bg-[#F8F9FA]"
                        }
                        p-5
                        transition-all duration-300
                        hover:-translate-y-0.5
                        hover:border-[#67E8F9]/35
                        hover:bg-[#0A1118]
                        hover:shadow-[0_14px_40px_rgba(103,232,249,0.08)]
                      `}
                  >
                    <span className="text-[12px] font-medium tracking-[0.12em] text-[#67E8F9]">
                      MODEL FEATURE VALUE
                    </span>

                    <p
                      className={`
                          mt-3
                          break-words
                          text-sm
                          leading-6
                          ${isDark ? "text-[#D5DCE2]" : "text-gray-700"}
                        `}
                    >
                      {formatValue(reason.value)}
                    </p>
                  </div>

                  {/* SHAP Contribution */}

                  <div
                    className={`
                        rounded-xl
                        border
                        ${
                          isDark
                            ? "border-white/[0.08] bg-[#070C12]"
                            : "border-black/[0.08] bg-[#F8F9FA]"
                        }
                        p-5
                        transition-all duration-300
                        hover:-translate-y-0.5
                        hover:border-[#67E8F9]/35
                        hover:bg-[#0A1118]
                        hover:shadow-[0_14px_40px_rgba(103,232,249,0.08)]
                      `}
                  >
                    <span className="text-[12px] font-medium tracking-[0.12em] text-[#D4AF37]">
                      SHAP CONTRIBUTION
                    </span>

                    <p
                      className={`
                          mt-3
                          break-words
                          text-sm
                          leading-6
                          ${isDark ? "text-[#D5DCE2]" : "text-gray-700"}
                        `}
                    >
                      {formatShapValue(reason.shap_value)}
                    </p>
                  </div>

                  {/* Model Explanation */}

                  <div
                    className={`
                        rounded-xl
                        border
                        ${
                          isDark
                            ? "border-white/[0.08] bg-[#070C12]"
                            : "border-black/[0.08] bg-[#F8F9FA]"
                        }
                        p-5
                        transition-all duration-300
                        hover:-translate-y-0.5
                        hover:border-[#67E8F9]/35
                        hover:bg-[#0A1118]
                        hover:shadow-[0_14px_40px_rgba(103,232,249,0.08)]
                      `}
                  >
                    <span
                      className="text-[12px] font-medium tracking-[0.12em]"
                      style={{
                        color: mutedText,
                      }}
                    >
                      MODEL EXPLANATION
                    </span>

                    <div className="mt-3 flex items-start gap-3">
                      {increasesThreat ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#67E8F9]" />
                      )}

                      <p
                        className="text-sm leading-6"
                        style={{
                          color: secondaryText,
                        }}
                      >
                        This feature{" "}
                        {increasesThreat ? "increases" : "decreases"} the
                        predicted threat according to the SHAP contribution
                        generated by the trained tree model.
                      </p>
                    </div>
                  </div>

                  {/* Feature Attribution */}

                  <div
                    className={`
                        rounded-xl
                        border
                        ${
                          isDark
                            ? "border-white/[0.08] bg-[#070C12]"
                            : "border-black/[0.08] bg-[#F8F9FA]"
                        }
                        p-5
                        transition-all duration-300
                        hover:-translate-y-0.5
                        hover:border-[#67E8F9]/35
                        hover:bg-[#0A1118]
                        hover:shadow-[0_14px_40px_rgba(103,232,249,0.08)]
                      `}
                  >
                    <span className="text-[12px] font-medium tracking-[0.12em] text-[#67E8F9]">
                      FEATURE ATTRIBUTION
                    </span>

                    <p
                      className="mt-3 text-sm leading-6"
                      style={{
                        color: secondaryText,
                      }}
                    >
                      Feature{" "}
                      <strong className="font-medium text-[#F4F7FA]">
                        {reason.feature || "N/A"}
                      </strong>{" "}
                      had a SHAP contribution of{" "}
                      <strong className="font-medium text-[#D4AF37]">
                        {formatShapValue(reason.shap_value)}
                      </strong>{" "}
                      to this prediction.
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* ==================================================
            ML POLICY REASON
            ================================================== */}

        {prediction?.policyReason && (
          <section
            className={`
              mt-5
              rounded-2xl
              border
              ${
                isDark
                  ? "border-white/10 bg-[#050A10]"
                  : "border-black/10 bg-white"
              }
              p-6
              shadow-[0_18px_60px_rgba(0,0,0,0.12)]
              transition-all duration-300
              hover:-translate-y-0.5
              hover:border-[#67E8F9]/30
              hover:bg-[#070C12]
              hover:shadow-[0_20px_60px_rgba(103,232,249,0.07)]
              sm:p-7
            `}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04]">
                <BrainCircuit
                  className="h-5 w-5 text-[#D4AF37]"
                  strokeWidth={1.5}
                />
              </div>

              <div>
                <span className="text-[12px] font-medium tracking-[0.14em] text-[#D4AF37]">
                  ML POLICY REASON
                </span>

                <p
                  className="mt-3 text-sm leading-6"
                  style={{
                    color: secondaryText,
                  }}
                >
                  {prediction.policyReason}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
