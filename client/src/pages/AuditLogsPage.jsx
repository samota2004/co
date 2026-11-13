import React, { useMemo, useState } from "react";
import {
  Search,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Activity,
  Clock3,
  Filter,
  AlertCircle,
  Download,
} from "lucide-react";

export const AuditLogsPage = ({
  auditLogs = [],
  currentUser,
  onRefreshData,
}) => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState("7D");
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  // --------------------------------------------------
  // ENRICH AUDIT LOG DATA
  // --------------------------------------------------

  const enrichedLogs = useMemo(() => {
    return auditLogs.map((log, index) => {
      let details = log.metadata || {};

      if (typeof log.details === "string") {
        try {
          details = {
            ...JSON.parse(log.details),
            ...details,
          };
        } catch {
          // Retain metadata if details is not valid JSON.
        }
      }

      const user = String(
        log.userName ||
          log.userEmail ||
          log.userId ||
          "System"
      );

      const action = String(
        log.action || "POLICY_EVALUATION"
      );

      const device = String(
        log.deviceName ||
          details.deviceName ||
          "Not recorded"
      );

      const timestamp = log.timestamp
        ? new Date(log.timestamp)
        : null;

      const validTimestamp =
        timestamp && !Number.isNaN(timestamp.getTime());

      const time = validTimestamp
        ? timestamp.toLocaleString()
        : "Recent";

      const policyDecision = String(
        log.policyDecision ||
          details.decision ||
          "Not recorded"
      );

      const risk =
        log.riskScore ??
        details.riskScore ??
        "Not recorded";

      return {
        id: String(
          log.id ||
            log._id ||
            `audit-${index}`
        ),
        user,
        action,
        device,
        time,
        policyDecision,
        risk,
        status: String(log.status || "RECORDED"),
        category: String(log.category || "POLICY").toUpperCase(),
        severity: String(log.severity || "LOW").toUpperCase(),
        timestamp: validTimestamp ? timestamp.getTime() : null,
        raw: log,
      };
    });
  }, [auditLogs]);

  // --------------------------------------------------
  // FILTER AUDIT LOGS
  // --------------------------------------------------

  const filteredLogs = useMemo(() => {
    const now = Date.now();

    let rangeStart = null;

    if (dateRange === "24H") {
      rangeStart = now - 24 * 60 * 60 * 1000;
    } else if (dateRange === "7D") {
      rangeStart = now - 7 * 24 * 60 * 60 * 1000;
    } else if (dateRange === "30D") {
      rangeStart = now - 30 * 24 * 60 * 60 * 1000;
    }

    const query = search.toLowerCase().trim();

    return enrichedLogs.filter((log) => {
      const matchesSearch =
        !query ||
        log.user.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.device.toLowerCase().includes(query) ||
        log.policyDecision.toLowerCase().includes(query) ||
        log.id.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === "ALL" ||
        log.category === categoryFilter;

      const matchesDate =
        rangeStart === null ||
        log.timestamp === null ||
        log.timestamp >= rangeStart;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesDate
      );
    });
  }, [
    enrichedLogs,
    search,
    categoryFilter,
    dateRange,
  ]);

  // --------------------------------------------------
  // AUDIT STATISTICS
  // --------------------------------------------------

  const statistics = useMemo(() => {
    const highRisk = filteredLogs.filter(
      (log) => Number(log.risk) >= 60
    ).length;

    const critical = filteredLogs.filter((log) => {
      const risk = Number(log.risk);

      return (
        risk >= 90 ||
        log.severity === "CRITICAL" ||
        log.policyDecision === "FREEZE" ||
        log.policyDecision === "RESTRICT"
      );
    }).length;

    const securityEvents = filteredLogs.filter(
      (log) =>
        log.category === "SECURITY" ||
        log.category === "AUTH" ||
        log.category === "ACCESS"
    ).length;

    return {
      total: filteredLogs.length,
      highRisk,
      critical,
      securityEvents,
    };
  }, [filteredLogs]);

  // --------------------------------------------------
  // EXPORT AUDIT LOGS
  // --------------------------------------------------

  const handleExport = async (format) => {
    try {
      setExportError(null);
      setExporting(format);

      const token = localStorage.getItem("zero_trust_token");

      if (!token) {
        throw new Error(
          "Authentication token not found. Please log in again."
        );
      }

      const params = new URLSearchParams();

      params.set("format", format);

      if (categoryFilter !== "ALL") {
        params.set("category", categoryFilter);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const hours = {
        "24H": 24,
        "7D": 168,
        "30D": 720,
      }[dateRange];

      if (hours) {
        params.set(
          "from",
          new Date(
            Date.now() - hours * 3600000
          ).toISOString()
        );
      }

      const response = await fetch(
        `/api/audit-logs/export?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 401) {
        throw new Error(
          "Authentication failed. Please log in again."
        );
      }

      if (response.status === 403) {
        throw new Error(
          "You are not authorized to export audit logs."
        );
      }

      if (!response.ok) {
        let message = `Export failed with HTTP status ${response.status}`;

        try {
          const errorData = await response.json();

          if (errorData?.error?.message) {
            message = errorData.error.message;
          }
        } catch {
          // Use the default HTTP error message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const dateStr = new Date()
        .toISOString()
        .split("T")[0];

      const filename = `cyberorbit-audit-ledger-${dateStr}.${format}`;

      const downloadAnchor = document.createElement("a");

      downloadAnchor.href = url;
      downloadAnchor.download = filename;

      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "Failed to export audit logs:",
        error
      );

      setExportError(
        error.message ||
          "Failed to export audit log records."
      );
    } finally {
      setExporting(null);
    }
  };

  // --------------------------------------------------
  // STYLE HELPERS
  // --------------------------------------------------

  const getDecisionStyle = (decision) => {
    const normalized = String(decision).toUpperCase();

    if (
      normalized === "FREEZE" ||
      normalized === "RESTRICT" ||
      normalized === "BLOCK" ||
      normalized === "DENY"
    ) {
      return "border-red-500/30 bg-red-500/10 text-red-400";
    }

    if (
      normalized === "MFA_CHALLENGE" ||
      normalized === "MONITOR" ||
      normalized === "REVIEW" ||
      normalized === "APPROVAL"
    ) {
      return "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]";
    }

    if (
      normalized === "ALLOW" ||
      normalized === "PERMIT"
    ) {
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    }

    return "border-white/10 bg-white/5 text-[#A7B0BA]";
  };

  const getRiskStyle = (risk) => {
    const score = Number(risk);

    if (!Number.isFinite(score)) {
      return "text-[#7F8A96]";
    }

    if (score >= 90) {
      return "text-red-400";
    }

    if (score >= 60) {
      return "text-orange-400";
    }

    if (score >= 40) {
      return "text-[#D4AF37]";
    }

    return "text-[#67E8F9]";
  };

  // --------------------------------------------------
  // PAGE UI
  // --------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">

      {/* PAGE HEADER */}

      <section className="group relative min-h-[230px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">

        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
              maskImage:
                "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
            }}
          />

          <div className="absolute right-[12%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />

          <div className="absolute right-[9%] top-1/2 h-28 w-56 -translate-y-1/2 rotate-12 rounded-[50%] border border-[#D4AF37]/20" />

          <div className="absolute right-[15%] top-1/2 h-16 w-40 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#67E8F9]/20" />
        </div>

        <div className="relative z-10 flex min-h-[230px] flex-col justify-center px-6 py-8 sm:px-8 lg:px-9">

          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">

            <div className="max-w-3xl">

              <div className="mb-4 flex flex-wrap items-center gap-3">

                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                  Compliance Ledger
                </span>

                <span className="text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">
                  Tamper-Evident Audit Trail
                </span>

              </div>

              <h1 className="text-4xl font-light leading-tight tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Security{" "}
                <span className="font-medium text-[#67E8F9]">
                  Audit Logs
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
                Database timestamped records of Zero Trust
                policy decisions, authentication attempts,
                administrative interventions, and risk
                transitions.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">

                <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/5 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#67E8F9]">
                  Audit Trail
                </span>

                <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#D4AF37]">
                  Zero Trust
                </span>

              </div>

            </div>

            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">

              <button
                type="button"
                onClick={() => handleExport("csv")}
                disabled={exporting !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#050A10]/90 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A7B0BA] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/80 hover:bg-[#67E8F9]/5 hover:text-[#F4F7FA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#67E8F9]" />

                {exporting === "csv"
                  ? "Exporting..."
                  : "Export CSV"}
              </button>

              <button
                type="button"
                onClick={() => handleExport("json")}
                disabled={exporting !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#03070C] transition-all duration-300 hover:-translate-y-0.5 hover:bg-transparent hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />

                {exporting === "json"
                  ? "Exporting..."
                  : "Export JSON"}
              </button>

            </div>

          </div>

        </div>
      </section>

      {/* EXPORT ERROR */}

      {exportError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <div className="flex-1">
            {exportError}
          </div>

          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-red-400 transition hover:text-red-300"
            aria-label="Dismiss export error"
          >
            ×
          </button>
        </div>
      )}

      {/* STATISTICS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#7F8A96]">
                Total Records
              </p>

              <p className="mt-3 text-3xl font-semibold tabular-nums text-[#F4F7FA]">
                {statistics.total}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Activity className="h-5 w-5 text-[#67E8F9]" />
            </div>

          </div>

          <p className="mt-3 text-xs text-[#7F8A96]">
            Matching audit records
          </p>

        </div>

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#7F8A96]">
                High Risk Events
              </p>

              <p className="mt-3 text-3xl font-semibold tabular-nums text-[#D4AF37]">
                {statistics.highRisk}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5">
              <ShieldCheck className="h-5 w-5 text-[#D4AF37]" />
            </div>

          </div>

          <p className="mt-3 text-xs text-[#7F8A96]">
            Risk score of 60 or above
          </p>

        </div>

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-500/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#7F8A96]">
                Critical Events
              </p>

              <p className="mt-3 text-3xl font-semibold tabular-nums text-red-400">
                {statistics.critical}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>

          </div>

          <p className="mt-3 text-xs text-[#7F8A96]">
            Critical risk or restrictive decisions
          </p>

        </div>

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#7F8A96]">
                Security Events
              </p>

              <p className="mt-3 text-3xl font-semibold tabular-nums text-[#67E8F9]">
                {statistics.securityEvents}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Clock3 className="h-5 w-5 text-[#67E8F9]" />
            </div>

          </div>

          <p className="mt-3 text-xs text-[#7F8A96]">
            Security, authentication and access
          </p>

        </div>

      </div>

      {/* SEARCH AND FILTERS */}

      <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6">

        <div className="mb-5 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#67E8F9]" />

          <h2 className="text-xs font-semibold uppercase tracking-[0.17em] text-[#F4F7FA]">
            Search & Filter Records
          </h2>
        </div>

        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">

          <div className="w-full xl:max-w-[420px]">

            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7F8A96]">
              Search audit records
            </label>

            <div className="relative">

              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search user, action, device or decision..."
                className="w-full rounded-xl border border-white/10 bg-[#070C12] py-3 pl-10 pr-4 text-sm text-[#F4F7FA] outline-none transition-all placeholder:text-[#7F8A96]/70 hover:border-white/20 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
              />

            </div>

          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">

            <div>
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7F8A96]">
                Category
              </label>

              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
                className="min-w-[175px] cursor-pointer rounded-xl border border-white/10 bg-[#070C12] px-3 py-3 text-sm text-[#F4F7FA] outline-none transition-all hover:border-[#67E8F9]/35 focus:border-[#67E8F9]/60"
              >
                <option value="ALL">All Categories</option>
                <option value="SECURITY">Security</option>
                <option value="POLICY">Policy</option>
                <option value="AUTH">Authentication</option>
                <option value="ACCESS">Access Control</option>
                <option value="ADMIN">Administrative</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7F8A96]">
                Date Range
              </label>

              <div className="flex overflow-hidden rounded-xl border border-white/10 bg-[#070C12]">

                {["24H", "7D", "30D", "ALL"].map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDateRange(range)}
                    className={`px-4 py-3 text-[11px] font-semibold transition-all duration-200 ${
                      dateRange === range
                        ? "bg-[#67E8F9] text-[#03070C] shadow-[inset_0_-2px_0_rgba(212,175,55,0.75)]"
                        : "text-[#A7B0BA] hover:bg-white/5 hover:text-[#F4F7FA]"
                    }`}
                  >
                    {range}
                  </button>
                ))}

              </div>
            </div>

          </div>

        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">

          <p className="text-xs text-[#7F8A96]">
            Showing{" "}
            <span className="font-semibold text-[#67E8F9]">
              {filteredLogs.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-[#F4F7FA]">
              {enrichedLogs.length}
            </span>{" "}
            records
          </p>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("ALL");
              setDateRange("7D");
              setExportError(null);
            }}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D4AF37] transition hover:text-[#F4F7FA]"
          >
            Reset Filters
          </button>

        </div>

      </section>

      {/* AUDIT LOG TABLE */}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.20)] transition-all duration-300 hover:border-[#67E8F9]/20">

        <div className="flex flex-col gap-3 border-b border-white/10 bg-[#070C12] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <ShieldCheck className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#F4F7FA]">
                Audit Event Ledger
              </h2>

              <p className="mt-1 text-[11px] text-[#7F8A96]">
                Recorded Zero Trust security events
              </p>
            </div>

          </div>

          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
            Ledger Records
          </div>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1050px] text-left text-sm">

            <thead className="border-b border-white/10 bg-[#070C12] text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">

              <tr>
                <th className="px-5 py-4">User</th>
                <th className="px-5 py-4">Action</th>
                <th className="px-5 py-4">Device</th>
                <th className="px-5 py-4">Timestamp</th>
                <th className="px-5 py-4 text-center">
                  Policy Decision
                </th>
                <th className="px-5 py-4 text-center">
                  Risk Score
                </th>
                <th className="px-5 py-4 text-right">
                  Status
                </th>
              </tr>

            </thead>

            <tbody className="divide-y divide-white/5">

              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const riskValue = Number(log.risk);
                  const isValidRisk = Number.isFinite(riskValue);

                  return (
                    <tr
                      key={log.id}
                      className="group/row transition-all duration-200 hover:bg-[#67E8F9]/[0.035] hover:shadow-[inset_3px_0_0_#67E8F9]"
                    >

                      <td className="px-5 py-4">

                        <span className="block max-w-[190px] truncate text-sm font-medium text-[#F4F7FA] transition-colors group-hover/row:text-[#67E8F9]">
                          {log.user}
                        </span>

                        <span className="mt-1 block text-[10px] text-[#7F8A96]">
                          {log.id.slice(0, 12)}
                        </span>

                      </td>

                      <td className="px-5 py-4">
                        <span className="text-xs font-medium text-[#A7B0BA]">
                          {log.action}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-xs text-[#A7B0BA]">
                          {log.device}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span className="whitespace-nowrap text-xs text-[#A7B0BA]">
                          {log.time}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-center">

                        <span
                          className={`inline-flex whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition-all group-hover/row:-translate-y-0.5 ${getDecisionStyle(
                            log.policyDecision
                          )}`}
                        >
                          {log.policyDecision}
                        </span>

                      </td>

                      <td className="px-5 py-4 text-center">

                        <span
                          className={`text-sm font-bold tabular-nums ${getRiskStyle(
                            log.risk
                          )}`}
                        >
                          {isValidRisk ? riskValue : log.risk}
                        </span>

                        {isValidRisk && (
                          <span className="ml-1 text-[10px] text-[#7F8A96]">
                            /100
                          </span>
                        )}

                      </td>

                      <td className="px-5 py-4 text-right">

                        <span className="inline-flex rounded-md border border-white/10 bg-[#070C12] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#A7B0BA] transition-all group-hover/row:border-[#67E8F9]/20 group-hover/row:text-[#F4F7FA]">
                          {log.status}
                        </span>

                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-16 text-center"
                  >

                    <div className="mx-auto flex max-w-sm flex-col items-center">

                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
                        <Search className="h-6 w-6 text-[#67E8F9]" />
                      </div>

                      <h3 className="mt-4 text-sm font-semibold text-[#F4F7FA]">
                        No Audit Records Found
                      </h3>

                      <p className="mt-2 text-xs leading-5 text-[#7F8A96]">
                        No security audit logs match your current
                        search and filter criteria. Try changing
                        the date range or clearing your filters.
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setCategoryFilter("ALL");
                          setDateRange("7D");
                        }}
                        className="mt-4 rounded-lg border border-[#67E8F9]/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#67E8F9] transition hover:bg-[#67E8F9]/10"
                      >
                        Clear Filters
                      </button>

                    </div>

                  </td>
                </tr>
              )}

            </tbody>

          </table>

        </div>

        {/* TABLE FOOTER */}

        <div className="flex flex-col gap-2 border-t border-white/10 bg-[#070C12] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">

          <p className="text-[10px] uppercase tracking-[0.12em] text-[#7F8A96]">
            CyberOrbit Security Monitoring
          </p>

          <div className="flex items-center gap-2 text-[10px] text-[#7F8A96]">
            <Download className="h-3.5 w-3.5 text-[#D4AF37]" />
            Export records using CSV or JSON
          </div>

        </div>

      </section>

    </div>
  );
};