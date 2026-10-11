import React, { useState } from "react";
import {
  Building2,
  Users,
  ShieldCheck,
  Activity,
  AlertTriangle,
  X,
  ArrowRight,
  Database,
  Code2,
  Megaphone,
  Scale,
  LockKeyhole,
  Settings2,
  BriefcaseBusiness,
  UserRound,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

// ======================================================
// CONSTANTS / CONFIGURATION
// ======================================================

const DEPARTMENTS = [
  "HR",
  "FINANCE",
  "ENGINEERING",
  "MARKETING",
  "LEGAL",
  "SECURITY",
  "IT",
  "SALES",
  "ADMINISTRATION",
  "EXECUTIVE",
];

const DEPARTMENT_META = {
  HR: {
    icon: UserRound,
    accent: "cyan",
    label: "People Operations",
  },
  FINANCE: {
    icon: Database,
    accent: "gold",
    label: "Financial Operations",
  },
  ENGINEERING: {
    icon: Code2,
    accent: "cyan",
    label: "Engineering & Product",
  },
  MARKETING: {
    icon: Megaphone,
    accent: "gold",
    label: "Growth & Communications",
  },
  LEGAL: {
    icon: Scale,
    accent: "gold",
    label: "Legal & Compliance",
  },
  SECURITY: {
    icon: LockKeyhole,
    accent: "cyan",
    label: "Security Operations",
  },
  IT: {
    icon: Settings2,
    accent: "cyan",
    label: "Infrastructure & IT",
  },
  OPERATIONS: {
    icon: BriefcaseBusiness,
    accent: "gold",
    label: "Business Operations",
  },
};

const ACCENT_STYLES = {
  cyan: {
    icon: "border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[#67E8F9]",
    glow: "bg-[#67E8F9]/10",
    line: "bg-[#67E8F9]",
    text: "text-[#67E8F9]",
  },
  gold: {
    icon: "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]",
    glow: "bg-[#D4AF37]/10",
    line: "bg-[#D4AF37]",
    text: "text-[#D4AF37]",
  },
};

// ======================================================
// HELPER FUNCTIONS
// ======================================================

const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";

const getRiskClasses = (risk) => {
  if (risk >= 70) {
    return {
      text: "text-red-300",
      bar: "bg-red-400",
      label: "High",
    };
  }

  if (risk >= 50) {
    return {
      text: "text-amber-300",
      bar: "bg-amber-400",
      label: "Elevated",
    };
  }

  return {
    text: "text-[#67E8F9]",
    bar: "bg-[#67E8F9]",
    label: "Low",
  };
};

// ======================================================
// ENTERPRISE NETWORK VISUAL
// ======================================================

const EnterpriseNetworkVisual = () => (
  <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] overflow-hidden lg:block">
    <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(103,232,249,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.075)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_right,transparent_0%,black_24%,black_100%)]" />

    <div className="absolute right-[5%] top-1/2 h-[300px] w-[460px] -translate-y-1/2">
      <div className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
      <div className="absolute left-1/2 top-1/2 h-[196px] w-[196px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/20" />
      <div className="absolute left-1/2 top-1/2 h-[148px] w-[148px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/20" />
      <div className="absolute left-1/2 top-1/2 h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#67E8F9]/40 bg-[#07131B]/80 shadow-[0_0_45px_rgba(103,232,249,0.08)]" />

      <div className="absolute left-1/2 top-1/2 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_0_28px_rgba(103,232,249,0.12)]">
        <Building2 className="h-9 w-9 text-[#67E8F9]" strokeWidth={1.25} />
      </div>

      <span className="absolute left-1/2 top-[2%] h-2 w-2 -translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.75)]" />
      <span className="absolute bottom-[2%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.75)]" />
      <span className="absolute left-[8%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#67E8F9]" />
      <span className="absolute right-[8%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#D4AF37]" />

      <div className="absolute left-[7%] top-[30%] h-px w-[27%] bg-gradient-to-r from-transparent via-[#67E8F9]/35 to-transparent" />
      <div className="absolute right-[7%] top-[66%] h-px w-[27%] bg-gradient-to-l from-transparent via-[#D4AF37]/30 to-transparent" />
    </div>
  </div>
);

// ======================================================
// DEPARTMENT CARD
// ======================================================

const DepartmentCard = ({ department, stats, onOpen }) => {
  const meta = DEPARTMENT_META[department] || DEPARTMENT_META.IT;

  const accent = ACCENT_STYLES[meta.accent];
  const risk = getRiskClasses(stats.avgRisk);
  const isElevated = stats.avgRisk >= 50;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative min-h-[292px] overflow-hidden rounded-xl border border-white/10 bg-[#050A10] p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:shadow-[0_18px_50px_rgba(103,232,249,0.08)] focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/40 sm:p-6"
    >
      {/* ==================================================
          CARD AMBIENT EFFECT
          ================================================== */}

      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl ${accent.glow} opacity-20 transition-opacity duration-300 group-hover:opacity-45`}
      />

      {/* ==================================================
          CARD STRUCTURE / BACKGROUND DETAIL
          ================================================== */}

      <div className="pointer-events-none absolute bottom-0 right-0 h-28 w-40 opacity-15">
        <div className="absolute right-4 top-6 h-14 w-14 rounded-full border border-[#67E8F9]/20" />
        <div className="absolute right-10 top-10 h-20 w-20 rounded-full border border-white/[0.04]" />
        <div className="absolute bottom-4 right-4 h-px w-28 bg-gradient-to-l from-[#67E8F9]/25 to-transparent" />
        <div className="absolute bottom-8 right-10 h-px w-20 bg-gradient-to-l from-[#D4AF37]/20 to-transparent" />
      </div>

      <div
        className={`absolute inset-x-0 top-0 h-px opacity-60 ${accent.line}`}
      />

      {/* ==================================================
          CARD HEADER
          ================================================== */}

      <div className="relative">
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.07] pb-3">
          <span
            className={`text-[12px] font-medium uppercase tracking-[0.2em] ${accent.text}`}
          >
            BUSINESS UNIT
          </span>

          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
              isElevated
                ? "border-amber-400/25 bg-amber-400/5 text-amber-300"
                : "border-emerald-400/20 bg-emerald-400/5 text-emerald-300"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {isElevated ? "Elevated" : "Nominal"}
          </span>
        </div>

        <h3 className="text-xl font-medium leading-tight tracking-[-0.02em] text-[#F4F7FA] break-words">
          {department}
        </h3>
      </div>

      {/* ==================================================
          CORE METRICS — REFERENCE CARD FORMAT
          ================================================== */}

      <div className="relative mt-5 space-y-2.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7C0]">Employees</span>
          <span className="font-mono font-semibold text-[#E0E6EA]">
            {stats.totalUsers}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7C0]">Average Risk</span>
          <span className={`font-mono font-semibold ${risk.text}`}>
            {stats.avgRisk} / 100
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7C0]">Average Trust</span>
          <span className="font-mono font-semibold text-emerald-300">
            {stats.avgTrust} / 100
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7C0]">High Risk Users</span>
          <span
            className={`font-mono font-semibold ${
              stats.highRiskUsers > 0 ? "text-red-300" : "text-[#A3ADB6]"
            }`}
          >
            {stats.highRiskUsers}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7B0]">Active Users</span>
          <span className="font-mono font-semibold text-[#67E8F9]">
            {stats.activeUsers}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-[#AEB7B0]">Incidents</span>
          <span
            className={`font-mono font-semibold ${
              stats.departmentIncidents > 0
                ? "text-amber-300"
                : "text-[#A3ADB6]"
            }`}
          >
            {stats.departmentIncidents}
          </span>
        </div>
      </div>

      {/* ==================================================
          RISK BAR
          ================================================== */}

      <div className="relative mt-4 h-[3px] overflow-hidden bg-white/[0.05]">
        <div
          className={`h-full ${risk.bar}`}
          style={{
            width: `${Math.min(Math.max(stats.avgRisk, 0), 100)}%`,
          }}
        />
      </div>

      {/* ==================================================
          CARD FOOTER
          ================================================== */}

      <div className="relative mt-4 flex items-center justify-between border-t border-white/[0.07] pt-4">
        <span className="text-[12px] font-medium tracking-wide text-[#AEB7C0]">
          {meta.label}
        </span>

        <span className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-[#7B8792] transition-colors group-hover:text-[#67E8F9]">
          Inspect
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
};

// ======================================================
// MAIN COMPONENT
// ======================================================

export const DepartmentsPage = ({
  users = [],
  incidents = [],
  onSelectUser,
}) => {
  const { isDark } = useTheme();
  const [selectedDept, setSelectedDept] = useState(null);

  // Theme context is preserved for compatibility.
  void isDark;

  // ======================================================
  // SAFE DATA
  // ======================================================

  const safeUsers = Array.isArray(users) ? users : [];

  const safeIncidents = Array.isArray(incidents) ? incidents : [];

  // ======================================================
  // DEPARTMENT ANALYTICS
  // ======================================================

  const getDeptStats = (department) => {
    const deptUsers = safeUsers.filter(
      (user) => user.department === department,
    );

    const totalUsers = deptUsers.length;

    const highRiskUsers = deptUsers.filter(
      (user) => ['HIGH','VERY_HIGH','CRITICAL'].includes(user.currentRiskLevel || user.riskLevel),
    ).length;

    const activeUsers = deptUsers.filter(
      (user) => user.status === "ACTIVE",
    ).length;

    const avgRisk =
      totalUsers > 0
        ? Math.round(
            deptUsers.reduce(
              (sum, user) => sum + (user.currentRiskScore || 0),
              0,
            ) / totalUsers,
          )
        : 0;

    const avgTrust =
      totalUsers > 0
        ? Math.round(
            deptUsers.reduce(
              (sum, user) => sum + (user.currentTrustScore || 0),
              0,
            ) / totalUsers,
          )
        : 0;

    const deptIncidents = safeIncidents.filter(
      (incident) => (incident.user?.departmentCode || safeUsers.find(user => user.id === incident.userId)?.departmentCode) === department,
    ).length;

    return {
      totalUsers,
      avgRisk,
      avgTrust,
      highRiskUsers,
      activeUsers,
      departmentIncidents: deptIncidents,
      users: deptUsers,
    };
  };

  const selectedDeptStats = selectedDept ? getDeptStats(selectedDept) : null;

  // ======================================================
  // HERO METRICS
  // ======================================================

  const totalEmployees = safeUsers.length;

  const activeIncidents = safeIncidents.filter(
    (incident) =>
      incident.status === "OPEN" ||
      incident.status === "UNDER_REVIEW" ||
      incident.status === "INVESTIGATING",
  ).length;

  const totalTrust =
    totalEmployees > 0
      ? Math.round(
          safeUsers.reduce(
            (sum, user) => sum + (user.currentTrustScore || 0),
            0,
          ) / totalEmployees,
        )
      : 0;

  // ======================================================
  // PAGE
  // ======================================================

  return (
    <div className="min-h-full bg-[#03070C] text-[#F4F7FA]">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
        {/* ==================================================
            HERO / COMMAND HEADER
            ================================================== */}

        <section className="console-hero group relative min-h-[360px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_45%,rgba(103,232,249,0.07),transparent_34%),radial-gradient(circle_at_65%_70%,rgba(212,175,55,0.045),transparent_28%)]" />
          <div className="absolute left-0 top-0 h-10 w-1 rounded-br-full bg-[#D4AF37]" />
          <div className="absolute bottom-0 right-0 h-10 w-1 rounded-tl-full bg-[#67E8F9]" />

          <EnterpriseNetworkVisual />

          <div className="relative z-10 flex min-h-[360px] items-start px-6 py-9 sm:px-8 lg:px-9 lg:py-10">
            {/* Hero Content */}

            <div className="relative z-10 w-full max-w-[680px] lg:max-w-[54%] xl:max-w-[58%]">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                  CYBERORBIT ORGANIZATIONAL SECURITY
                </span>

                <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                  8 MONITORED UNITS
                </span>
              </div>

              <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Enterprise <span className="text-[#67E8F9]">Departments</span>
              </h1>

              <p className="mt-5 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
                Security posture across supported departments, using the loaded employee records and recorded incidents. Cross-department access contributes to contextual risk.
              </p>
            </div>

            {/* ==================================================
                HERO METRICS
                ================================================== */}

            <div className="absolute bottom-7 left-6 right-6 hidden items-center gap-0 border-t border-white/[0.07] pt-4 sm:left-8 sm:right-auto lg:left-9 sm:flex">
              <div className="flex items-center gap-2 pr-6">
                <Building2 className="h-4 w-4 text-[#67E8F9]" />

                <div>
                  <div className="text-sm font-mono font-semibold text-[#E5EAEE]">
                    {DEPARTMENTS.length}
                  </div>

                  <div className="text-[12px] font-medium text-[#AEB7C0]">
                    Departments
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#D4AF37]/30" />

              <div className="flex items-center gap-2 px-6">
                <Users className="h-4 w-4 text-[#67E8F9]" />

                <div>
                  <div className="text-sm font-mono font-semibold text-[#E5EAEE]">
                    {totalEmployees}
                  </div>

                  <div className="text-[12px] font-medium text-[#AEB7C0]">
                    Employees
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#D4AF37]/30" />

              <div className="flex items-center gap-2 px-6">
                <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />

                <div>
                  <div className="text-sm font-mono font-semibold text-[#E5EAEE]">
                    {activeIncidents}
                  </div>

                  <div className="text-[12px] font-medium text-[#AEB7C0]">
                    Active Incidents
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#D4AF37]/30" />

              <div className="flex items-center gap-2 pl-6">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />

                <div>
                  <div className="text-sm font-mono font-semibold text-[#E5EAEE]">
                    {totalTrust}%
                  </div>

                  <div className="text-[12px] font-medium text-[#AEB7C0]">
                    Trust Score
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================
              HERO SUMMARY
              ================================================== */}

          <div className="absolute bottom-6 right-7 z-20 hidden items-center gap-2 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
            <span className="text-[12px] uppercase tracking-[0.18em] text-[#7F8A96]">
              Organizational Network Active
            </span>
          </div>
        </section>

        {/* ==================================================
            DEPARTMENT GRID
            ================================================== */}

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {DEPARTMENTS.map((department) => (
            <DepartmentCard
              key={department}
              department={department}
              stats={getDeptStats(department)}
              onOpen={() => setSelectedDept(department)}
            />
          ))}
        </section>

        {/* ==================================================
            FOOTER STATUS
            ================================================== */}

        <div className="flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#89949E]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
            Department telemetry synchronized
          </div>

          <div className="flex items-center gap-2 text-[12px] font-medium text-[#89949E]">
            <Activity className="h-3 w-3 text-[#67E8F9]" />
            UEBA Engine
            <span className="text-[#67E8F9]">Online</span>
          </div>
        </div>
      </div>

      {/* ======================================================
          DEPARTMENT DETAIL DRAWER
          ====================================================== */}

      {selectedDept && selectedDeptStats && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          {/* Backdrop */}

          <button
            type="button"
            aria-label="Close department details"
            onClick={() => setSelectedDept(null)}
            className="absolute inset-0 cursor-default"
          />

          {/* Drawer */}

          <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-[#67E8F9]/20 bg-[#050A10] shadow-[-20px_0_80px_rgba(0,0,0,0.45)]">
            {/* ==================================================
                DRAWER HEADER
                ================================================== */}

            <div className="sticky top-0 z-10 border-b border-white/10 bg-[#050A10]/95 px-5 py-5 backdrop-blur-md sm:px-7">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.7)]" />

                    <span className="text-[12px] font-medium text-[#67E8F9]">
                      Department Detail
                    </span>
                  </div>

                  <h2 className="text-3xl font-light tracking-tight text-[#F4F7FA]">
                    {selectedDept}
                  </h2>

                  <div className="mt-2 text-[12px] font-medium text-[#89949E]">
                    {selectedDeptStats.totalUsers} identities
                    <span className="mx-2 text-white/20">•</span>
                    {selectedDeptStats.departmentIncidents} incidents
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDept(null)}
                  className="rounded-lg border border-white/10 p-2 text-[#697581] transition-all hover:border-[#D4AF37]/30 hover:text-[#D4AF37]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {/* ==================================================
                  SUMMARY
                  ================================================== */}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 border-l-2 border-l-[#67E8F9] bg-[#070C12] p-5">
                  <div className="text-[12px] font-medium text-[#D7DEE4]">
                    Average Risk
                  </div>

                  <div
                    className={`mt-3 text-2xl font-light ${
                      getRiskClasses(selectedDeptStats.avgRisk).text
                    }`}
                  >
                    {selectedDeptStats.avgRisk}

                    <span className="text-sm text-[#697581]"> / 100</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 border-l-2 border-l-[#D4AF37] bg-[#070C12] p-5">
                  <div className="text-[12px] font-medium text-[#D7DEE4]">
                    Average Trust
                  </div>

                  <div className="mt-3 text-2xl font-light text-emerald-300">
                    {selectedDeptStats.avgTrust}

                    <span className="text-sm text-[#697581]"> / 100</span>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  POSTURE
                  ================================================== */}

              <div className="rounded-xl border border-white/10 bg-[#070C12] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#D7DEE4]">
                    Posture Signals
                  </span>

                  <span
                    className={`text-[12px] font-medium ${
                      selectedDeptStats.avgRisk >= 50
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    ● {selectedDeptStats.avgRisk >= 50 ? "Elevated" : "Nominal"}
                  </span>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-1.5 flex justify-between text-[12px]">
                      <span className="font-medium text-[#D7DEE4]">
                        Risk Posture
                      </span>

                      <span className="font-mono text-[#B8C1CA]">
                        {selectedDeptStats.avgRisk}%
                      </span>
                    </div>

                    <div className="h-1 bg-white/[0.06]">
                      <div
                        className={`h-full ${
                          getRiskClasses(selectedDeptStats.avgRisk).bar
                        }`}
                        style={{
                          width: `${Math.min(
                            Math.max(selectedDeptStats.avgRisk, 0),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between text-[12px]">
                      <span className="font-medium text-[#D7DEE4]">
                        Trust Posture
                      </span>

                      <span className="font-mono text-emerald-300">
                        {selectedDeptStats.avgTrust}%
                      </span>
                    </div>

                    <div className="h-1 bg-white/[0.06]">
                      <div
                        className="h-full bg-emerald-400"
                        style={{
                          width: `${Math.min(
                            Math.max(selectedDeptStats.avgTrust, 0),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  MEMBERS
                  ================================================== */}

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#D7DEE4]">
                    Department Members
                  </span>

                  <span className="text-[12px] font-medium text-[#7D8994]">
                    {selectedDeptStats.users.length} records
                  </span>
                </div>

                {selectedDeptStats.users.length > 0 ? (
                  <div className="space-y-1">
                    {selectedDeptStats.users.map((user) => {
                      const risk = Number(user.currentRiskScore ?? 0);

                      const trust = Number(user.currentTrustScore ?? 0);

                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            if (typeof onSelectUser === "function") {
                              onSelectUser(user);
                            }
                          }}
                          disabled={typeof onSelectUser !== "function"}
                          className={`w-full border-b border-white/[0.06] py-4 text-left transition-colors ${
                            typeof onSelectUser === "function"
                              ? "hover:bg-white/[0.02]"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[12px] font-mono font-semibold text-[#AAB4BE]">
                              {getInitials(user.name)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-[#E4E9ED]">
                                {user.name}
                              </div>

                              <div className="mt-1 truncate text-[12px] text-[#7A8691]">
                                {user.email}
                              </div>
                            </div>

                            <div className="text-right">
                              <div
                                className={`text-xs font-mono font-semibold ${
                                  getRiskClasses(risk).text
                                }`}
                              >
                                {risk}
                              </div>

                              <div className="mt-1 text-[12px] font-medium text-[#697581]">
                                Risk
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-[12px]">
                            <span className="text-[#7A8691]">
                              Trust{" "}
                              <span className="font-mono text-emerald-300">
                                {trust}
                              </span>
                            </span>

                            <span className="text-[#7A8691]">
                              Status{" "}
                              <span className="font-medium text-[#C2CAD1]">
                                {user.status || "Unknown"}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#070C12] p-8 text-center">
                    <AlertTriangle className="mx-auto h-5 w-5 text-[#56616D]" />

                    <div className="mt-3 text-xs text-[#87929D]">
                      No registered employees assigned yet.
                    </div>

                    <div className="mt-1 text-[12px] text-[#596570]">
                      Use Employee Management to assign employees.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default DepartmentsPage;
