
import React from "react";

// Shared badge styling
const badgeBase =
  "group inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium uppercase tracking-wide transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_16px_rgba(103,232,249,0.08)]";

const getBadgeClass = (config) =>
  `${badgeBase} ${config.bg} ${config.text} ${config.border}`;

const BadgeDot = ({ color }) => (
  <span
    className={`h-1.5 w-1.5 shrink-0 rounded-full ${color} shadow-[0_0_7px_currentColor]`}
  />
);

// ======================================================
// RISK BADGE
// ======================================================

const riskConfigs = {
  LOW: {
    bg: "bg-[#67E8F9]/10",
    text: "text-[#67E8F9]",
    border: "border-[#67E8F9]/25",
    dot: "bg-[#67E8F9]",
  },
  MEDIUM: {
    bg: "bg-[#D4AF37]/10",
    text: "text-[#D4AF37]",
    border: "border-[#D4AF37]/30",
    dot: "bg-[#D4AF37]",
  },
  HIGH: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  VERY_HIGH: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  CRITICAL: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
};

export const RiskBadge = ({ level, score }) => {
  const normalizedLevel = level?.toUpperCase() || "LOW";
  const config = riskConfigs[normalizedLevel] || riskConfigs.LOW;

  return (
    <span className={getBadgeClass(config)}>
      <BadgeDot color={config.dot} />

      <span>{normalizedLevel.replace(/_/g, " ")}</span>

      {typeof score === "number" && (
        <span className="text-[11px] opacity-75">
          ({score})
        </span>
      )}
    </span>
  );
};

// ======================================================
// SEVERITY BADGE
// ======================================================

const severityConfigs = {
  LOW: {
    bg: "bg-white/[0.04]",
    text: "text-[#A7B0BA]",
    border: "border-white/10",
    dot: "bg-[#7F8A96]",
  },
  MEDIUM: {
    bg: "bg-[#D4AF37]/10",
    text: "text-[#D4AF37]",
    border: "border-[#D4AF37]/30",
    dot: "bg-[#D4AF37]",
  },
  HIGH: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  CRITICAL: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
};

export const SeverityBadge = ({ severity }) => {
  const normalizedSeverity = severity?.toUpperCase() || "LOW";
  const config =
    severityConfigs[normalizedSeverity] || severityConfigs.LOW;

  return (
    <span className={getBadgeClass(config)}>
      <BadgeDot color={config.dot} />
      {normalizedSeverity}
    </span>
  );
};

// ======================================================
// STATUS BADGE
// ======================================================

const statusConfigs = {
  ACTIVE: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  RESTRICTED: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  FROZEN: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  SUSPENDED: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  TRUSTED: {
    bg: "bg-[#67E8F9]/10",
    text: "text-[#67E8F9]",
    border: "border-[#67E8F9]/25",
    dot: "bg-[#67E8F9]",
  },
  SUSPICIOUS: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  REVOKED: {
    bg: "bg-white/[0.04]",
    text: "text-[#7F8A96]",
    border: "border-white/10",
    dot: "bg-[#7F8A96]",
  },
  OPEN: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  UNDER_REVIEW: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  APPROVED: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  REJECTED: {
    bg: "bg-white/[0.04]",
    text: "text-[#7F8A96]",
    border: "border-white/10",
    dot: "bg-[#7F8A96]",
  },
  RESOLVED: {
    bg: "bg-[#67E8F9]/10",
    text: "text-[#67E8F9]",
    border: "border-[#67E8F9]/25",
    dot: "bg-[#67E8F9]",
  },
  PENDING: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
  },
};

export const StatusBadge = ({ status }) => {
  const normalizedStatus = status?.toUpperCase() || "UNKNOWN";

  const config = statusConfigs[normalizedStatus] || {
    bg: "bg-white/[0.04]",
    text: "text-[#7F8A96]",
    border: "border-white/10",
    dot: "bg-[#7F8A96]",
  };

  return (
    <span className={getBadgeClass(config)}>
      <BadgeDot color={config.dot} />
      {normalizedStatus.replace(/_/g, " ")}
    </span>
  );
};

// ======================================================
// POLICY ACTION BADGE
// ======================================================

const policyActionConfigs = {
  ALLOW: {
    bg: "bg-[#67E8F9]/10",
    text: "text-[#67E8F9]",
    border: "border-[#67E8F9]/25",
    dot: "bg-[#67E8F9]",
    label: "ALLOW ACCESS",
  },
  MONITOR: {
    bg: "bg-white/[0.04]",
    text: "text-[#A7B0BA]",
    border: "border-white/10",
    dot: "bg-[#A7B0BA]",
    label: "MONITOR TELEMETRY",
  },
  MFA: {
    bg: "bg-[#D4AF37]/10",
    text: "text-[#D4AF37]",
    border: "border-[#D4AF37]/30",
    dot: "bg-[#D4AF37]",
    label: "REQUIRE STEP-UP MFA",
  },
  REQUIRE_APPROVAL: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
    label: "REQUIRE ADMIN APPROVAL",
  },
  RESTRICT: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
    label: "RESTRICT RESOURCE",
  },
  FREEZE: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
    dot: "bg-red-400",
    label: "FREEZE ACCOUNT",
  },
};

export const PolicyActionBadge = ({ action }) => {
  const normalizedAction = action?.toUpperCase() || "ALLOW";
  const config =
    policyActionConfigs[normalizedAction] || policyActionConfigs.ALLOW;

  return (
    <span className={getBadgeClass(config)}>
      <BadgeDot color={config.dot} />
      {config.label}
    </span>
  );
};
