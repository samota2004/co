import React from "react";

const badgeBase =
  "group inline-flex items-center justify-center rounded-full border font-medium tracking-wide transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_16px_rgba(103,232,249,0.08)]";

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
  const c = riskConfigs[level] || riskConfigs.LOW;

  return (
    <span
      className={`${badgeBase} gap-2 px-3 py-1.5 text-[12px] uppercase ${c.bg} ${c.text} ${c.border}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} shadow-[0_0_7px_currentColor]`}
      />
      <span>{level?.replace(/_/g, " ")}</span>

      {typeof score === "number" && (
        <span className="text-[11px] opacity-75">({score})</span>
      )}
    </span>
  );
};

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
  const c = severityConfigs[severity] || severityConfigs.LOW;

  return (
    <span
      className={`${badgeBase} gap-2 px-3 py-1.5 text-[12px] uppercase ${c.bg} ${c.text} ${c.border}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} shadow-[0_0_7px_currentColor]`}
      />
      {severity}
    </span>
  );
};

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
  const c = statusConfigs[status] || {
    bg: "bg-white/[0.04]",
    text: "text-[#7F8A96]",
    border: "border-white/10",
    dot: "bg-[#7F8A96]",
  };

  return (
    <span
      className={`${badgeBase} gap-2 px-3 py-1.5 text-[12px] uppercase ${c.bg} ${c.text} ${c.border}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} shadow-[0_0_7px_currentColor]`}
      />
      {status?.replace(/_/g, " ")}
    </span>
  );
};

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
  const c = policyActionConfigs[action] || policyActionConfigs.ALLOW;

  return (
    <span
      className={`${badgeBase} gap-2 px-3 py-1.5 text-[12px] uppercase ${c.bg} ${c.text} ${c.border}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} shadow-[0_0_7px_currentColor]`}
      />
      {c.label}
    </span>
  );
};
