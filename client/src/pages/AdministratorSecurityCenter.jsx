
import React, { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Fingerprint,
  Laptop,
  Monitor,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
  History,
  Server,
  CircleDot,
} from "lucide-react";

import { requestApi } from "../services/api.js";

// --------------------------------------------------
// SHARED STYLES
// --------------------------------------------------

const panel =
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6";

const sectionHeading =
  "flex items-center gap-2 text-xs font-mono uppercase tracking-[0.17em] text-[#67E8F9]";

const mutedText = "text-sm text-[#7F8A96]";

const date = (value) => {
  if (!value) return "Not recorded";

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toLocaleString();
};

// --------------------------------------------------
// STATUS STYLES
// --------------------------------------------------

const getSeverityStyle = (severity) => {
  const value = String(severity || "").toLowerCase();

  if (
    value.includes("critical") ||
    value.includes("high")
  ) {
    return "border-red-400/25 bg-red-400/[0.07] text-red-400";
  }

  if (
    value.includes("medium") ||
    value.includes("warning")
  ) {
    return "border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] text-[#D4AF37]";
  }

  if (
    value.includes("low") ||
    value.includes("info")
  ) {
    return "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]";
  }

  return "border-white/10 bg-white/[0.04] text-[#A7B0BA]";
};

const getStatusStyle = (status) => {
  const value = String(status || "").toLowerCase();

  if (
    value === "online" ||
    value === "active" ||
    value === "resolved" ||
    value === "verified" ||
    value === "success"
  ) {
    return "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]";
  }

  if (
    value === "offline" ||
    value === "revoked" ||
    value === "blocked" ||
    value === "critical"
  ) {
    return "border-red-400/25 bg-red-400/[0.07] text-red-400";
  }

  if (
    value === "pending" ||
    value === "investigating" ||
    value === "not enrolled"
  ) {
    return "border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] text-[#D4AF37]";
  }

  return "border-white/10 bg-white/[0.04] text-[#A7B0BA]";
};

// --------------------------------------------------
// REUSABLE COMPONENTS
// --------------------------------------------------

const StatusTag = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${getStatusStyle(
      status
    )}`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {status || "Unknown"}
  </span>
);

const SeverityTag = ({ severity }) => (
  <span
    className={`inline-flex items-center rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${getSeverityStyle(
      severity
    )}`}
  >
    {severity || "Unspecified"}
  </span>
);

const EmptyState = ({
  icon: Icon,
  title,
  description,
}) => (
  <div className="rounded-xl border border-white/10 bg-[#070C12] p-7 text-center">

    <Icon className="mx-auto h-7 w-7 text-[#7F8A96]" />

    <p className="mt-3 text-sm font-medium text-[#A7B0BA]">
      {title}
    </p>

    {description && (
      <p className="mt-1 text-xs leading-5 text-[#7F8A96]">
        {description}
      </p>
    )}

  </div>
);

const MetricCard = ({
  label,
  value,
  icon: Icon,
  accent = "cyan",
  description,
}) => {
  const colors =
    accent === "gold"
      ? {
          text: "text-[#D4AF37]",
          border: "border-[#D4AF37]/20",
          bg: "bg-[#D4AF37]/[0.06]",
        }
      : accent === "red"
      ? {
          text: "text-red-400",
          border: "border-red-400/20",
          bg: "bg-red-400/[0.06]",
        }
      : {
          text: "text-[#67E8F9]",
          border: "border-[#67E8F9]/20",
          bg: "bg-[#67E8F9]/[0.06]",
        };

  return (
    <article className={panel}>

      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0">

          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#7F8A96]">
            {label}
          </p>

          <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-[#F4F7FA] sm:text-3xl">
            {value}
          </p>

          {description && (
            <p className="mt-2 text-xs text-[#7F8A96]">
              {description}
            </p>
          )}

        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${colors.border} ${colors.bg} ${colors.text}`}
        >
          <Icon className="h-5 w-5" />
        </div>

      </div>

    </article>
  );
};

const SectionHeader = ({
  icon: Icon,
  title,
  badge,
}) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">

    <h2 className={sectionHeading}>
      <Icon className="h-4 w-4" />
      {title}
    </h2>

    {badge !== undefined && (
      <span className="rounded-md border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#67E8F9]">
        {badge}
      </span>
    )}

  </div>
);

// --------------------------------------------------
// CHART TOOLTIP
// --------------------------------------------------

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-[#67E8F9]/20 bg-[#050A10] p-4 shadow-xl">

      <p className="mb-3 font-mono text-xs text-[#7F8A96]">
        {label}
      </p>

      {payload.map((item) => (
        <div
          key={item.dataKey}
          className="mb-2 flex items-center justify-between gap-5"
        >
          <span className="text-xs text-[#A7B0BA]">
            {item.name}
          </span>

          <span
            className="font-mono text-sm font-semibold"
            style={{ color: item.color }}
          >
            {item.value ?? "N/A"}
          </span>
        </div>
      ))}

    </div>
  );
};

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

export function AdministratorSecurityCenter({
  administratorId,
  onBack,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await requestApi(
        `/api/admins/${encodeURIComponent(
          administratorId
        )}/security-center`
      );

      setData(result);
    } catch (reason) {
      setError(
        reason.message ||
          "Unable to load administrator security details."
      );
    } finally {
      setLoading(false);
    }
  };

  // LOAD ADMINISTRATOR SECURITY DATA

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setData(null);

    requestApi(
      `/api/admins/${encodeURIComponent(
        administratorId
      )}/security-center`
    )
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason.message ||
              "Unable to load administrator security details."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [administratorId]);

  // LOADING STATE

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[1500px] items-center justify-center px-5">

        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06]">

            <RefreshCw className="h-7 w-7 animate-spin text-[#67E8F9]" />

          </div>

          <p className="mt-5 text-sm font-semibold text-[#F4F7FA]">
            Loading Administrator Security Center
          </p>

          <p className="mt-2 font-mono text-xs text-[#7F8A96]">
            Retrieving security telemetry...
          </p>

        </div>

      </main>
    );
  }

  // ERROR STATE

  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-[1500px] space-y-5 px-5 py-8 sm:px-8 lg:px-12">

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-4 py-2.5 text-xs font-semibold text-[#67E8F9] transition-all hover:bg-[#67E8F9]/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Administrator Dashboard
        </button>

        <div className="rounded-2xl border border-red-400/20 bg-[#050A10] p-8 text-center">

          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />

          <h2 className="mt-4 text-lg font-semibold text-[#F4F7FA]">
            Unable to Load Security Center
          </h2>

          <p role="alert" className="mt-2 text-sm text-red-300">
            {error || "No administrator data returned."}
          </p>

          <button
            type="button"
            onClick={loadData}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/10 px-4 py-2.5 text-xs font-semibold text-[#67E8F9] hover:bg-[#67E8F9]/15"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>

        </div>

      </main>
    );
  }

  // --------------------------------------------------
  // DATA PROCESSING
  // --------------------------------------------------

  const admin = data.administrator;

  const sessions = data.sessions || [];
  const devices = data.devices || [];
  const endpointDevices = data.endpointDevices || [];
  const incidents = data.incidents || [];
  const auditEvents = data.auditEvents || [];

  const dailyRiskHistory = data.dailyRiskHistory || [];
  const riskHistory = data.riskHistory || [];
  const trustHistory = data.trustHistory || [];

  const history = new Map();

  for (const row of dailyRiskHistory) {
    const parsedDate = new Date(row.day);

    if (Number.isNaN(parsedDate.getTime())) continue;

    const key = parsedDate.toISOString().slice(0, 10);

    history.set(key, {
      date: key,
      risk: row.riskScore ?? null,
      trust: row.trustScore ?? null,
      monitoringStatus: row.monitoringStatus,
    });
  }

  if (!dailyRiskHistory.length) {
    for (const row of riskHistory) {
      const parsedDate = new Date(row.timestamp);

      if (Number.isNaN(parsedDate.getTime())) continue;

      const key = parsedDate.toISOString().slice(0, 10);

      const point = history.get(key) || {
        date: key,
        risk: null,
        trust: null,
      };

      point.risk = row.score ?? null;

      history.set(key, point);
    }

    for (const row of trustHistory) {
      const parsedDate = new Date(row.timestamp);

      if (Number.isNaN(parsedDate.getTime())) continue;

      const key = parsedDate.toISOString().slice(0, 10);

      const point = history.get(key) || {
        date: key,
        risk: null,
        trust: null,
      };

      point.trust = row.trustScore ?? null;

      history.set(key, point);
    }
  }

  const series = [...history.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // ENDPOINT STATUS

  const getEndpointState = (device) => {
    if (device.revokedAt) return "REVOKED";

    if (!device.enrolledAt) return "NOT ENROLLED";

    const lastSeen = device.lastSeen
      ? new Date(device.lastSeen).getTime()
      : null;

    if (
      lastSeen !== null &&
      Number.isFinite(lastSeen) &&
      Date.now() - lastSeen < 300000
    ) {
      return "ONLINE";
    }

    return "OFFLINE";
  };

  const monitoringStatus = String(
    data.monitoringStatus || "Unknown"
  ).replaceAll("_", " ");

  // --------------------------------------------------
  // MAIN UI
  // --------------------------------------------------

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 pb-10 pt-5 sm:space-y-6 sm:px-8 lg:px-12">

      {/* BACK NAVIGATION */}

      <div className="flex flex-wrap items-center justify-between gap-3">

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-4 py-2.5 text-xs font-semibold text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/50 hover:bg-[#67E8F9]/10"
        >

          <ArrowLeft className="h-4 w-4" />

          Administrator Dashboard

        </button>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-[#A7B0BA] transition-all hover:border-[#67E8F9]/35 hover:text-[#67E8F9]"
        >

          <RefreshCw className="h-3.5 w-3.5" />

          Refresh Security Data

        </button>

      </div>

      {/* HERO SECTION */}

      <header className="console-hero group relative isolate overflow-hidden rounded-2xl border border-[#67E8F9]/35 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:border-[#67E8F9]/60">

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage:
              "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
          }}
        />

        <div className="pointer-events-none absolute left-0 top-0 h-16 w-px bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />

        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-px bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="pointer-events-none absolute right-[5%] top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full border border-[#67E8F9]/10 sm:block" />

        <div className="pointer-events-none absolute right-[8%] top-1/2 hidden h-44 w-44 -translate-y-1/2 rounded-full border border-[#D4AF37]/20 sm:block" />

        <div className="pointer-events-none absolute right-[12%] top-1/2 hidden h-32 w-32 -translate-y-1/2 rounded-full border border-[#67E8F9]/25 sm:block" />

        <div className="relative z-10 px-5 py-8 sm:px-8 sm:py-9 lg:px-9">

          <div className="flex flex-wrap items-center gap-3">

            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] sm:text-xs">

              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />

              Administrator Security Center

            </span>

            <span className="text-[11px] uppercase tracking-wider text-[#7F8A96]">
              Zero Trust Monitoring
            </span>

          </div>

          <h1 className="mt-4 max-w-3xl break-words text-3xl font-light leading-tight tracking-tight text-[#F4F7FA] sm:text-4xl lg:text-5xl">

            Administrator{" "}

            <span className="text-[#67E8F9]">
              Security Profile
            </span>

          </h1>

          <p className="mt-3 text-sm text-[#A7B0BA]">
            Security monitoring and authentication intelligence
            for the administrator account.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">

            <span className="rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#67E8F9]">
              90 Day View
            </span>

            <span className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#D4AF37]">
              {monitoringStatus}
            </span>

            <span className="rounded-lg border border-white/10 bg-[#070C12]/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#7F8A96]">
              Security Telemetry
            </span>

          </div>

        </div>

      </header>

      {/* ADMINISTRATOR IDENTITY */}

      <section className={`${panel} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>

        <div className="flex min-w-0 items-center gap-4">

          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[#67E8F9]">

            <UserRound className="h-7 w-7" />

          </div>

          <div className="min-w-0">

            <h2 className="break-words text-lg font-semibold text-[#F4F7FA] sm:text-xl">
              {admin.name}
            </h2>

            <p className="mt-1 break-all text-xs text-[#A7B0BA]">
              {admin.email}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">

              <StatusTag status={admin.status} />

              <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-2 py-1 font-mono text-[10px] uppercase text-[#D4AF37]">
                {admin.roleCode}
              </span>

            </div>

          </div>

        </div>

        <div className="rounded-xl border border-white/10 bg-[#070C12] p-4">

          <p className="text-[10px] font-mono uppercase tracking-wider text-[#7F8A96]">
            Last Completed Login
          </p>

          <p className="mt-2 text-xs font-semibold text-[#F4F7FA]">
            {date(admin.lastLoginAt)}
          </p>

          <p className="mt-2 text-[10px] text-[#A7B0BA]">
            Department: {admin.departmentCode || "Not specified"}
          </p>

        </div>

      </section>

      {/* SECURITY METRICS */}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <MetricCard
          label="Risk Score"
          value={
            admin.riskScore === null ||
            admin.riskScore === undefined
              ? "N/A"
              : `${admin.riskScore}/100`
          }
          icon={ShieldAlert}
          accent="gold"
          description="Current assessed risk"
        />

        <MetricCard
          label="Trust Score"
          value={
            admin.trustScore === null ||
            admin.trustScore === undefined
              ? "N/A"
              : `${admin.trustScore}/100`
          }
          icon={ShieldCheck}
          accent="cyan"
          description="Current trust assessment"
        />

        <MetricCard
          label="Active Sessions"
          value={data.sessionCount ?? sessions.length}
          icon={Laptop}
          accent="gold"
          description="Administrator login sessions"
        />

        <MetricCard
          label="Endpoint Agents"
          value={endpointDevices.length}
          icon={Server}
          accent="cyan"
          description="Assigned endpoint devices"
        />

      </section>

      {/* RISK AND TRUST HISTORY */}

      <section className={panel}>

        <SectionHeader
          icon={Activity}
          title="Risk & Trust Analytics"
          badge="90 DAY HISTORY"
        />

        <div className="mb-5 flex flex-wrap items-center gap-4">

          <div className="flex items-center gap-2">

            <span className="h-2 w-2 rounded-full bg-[#67E8F9]" />

            <span className="text-xs text-[#A7B0BA]">
              Risk Score
            </span>

          </div>

          <div className="flex items-center gap-2">

            <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />

            <span className="text-xs text-[#A7B0BA]">
              Trust Score
            </span>

          </div>

        </div>

        {series.length > 0 ? (

          <div className="h-[280px] w-full sm:h-[340px]">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart
                data={series}
                margin={{
                  top: 10,
                  right: 12,
                  left: -15,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                  vertical={false}
                />

                <XAxis
                  dataKey="date"
                  stroke="#53616D"
                  tick={{ fill: "#7F8A96", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={25}
                />

                <YAxis
                  domain={[0, 100]}
                  stroke="#53616D"
                  tick={{ fill: "#7F8A96", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  ticks={[0, 20, 40, 60, 80, 100]}
                />

                <Tooltip content={<CustomTooltip />} />

                <Line
                  type="monotone"
                  dataKey="risk"
                  stroke="#67E8F9"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#67E8F9",
                    stroke: "#050A10",
                    strokeWidth: 2,
                  }}
                  connectNulls
                  name="Risk"
                />

                <Line
                  type="monotone"
                  dataKey="trust"
                  stroke="#D4AF37"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#D4AF37",
                    stroke: "#050A10",
                    strokeWidth: 2,
                  }}
                  connectNulls
                  name="Trust"
                />

              </LineChart>

            </ResponsiveContainer>

          </div>

        ) : (

          <EmptyState
            icon={Activity}
            title="No Risk or Trust History"
            description="No administrator risk or trust assessments are recorded in the last 90 days."
          />

        )}

      </section>

      {/* ACTIVE LOGIN SESSIONS */}

      <section className={panel}>

        <SectionHeader
          icon={Fingerprint}
          title="Active Login Sessions"
          badge={`${sessions.length} SESSIONS`}
        />

        {sessions.length > 0 ? (

          <div className="space-y-3">

            {sessions.map((session) => (

              <article
                key={session.id}
                className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#67E8F9]/30 sm:flex-row sm:items-center sm:justify-between"
              >

                <div className="flex min-w-0 items-start gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">

                    <Monitor className="h-5 w-5" />

                  </div>

                  <div className="min-w-0">

                    <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                      {session.userAgent || "Unknown client"}
                    </p>

                    <p className="mt-1 break-all font-mono text-xs text-[#A7B0BA]">
                      IP: {session.ip || "Unavailable"}
                    </p>

                    <div className="mt-2 space-y-1 text-[11px] text-[#7F8A96]">

                      <p>
                        Login: {date(session.createdAt)}
                      </p>

                      <p>
                        Expires: {date(session.expiresAt)}
                      </p>

                    </div>

                  </div>

                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">

                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-mono uppercase text-[#A7B0BA]">

                    MFA: {session.mfaVerifiedAt ? "VERIFIED" : "NOT RECORDED"}

                  </span>

                  <StatusTag status="Active" />

                </div>

              </article>

            ))}

          </div>

        ) : (

          <EmptyState
            icon={Laptop}
            title="No Active Sessions"
            description="No valid, non-expired administrator sessions were found."
          />

        )}

      </section>

      {/* REGISTERED DEVICES AND ENDPOINT AGENTS */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* REGISTERED DEVICES */}

        <section className={panel}>

          <SectionHeader
            icon={Smartphone}
            title="Registered Devices"
            badge={`${devices.length} DEVICES`}
          />

          {devices.length > 0 ? (

            <div className="space-y-3">

              {devices.map((device) => (

                <article
                  key={device.id}
                  className="rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#67E8F9]/30"
                >

                  <div className="flex items-start gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">

                      <Laptop className="h-5 w-5" />

                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                        {device.name}
                      </p>

                      <p className="mt-1 break-words text-xs text-[#A7B0BA]">
                        {device.os} • {device.browser}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">

                        <StatusTag status={device.status} />

                        <span className="text-[10px] text-[#7F8A96]">
                          Last seen: {date(device.lastSeen)}
                        </span>

                      </div>

                    </div>

                  </div>

                </article>

              ))}

            </div>

          ) : (

            <EmptyState
              icon={Monitor}
              title="No Registered Devices"
              description="No logical browser devices are registered for this administrator."
            />

          )}

        </section>

        {/* ENDPOINT AGENTS */}

        <section className={panel}>

          <SectionHeader
            icon={Server}
            title="Endpoint Agents"
            badge={`${endpointDevices.length} AGENTS`}
          />

          {endpointDevices.length > 0 ? (

            <div className="space-y-3">

              {endpointDevices.map((device) => {

                const state = getEndpointState(device);

                return (

                  <article
                    key={device.id}
                    className="rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#67E8F9]/30"
                  >

                    <div className="flex items-start gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.06] text-[#D4AF37]">

                        <Server className="h-5 w-5" />

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                          {device.name}
                        </p>

                        <p className="mt-1 text-xs text-[#A7B0BA]">
                          Platform: {device.platform}
                        </p>

                        <p className="mt-1 font-mono text-[10px] text-[#7F8A96]">
                          Version: {device.agentVersion || "Unknown"}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">

                          <StatusTag status={state} />

                          <span className="text-[10px] text-[#7F8A96]">
                            Last seen: {date(device.lastSeen)}
                          </span>

                        </div>

                      </div>

                    </div>

                  </article>

                );

              })}

            </div>

          ) : (

            <EmptyState
              icon={Server}
              title="No Endpoint Agents"
              description="No endpoint agent is assigned to this administrator."
            />

          )}

        </section>

      </div>

      {/* INCIDENTS AND AUDIT HISTORY */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* INCIDENTS */}

        <section className={panel}>

          <SectionHeader
            icon={ShieldAlert}
            title="Security Incidents"
            badge={`${incidents.length} INCIDENTS`}
          />

          {incidents.length > 0 ? (

            <div className="space-y-3">

              {incidents.map((item) => (

                <article
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#67E8F9]/25"
                >

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                    <div className="min-w-0">

                      <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                        {item.title}
                      </p>

                      <p className="mt-2 text-[11px] text-[#7F8A96]">
                        Created: {date(item.createdAt)}
                      </p>

                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">

                      <SeverityTag severity={item.severity} />

                      <StatusTag status={item.status} />

                    </div>

                  </div>

                </article>

              ))}

            </div>

          ) : (

            <EmptyState
              icon={CheckCircle2}
              title="No Security Incidents"
              description="No administrator incidents are recorded."
            />

          )}

        </section>

        {/* AUDIT HISTORY */}

        <section className={panel}>

          <SectionHeader
            icon={History}
            title="Audit History"
            badge={`${auditEvents.length} EVENTS`}
          />

          {auditEvents.length > 0 ? (

            <div className="space-y-0">

              {auditEvents.slice(0, 30).map((item, index) => (

                <article
                  key={item.id}
                  className="relative flex gap-3 border-b border-white/[0.06] py-4 last:border-0"
                >

                  <div className="relative flex flex-col items-center">

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">

                      <CircleDot className="h-4 w-4" />

                    </div>

                    {index !== auditEvents.slice(0, 30).length - 1 && (
                      <div className="mt-1 h-full min-h-4 w-px bg-white/10" />
                    )}

                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex flex-wrap items-center justify-between gap-2">

                      <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                        {item.action}
                      </p>

                      <SeverityTag severity={item.severity} />

                    </div>

                    <p className="mt-2 font-mono text-[10px] text-[#7F8A96]">
                      {date(item.timestamp)}
                    </p>

                  </div>

                </article>

              ))}

            </div>

          ) : (

            <EmptyState
              icon={History}
              title="No Audit History"
              description="No administrator audit events were recorded in this 90-day window."
            />

          )}

        </section>

      </div>

      {/* FOOTER */}

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-white/10 py-5 text-center sm:flex-row sm:text-left">

        <p className="font-mono text-[10px] uppercase tracking-wider text-[#53616D]">
          CyberOrbit Security Console
        </p>

        <p className="font-mono text-[10px] uppercase tracking-wider text-[#53616D]">
          Administrator Monitoring • Zero Trust • Audit Intelligence
        </p>

      </footer>

    </main>
  );
}
