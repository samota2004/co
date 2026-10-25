import React, { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  Search,
  Sparkles,
  ShieldAlert,
  FileSpreadsheet,
  FileCode,
  Lock,
  XCircle,
  UserX,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { SeverityBadge, StatusBadge } from "../components/Badges";
import { useTheme } from "../context/ThemeContext";
import {requestApi} from '../services/api.js';
import {confirmAccountAction} from '../services/confirm-account-action.js';

const getIncidentId = (incident) =>
  incident?.id || incident?.incidentId || incident?._id || "";

const getIncidentEventType = (incident) =>
  incident?.eventType || incident?.title || incident?.type || "Incident";

const getIncidentUserId = (incident) =>
  incident?.userId || incident?.employeeId || "";

const getUserDepartment = (user) =>
  user?.department || user?.departmentName || user?.departmentCode || "";

const isUserFrozen = (user) => {
  if (!user) {
    return false;
  }

  return (
    user.isFrozen === true ||
    user.accountFrozen === true ||
    user.accountStatus === "FROZEN" ||
    user.status === "FROZEN"
  );
};

const normalizeText = (value) =>
  value === null || value === undefined ? "" : String(value);

export const IncidentsPage = ({
  incidents = [],
  users = [],
  currentUser,
  onRefreshData,
  onOpenCopilot,
  initialIncidentId,
}) => {
  const { isDark } = useTheme();

  const [selectedIncidentId, setSelectedIncidentId] = useState(initialIncidentId || null);

  const [filterSeverity, setFilterSeverity] = useState("ALL");

  const [filterStatus, setFilterStatus] = useState("ALL");

  const [search, setSearch] = useState("");

  const [resolutionNotes, setResolutionNotes] = useState("");

  const [resolving, setResolving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);

  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  const [freezingUserId, setFreezingUserId] = useState(null);

  const [freezeError, setFreezeError] = useState(null);

  const [refreshing, setRefreshing] = useState(false);

  const isAuthorized =
    ["SECURITY_ADMIN", "SYSTEM_ADMIN"].includes(currentUser?.role || currentUser?.roleCode);

  const userMap = useMemo(() => {
    const map = new Map();

    users.forEach((user) => {
      if (!user) {
        return;
      }

      if (user.id !== undefined && user.id !== null) {
        map.set(String(user.id), user);
      }

      if (user._id !== undefined && user._id !== null) {
        map.set(String(user._id), user);
      }

      if (user.email) {
        map.set(`email:${String(user.email).toLowerCase()}`, user);
      }

      if (user.employeeId) {
        map.set(`employee:${String(user.employeeId).toLowerCase()}`, user);
      }
    });

    return map;
  }, [users]);

  const getIncidentUser = (incident) => {
    if (!incident) {
      return null;
    }

    const userId = getIncidentUserId(incident);

    if (userId) {
      const user =
        userMap.get(String(userId)) ||
        userMap.get(`employee:${String(userId).toLowerCase()}`) ||
        userMap.get(`email:${String(userId).toLowerCase()}`);

      if (user) {
        return user;
      }
    }

    if (incident.userEmail) {
      return (
        userMap.get(`email:${String(incident.userEmail).toLowerCase()}`) || null
      );
    }

    return null;
  };

  const severityOptions = useMemo(() => {
    const values = new Set();

    incidents.forEach((incident) => {
      if (incident?.severity) {
        values.add(String(incident.severity).toUpperCase());
      }
    });

    ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach((value) => values.add(value));

    return Array.from(values);
  }, [incidents]);

  const statusOptions = useMemo(() => {
    const values = new Set();

    incidents.forEach((incident) => {
      if (incident?.status) {
        values.add(String(incident.status).toUpperCase());
      }
    });

    ["OPEN", "UNDER_REVIEW", "APPROVED", "REJECTED", "RESOLVED"].forEach((value) => values.add(value));

    return Array.from(values);
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return incidents.filter((incident) => {
      const user = getIncidentUser(incident);

      const incidentId = normalizeText(getIncidentId(incident));

      const userName = user?.name || incident?.userName || "";

      const userEmail = user?.email || incident?.userEmail || "";

      const userDepartment =
        getUserDepartment(user) || incident?.userDepartment || "";

      const eventType = getIncidentEventType(incident);

      const title = incident?.title || "";

      const device =
        incident?.deviceName || incident?.deviceId || incident?.device || "";

      const matchesSeverity =
        filterSeverity === "ALL" ||
        String(incident?.severity || "").toUpperCase() === filterSeverity;

      const matchesStatus =
        filterStatus === "ALL" ||
        String(incident?.status || "").toUpperCase() === filterStatus;

      const searchableValues = [
        incidentId,
        userName,
        userEmail,
        userDepartment,
        eventType,
        title,
        device,
        incident?.description,
        incident?.recommendedAction,
      ];

      const matchesSearch =
        !query ||
        searchableValues.some((value) =>
          normalizeText(value).toLowerCase().includes(query),
        );

      return matchesSeverity && matchesStatus && matchesSearch;
    });
  }, [incidents, userMap, filterSeverity, filterStatus, search]);

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) {
      return null;
    }

    return (
      incidents.find(
        (incident) =>
          String(getIncidentId(incident)) === String(selectedIncidentId),
      ) || null
    );
  }, [incidents, selectedIncidentId]);

  const selectedUser = useMemo(() => {
    if (!selectedIncident) {
      return null;
    }

    return getIncidentUser(selectedIncident);
  }, [selectedIncident, userMap]);

  const totalIncidents = incidents.length;

  const openCount = incidents.filter(
    (incident) => String(incident?.status || "").toUpperCase() === "OPEN",
  ).length;

  const criticalCount = incidents.filter(
    (incident) =>
      String(incident?.severity || "").toUpperCase() === "CRITICAL" &&
      String(incident?.status || "").toUpperCase() !== "RESOLVED",
  ).length;

  const highRiskUsers = useMemo(() => {
    const result = new Map();

    incidents.forEach((incident) => {
      const userId = getIncidentUserId(incident);

      const incidentRisk =
        typeof incident?.riskScore === "number" ? incident.riskScore : null;

      if (!userId || incidentRisk === null) {
        return;
      }

      if (!["HIGH", "VERY_HIGH", "CRITICAL"].includes(String(incident.severity).toUpperCase())) {
        return;
      }

      const key = String(userId);
      const existing = result.get(key);

      if (!existing || incidentRisk > existing.riskScore) {
        result.set(key, {
          userId,
          riskScore: incidentRisk,
          incidentId: getIncidentId(incident),
        });
      }
    });

    users.forEach((user) => {
      const userRisk = user?.riskScore ?? user?.currentRiskScore;

      const userId = user?.id || user?._id || user?.employeeId;

      if (
        !userId ||
        typeof userRisk !== "number" ||
        !["HIGH", "VERY_HIGH", "CRITICAL"].includes(String(user.riskLevel || user.currentRiskLevel).toUpperCase())
      ) {
        return;
      }

      const key = String(userId);
      const existing = result.get(key);

      if (!existing || userRisk > existing.riskScore) {
        result.set(key, {
          userId,
          riskScore: userRisk,
          incidentId: existing?.incidentId || null,
        });
      }
    });

    return Array.from(result.values());
  }, [incidents, users]);

  const handleRefresh = async () => {
    if (!onRefreshData) {
      return;
    }

    try {
      setRefreshing(true);
      await onRefreshData();
    } catch (error) {
      console.error("Failed to refresh incidents:", error);

      setFreezeError(error.message || "Failed to refresh incident data.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (
      selectedIncidentId &&
      !incidents.some(
        (incident) =>
          String(getIncidentId(incident)) === String(selectedIncidentId),
      )
    ) {
      setSelectedIncidentId(null);
      setResolutionNotes("");
    }
  }, [incidents, selectedIncidentId]);

  const handleExport = async (format) => {
    if (!isAuthorized) {
      return;
    }

    try {
      setExportError(null);
      setExporting(format);

      const params = new URLSearchParams();

      params.set("format", format);

      if (filterSeverity !== "ALL") {
        params.set("severity", filterSeverity);
      }

      if (filterStatus !== "ALL") {
        params.set("status", filterStatus);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (currentUser?.id) {
        params.set("userId", currentUser.id);
      }

      const response = await fetch(
        `/api/incidents/export?${params.toString()}`,
        {
          headers: {
            "x-user-id": currentUser?.id || "",
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          errorData?.error?.message ||
            errorData?.message ||
            `Export failed with status ${response.status}`,
        );
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split("T")[0];

      const filename = `cyberorbit-incidents-${dateStr}.${format}`;

      const downloadAnchor = document.createElement("a");

      downloadAnchor.href = url;
      downloadAnchor.download = filename;

      document.body.appendChild(downloadAnchor);

      downloadAnchor.click();
      downloadAnchor.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export incidents:", error);

      setExportError(error.message || "Failed to export incident reports.");
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateAiExplanation = async (incidentId) => {
    if (!incidentId) {
      return;
    }

    try {
      setGeneratingAi(true);

      const response = await fetch(`/api/incidents/${incidentId}/ai-explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUser?.id
            ? {
                "x-user-id": currentUser.id,
              }
            : {}),
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            data?.message ||
            "Failed to generate AI explanation.",
        );
      }

      if (data?.success) {
        await handleRefresh();
      }
    } catch (error) {
      console.error("Failed to generate AI explanation:", error);

      setExportError(error.message || "Failed to generate AI explanation.");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleResolveIncident = async (incidentId, status) => {
    if (!incidentId) {
      return;
    }

    try {
      setResolving(true);

      const response = await fetch(`/api/incidents/${incidentId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUser?.id
            ? {
                "x-user-id": currentUser.id,
              }
            : {}),
        },
        body: JSON.stringify({
          resolutionNotes,
          newStatus: status,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message || data?.message || "Failed to update incident.",
        );
      }

      if (data?.success) {
        setResolutionNotes("");
        await handleRefresh();
      }
    } catch (error) {
      console.error("Failed to resolve incident:", error);

      setFreezeError(error.message || "Failed to update incident.");
    } finally {
      setResolving(false);
    }
  };

  const handleFreezeUser = async (userId) => {
    if (!userId || !isAuthorized) {
      return;
    }
    const reason=confirmAccountAction('freeze',incidents.find(row=>getIncidentUserId(row)===userId)?.userName||'this employee');if(!reason)return;

    try {
      setFreezeError(null);
      setFreezingUserId(userId);

      await requestApi(`/api/users/${encodeURIComponent(userId)}/freeze`,{method:'POST',body:{reason}});

      await handleRefresh();
    } catch (error) {
      console.error("Failed to freeze user account:", error);

      setFreezeError(error.message || "Failed to freeze user account.");
    } finally {
      setFreezingUserId(null);
    }
  };

  const handleUnfreezeUser = async (userId) => {
    if (!userId || !isAuthorized) {
      return;
    }
    const reason=confirmAccountAction('unfreeze',incidents.find(row=>getIncidentUserId(row)===userId)?.userName||'this employee');if(!reason)return;

    try {
      setFreezeError(null);
      setFreezingUserId(userId);

      await requestApi(`/api/users/${encodeURIComponent(userId)}/unfreeze`,{method:'POST',body:{reason}});

      await handleRefresh();
    } catch (error) {
      console.error("Failed to unfreeze user account:", error);

      setFreezeError(error.message || "Failed to unfreeze user account.");
    } finally {
      setFreezingUserId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-12 bg-[#03070C] text-[#F4F7FA] font-sans">
      <section className="console-hero group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div className="pointer-events-none absolute left-0 top-0 h-12 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-12 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="absolute right-0 top-0 h-full w-[48%] overflow-hidden opacity-95">
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050A10] to-transparent z-10" />
          <div className="absolute left-1/2 top-1/2 h-44 w-72 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-7 rounded-[50%] border border-[#67E8F9]/15 rotate-[18deg]" />
            <div className="absolute inset-3 rounded-[50%] border border-[#D4AF37]/15 -rotate-[18deg]" />
            <div className="absolute inset-0 rounded-[50%] border border-[#67E8F9]/10" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#67E8F9]/45 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.10)] flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-[#67E8F9]" />
            </div>
            <span className="absolute left-[18%] top-[28%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.65)]" />
            <span className="absolute right-[18%] top-[24%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.55)]" />
            <span className="absolute bottom-[22%] left-[26%] h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="absolute bottom-[25%] right-[24%] h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
            <div className="absolute left-[8%] top-[44%] h-9 w-16 rounded-lg border border-white/10 bg-[#050A10]/90" />
            <div className="absolute right-[8%] top-[42%] h-9 w-16 rounded-lg border border-white/10 bg-[#050A10]/90" />
          </div>
        </div>

        <div className="relative z-20 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[68%]">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                Security Operations
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                Threat Containment &amp; Forensic Auditing
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Insider Threat
              <span className="block text-[#67E8F9]">Incident Queue</span>
            </h1>

            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Investigate recorded detections, review supporting evidence and manage application account containment.
            </p>
          </div>
        </div>

        <div className="absolute bottom-7 right-7 z-30 grid w-[370px] grid-cols-2 gap-2.5">
          {!isAuthorized && (
            <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 border border-amber-500/40 bg-[#050A10] text-amber-300 text-[12px] font-mono transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-500/10">
              <Lock className="w-3.5 h-3.5" />
              <span>SOC Admin Required</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full justify-center rounded-xl px-3.5 py-2.5 border border-[#D4AF37]/40 bg-[#050A10] text-[#D4AF37] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 hover:shadow-[0_8px_24px_rgba(212,175,55,0.10)] text-[12px] font-mono flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "REFRESHING..." : "REFRESH"}
          </button>

          <button
            onClick={() => handleExport("json")}
            disabled={!isAuthorized || exporting !== null}
            className={`w-full justify-center rounded-xl px-4 py-2.5 text-[12px] font-mono tracking-wider border transition-all duration-300 flex items-center gap-2 ${isAuthorized && exporting === null ? "bg-[#050A10] text-[#67E8F9] border-[#67E8F9]/35 hover:border-[#67E8F9] hover:bg-[#67E8F9] hover:text-[#03070C] hover:-translate-y-0.5 cursor-pointer" : "bg-[#03070C] text-[#66717C] border-white/10 cursor-not-allowed opacity-50"}`}
          >
            <FileCode className="w-4 h-4" />
            <span>
              {exporting === "json" ? "EXPORTING JSON..." : "EXPORT JSON"}
            </span>
          </button>

          <button
            onClick={() => handleExport("csv")}
            disabled={!isAuthorized || exporting !== null}
            className={`w-full justify-center rounded-xl px-4 py-2.5 text-[12px] font-mono font-bold tracking-wider border transition-all duration-300 flex items-center gap-2 ${isAuthorized && exporting === null ? "bg-[#67E8F9] text-[#03070C] border-[#67E8F9] hover:bg-transparent hover:text-[#67E8F9] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(103,232,249,0.14)] cursor-pointer" : "bg-[#03070C] text-[#66717C] border-white/10 cursor-not-allowed opacity-50"}`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {exporting === "csv" ? "EXPORTING CSV..." : "EXPORT CSV"}
            </span>
          </button>
        </div>
      </section>

      {exportError && (
        <div className="rounded-xl bg-[#050A10] border border-red-500/30 p-4 flex items-center justify-between shadow-[0_12px_35px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/50 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)] text-xs text-red-400 font-mono">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span>{exportError}</span>
          </div>

          <button
            onClick={() => setExportError(null)}
            className="rounded-lg p-1.5 text-red-400 hover:text-[#F4F7FA] hover:bg-red-500/10 transition-all duration-300 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {freezeError && (
        <div className="rounded-xl bg-[#050A10] border border-red-500/30 p-4 flex items-center justify-between shadow-[0_12px_35px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/50 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)] text-xs text-red-400 font-mono">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span>{freezeError}</span>
          </div>

          <button
            onClick={() => setFreezeError(null)}
            className="rounded-lg p-1.5 text-red-400 hover:text-[#F4F7FA] hover:bg-red-500/10 transition-all duration-300 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div
        className={`rounded-2xl p-4 border transition-all duration-300 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:shadow-[0_14px_35px_rgba(0,0,0,0.20)] ${
          isDark
            ? "bg-[#050A10] border-[#67E8F9]/25 text-[#F4F7FA]"
            : "bg-[#050A10] border-white/10 text-[#F4F7FA]"
        }`}
      >
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search incidents"
            placeholder="Search incident ID, user, event..."
            className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none font-sans transition-all duration-300 ${
              isDark
                ? "bg-[#03070C] border-[#67E8F9]/30 text-[#F4F7FA] focus:border-[#67E8F9]"
                : "bg-[#070C12] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]"
            }`}
          />

          <Search className="w-4 h-4 text-[#A7B0BA] absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#A7B0BA] font-mono text-[11px] uppercase">
              Severity:
            </span>

            <select
              aria-label="Incident severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-sm outline-none font-sans transition-all duration-300 focus:border-[#67E8F9] ${
                isDark
                  ? "bg-[#03070C] border-[#67E8F9]/30 text-[#F4F7FA]"
                  : "bg-[#050A10] border-white/10 text-[#F4F7FA]"
              }`}
            >
              <option value="ALL">All Severities</option>

              {severityOptions.map((severity) => (
                <option key={severity} value={severity}>
                  {severity.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#A7B0BA] font-mono text-[11px] uppercase">
              Status:
            </span>

            <select
              aria-label="Incident status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-sm outline-none font-sans transition-all duration-300 focus:border-[#67E8F9] ${
                isDark
                  ? "bg-[#03070C] border-[#67E8F9]/30 text-[#F4F7FA]"
                  : "bg-[#050A10] border-white/10 text-[#F4F7FA]"
              }`}
            >
              <option value="ALL">All Statuses</option>

              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            <span className="rounded-md px-2 py-1 text-[11px] font-mono border border-[#D4AF37]/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37] hover:bg-[#D4AF37]/15 cursor-default text-[#D4AF37] bg-[#D4AF37]/10">
              {totalIncidents} TOTAL
            </span>

            <span className="rounded-md px-2 py-1 text-[11px] font-mono border border-red-500/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400 hover:bg-red-500/15 cursor-default text-red-500 bg-red-500/10">
              {criticalCount} CRITICAL
            </span>

            <span className="rounded-md px-2 py-1 text-[11px] font-mono border border-amber-500/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-500/15 cursor-default text-amber-500 bg-amber-500/10">
              {openCount} OPEN
            </span>
          </div>
        </div>
      </div>

      {highRiskUsers.length > 0 && (
        <div
          className={`rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/50 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)] ${
            isDark
              ? "bg-[#050A10] border-red-500/30"
              : "bg-[#050A10] border-red-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <UserX className="w-4 h-4 text-red-400" />

            <span className="font-mono text-xs font-bold uppercase tracking-wider text-red-400">
              High-Risk Account Containment
            </span>
          </div>

          <div className="space-y-2">
            {highRiskUsers.map((item) => {
              const user =
                userMap.get(String(item.userId)) ||
                userMap.get(`employee:${String(item.userId).toLowerCase()}`);

              if (!user) {
                return null;
              }

              const frozen = isUserFrozen(user);

              const processing = freezingUserId === (user.id || user._id);

              const actualUserId = user.id || user._id;

              return (
                <div
                  key={String(actualUserId)}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border ${
                    isDark
                      ? "border-white/10 bg-[#03070C]"
                      : "border-white/10 bg-[#070C12]"
                  }`}
                >
                  <div>
                    <div className="font-sans font-semibold text-sm">
                      {user.name || "Unknown User"}
                    </div>

                    <div className="font-mono text-[11px] text-[#A7B0BA]">
                      {user.email || user.employeeId || actualUserId}
                    </div>

                    <div className="font-mono text-[11px] mt-1">
                      Risk Score:{" "}
                      <span className="text-red-400 font-bold">
                        {item.riskScore}/100
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 border text-[11px] font-mono ${
                        frozen
                          ? "border-red-500/50 text-red-400 bg-red-500/10"
                          : "border-orange-500/50 text-orange-400 bg-orange-500/10"
                      }`}
                    >
                      {frozen ? "ACCOUNT FROZEN" : "HIGH RISK"}
                    </span>

                    {frozen ? (
                      <button
                        onClick={() => handleUnfreezeUser(actualUserId)}
                        disabled={!isAuthorized || processing}
                        className="rounded-xl px-3 py-1.5 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all duration-300 hover:-translate-y-0.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />

                        {processing ? "PROCESSING..." : "UNFREEZE"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleFreezeUser(actualUserId)}
                        disabled={!isAuthorized || processing}
                        className="rounded-xl px-3 py-1.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all duration-300 hover:-translate-y-0.5"
                      >
                        <UserX className="w-3.5 h-3.5" />

                        {processing ? "PROCESSING..." : "FREEZE ACCOUNT"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {filteredIncidents.length === 0 ? (
            <div
              className={`rounded-2xl border p-8 text-center text-xs font-mono transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:shadow-[0_14px_35px_rgba(0,0,0,0.20)] ${
                isDark
                  ? "bg-[#050A10] border-white/10 text-[#A7B0BA]"
                  : "bg-[#050A10] border-white/10 text-[#A7B0BA] shadow-sm"
              }`}
            >
              No incidents matching current criteria.
            </div>
          ) : (
            filteredIncidents.map((incident) => {
              const user = getIncidentUser(incident);

              const incidentId = getIncidentId(incident);

              const isSelected =
                String(selectedIncidentId) === String(incidentId);

              const incidentRisk =
                typeof incident?.riskScore === "number"
                  ? incident.riskScore
                  : null;

              const userDepartment =
                getUserDepartment(user) || incident?.userDepartment || "";

              return (
                <div
                  key={
                    incidentId ||
                    `${getIncidentEventType(incident)}-${incident.detectedAt}`
                  }
                  onClick={() => setSelectedIncidentId(incidentId)}
                  className={`rounded-xl p-4 border transition-all duration-300 cursor-pointer relative shadow-[0_10px_30px_rgba(0,0,0,0.14)] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.24)] ${
                    isSelected
                      ? "bg-[#070C12] border-2 border-[#D4AF37] shadow-xl text-[#F4F7FA]"
                      : isDark
                        ? "bg-[#050A10] border-white/10 hover:border-[#67E8F9]/60 hover:bg-[#070C12] text-[#F4F7FA]"
                        : "bg-[#050A10] border-white/10 hover:border-[#67E8F9] hover:bg-[#070C12] text-[#F4F7FA]"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#D4AF37]" />
                  )}

                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-bold text-xs ${
                          isSelected ? "text-[#D4AF37]" : "text-current"
                        }`}
                      >
                        {incidentId || "NO-ID"}
                      </span>

                      {incident.severity && (
                        <SeverityBadge severity={incident.severity} />
                      )}
                    </div>

                    {incident.status && (
                      <StatusBadge status={incident.status} />
                    )}
                  </div>

                  <div
                    className={`font-semibold text-xs mb-1 ${
                      isSelected ? "text-[#F4F7FA]" : "text-current"
                    }`}
                  >
                    {user?.name || incident.userName || "Unknown User"}

                    {userDepartment && (
                      <span className="text-[#A7B0BA] font-mono text-[11px]">
                        {" "}
                        ({userDepartment})
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[#A7B0BA] font-mono truncate mb-2">
                    {getIncidentEventType(incident)}

                    {incidentRisk !== null && (
                      <>
                        {" "}
                        • Risk Index:{" "}
                        <strong className="text-[#D4AF37]">
                          {incidentRisk}
                          /100
                        </strong>
                      </>
                    )}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[#A7B0BA] font-mono pt-2 border-t border-white/10 border-white/10 gap-3">
                    <span>
                      {incident.detectedAt
                        ? new Date(incident.detectedAt).toLocaleString()
                        : "—"}
                    </span>

                    {incident.recommendedAction && (
                      <span className="text-[#D4AF37] font-semibold truncate">
                        {incident.recommendedAction}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7">
          {selectedIncident ? (
            <div className="rounded-2xl bg-[#050A10] border border-white/10 p-6 sm:p-7 shadow-[0_18px_60px_rgba(0,0,0,0.28)] space-y-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:shadow-[0_22px_65px_rgba(0,0,0,0.32)] text-[#F4F7FA] relative overflow-hidden">
              <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/70 to-transparent" />

              <div className="flex items-center justify-between pb-4 border-b border-[#67E8F9]/25">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-sans font-semibold text-sm text-[#67E8F9]">
                      {getIncidentId(selectedIncident) || "NO-ID"}
                    </span>

                    {selectedIncident.severity && (
                      <SeverityBadge severity={selectedIncident.severity} />
                    )}

                    {selectedIncident.status && (
                      <StatusBadge status={selectedIncident.status} />
                    )}
                  </div>

                  <h3 className="font-sans text-xl text-[#F4F7FA]">
                    {getIncidentEventType(selectedIncident)}

                    {selectedUser?.name ? ` - ${selectedUser.name}` : ""}
                  </h3>
                </div>

                {onOpenCopilot && (
                  <button
                    onClick={() =>
                      onOpenCopilot({
                        incidentId: getIncidentId(selectedIncident),
                        userId: getIncidentUserId(selectedIncident),
                      })
                    }
                    className="rounded-xl px-3.5 py-2 bg-[#050A10] border border-[#67E8F9] text-[#67E8F9] hover:bg-[#67E8F9] hover:text-[#F4F7FA] text-xs font-mono font-bold tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ASK COPILOT</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
                {typeof selectedIncident.riskScore === "number" && (
                  <div className="rounded-xl bg-[#070C12] p-3 border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 hover:-translate-y-0.5">
                    <span className="text-[11px] font-mono uppercase text-[#A7B0BA] block mb-1">
                      Risk Index
                    </span>

                    <span className="text-xl font-bold font-mono text-[#67E8F9]">
                      {selectedIncident.riskScore}
                      /100
                    </span>
                  </div>
                )}

                {selectedIncident.recommendedAction && (
                  <div className="rounded-xl bg-[#070C12] p-3 border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 hover:-translate-y-0.5">
                    <span className="text-[11px] font-mono uppercase text-[#A7B0BA] block mb-1">
                      Action Enforced
                    </span>

                    <span className="text-xs font-bold font-mono text-[#F4F7FA]">
                      {selectedIncident.recommendedAction}
                    </span>
                  </div>
                )}

                {selectedIncident.adminActionTaken && (
                  <div className="rounded-xl bg-[#070C12] p-3 border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 hover:-translate-y-0.5">
                    <span className="text-[11px] font-mono uppercase text-[#A7B0BA] block mb-1">
                      Containment
                    </span>

                    <span className="text-xs font-bold font-mono text-[#F4F7FA]">
                      {selectedIncident.adminActionTaken}
                    </span>
                  </div>
                )}

                {typeof selectedIncident.supervisedProbability === "number" && (
                  <div className="rounded-xl bg-[#070C12] p-3 border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 hover:-translate-y-0.5">
                    <span className="text-[11px] font-mono uppercase text-[#A7B0BA] block mb-1">
                      Supervised ML
                    </span>

                    <span className="text-xs font-bold font-mono text-[#67E8F9]">
                      {(selectedIncident.supervisedProbability * 100).toFixed(
                        1,
                      )}
                      %
                    </span>
                  </div>
                )}

                {typeof selectedIncident.isolationForestScore === "number" && (
                  <div className="rounded-xl bg-[#070C12] p-3 border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 hover:-translate-y-0.5">
                    <span className="text-[11px] font-mono uppercase text-[#A7B0BA] block mb-1">
                      Isolation Forest
                    </span>

                    <span className="text-xs font-bold font-mono text-emerald-400">
                      {(selectedIncident.isolationForestScore * 100).toFixed(1)}
                      %
                    </span>
                  </div>
                )}
              </div>

              {selectedIncident.xaiExplanation && (
                <div className="rounded-xl p-4 bg-[#67E8F9]/10 border-l-4 border-[#D4AF37] border-y border-r border-[#D4AF37]/25 space-y-1 text-xs">
                  <span className="font-mono text-[11px] uppercase text-[#67E8F9] font-bold block">
                    XAI Feature Attribution Rationale
                  </span>

                  <p className="text-[#F4F7FA] font-sans text-xs leading-relaxed">
                    {selectedIncident.xaiExplanation}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold text-xs font-sans uppercase text-[#67E8F9] tracking-wider">
                  Contributing Behavioral Telemetry Signals
                </h4>

                <div className="space-y-1.5">
                  {Array.isArray(selectedIncident.contributingFactors) &&
                  selectedIncident.contributingFactors.length > 0 ? (
                    selectedIncident.contributingFactors.map(
                      (factor, index) => (
                        <div
                          key={`${getIncidentId(selectedIncident)}-${index}`}
                          className="rounded-xl flex items-center gap-2.5 p-2.5 bg-[#050A10] border border-white/10 transition-all duration-300 hover:border-[#67E8F9]/30 text-xs"
                        >
                          <span className="w-1.5 h-1.5 bg-[#67E8F9] shrink-0" />

                          <span className="text-[#F4F7FA] font-sans">
                            {factor}
                          </span>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="p-3 border border-white/10 text-xs font-mono text-[#A7B0BA]">
                      No contributing factors recorded.
                    </div>
                  )}
                </div>
              </div>

              {selectedUser && (
                <div className="rounded-xl p-4 bg-[#050A10] border border-white/10 space-y-3 transition-all duration-300 hover:border-[#67E8F9]/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isUserFrozen(selectedUser) ? (
                        <UserX className="w-4 h-4 text-red-400" />
                      ) : (
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                      )}

                      <h4 className="font-sans text-sm font-semibold text-[#67E8F9] uppercase tracking-wider">
                        Employee Account Control
                      </h4>
                    </div>

                    <span
                      className={`text-[11px] px-2 py-0.5 border font-mono ${
                        isUserFrozen(selectedUser)
                          ? "border-red-500/50 text-red-400 bg-red-500/10"
                          : "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                      }`}
                    >
                      {isUserFrozen(selectedUser) ? "FROZEN" : "ACTIVE"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] uppercase font-mono text-[#A7B0BA] block">
                        Employee
                      </span>

                      <span className="text-xs font-sans text-[#F4F7FA]">
                        {selectedUser.name || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] uppercase font-mono text-[#A7B0BA] block">
                        Account
                      </span>

                      <span className="text-xs font-mono text-[#F4F7FA]">
                        {selectedUser.email ||
                          selectedUser.employeeId ||
                          selectedUser.id ||
                          selectedUser._id ||
                          "—"}
                      </span>
                    </div>
                  </div>

                  {typeof selectedIncident.riskScore === "number" &&
                    ['HIGH','CRITICAL'].includes(selectedIncident.severity) && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/50">
                        <div className="text-[11px] font-mono text-red-400 uppercase">
                          Recorded incident risk
                        </div>

                        <div className="text-xs text-[#A7B0BA] mt-1">
                          Current incident risk score:{" "}
                          <strong className="text-red-400">
                            {selectedIncident.riskScore}
                            /100
                          </strong>
                        </div>
                      </div>
                    )}

                  <div className="flex gap-3">
                    {isUserFrozen(selectedUser) ? (
                      <button
                        onClick={() =>
                          handleUnfreezeUser(
                            selectedUser.id || selectedUser._id,
                          )
                        }
                        disabled={
                          !isAuthorized ||
                          freezingUserId ===
                            (selectedUser.id || selectedUser._id)
                        }
                        className="flex-1 rounded-xl py-2.5 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 text-xs font-mono font-bold tracking-wider cursor-pointer disabled:opacity-50 transition-all duration-300 hover:-translate-y-0.5"
                      >
                        {freezingUserId ===
                        (selectedUser.id || selectedUser._id)
                          ? "UNFREEZING..."
                          : "UNFREEZE ACCOUNT"}
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          handleFreezeUser(selectedUser.id || selectedUser._id)
                        }
                        disabled={
                          !isAuthorized ||
                          freezingUserId ===
                            (selectedUser.id || selectedUser._id)
                        }
                        className="flex-1 rounded-xl py-2.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs font-mono font-bold tracking-wider cursor-pointer disabled:opacity-50 transition-all duration-300 hover:-translate-y-0.5"
                      >
                        {freezingUserId ===
                        (selectedUser.id || selectedUser._id)
                          ? "FREEZING..."
                          : "FREEZE ACCOUNT"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl p-4 bg-[#050A10] border border-white/10 space-y-2 transition-all duration-300 hover:border-[#67E8F9]/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#67E8F9]" />

                    <h4 className="font-sans text-sm font-semibold text-[#67E8F9] uppercase tracking-wider">
                      Gemini Threat Forensics
                    </h4>
                  </div>

                  <button
                    onClick={() =>
                      handleGenerateAiExplanation(
                        getIncidentId(selectedIncident),
                      )
                    }
                    disabled={generatingAi}
                    className="text-xs font-mono text-[#67E8F9] hover:text-[#F4F7FA] underline disabled:opacity-50 cursor-pointer"
                  >
                    {generatingAi ? "ANALYZING..." : "REFRESH AI REPORT"}
                  </button>
                </div>

                <p className="text-xs text-[#A7B0BA] leading-relaxed whitespace-pre-line font-sans">
                  {selectedIncident.aiExplanation ||
                    "No AI forensic explanation has been generated for this incident."}
                </p>
              </div>

              <div className="rounded-xl p-4 bg-[#050A10] text-[#F4F7FA] border border-[#D4AF37]/30 space-y-3 shadow-[0_16px_45px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/50 hover:shadow-[0_20px_55px_rgba(0,0,0,0.26)]">
                <h4 className="font-semibold text-xs font-sans uppercase text-[#F4F7FA] tracking-wider">
                  SOC Analyst Resolution &amp; Remediation
                </h4>

                <textarea
                  rows={2}
                  aria-label="Resolution notes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Enter containment justification, mitigation notes, or adjustment reason..."
                  className="w-full rounded-xl bg-[#070C12] border border-white/10 p-3 text-sm text-[#F4F7FA] outline-none focus:border-[#67E8F9] resize-none font-sans transition-all duration-300"
                />

                <p className="text-xs text-[#A7B0BA]">Incident outcomes record the investigation. Resource approval and account restoration are separate actions.</p>
                <div className="flex gap-3">
                  <button disabled={!isAuthorized || resolving} onClick={() => handleResolveIncident(getIncidentId(selectedIncident), "APPROVED")} className="rounded-xl px-3 py-2 border border-emerald-600 text-emerald-300">Approve outcome</button>
                  <button disabled={!isAuthorized || resolving} onClick={() => handleResolveIncident(getIncidentId(selectedIncident), "REJECTED")} className="rounded-xl px-3 py-2 border border-red-600 text-red-300">Reject outcome</button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "UNDER_REVIEW",
                      )
                    }
                    disabled={resolving}
                    className="flex-1 rounded-xl py-2.5 px-3 bg-[#03070C] border border-white/10 text-amber-300 hover:bg-white/5 text-xs font-mono font-bold tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {resolving ? "PROCESSING..." : "MARK UNDER REVIEW"}
                  </button>

                  <button
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "RESOLVED",
                      )
                    }
                    disabled={resolving}
                    className="flex-1 rounded-xl py-2.5 px-3 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#03070C] font-mono font-bold text-xs tracking-wider transition-all disabled:opacity-50 cursor-pointer border border-[#67E8F9]"
                  >
                    {resolving ? "PROCESSING..." : "RESOLVE & CLOSE"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`rounded-2xl border border-dashed p-12 text-center space-y-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/50 hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)] ${
                isDark
                  ? "bg-[#050A10] border-[#67E8F9]/25 text-[#A7B0BA]"
                  : "bg-[#050A10] border-white/10 text-[#A7B0BA] shadow-sm"
              }`}
            >
              <AlertOctagon className="w-10 h-10 mx-auto text-[#67E8F9]/60" />

              <p className="font-sans text-xl text-current">
                Select an Incident to Investigate
              </p>

              <p className="text-xs text-[#A7B0BA] font-sans max-w-sm mx-auto">
                Select an incident from the queue to inspect its telemetry, ML
                scores, XAI explanation, AI forensic analysis, and account
                containment state.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
