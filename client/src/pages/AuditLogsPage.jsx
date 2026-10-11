import React, { useState, useMemo } from "react";
import { Search, FileSpreadsheet, FileText } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export const AuditLogsPage = ({
  auditLogs = [],
  currentUser,
  onRefreshData,
}) => {
  const { isDark } = useTheme();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState("7D");
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  const getAuthToken = () => {
    const possibleKeys = [
      "token",
      "authToken",
      "accessToken",
      "jwtToken",
      "jwt",
      "access_token",
    ];

    for (const key of possibleKeys) {
      const localValue = localStorage.getItem(key);
      if (localValue) {
        return localValue;
      }

      const sessionValue = sessionStorage.getItem(key);
      if (sessionValue) {
        return sessionValue;
      }
    }

    const possibleObjects = [
      "user",
      "currentUser",
      "authUser",
      "auth",
      "userData",
    ];

    for (const key of possibleObjects) {
      try {
        const value = localStorage.getItem(key);

        if (value) {
          const parsed = JSON.parse(value);

          if (parsed?.token) {
            return parsed.token;
          }

          if (parsed?.accessToken) {
            return parsed.accessToken;
          }

          if (parsed?.jwtToken) {
            return parsed.jwtToken;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const enrichedLogs = useMemo(() => {
    return auditLogs.map((log) => {
      const userStr =
        log.userName || log.userEmail || log.userId || "System";

      const actionStr = log.action || "POLICY_EVALUATION";

      let details=log.metadata||{};
      if(typeof log.details==='string'){try{details={...JSON.parse(log.details),...details};}catch{}}
      const deviceStr=log.deviceName||details.deviceName||'Not recorded';

      const timeStr = log.timestamp
        ? new Date(log.timestamp).toLocaleString()
        : "Recent";

      const policyDecision=log.policyDecision||details.decision||'Not recorded';
      const riskScore=log.riskScore??details.riskScore??'Not recorded';

      const status =
        log.status || "RECORDED";

      return {
        id: log.id || "",
        user: userStr,
        action: actionStr,
        device: deviceStr,
        time: timeStr,
        policyDecision,
        risk: riskScore,
        status,
        category: log.category || "POLICY",
        severity: log.severity || "LOW",
        raw: log,
      };
    });
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();

    let rangeStart = null;

    if (dateRange === "24H") {
      rangeStart = now - 24 * 60 * 60 * 1000;
    }

    if (dateRange === "7D") {
      rangeStart = now - 7 * 24 * 60 * 60 * 1000;
    }

    if (dateRange === "30D") {
      rangeStart = now - 30 * 24 * 60 * 60 * 1000;
    }

    return enrichedLogs.filter((log) => {
      const q = search.toLowerCase().trim();

      const matchesSearch =
        !q ||
        log.user.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.device.toLowerCase().includes(q) ||
        log.policyDecision.toLowerCase().includes(q) ||
        log.id.toLowerCase().includes(q);

      const matchesCategory =
        categoryFilter === "ALL" || log.category === categoryFilter;

      let matchesDate = true;

      if (rangeStart && log.raw?.timestamp) {
        matchesDate = new Date(log.raw.timestamp).getTime() >= rangeStart;
      }

      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [enrichedLogs, search, categoryFilter, dateRange]);

  const handleExport = async (format) => {
    try {
      setExportError(null);
      setExporting(format);

      const token = localStorage.getItem("zero_trust_token");

      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      const params = new URLSearchParams();

      params.set("format", format);

      if (categoryFilter !== "ALL") {
        params.set("category", categoryFilter);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }
      const hours = {'24H':24,'7D':168,'30D':720}[dateRange];
      if(hours) params.set("from",new Date(Date.now()-hours*3600000).toISOString());


      const res = await fetch(`/api/audit-logs/export?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        throw new Error("Authentication failed. Please log in again.");
      }

      if (res.status === 403) {
        throw new Error("You are not authorized to export audit logs.");
      }

      if (!res.ok) {
        let message = `Export failed with HTTP status ${res.status}`;

        try {
          const errorData = await res.json();

          if (errorData?.error?.message) {
            message = errorData.error.message;
          }
        } catch {}

        throw new Error(message);
      }

      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split("T")[0];

      const filename = `cyberorbit-audit-ledger-${dateStr}.${format}`;

      const downloadAnchor = document.createElement("a");

      downloadAnchor.href = url;
      downloadAnchor.download = filename;

      document.body.appendChild(downloadAnchor);

      downloadAnchor.click();

      downloadAnchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export audit logs:", err);

      setExportError(err.message || "Failed to export audit log records.");
    } finally {
      setExporting(null);
    }
  };
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">
      {/* ====================================================== */}
      {/* PAGE HEADER */}
      {/* ====================================================== */}
      <section className="console-hero group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(103,232,249,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.055) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
              maskImage:
                "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
            }}
          />
          <div className="absolute right-[11%] top-1/2 h-44 w-44 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />
          <div className="absolute right-[8%] top-1/2 h-32 w-64 -translate-y-1/2 rotate-[18deg] rounded-[50%] border border-[#D4AF37]/20" />
          <div className="absolute right-[13%] top-1/2 h-20 w-44 -translate-y-1/2 -rotate-[18deg] rounded-[50%] border border-[#67E8F9]/20" />
          <div className="absolute right-[22%] top-[36%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.75)]" />
          <div className="absolute right-[12%] top-[55%] h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.65)]" />
          <div className="absolute right-[25%] bottom-[22%] h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.65)]" />
        </div>

        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="absolute right-[11%] top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-xl border border-[#67E8F9]/45 bg-[#050A10]/90 shadow-[0_0_30px_rgba(103,232,249,0.08)]">
          <div className="h-7 w-7 rounded-md border border-[#D4AF37]/45" />
          <div className="absolute h-1.5 w-7 rounded-full bg-[#67E8F9]/80" />
          <div className="absolute mt-5 h-1 w-5 rounded-full bg-[#D4AF37]/75" />
        </div>

        <div className="relative z-20 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[72%]">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                COMPLIANCE LEDGER
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                TAMPER-EVIDENT AUDIT TRAIL
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Security <span className="text-[#67E8F9]">Audit Logs</span>
            </h1>

            <p className="mt-4 max-w-3xl text-[14px] leading-6 text-[#A7B0BA]">
              Database timestamped record of Zero Trust policy
              decision, authentication attempt, administrative intervention, and
              risk transition.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#67E8F9]">
                AUDIT TRAIL
              </span>
              <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#D4AF37]">
                ZERO TRUST
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 right-7 z-30 flex items-center gap-2.5">
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#050A10]/90 px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-[#A7B0BA] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/80 hover:bg-[#67E8F9]/5 hover:text-[#F4F7FA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>{exporting === "csv" ? "EXPORTING..." : "EXPORT CSV"}</span>
          </button>

          <button
            onClick={() => handleExport("json")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37] bg-[#D4AF37] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#03070C] transition-all duration-300 hover:-translate-y-0.5 hover:bg-transparent hover:text-[#D4AF37] hover:shadow-[0_8px_24px_rgba(212,175,55,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{exporting === "json" ? "EXPORTING..." : "EXPORT JSON"}</span>
          </button>
        </div>
      </section>

      {/* ====================================================== */}
      {/* EXPORT ERROR */}
      {/* ====================================================== */}
      {exportError && (
        <div className="group flex items-center rounded-xl border border-red-500/35 bg-red-500/5 p-4 text-sm font-mono text-red-400 transition-all duration-300 hover:border-red-500/55 hover:bg-red-500/10 hover:shadow-[0_10px_30px_rgba(239,68,68,0.08)]">
          {exportError}
        </div>
      )}

      {/* ====================================================== */}
      {/* SEARCH & FILTERS */}
      {/* ====================================================== */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6">
        <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
          <div className="relative w-full md:w-[360px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search User, Action, Device, or Decision..."
              className="w-full rounded-xl border border-white/10 bg-[#070C12] py-2.5 pl-10 pr-3 font-mono text-sm text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#A7B0BA]/60 hover:border-white/20 focus:border-[#67E8F9]/60 focus:bg-[#050A10] focus:ring-1 focus:ring-[#67E8F9]/20"
            />

            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />
          </div>

          <div className="flex w-full flex-wrap items-center gap-4 font-mono text-sm md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-[#A7B0BA]">CATEGORY:</span>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="cursor-pointer rounded-lg border border-white/10 bg-[#070C12] px-3 py-2 text-sm text-[#F4F7FA] outline-none transition-all duration-300 hover:border-[#67E8F9]/35 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
              >
                <option value="ALL">All Categories</option>

                <option value="SECURITY">Security</option>

                <option value="POLICY">Policy</option>

                <option value="AUTH">Authentication</option>

                <option value="ACCESS">Access Control</option>

                <option value="ADMIN">Administrative</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#A7B0BA]">RANGE:</span>

              <div className="flex overflow-hidden rounded-lg border border-white/10 bg-[#070C12]">
                {["24H", "7D", "30D", "ALL"].map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-2 text-[11px] font-mono transition-all duration-300 ${
                      dateRange === range
                        ? "bg-[#67E8F9] font-semibold text-[#03070C] shadow-[inset_0_-2px_0_rgba(212,175,55,0.75)]"
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
      </div>

      {/* ====================================================== */}
      {/* AUDIT LOG TABLE */}
      {/* ====================================================== */}
      <div className="group overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.20)] transition-all duration-300 hover:border-[#67E8F9]/20 hover:shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#070C12] font-mono text-[11px] uppercase tracking-[0.12em] text-[#67E8F9]">
              <tr>
                <th className="px-5 py-4">USER</th>

                <th className="px-5 py-4">ACTION</th>

                <th className="px-5 py-4">DEVICE</th>

                <th className="px-5 py-4">TIME</th>

                <th className="px-5 py-4 text-center">POLICY DECISION</th>

                <th className="px-5 py-4 text-center">RISK</th>

                <th className="px-5 py-4 text-right">STATUS</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 font-mono">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const isHighRisk = log.risk >= 60;

                  const isCriticalDecision =
                    log.policyDecision === "FREEZE" ||
                    log.policyDecision === "RESTRICT";

                  return (
                    <tr
                      key={log.id}
                      className="group/row transition-all duration-300 hover:bg-[#67E8F9]/[0.035] hover:shadow-[inset_3px_0_0_#67E8F9]"
                    >
                      <td className="px-5 py-4">
                        <span className="block font-sans text-sm font-medium text-[#F4F7FA] transition-colors duration-300 group-hover/row:text-[#67E8F9]">
                          {log.user}
                        </span>

                        <span className="text-[12px] text-[#7F8A96]">
                          {log.id.slice(0, 10)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-[#A7B0BA] text-[12px]">
                        {log.action}
                      </td>

                      <td className="px-5 py-4 text-[#A7B0BA] text-[12px]">
                        {log.device}
                      </td>

                      <td className="px-5 py-4 text-[#A7B0BA] text-[12px]">
                        {log.time}
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-all duration-300 group-hover/row:-translate-y-0.5 ${
                            isCriticalDecision
                              ? "border-red-500/50 bg-red-500/10 text-red-400"
                              : log.policyDecision === "MFA_CHALLENGE" ||
                                  log.policyDecision === "MONITOR"
                                ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]"
                                : "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {log.policyDecision}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span
                          className={`font-bold text-sm ${
                            isHighRisk ? "text-red-400" : "text-[#67E8F9]"
                          }`}
                        >
                          {log.risk}
                        </span>

                        <span className="text-[12px] text-[#7F8A96]">/100</span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex rounded-md border border-white/10 bg-[#070C12] px-2 py-1 text-[10px] uppercase text-[#A7B0BA] transition-all duration-300 group-hover/row:border-white/20 group-hover/row:text-[#F4F7FA]">
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
                    className="py-16 text-center text-sm font-mono text-[#A7B0BA]"
                  >
                    No security audit logs match the query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
