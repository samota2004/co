import React, { useMemo, useEffect, useState } from "react";
import {requestApi} from "../services/api.js";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Radio,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTheme } from "../context/ThemeContext";

// ============================================================
// DASHBOARD PAGE
// CYBERORBIT — SECURITY OPERATIONS CENTER
// ============================================================

// ============================================================
// 1. IMPORTS
// ============================================================

// ============================================================
// 2. REUSABLE UI COMPONENTS
// ============================================================

const MetricCard = ({
  label,
  value,
  description,
  icon: Icon,
  accent = "gold",
  isDark,
}) => {
  const accentClasses = {
    cyan: "text-[#67E8F9]",
    gold: "text-[#D4AF37]",
    red: "text-red-400",
    green: "text-emerald-400",
    neutral: isDark ? "text-white" : "text-[#111111]",
  };

  return (
    <div
      className={`
        group relative overflow-hidden
        rounded-2xl
        border
        bg-[#050A10]
        border-white/10
        shadow-[0_18px_60px_rgba(0,0,0,0.18)]
        transition-all duration-300
        hover:-translate-y-0.5
        hover:border-[#67E8F9]/30
        hover:bg-[#070C12]
      `}
    >
      <div className="absolute left-0 top-0 h-full w-[2px] bg-[#67E8F9] opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-5 sm:p-6 lg:p-7">
        <div className="flex items-start justify-between gap-3">
          <span
            className={`
              text-[12px] sm:text-[12px]
              uppercase tracking-[0.18em]
              font-mono
              ${isDark ? "text-[#7F8A96]" : "text-[#7F8A96]"}
            `}
          >
            {label}
          </span>

          <div
            className={`
              w-8 h-8
              rounded-lg
              flex items-center justify-center
              border
              ${
                isDark
                  ? "border-white/10 bg-white/[0.02]"
                  : "border-black/10 bg-[#F5F8FA]"
              }
            `}
          >
            <Icon className={`w-4 h-4 ${accentClasses[accent]}`} />
          </div>
        </div>

        <div className="mt-5">
          <div
            className={`
                            text-3xl sm:text-4xl
              font-light
              tracking-tight
              ${accentClasses[accent]}
            `}
          >
            {value}
          </div>

          <p
            className={`
              mt-2
              text-[12px]
              font-mono
              uppercase
              tracking-wide
              ${isDark ? "text-[#7F8A96]" : "text-[#7F8A96]"}
            `}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  description,
  rightContent,
  isDark,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-7">
      <div>
        <span className="block text-[12px] uppercase tracking-[0.2em] text-[#67E8F9] mb-2">
          {eyebrow}
        </span>

        <h2
          className={`
                        text-2xl
            font-light
            tracking-tight
            leading-[0.95]
            ${isDark ? "text-white" : "text-[#111111]"}
          `}
        >
          {title}
        </h2>

        {description && (
          <p
            className={`
              mt-2
              max-w-2xl
              text-[13px]
              leading-5
              ${isDark ? "text-[#7F8A96]" : "text-[#7F8A96]"}
            `}
          >
            {description}
          </p>
        )}
      </div>

      {rightContent}
    </div>
  );
};

const Panel = ({ children, className = "", isDark }) => {
  return (
    <div
      className={`
        group relative overflow-hidden
        rounded-2xl
        border border-white/10
        bg-[#050A10]
        p-5
        shadow-[0_18px_60px_rgba(0,0,0,0.18)]
        transition-all duration-300
        hover:border-[#67E8F9]/30
        hover:bg-[#070C12]
        sm:p-6
        lg:p-7
        ${className}
      `}
    >
      {children}
    </div>
  );
};

const RiskBadge = ({ score, level }) => {
  let label = "LOW";
  let classes = "border-emerald-500/30 bg-emerald-500/5 text-emerald-400";

  if (score >= 90) {
    label = "CRITICAL";
    classes = "border-red-500/40 bg-red-500/5 text-red-400";
  } else if (score >= 60) {
    label = "HIGH";
    classes = "border-orange-500/40 bg-orange-500/5 text-orange-400";
  } else if (score >= 40) {
    label = "MEDIUM";
    classes = "border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[#D4AF37]";
  }

  if(level)label=level.replaceAll("_"," ");
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2 py-1
        rounded-md
        border
        text-[12px]
        font-mono
        tracking-wider
        ${classes}
      `}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const normalized = status || "ACTIVE";

  let classes = "border-emerald-500/30 text-emerald-400 bg-emerald-500/5";

  if (normalized === "FROZEN") {
    classes = "border-red-500/40 text-red-400 bg-red-500/5";
  } else if (normalized === "RESTRICTED") {
    classes = "border-orange-500/40 text-orange-400 bg-orange-500/5";
  }

  return (
    <span
      className={`
        inline-flex
        px-2 py-1
        rounded-md
        border
        text-[12px]
        font-mono
        uppercase
        tracking-wider
        ${classes}
      `}
    >
      {normalized}
    </span>
  );
};

const EmptyState = ({ message, isDark }) => (
  <div
    className={`
      min-h-[150px]
      flex items-center justify-center
      text-center
      rounded-xl
      border
      border-dashed
      ${
        isDark
          ? "border-white/10 text-[#7F8A96]"
          : "border-black/10 text-[#7F8A96]"
      }
    `}
  >
    <div>
      <div className="text-[12px] font-mono uppercase tracking-wider">
        No data
      </div>
      <p className="mt-2 text-xs">{message}</p>
    </div>
  </div>
);

// ============================================================
// 4. MAIN DASHBOARD
// ============================================================

export const DashboardPage = ({
  onSelectUser,
  onSelectIncident,
  onNavigateToSimulator,
  onNavigateToCopilot,
  onFreezeUser,
  onUnfreezeUser,
}) => {
  const { isDark } = useTheme();

  const [overview,setOverview]=useState(null),[overviewError,setOverviewError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    const load=()=>Promise.all([
      requestApi("/api/dashboard/summary"),requestApi("/api/dashboard/risk-distribution"),
      requestApi("/api/dashboard/risk-trends")
    ]).then(([summary,distribution,trends])=>{if(!cancelled){setOverview({...summary,...distribution,...trends});setOverviewError("");}})
      .catch(e=>!cancelled&&setOverviewError(e.message));
    load();const timer=setInterval(load,30000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[]);
  const trend=useMemo(()=>{
    const days=new Map();
    for(const row of overview?.history||[]){
      const day=new Date(row.timestamp).toISOString().slice(0,10);
      const bucket=days.get(day)||{date:day,total:0,count:0};
      bucket.total+=row.score;bucket.count++;days.set(day,bucket);
    }
    return [...days.values()].map(d=>({date:d.date,risk:d.total/d.count}));
  },[overview]);
  const administrators=overview?.administrators||[];
  const incidents=overview?.incidents||[];
  const recentAlerts=(overview?.alerts||[]).slice(0,6);
  const authenticationEvents=overview?.authenticationActivity||[];
  /* =======================================================
     CORE METRICS
  ======================================================= */

  const totalAdministrators = overview?.summary.users ?? "—";
  const onlineUsers = overview?.summary.activeUsers ?? "—";
  const highRisk = overview?.summary.highRiskUsers ?? "—";
  const mediumRisk = overview?.summary.restrictedAccounts ?? "—";
  const safeUsers = overview?.summary.pendingApprovals ?? "—";
  const criticalIncidents = overview?.summary.criticalAlerts ?? "—";

  const assessedTrust = administrators.filter(user => typeof user.trustScore === 'number' && Number.isFinite(user.trustScore));
  const assessedRisk = administrators.filter(user => typeof user.riskScore === 'number' && Number.isFinite(user.riskScore));
  const avgTrustScore =
    assessedTrust.length > 0
      ? Math.round(
          assessedTrust.reduce(
            (sum, user) => sum + user.trustScore,
            0,
          ) / assessedTrust.length,
        )
      : null;

  const avgRiskScore =
    assessedRisk.length > 0
      ? Math.round(
          assessedRisk.reduce(
            (sum, user) => sum + user.riskScore,
            0,
          ) / assessedRisk.length,
        )
      : null;

  /* =======================================================
     RISK DISTRIBUTION
  ======================================================= */

  const riskDistData = useMemo(() => {
    const colors={LOW:"#22C55E",MEDIUM:"#D4AF37",HIGH:"#F59E0B",VERY_HIGH:"#F97316",CRITICAL:"#EF4444"};
    return (overview?.distribution||[]).map(row=>({
      name:row.riskLevel.replaceAll("_"," "),value:row._count._all,color:colors[row.riskLevel]
    })).filter(row=>row.value>0);
  },[overview]);

  /* =======================================================
     EVENT ANALYSIS
  ======================================================= */

  const activeIncidents = incidents
    .filter((incident) => incident.status !== "RESOLVED")
    .slice(0, 6);

  /* =======================================================
     DEPARTMENTS - REAL DATA ONLY
  ======================================================= */

  const departments = overview?.departments||[];

  /* =======================================================
     THREAT CATEGORIES - REAL INCIDENT DATA
  ======================================================= */

  const threatDistribution = useMemo(() => {
    if (!incidents.length) return [];

    const categories = {};

    incidents.forEach((incident) => {
      const title = String(
        incident.title ||
          incident.eventType ||
          incident.type ||
          "Uncategorized Threat",
      );

      let category = "Other Security Event";

      const lower = title.toLowerCase();

      if (lower.includes("privilege") || lower.includes("escalation")) {
        category = "Privilege Escalation";
      } else if (lower.includes("exfiltration") || lower.includes("data")) {
        category = "Data Exfiltration";
      } else if (
        lower.includes("hour") ||
        lower.includes("after") ||
        lower.includes("off-hours")
      ) {
        category = "Off-Hours Anomaly";
      } else if (
        lower.includes("usb") ||
        lower.includes("hardware") ||
        lower.includes("device")
      ) {
        category = "Unapproved Hardware";
      } else if (lower.includes("shell") || lower.includes("command")) {
        category = "Shell / Command Activity";
      }

      categories[category] = (categories[category] || 0) + 1;
    });

    const total = incidents.length;

    return Object.entries(categories)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [incidents]);

  /* =======================================================
     AUTHENTICATION DATA
     ======================================================= */

  const authenticationData = useMemo(() => {
    if (!authenticationEvents.length) return [];

    const buckets = {};

    authenticationEvents.forEach((event) => {
      if (!event.timestamp) return;

      const date = new Date(event.timestamp);

      if (Number.isNaN(date.getTime())) return;

      const hour = date.getHours();
      const label = `${String(hour).padStart(2, "0")}:00`;

      if (!buckets[label]) {
        buckets[label] = {
          time: label,
          logins: 0,
        };
      }

      // The API filters this collection to authentication audit actions.
      buckets[label].logins += 1;
    });

    return Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
  }, [authenticationEvents]);

  /* =======================================================
     REAL POSTURE DATA
  ======================================================= */

  const postureData = useMemo(() => {
    if (avgRiskScore === null && avgTrustScore === null) return [];

    return [
      {
        label: "Current",
        risk: avgRiskScore,
        trust: avgTrustScore,
      },
    ];
  }, [administrators, avgRiskScore, avgTrustScore]);

  /* =======================================================
     TOOLTIP STYLE
  ======================================================= */

  const tooltipStyle = {
    backgroundColor: isDark ? "#050A10" : "#FFFFFF",
    border: "1px solid rgba(103,232,249,0.35)",
    borderRadius: "10px",
    color: isDark ? "#FFFFFF" : "#111111",
    fontSize: "11px",
    fontFamily: "monospace",
  };

  const axisColor = isDark ? "#555555" : "#A3A3A3";

  return (
    <div
      id="cyberorbit-dashboard"
      className={`
        min-h-full
        mx-auto
        w-full
        max-w-[1500px]
        space-y-5
        px-5
        pb-10
        sm:px-8
        lg:px-12
        text-white
      `}
    >
      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        className={`console-hero 
          group relative min-h-[210px] overflow-hidden rounded-2xl
          border border-[#67E8F9]/55
          bg-[#050A10]
          shadow-[0_18px_60px_rgba(0,0,0,0.28)]
          transition-all duration-300
          hover:-translate-y-0.5
          hover:border-[#67E8F9]/85
          hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]
        `}
      >
        {/* Enterprise telemetry grid */}
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] opacity-70 lg:block">
          <div className="absolute inset-y-0 left-[8%] w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-y-0 left-[24%] w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-y-0 left-[40%] w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-y-0 left-[56%] w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-y-0 left-[72%] w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-y-0 left-[88%] w-px bg-[#67E8F9]/10" />

          <div className="absolute inset-x-0 top-[20%] h-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[40%] h-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[60%] h-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[80%] h-px bg-[#67E8F9]/10" />
        </div>

        {/* Security telemetry core */}
        <div className="pointer-events-none absolute right-[7%] top-1/2 hidden h-44 w-44 -translate-y-1/2 lg:block">
          <div className="absolute inset-1 rounded-full border border-[#67E8F9]/12" />
          <div className="absolute inset-5 rounded-full border border-[#D4AF37]/25" />
          <div className="absolute inset-10 rounded-full border border-[#67E8F9]/25" />
          <div className="absolute inset-[29%] rounded-full border border-[#67E8F9]/20" />

          <div
            className="absolute left-1/2 top-1/2 flex h-20 w-20
    -translate-x-1/2 -translate-y-1/2 items-center justify-center
    rounded-2xl border border-[#67E8F9]/55 bg-[#070C12]/95
    shadow-[0_0_35px_rgba(103,232,249,0.14)]"
          >
            <Shield className="h-9 w-9 text-[#67E8F9]" />
          </div>

          <div
            className="absolute left-1/2 top-0 h-2 w-2
    -translate-x-1/2 rounded-full bg-[#D4AF37]
    shadow-[0_0_12px_rgba(212,175,55,0.55)]"
          />

          <div
            className="absolute bottom-0 left-1/2 h-2 w-2
    -translate-x-1/2 rounded-full bg-[#67E8F9]
    shadow-[0_0_12px_rgba(103,232,249,0.55)]"
          />
        </div>

        <div className="pointer-events-none absolute left-0 top-0 h-10 w-1 rounded-r-full bg-[#D4AF37]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-1 rounded-l-full bg-[#67E8F9]" />

        <div className="relative z-10 flex min-h-[210px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[74%]">
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <span className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.55)]" />
                CyberOrbit Security Operations
              </span>

              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                Live Monitoring
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Security
              <span className="block text-[#67E8F9]">Operations Center</span>
            </h1>

            <p
              className={`
                mt-4
                max-w-2xl
                text-[14px]
                leading-6
                text-[#A7B0BA]
              `}
            >
              Continuous behavioral intelligence across identities, devices and
              security events — providing a unified view of organizational risk
              and trust posture.
            </p>
          </div>

          <div className="absolute bottom-9 right-9 z-20 flex items-center gap-3">
            <button
              id="dashboard-btn-simulator"
              onClick={onNavigateToSimulator}
              className="
                group
                inline-flex items-center justify-center gap-2
                px-5 py-3
                rounded-xl bg-[#67E8F9]
                border border-[#67E8F9]
                text-[#050A10]
                text-[12px]
                font-semibold
                uppercase
                tracking-[0.12em]
                transition-all duration-300
                hover:bg-transparent
                hover:text-[#67E8F9]
              "
            >
              <Radio className="w-3.5 h-3.5" />
              Threat Simulator
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>

            <button
              id="dashboard-btn-copilot"
              onClick={onNavigateToCopilot}
              className={`
                inline-flex items-center justify-center gap-2
                px-5 py-3
                rounded-xl border border-[#67E8F9]/40
                text-[12px]
                uppercase
                tracking-[0.12em]
                text-[#67E8F9]
                transition-all duration-300
                hover:bg-[#67E8F9]
                hover:text-[#050A10]
              `}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Copilot
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================
          KPI STRIP
      ===================================================== */}

      <section className="mt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[12px] font-mono uppercase tracking-[0.28em] text-[#67E8F9]">
              Security Intelligence
            </span>
          </div>

          <span className="hidden sm:block text-[12px] font-mono uppercase tracking-wider text-[#7F8A96]">
            Continuous Monitoring
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard
            label="Total Administrators"
            value={totalAdministrators}
            description="Administrator identities"
            icon={Users}
            accent="neutral"
            isDark={isDark}
          />

          <MetricCard
            label="Active Accounts"
            value={onlineUsers}
            description="Enabled accounts, not online sessions"
            icon={Wifi}
            accent="cyan"
            isDark={isDark}
          />

          <MetricCard
            label="High Risk"
            value={highRisk}
            description="Configured high-risk threshold"
            icon={ShieldAlert}
            accent={highRisk > 0 ? "red" : "neutral"}
            isDark={isDark}
          />

          <MetricCard
            label="Restricted Accounts"
            value={mediumRisk}
            description="Reversible restrictions"
            icon={Activity}
            accent="gold"
            isDark={isDark}
          />

          <MetricCard
            label="Pending Approvals"
            value={safeUsers}
            description="Awaiting an authorized review"
            icon={UserCheck}
            accent="green"
            isDark={isDark}
          />

          <MetricCard
            label="Critical Incidents"
            value={criticalIncidents}
            description="Pending containment"
            icon={AlertTriangle}
            accent={criticalIncidents > 0 ? "red" : "neutral"}
            isDark={isDark}
          />
        </div>
      </section>

      {/* =====================================================
          POSTURE + RISK DISTRIBUTION
      ===================================================== */}

      <section className="mt-10 grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Panel isDark={isDark} className="xl:col-span-8 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Posture Intelligence"
            title="Risk & Trust Overview"
            description="Risk and trust posture for administrator identities only."
            isDark={isDark}
            rightContent={
              <div className="flex gap-6">
                <div>
                  <span className="block text-[12px] font-mono text-[#7F8A96] uppercase">
                    Risk
                  </span>
                  <span className="text-xl text-[#67E8F9]">
                    {avgRiskScore ?? "—"}
                  </span>
                </div>

                <div>
                  <span className="block text-[12px] font-mono text-[#7F8A96] uppercase">
                    Trust
                  </span>
                  <span className="text-xl font-serif-display">
                    {avgTrustScore ?? "—"}
                  </span>
                </div>
              </div>
            }
          />

          {postureData.length > 0 ? (
            <div className="h-[280px] rounded-xl border border-white/10 bg-[#070C12] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={postureData}>
                  <defs>
                    <linearGradient
                      id="cyberOrbitRiskGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#67E8F9"
                        stopOpacity={0.22}
                      />
                      <stop offset="100%" stopColor="#67E8F9" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    stroke={
                      isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
                    }
                  />

                  <XAxis
                    dataKey="label"
                    stroke={axisColor}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />

                  <YAxis
                    domain={[0, 100]}
                    stroke={axisColor}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />

                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      `${value}/100`,
                      name === "risk" ? "Composite Risk" : "Fleet Trust",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="risk"
                    stroke="#67E8F9"
                    strokeWidth={2}
                    fill="url(#cyberOrbitRiskGradient)"
                    name="risk"
                  />

                  <Line
                    type="monotone"
                    dataKey="trust"
                    stroke={isDark ? "#E5E7EB" : "#4B5563"}
                    strokeWidth={1.5}
                    dot={false}
                    name="trust"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              message="Risk and trust telemetry will appear as administrator records are available."
              isDark={isDark}
            />
          )}
        </Panel>

        <Panel isDark={isDark} className="xl:col-span-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Risk Classification"
            title="Risk Distribution"
            description="Administrator distribution by behavioral risk tier."
            isDark={isDark}
          />

          {riskDistData.length > 0 ? (
            <>
              <div className="relative h-[220px] rounded-xl border border-white/10 bg-[#070C12]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={84}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {riskDistData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          stroke={isDark ? "#050A10" : "#FFFFFF"}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>

                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="block text-[12px] font-mono uppercase text-[#7F8A96]">
                      Total
                    </span>

                    <span className="text-3xl font-light tracking-tight">
                      {totalAdministrators}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={`
                  border-t pt-5 space-y-3
                  ${isDark ? "border-white/10" : "border-black/10"}
                `}
              >
                {riskDistData.map((item) => {
                  const percentage =
                    administrators.length > 0
                      ? Math.round((item.value / administrators.length) * 100)
                      : 0;

                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2"
                          style={{
                            backgroundColor: item.color,
                          }}
                        />

                        <span className="text-xs">{item.name}</span>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-[12px] text-[#7F8A96]">
                          {percentage}%
                        </span>

                        <span className="text-xs font-semibold">
                          {item.value}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>
      </section>

      <Panel isDark={isDark} className="mt-5">
        <h2 className="text-xl text-cyan-200">Recorded risk trend</h2>
        {overviewError&&<p role="alert" className="text-red-400">{overviewError}</p>}
        <p className="text-sm text-slate-400">Mean recorded assessment risk per UTC day, from at most 2,000 events in the last 30 days.</p>
        {trend.length?<div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><XAxis dataKey="date"/><YAxis domain={[0,100]}/><Tooltip contentStyle={tooltipStyle}/><Line dataKey="risk" stroke="#67E8F9"/></LineChart></ResponsiveContainer></div>:<p>No administrator activity available.</p>}
      </Panel>

      {/* =====================================================
          AUTHENTICATION
      ===================================================== */}

      <section className="mt-5">
        <Panel isDark={isDark} className="p-6 sm:p-8">
          <SectionHeader
            eyebrow="Access Intelligence"
            title="Authentication Activity"
            description="Authentication events for administrator accounts only."
            isDark={isDark}
            rightContent={
              <div className="flex items-center gap-2 text-[12px] font-mono uppercase text-[#7F8A96]">
                <Clock3 className="w-3.5 h-3.5 text-[#67E8F9]" />
                Event-derived
              </div>
            }
          />

          {authenticationData.length > 0 ? (
            <div className="h-[230px] rounded-xl border border-white/10 bg-[#070C12] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={authenticationData}>
                  <CartesianGrid
                    vertical={false}
                    stroke={
                      isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
                    }
                  />

                  <XAxis
                    dataKey="time"
                    stroke={axisColor}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />

                  <YAxis
                    allowDecimals={false}
                    stroke={axisColor}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />

                  <Tooltip contentStyle={tooltipStyle} />

                  <Line
                    type="monotone"
                    dataKey="logins"
                    stroke="#67E8F9"
                    strokeWidth={2}
                    dot={{
                      r: 3,
                      fill: isDark ? "#050A10" : "#FFFFFF",
                      stroke: "#67E8F9",
                      strokeWidth: 2,
                    }}
                    name="Authentication Events"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>
      </section>

      {/* =====================================================
          ORGANIZATIONAL INTELLIGENCE
      ===================================================== */}

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Panel isDark={isDark} className="xl:col-span-8 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Organizational Exposure"
            title="Department Risk Intelligence"
            description="Average recorded risk for administrators in each department."
            isDark={isDark}
          />

          {departments.length > 0 ? (
            <div className="space-y-5">
              {departments.map((department) => (
                <div key={department.name}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium">
                        {department.name}
                      </span>

                      <span className="ml-2 text-[12px] font-mono text-[#7F8A96]">
                        {department.count}{" "}
                        {department.count === 1 ? "administrator" : "administrators"}
                      </span>
                    </div>

                    <span
                      className={`
                        text-xs font-mono font-semibold
                        ${
                          department.risk >= 75
                            ? "text-red-400"
                            : department.risk >= 60
                              ? "text-orange-400"
                              : department.risk >= 40
                                ? "text-[#D4AF37]"
                                : "text-emerald-400"
                        }
                      `}
                    >
                      {department.risk === null ? 'Not assessed' : `${department.risk}/100`}
                    </span>
                  </div>

                  <div
                    className={`
                      h-2
                      rounded-full
                      overflow-hidden
                      ${isDark ? "bg-white/5" : "bg-black/5"}
                    `}
                  >
                    <div
                      className={`
                        h-full
                        rounded-full
                        transition-all duration-700
                        ${
                          department.risk >= 75
                            ? "bg-red-500"
                            : department.risk >= 60
                              ? "bg-orange-500"
                              : department.risk >= 40
                                ? "bg-[#D4AF37]"
                                : "bg-emerald-500"
                        }
                      `}
                      style={{ width: department.risk === null ? '0%' : `${Math.min(100, department.risk)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>

        <Panel isDark={isDark} className="xl:col-span-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Threat Taxonomy"
            title="Threat Distribution"
            description="Incident categories derived from the current incident stream."
            isDark={isDark}
          />

          {threatDistribution.length > 0 ? (
            <div className="space-y-5">
              {threatDistribution.map((threat, index) => (
                <div key={threat.type}>
                  <div className="flex justify-between gap-3 mb-2">
                    <span className="text-xs text-[#A7B0BA]">
                      {threat.type}
                    </span>

                    <span className="text-[12px] font-mono">
                      {threat.count} · {threat.percentage}%
                    </span>
                  </div>

                  <div
                    className={`
                        h-1.5
                        rounded-full
                        ${isDark ? "bg-white/5" : "bg-black/5"}
                      `}
                  >
                    <div
                      className="h-full bg-[#67E8F9]"
                      style={{
                        width: `${threat.percentage}%`,
                        opacity: 1 - index * 0.12,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>
      </section>

      {/* =====================================================
          ADMINISTRATOR TABLE
      ===================================================== */}

      <section className="mt-5">
        <Panel isDark={isDark} className="overflow-hidden">
          <div className="p-6 sm:p-8 pb-5">
            <SectionHeader
              eyebrow="Identity Governance"
              title="Administrator Intelligence"
              description="Administrator role, status, recorded risk and trust, policy trust state, latest completed MFA login, and current session state."
              isDark={isDark}
              rightContent={
                <div className="text-right">
                  <span className="block text-[12px] font-mono uppercase text-[#7F8A96]">
                    Administrators
                  </span>

                  <span className="text-2xl">{totalAdministrators}</span>
                </div>
              }
            />
          </div>

          {administrators.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full min-w-[950px] text-left">
                <thead>
                  <tr
                    className={`
                      border-y
                      bg-white/[0.015]
                      text-[12px]
                      font-mono
                      uppercase
                      tracking-[0.15em]
                      ${
                        isDark
                          ? "border-white/10 text-[#7F8A96]"
                          : "border-black/10 text-[#7F8A96]"
                      }
                    `}
                  >
                    <th className="px-6 py-4">Administrator</th>

                    <th className="px-4 py-4">Role</th>

                    <th className="px-4 py-4">Risk</th>

                    <th className="px-4 py-4">Trust</th>

                    <th className="px-4 py-4">Status</th>

                    <th className="px-4 py-4">Last login</th>

                    <th className="px-4 py-4">Trust State</th>

                    <th className="px-6 py-4">Session state</th>
                  </tr>
                </thead>

                <tbody>
                  {administrators.map((user) => {
                    const risk = user.riskScore;
                    const trust = user.trustScore;

                    const initials =
                      user.name
                        ?.split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "U";

                    return (
                      <tr
                        key={user.id}
                        onClick={() => onSelectUser && onSelectUser(user.id)}
                        className={`
                          group
                          border-b
                          cursor-pointer
                          transition-colors
                          ${
                            isDark
                              ? "border-white/5 hover:bg-white/[0.025]"
                              : "border-black/5 hover:bg-[#F5F8FA]/60"
                          }
                        `}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="
                                w-9 h-9
                                rounded-lg
                                flex items-center justify-center
                                border border-[#67E8F9]/40
                                bg-[#67E8F9]/5
                                text-[#67E8F9]
                                text-[12px]
                                font-mono
                                font-bold
                              "
                            >
                              {initials}
                            </div>

                            <div>
                              <div className="text-sm font-medium">
                                {user.name || "Unnamed Administrator"}
                              </div>

                              <div className="mt-0.5 text-[12px] font-mono text-[#7F8A96]">
                                {user.email ||
                                  user.employeeId ||
                                  "No identifier"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className="text-xs text-[#A7B0BA]">
                            {user.roleCode === "SYSTEM_ADMIN" ? "System Administrator" : "Security Administrator"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <div>
                            <span
                              className={`
                                text-sm
                                font-mono
                                font-semibold
                                ${
                                  risk >= 75
                                    ? "text-red-400"
                                    : risk >= 60
                                      ? "text-orange-400"
                                      : risk >= 40
                                        ? "text-[#67E8F9]"
                                        : "text-emerald-400"
                                }
                              `}
                            >
                              {risk === null ? 'Not assessed' : risk}
                            </span>

                            {risk !== null && <span className="text-[12px] font-mono text-[#7F8A96]">/100</span>}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div>
                            <span className="text-sm font-mono font-semibold">
                              {trust === null ? 'Not assessed' : trust}
                            </span>

                            {trust !== null && <span className="text-[12px] font-mono text-[#7F8A96]">/100</span>}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={user.status} />
                        </td>

                        <td className="px-4 py-4">
                          <span className="text-[12px] font-mono text-[#7F8A96]">
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleString([], {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span className="text-xs text-[#7F8A96]">
                            {{NOT_ASSESSED:"Not assessed",FRESH_MFA_REQUIRED:"Fresh MFA required",SENSITIVE_APPROVAL_REQUIRED:"Approval required for sensitive resources",STANDARD:"Standard"}[user.trustState]||"Unknown"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`
                                w-1.5 h-1.5 rounded-full
                                ${
                                user.sessionState === "ACTIVE" ? "bg-emerald-400" : "bg-gray-500"
                                }
                              `}
                            />

                            <span className="text-[12px] font-mono text-[#7F8A96]">
                              {user.sessionState === "ACTIVE" ? "Active session" : "No active session"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 pb-8">
              <EmptyState
                message="No administrator accounts available."
                isDark={isDark}
              />
            </div>
          )}
        </Panel>
      </section>

      {/* =====================================================
          ALERTS + INCIDENTS
      ===================================================== */}

      <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ALERTS */}

        <Panel isDark={isDark} className="p-6 sm:p-8">
          <SectionHeader
            eyebrow="Anomaly Stream"
            title="Recent Alerts"
            description="Highest-priority security events associated with administrators."
            isDark={isDark}
            rightContent={
              <span
                className="
                  inline-flex items-center gap-2
                  text-[12px]
                  font-mono
                  uppercase
                  tracking-wider
                  text-[#67E8F9]
                "
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#67E8F9] animate-pulse" />
                Live
              </span>
            }
          />

          {recentAlerts.length > 0 ? (
            <div className="space-y-3">
              {recentAlerts.map((event) => {
                const critical =
                  event.severity === "CRITICAL" || event.isAnomalous;

                return (
                  <div
                    key={event.id}
                    className={`
                      group
                      rounded-xl
                      border
                      p-4
                      transition-all
                      ${
                        critical
                          ? isDark
                            ? "border-red-500/20 bg-red-500/[0.025]"
                            : "border-red-500/20 bg-red-50/30"
                          : isDark
                            ? "border-white/10 hover:border-[#67E8F9]/30"
                            : "border-black/10 hover:border-[#67E8F9]/35"
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          mt-0.5
                          w-8 h-8
                          rounded-lg
                          flex items-center justify-center
                          border
                          ${
                            critical
                              ? "border-red-500/30 text-red-400"
                              : "border-[#67E8F9]/30 text-[#67E8F9]"
                          }
                        `}
                      >
                        {critical ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <Activity className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {event.eventType || "Security Event"}
                          </span>

                          <span className="text-[12px] font-mono text-[#7F8A96]">
                            {event.timestamp
                              ? new Date(event.timestamp).toLocaleTimeString()
                              : "—"}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] font-mono text-[#7F8A96]">
                            {event.userName || "Unknown administrator"}
                            {event.userDepartment
                              ? ` · ${event.userDepartment}`
                              : ""}
                          </span>

                          <span className="text-[12px] font-mono text-[#67E8F9]">
                            Risk {event.riskContribution ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>

        {/* INCIDENTS */}

        <Panel isDark={isDark} className="p-6 sm:p-8">
          <SectionHeader
            eyebrow="SOC Investigations"
            title="Active Incidents"
            description="Security incidents requiring monitoring, investigation or containment."
            isDark={isDark}
            rightContent={
              <button
                onClick={onSelectIncident}
                className="
                  inline-flex items-center gap-1
                  text-[12px]
                  font-mono
                  uppercase
                  tracking-wider
                  text-[#67E8F9]
                  hover:underline
                "
              >
                View all
                <ArrowUpRight className="w-3 h-3" />
              </button>
            }
          />

          {activeIncidents.length > 0 ? (
            <div className="space-y-3">
              {activeIncidents.map((incident) => (
                <button
                  key={incident.id}
                  onClick={() =>
                    onSelectIncident && onSelectIncident(incident.id)
                  }
                  className={`
                    w-full
                    text-left
                    rounded-xl
                    border
                    p-4
                    transition-all
                    ${
                      isDark
                        ? "border-white/10 hover:border-[#67E8F9]/35"
                        : "border-black/10 hover:border-[#67E8F9]/45"
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="mt-1">
                        <span
                          className={`
                            block w-2 h-2 rounded-full
                            ${
                              incident.severity === "CRITICAL"
                                ? "bg-red-500"
                                : incident.severity === "HIGH"
                                  ? "bg-orange-500"
                                  : "bg-[#67E8F9]"
                            }
                          `}
                        />
                      </div>

                      <div>
                        <h4 className="text-sm font-medium">
                          {incident.title ||
                            incident.eventType ||
                            "Security Incident"}
                        </h4>

                        <p className="mt-1 text-[12px] font-mono text-[#7F8A96]">
                          {incident.userName || "Unknown administrator"}
                          {incident.userDepartment
                            ? ` · ${incident.userDepartment}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`
                        shrink-0
                        text-[12px]
                        font-mono
                        uppercase
                        tracking-wider
                        ${
                          incident.severity === "CRITICAL"
                            ? "text-red-400"
                            : incident.severity === "HIGH"
                              ? "text-orange-400"
                              : "text-[#67E8F9]"
                        }
                      `}
                    >
                      {incident.severity || "UNKNOWN"}
                    </span>
                  </div>

                  <div
                    className={`
                      mt-4 pt-3
                      border-t
                      flex items-center justify-between
                      ${isDark ? "border-white/5" : "border-black/5"}
                    `}
                  >
                    <span className="text-[12px] font-mono uppercase text-[#7F8A96]">
                      Status
                    </span>

                    <span className="text-[12px] font-mono uppercase text-[#A7B0BA]">
                      {incident.status || "OPEN"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              message="No administrator activity available."
              isDark={isDark}
            />
          )}
        </Panel>
      </section>

      {/* =====================================================
          FOOTER STATUS
      ===================================================== */}

      <section
        className={`
          mt-5
          flex flex-col sm:flex-row
          items-start sm:items-center
          justify-between
          gap-4
          border-t
          pt-6
          ${isDark ? "border-white/10" : "border-black/10"}
        `}
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />

          <div>
            <span className="block text-[12px] font-mono uppercase tracking-wider text-[#7F8A96]">
              CyberOrbit Monitoring Status
            </span>

            <span className="text-xs">
              Security intelligence layer operational
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5 text-[12px] font-mono uppercase tracking-wider text-[#7F8A96]">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-[#67E8F9]" />
            Continuous Evaluation
          </span>

          <span className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-[#67E8F9]" />
            Identity Monitoring
          </span>
        </div>
      </section>
    </div>
  );
};
