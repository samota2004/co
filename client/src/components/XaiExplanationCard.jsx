import React, { useState } from "react";
import { RiskBadge, PolicyActionBadge } from "./Badges";
import {
  Sparkles,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  BrainCircuit,
  Activity,
  ShieldCheck,
} from "lucide-react";

export const XaiExplanationCard = ({ evaluation, onAskCopilot }) => {
  const [expanded, setExpanded] = useState(true);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  if (!evaluation) return null;

  const fetchAiExplanation = async () => {
    try {
      setLoadingAi(true);

      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Explain this security evaluation in detail: Risk Score ${evaluation.riskScore} (${evaluation.riskLevel}), Action ${evaluation.policyEnforced}, Signals: ${evaluation.contributingFactors?.map((f) => f.factor).join(", ")}. What should the SOC analyst do?`,
          context: { userId: evaluation.userId },
        }),
      });

      const data = await res.json();

      if (data.success) {
        setAiInsight(data.reply);
      }
    } catch (err) {
      console.error("Failed to fetch AI explanation", err);
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 text-[#F4F7FA] shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12] hover:shadow-[0_22px_70px_rgba(103,232,249,0.08)] sm:p-6 lg:p-7">
      {/* Master reference corner accents */}
      <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

      {/* Subtle technical grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(103,232,249,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.8) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/30 bg-[#070C12] shadow-[0_0_24px_rgba(103,232,249,0.08)]">
              <Cpu className="h-5 w-5 text-[#67E8F9]" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                  XAI Security Evaluation
                </span>
                <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#D4AF37]">
                  UEBA ENSEMBLE
                </span>
              </div>

              <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Zero Trust Decision &{" "}
                <span className="text-[#67E8F9]">XAI Diagnostics</span>
              </h3>

              <p className="mt-1.5 text-[13px] leading-5 text-[#7F8A96]">
                Evaluated at{" "}
                {evaluation.timestamp
                  ? new Date(evaluation.timestamp).toLocaleTimeString()
                  : "Current Session"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge
              level={evaluation.riskLevel}
              score={evaluation.riskScore}
            />
            <PolicyActionBadge action={evaluation.policyEnforced} />
          </div>
        </div>

        {/* Policy rationale */}
        <div className="py-5">
          <div className="group/rationale relative overflow-hidden rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#050A10] hover:shadow-[0_12px_35px_rgba(103,232,249,0.05)]">
            <div className="absolute left-0 top-0 h-full w-[2px] bg-[#67E8F9]/70 opacity-70 transition-opacity group-hover/rationale:opacity-100" />

            <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[#67E8F9]">
              <ShieldAlert className="h-4 w-4" />
              <span>Policy Rationale & Inference Explanation</span>
            </div>

            <p className="mt-3 text-[13px] leading-6 text-[#A7B0BA]">
              {evaluation.explanationText ||
                "Continuous baseline verification active. Multi-feature anomaly detection evaluated normal operational context."}
            </p>
          </div>
        </div>

        {/* XAI signal decomposition */}
        <div className="mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#070C12] px-4 py-3.5 text-left transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#050A10] hover:shadow-[0_10px_30px_rgba(103,232,249,0.05)] focus:border-[#67E8F9]/40 focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/15"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2.5">
              <BrainCircuit className="h-4 w-4 shrink-0 text-[#67E8F9]" />
              <span className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#67E8F9]">
                Explainable AI (XAI) Contributing Signal Decomposition
              </span>
              <span className="text-[12px] text-[#7F8A96]">
                ({evaluation.contributingFactors?.length || 0} factors)
              </span>
            </span>

            {expanded ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-[#67E8F9]" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-[#67E8F9]" />
            )}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2.5">
              {evaluation.contributingFactors?.map((factor, index) => {
                const maxPossibleImpact = 35;
                const impactPercent = Math.min(
                  100,
                  Math.round((factor.scoreImpact / maxPossibleImpact) * 100),
                );

                return (
                  <div
                    key={index}
                    className="group/signal relative flex flex-col gap-4 overflow-hidden rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#050A10] hover:shadow-[0_12px_35px_rgba(103,232,249,0.06)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#67E8F9] opacity-0 transition-opacity duration-300 group-hover/signal:opacity-100" />

                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-full border border-[#67E8F9]/20 bg-[#67E8F9]/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[#67E8F9]">
                          {factor.category}
                        </span>

                        <span className="text-[14px] font-medium text-[#F4F7FA]">
                          {factor.factor}
                        </span>
                      </div>

                      <p className="text-[13px] leading-5 text-[#7F8A96]">
                        {factor.description}
                      </p>
                    </div>

                    <div className="flex w-full items-center justify-end gap-3 sm:w-56">
                      <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            factor.scoreImpact > 20
                              ? "bg-red-400"
                              : factor.scoreImpact > 10
                                ? "bg-amber-400"
                                : "bg-[#67E8F9]"
                          }`}
                          style={{ width: `${impactPercent}%` }}
                        />
                      </div>

                      <span
                        className={`w-14 shrink-0 text-right text-[12px] font-medium ${
                          factor.scoreImpact > 0
                            ? "text-[#67E8F9]"
                            : "text-[#7F8A96]"
                        }`}
                      >
                        {factor.scoreImpact > 0
                          ? `+${factor.scoreImpact}`
                          : "0"}{" "}
                        pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Gemini AI analysis */}
        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#67E8F9]" />
                <span className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#67E8F9]">
                  Gemini AI Threat Analysis
                </span>
              </div>

              <p className="mt-1 text-[13px] text-[#7F8A96]">
                Generate an analyst-ready forensic interpretation from the
                current telemetry.
              </p>
            </div>

            <button
              onClick={fetchAiExplanation}
              disabled={loadingAi}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#67E8F9]/10 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#67E8F9] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/65 hover:bg-[#67E8F9]/15 hover:shadow-[0_10px_28px_rgba(103,232,249,0.10)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 focus:border-[#67E8F9]/60 focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/20"
            >
              {loadingAi ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#67E8F9] border-t-transparent" />
                  <span>Analyzing Telemetry...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Forensic Summary</span>
                </>
              )}
            </button>
          </div>

          {aiInsight && (
            <div className="mt-4 rounded-xl border border-[#67E8F9]/20 bg-[#070C12] p-5 text-[13px] leading-6 text-[#A7B0BA] whitespace-pre-line transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#050A10]">
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#D4AF37]">
                <Activity className="h-3.5 w-3.5" />
                AI Forensic Output
              </div>
              {aiInsight}
            </div>
          )}
        </div>

        {/* Footer status */}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#67E8F9]" />
            Continuous Verification
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.65)]" />
            XAI Attribution Active
          </div>
        </div>
      </div>
    </div>
  );
};
