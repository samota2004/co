
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
  ShieldCheck,
  Activity,
  Clock3,
  Laptop,
  UserRound,
  Fingerprint,
  BrainCircuit,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

import { SeverityBadge, StatusBadge } from "../components/Badges";
import { requestApi } from "../services/api.js";
import { confirmAccountAction } from "../services/confirm-account-action.js";

const getIncidentId = (incident) =>
  incident?.id || incident?.incidentId || incident?._id || "";

const getIncidentEventType = (incident) =>
  incident?.eventType || incident?.title || incident?.type || "Incident";

const getIncidentUserId = (incident) =>
  incident?.userId || incident?.employeeId || "";

const getUserDepartment = (user) =>
  user?.department || user?.departmentName || user?.departmentCode || "";

const isUserFrozen = (user) => {
  if (!user) return false;

  return (
    user.isFrozen === true ||
    user.accountFrozen === true ||
    user.accountStatus === "FROZEN" ||
    user.status === "FROZEN"
  );
};

const normalizeText = (value) =>
  value === null || value === undefined ? "" : String(value);

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString();
};

const panelClass =
  "rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)]";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#03070C] px-3 py-2.5 text-sm text-[#F4F7FA] outline-none transition placeholder:text-[#59636E] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#67E8F9]/[0.06] px-4 py-2.5 text-xs font-semibold tracking-wider text-[#67E8F9] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/70 hover:bg-[#67E8F9]/[0.12] disabled:cursor-not-allowed disabled:opacity-40";

const goldButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/[0.07] px-4 py-2.5 text-xs font-semibold tracking-wider text-[#D4AF37] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/[0.13] disabled:cursor-not-allowed disabled:opacity-40";

const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-2.5 text-xs font-semibold tracking-wider text-red-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400/60 hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-40";

function SummaryCard({ label, value, icon: Icon, accent = "cyan" }) {
  const accentStyles = {
    cyan: {
      icon: "border-[#67E8F9]/20 bg-[#67E8F9]/[0.08] text-[#67E8F9]",
      value: "text-[#67E8F9]",
    },
    gold: {
      icon: "border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] text-[#D4AF37]",
      value: "text-[#D4AF37]",
    },
    red: {
      icon: "border-red-400/20 bg-red-400/[0.07] text-red-300",
      value: "text-red-300",
    },
  };

  const style = accentStyles[accent];

  return (
    <article
      className={`${panelClass} p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#070C12]`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#7F8A96]">{label}</p>
          <p
            className={`mt-3 text-3xl font-semibold tabular-nums ${style.value}`}
          >
            {value}
          </p>
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${style.icon}`}
        >
          <Icon size={20} />
        </div>
      </div>
    </article>
  );
}

function DetailSection({ title, icon: Icon, children, accent = "cyan" }) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#050A10] p-4 transition-all duration-200 hover:border-[#67E8F9]/20">
      <div
        className={`mb-4 flex items-center gap-2 ${
          accent === "gold" ? "text-[#D4AF37]" : "text-[#67E8F9]"
        }`}
      >
        <Icon size={16} />
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em]">
          {title}
        </h4>
      </div>

      {children}
    </section>
  );
}

function MetricCard({ label, value, suffix = "", accent = "cyan" }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#070C12] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/25">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.13em] text-[#7F8A96]">
        {label}
      </span>

      <span
        className={`text-xl font-semibold tabular-nums ${
          accent === "gold" ? "text-[#D4AF37]" : "text-[#67E8F9]"
        }`}
      >
        {value}
        {suffix && <span className="ml-1 text-xs text-[#7F8A96]">{suffix}</span>}
      </span>
    </div>
  );
}

export const IncidentsPage = ({
  incidents = [],
  users = [],
  currentUser,
  onRefreshData,
  onOpenCopilot,
  initialIncidentId,
}) => {
  const [selectedIncidentId, setSelectedIncidentId] = useState(
    initialIncidentId || null
  );

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

  const isAuthorized = [
    "SECURITY_ADMIN",
    "SYSTEM_ADMIN",
  ].includes(currentUser?.role || currentUser?.roleCode);

  const userMap = useMemo(() => {
    const map = new Map();

    users.forEach((user) => {
      if (!user) return;

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
    if (!incident) return null;

    const userId = getIncidentUserId(incident);

    if (userId) {
      const user =
        userMap.get(String(userId)) ||
        userMap.get(`employee:${String(userId).toLowerCase()}`) ||
        userMap.get(`email:${String(userId).toLowerCase()}`);

      if (user) return user;
    }

    if (incident.userEmail) {
      return (
        userMap.get(`email:${String(incident.userEmail).toLowerCase()}`) ||
        null
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

    ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach((value) =>
      values.add(value)
    );

    return Array.from(values);
  }, [incidents]);

  const statusOptions = useMemo(() => {
    const values = new Set();

    incidents.forEach((incident) => {
      if (incident?.status) {
        values.add(String(incident.status).toUpperCase());
      }
    });

    ["OPEN", "UNDER_REVIEW", "APPROVED", "REJECTED", "RESOLVED"].forEach(
      (value) => values.add(value)
    );

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
          normalizeText(value).toLowerCase().includes(query)
        );

      return matchesSeverity && matchesStatus && matchesSearch;
    });
  }, [incidents, userMap, filterSeverity, filterStatus, search]);

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) return null;

    return (
      incidents.find(
        (incident) =>
          String(getIncidentId(incident)) === String(selectedIncidentId)
      ) || null
    );
  }, [incidents, selectedIncidentId]);

  const selectedUser = useMemo(() => {
    if (!selectedIncident) return null;

    return getIncidentUser(selectedIncident);
  }, [selectedIncident, userMap]);

  const totalIncidents = incidents.length;

  const openCount = incidents.filter(
    (incident) => String(incident?.status || "").toUpperCase() === "OPEN"
  ).length;

  const criticalCount = incidents.filter(
    (incident) =>
      String(incident?.severity || "").toUpperCase() === "CRITICAL" &&
      String(incident?.status || "").toUpperCase() !== "RESOLVED"
  ).length;

  const highRiskUsers = useMemo(() => {
    const result = new Map();

    incidents.forEach((incident) => {
      const userId = getIncidentUserId(incident);

      const incidentRisk =
        typeof incident?.riskScore === "number"
          ? incident.riskScore
          : null;

      if (!userId || incidentRisk === null) return;

      if (
        !["HIGH", "VERY_HIGH", "CRITICAL"].includes(
          String(incident.severity).toUpperCase()
        )
      ) {
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
        !["HIGH", "VERY_HIGH", "CRITICAL"].includes(
          String(user.riskLevel || user.currentRiskLevel).toUpperCase()
        )
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
    if (!onRefreshData) return;

    try {
      setRefreshing(true);
      setFreezeError(null);
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
          String(getIncidentId(incident)) === String(selectedIncidentId)
      )
    ) {
      setSelectedIncidentId(null);
      setResolutionNotes("");
    }
  }, [incidents, selectedIncidentId]);

  useEffect(() => {
    if (initialIncidentId) {
      setSelectedIncidentId(initialIncidentId);
    }
  }, [initialIncidentId]);

  const handleExport = async (format) => {
    if (!isAuthorized) return;

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
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          errorData?.error?.message ||
            errorData?.message ||
            `Export failed with status ${response.status}`
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
    if (!incidentId) return;

    try {
      setGeneratingAi(true);
      setExportError(null);

      const response = await fetch(
        `/api/incidents/${encodeURIComponent(incidentId)}/ai-explain`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentUser?.id
              ? { "x-user-id": currentUser.id }
              : {}),
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            data?.message ||
            "Failed to generate AI explanation."
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
    if (!incidentId || !isAuthorized) return;

    try {
      setResolving(true);
      setFreezeError(null);

      const response = await fetch(
        `/api/incidents/${encodeURIComponent(incidentId)}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentUser?.id
              ? { "x-user-id": currentUser.id }
              : {}),
          },
          body: JSON.stringify({
            resolutionNotes,
            newStatus: status,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            data?.message ||
            "Failed to update incident."
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
    if (!userId || !isAuthorized) return;

    const targetUser =
      users.find(
        (user) =>
          String(user.id || user._id || user.employeeId) === String(userId)
      ) ||
      incidents
        .map((incident) => getIncidentUser(incident))
        .find(
          (user) =>
            String(user?.id || user?._id || user?.employeeId) ===
            String(userId)
        );

    const reason = confirmAccountAction(
      "freeze",
      targetUser?.name || "this employee"
    );

    if (!reason) return;

    try {
      setFreezeError(null);
      setFreezingUserId(userId);

      await requestApi(
        `/api/users/${encodeURIComponent(userId)}/freeze`,
        {
          method: "POST",
          body: { reason },
        }
      );

      await handleRefresh();
    } catch (error) {
      console.error("Failed to freeze user account:", error);
      setFreezeError(error.message || "Failed to freeze user account.");
    } finally {
      setFreezingUserId(null);
    }
  };

  const handleUnfreezeUser = async (userId) => {
    if (!userId || !isAuthorized) return;

    const targetUser =
      users.find(
        (user) =>
          String(user.id || user._id || user.employeeId) === String(userId)
      ) ||
      incidents
        .map((incident) => getIncidentUser(incident))
        .find(
          (user) =>
            String(user?.id || user?._id || user?.employeeId) ===
            String(userId)
        );

    const reason = confirmAccountAction(
      "unfreeze",
      targetUser?.name || "this employee"
    );

    if (!reason) return;

    try {
      setFreezeError(null);
      setFreezingUserId(userId);

      await requestApi(
        `/api/users/${encodeURIComponent(userId)}/unfreeze`,
        {
          method: "POST",
          body: { reason },
        }
      );

      await handleRefresh();
    } catch (error) {
      console.error("Failed to unfreeze user account:", error);
      setFreezeError(error.message || "Failed to unfreeze user account.");
    } finally {
      setFreezingUserId(null);
    }
  };

  const selectedUserId = selectedUser?.id || selectedUser?._id;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">

      {/* Page hero */}
      <section className="group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />
          <div className="absolute right-0 top-0 h-full w-[52%] bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.09),transparent_48%)]" />
        </div>

        <div className="pointer-events-none absolute right-8 top-1/2 hidden h-52 w-[48%] -translate-y-1/2 lg:block">
          <div className="absolute left-1/2 top-1/2 h-44 w-64 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-5 rotate-[18deg] rounded-[50%] border border-[#67E8F9]/20" />
            <div className="absolute inset-1 -rotate-[18deg] rounded-[50%] border border-[#D4AF37]/20" />
            <div className="absolute inset-0 rounded-[50%] border border-[#67E8F9]/10" />

            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/45 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.12)]">
              <ShieldAlert className="h-9 w-9 text-[#67E8F9]" />
            </div>

            <span className="absolute left-[18%] top-[28%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
            <span className="absolute right-[18%] top-[24%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.8)]" />
            <span className="absolute bottom-[22%] left-[26%] h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="absolute bottom-[25%] right-[24%] h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
          </div>
        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-full lg:max-w-[68%]">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />
                Security Operations
              </span>

              <span className="text-[12px] uppercase tracking-wider text-[#7F8A96]">
                Threat Containment &amp; Forensic Auditing
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.98] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Insider Threat
              <span className="block text-[#67E8F9]">Incident Queue</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
              Investigate recorded detections, review supporting evidence, and
              manage application account containment.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#67E8F9]">
                Incident Investigation
              </span>

              <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#D4AF37]">
                Account Containment
              </span>

              {!isAuthorized && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-400/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-300">
                  <Lock size={11} />
                  SOC Admin Required
                </span>
              )}
            </div>
          </div>

          <div className="absolute bottom-7 right-7 z-20 hidden w-[340px] grid-cols-2 gap-2.5 lg:grid">
            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#03070C]/80 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7F8A96]">
                Total incidents
              </span>
              <span className="mt-1 block text-lg font-semibold text-[#D4AF37]">
                {totalIncidents}
              </span>
            </div>

            <div className="rounded-xl border border-red-400/25 bg-[#03070C]/80 px-3 py-2.5">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7F8A96]">
                Critical unresolved
              </span>
              <span className="mt-1 block text-lg font-semibold text-red-300">
                {criticalCount}
              </span>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={goldButton}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={!isAuthorized || exporting !== null}
              className={primaryButton}
            >
              <FileCode size={14} />
              {exporting === "json" ? "Exporting..." : "Export JSON"}
            </button>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total incidents"
          value={totalIncidents}
          icon={Activity}
          accent="cyan"
        />

        <SummaryCard
          label="Critical unresolved"
          value={criticalCount}
          icon={ShieldAlert}
          accent="red"
        />

        <SummaryCard
          label="Open incidents"
          value={openCount}
          icon={Clock3}
          accent="gold"
        />

        <SummaryCard
          label="High-risk accounts"
          value={highRiskUsers.length}
          icon={UserX}
          accent="cyan"
        />
      </section>

      {/* Error messages */}
      {(exportError || freezeError) && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-300"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert size={17} className="mt-0.5 shrink-0" />
            <span>{exportError || freezeError}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setExportError(null);
              setFreezeError(null);
            }}
            aria-label="Dismiss error"
            className="rounded-lg p-1 text-red-300 transition hover:bg-red-400/10 hover:text-white"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* Filters and exports */}
      <section className={`${panelClass} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search incidents"
              placeholder="Search incident ID, user, event..."
              className={`${fieldClass} pl-10`}
            />

            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
              Severity
              <select
                aria-label="Incident severity"
                value={filterSeverity}
                onChange={(event) => setFilterSeverity(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#03070C] px-3 py-2.5 text-xs text-[#F4F7FA] outline-none transition hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"
              >
                <option value="ALL">All Severities</option>
                {severityOptions.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
              Status
              <select
                aria-label="Incident status"
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#03070C] px-3 py-2.5 text-xs text-[#F4F7FA] outline-none transition hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"
              >
                <option value="ALL">All Statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <span className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-3 py-2 text-[10px] font-semibold tracking-wider text-[#D4AF37]">
              {totalIncidents} TOTAL
            </span>

            <span className="rounded-lg border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-[10px] font-semibold tracking-wider text-red-300">
              {criticalCount} CRITICAL
            </span>

            <span className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-3 py-2 text-[10px] font-semibold tracking-wider text-[#D4AF37]">
              {openCount} OPEN
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <p className="text-xs text-[#7F8A96]">
            Showing{" "}
            <span className="font-semibold text-[#F4F7FA]">
              {filteredIncidents.length}
            </span>{" "}
            of {totalIncidents} incidents
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={goldButton}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={!isAuthorized || exporting !== null}
              className={primaryButton}
            >
              <FileCode size={14} />
              {exporting === "json" ? "Exporting..." : "Export JSON"}
            </button>

            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={!isAuthorized || exporting !== null}
              className={goldButton}
            >
              <FileSpreadsheet size={14} />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </div>
      </section>

      {/* High-risk account containment */}
      {highRiskUsers.length > 0 && (
        <section className="rounded-2xl border border-red-400/25 bg-[#050A10] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/[0.07] text-red-300">
                <UserX size={19} />
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-red-300">
                  High-Risk Account Containment
                </h2>
                <p className="mt-1 text-xs text-[#7F8A96]">
                  Accounts associated with high, very high, or critical risk.
                </p>
              </div>
            </div>

            <span className="rounded-lg border border-red-400/25 bg-red-400/[0.06] px-3 py-1.5 text-[10px] font-semibold text-red-300">
              {highRiskUsers.length} HIGH-RISK RECORDS
            </span>
          </div>

          <div className="space-y-2">
            {highRiskUsers.map((item) => {
              const user =
                userMap.get(String(item.userId)) ||
                userMap.get(
                  `employee:${String(item.userId).toLowerCase()}`
                );

              if (!user) return null;

              const frozen = isUserFrozen(user);
              const actualUserId = user.id || user._id;
              const processing =
                freezingUserId === actualUserId ||
                freezingUserId === item.userId;

              return (
                <div
                  key={String(actualUserId || item.userId)}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#03070C] p-4 transition-all duration-200 hover:border-[#67E8F9]/20 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#F4F7FA]">
                      {user.name || "Unknown User"}
                    </div>

                    <div className="mt-1 break-all text-[11px] text-[#7F8A96]">
                      {user.email || user.employeeId || actualUserId}
                    </div>

                    <div className="mt-2 text-xs text-[#A7B0BA]">
                      Risk Score:{" "}
                      <strong className="text-red-300">
                        {item.riskScore}/100
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider ${
                        frozen
                          ? "border-red-400/30 bg-red-400/[0.07] text-red-300"
                          : "border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] text-[#D4AF37]"
                      }`}
                    >
                      {frozen ? "ACCOUNT FROZEN" : "HIGH RISK"}
                    </span>

                    {frozen ? (
                      <button
                        type="button"
                        onClick={() => handleUnfreezeUser(actualUserId)}
                        disabled={!isAuthorized || processing}
                        className={primaryButton}
                      >
                        <UserCheck size={14} />
                        {processing ? "PROCESSING..." : "UNFREEZE"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleFreezeUser(actualUserId)}
                        disabled={!isAuthorized || processing}
                        className={dangerButton}
                      >
                        <UserX size={14} />
                        {processing ? "PROCESSING..." : "FREEZE ACCOUNT"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Incident queue and detail panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* Left: incident queue */}
        <section className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-semibold text-[#F4F7FA]">
                Incident queue
              </h2>
              <p className="mt-1 text-[11px] text-[#7F8A96]">
                Select a record to inspect its details.
              </p>
            </div>

            <span className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] px-2.5 py-1 text-[10px] text-[#67E8F9]">
              {filteredIncidents.length} RECORDS
            </span>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className={`${panelClass} p-10 text-center`}>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#7F8A96]">
                <Search size={21} />
              </div>

              <p className="mt-4 text-sm font-medium text-[#C5CDD5]">
                No incidents found
              </p>

              <p className="mt-1 text-xs text-[#7F8A96]">
                No incidents match the current search and filter criteria.
              </p>
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
                <button
                  type="button"
                  key={
                    incidentId ||
                    `${getIncidentEventType(incident)}-${incident.detectedAt}`
                  }
                  onClick={() => setSelectedIncidentId(incidentId)}
                  className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.24)] ${
                    isSelected
                      ? "border-[#D4AF37]/65 bg-[#070C12] shadow-[0_0_25px_rgba(212,175,55,0.07)]"
                      : "border-white/10 bg-[#050A10] hover:border-[#67E8F9]/40 hover:bg-[#070C12]"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute inset-y-0 left-0 w-1 bg-[#D4AF37]" />
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={`truncate font-mono text-xs font-bold ${
                          isSelected ? "text-[#D4AF37]" : "text-[#C5CDD5]"
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

                  <div className="mt-3 flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        isSelected
                          ? "border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] text-[#D4AF37]"
                          : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]"
                      }`}
                    >
                      <AlertOctagon size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#F4F7FA]">
                        {user?.name || incident.userName || "Unknown User"}
                      </div>

                      {userDepartment && (
                        <div className="mt-1 truncate text-[10px] text-[#7F8A96]">
                          {userDepartment}
                        </div>
                      )}

                      <p className="mt-2 truncate text-xs text-[#A7B0BA]">
                        {getIncidentEventType(incident)}
                      </p>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`mt-1 shrink-0 transition ${
                        isSelected
                          ? "text-[#D4AF37]"
                          : "text-[#59636E] group-hover:text-[#67E8F9]"
                      }`}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-[10px] text-[#7F8A96]">
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={12} />
                      {formatDate(incident.detectedAt)}
                    </span>

                    {incidentRisk !== null && (
                      <span className="font-semibold text-[#D4AF37]">
                        Risk Index: {incidentRisk}/100
                      </span>
                    )}
                  </div>

                  {incident.recommendedAction && (
                    <div className="mt-2 truncate text-[10px] text-[#67E8F9]">
                      Recommended: {incident.recommendedAction}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </section>

        {/* Right: selected incident */}
        <section className="min-w-0 lg:col-span-7">
          {selectedIncident ? (
            <div className={`${panelClass} relative space-y-5 overflow-hidden p-5 sm:p-7`}>
              <div className="absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/60 to-transparent" />

              {/* Detail header */}
              <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#67E8F9]">
                      {getIncidentId(selectedIncident) || "NO-ID"}
                    </span>

                    {selectedIncident.severity && (
                      <SeverityBadge severity={selectedIncident.severity} />
                    )}

                    {selectedIncident.status && (
                      <StatusBadge status={selectedIncident.status} />
                    )}
                  </div>

                  <h3 className="break-words text-xl font-semibold text-[#F4F7FA]">
                    {getIncidentEventType(selectedIncident)}
                    {selectedUser?.name ? ` — ${selectedUser.name}` : ""}
                  </h3>

                  <p className="mt-2 text-xs text-[#7F8A96]">
                    Detected: {formatDate(selectedIncident.detectedAt)}
                  </p>
                </div>

                {onOpenCopilot && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCopilot({
                        incidentId: getIncidentId(selectedIncident),
                        userId: getIncidentUserId(selectedIncident),
                      })
                    }
                    className={primaryButton}
                  >
                    <Sparkles size={14} />
                    Ask Copilot
                  </button>
                )}
              </div>

              {/* Incident metrics */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {typeof selectedIncident.riskScore === "number" && (
                  <MetricCard
                    label="Risk index"
                    value={selectedIncident.riskScore}
                    suffix="/100"
                    accent="gold"
                  />
                )}

                {selectedIncident.recommendedAction && (
                  <div className="rounded-xl border border-white/[0.08] bg-[#070C12] p-3">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
                      Action enforced
                    </span>
                    <span className="break-words text-xs font-semibold text-[#F4F7FA]">
                      {selectedIncident.recommendedAction}
                    </span>
                  </div>
                )}

                {selectedIncident.adminActionTaken && (
                  <div className="rounded-xl border border-white/[0.08] bg-[#070C12] p-3">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
                      Containment
                    </span>
                    <span className="break-words text-xs font-semibold text-[#F4F7FA]">
                      {selectedIncident.adminActionTaken}
                    </span>
                  </div>
                )}

                {typeof selectedIncident.supervisedProbability === "number" && (
                  <MetricCard
                    label="Supervised ML"
                    value={(selectedIncident.supervisedProbability * 100).toFixed(1)}
                    suffix="%"
                  />
                )}

                {typeof selectedIncident.isolationForestScore === "number" && (
                  <MetricCard
                    label="Isolation Forest"
                    value={(selectedIncident.isolationForestScore * 100).toFixed(1)}
                    suffix="%"
                    accent="gold"
                  />
                )}
              </div>

              {/* XAI explanation */}
              {selectedIncident.xaiExplanation && (
                <section className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] p-4">
                  <div className="mb-2 flex items-center gap-2 text-[#D4AF37]">
                    <BrainCircuit size={16} />
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em]">
                      XAI Feature Attribution Rationale
                    </h4>
                  </div>

                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#C5CDD5]">
                    {selectedIncident.xaiExplanation}
                  </p>
                </section>
              )}

              {/* Behavioral signals */}
              <DetailSection
                title="Contributing behavioral telemetry signals"
                icon={Activity}
              >
                {Array.isArray(selectedIncident.contributingFactors) &&
                selectedIncident.contributingFactors.length > 0 ? (
                  <div className="space-y-2">
                    {selectedIncident.contributingFactors.map(
                      (factor, index) => (
                        <div
                          key={`${getIncidentId(selectedIncident)}-${index}`}
                          className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-[#03070C]/70 p-3 transition hover:border-[#67E8F9]/25"
                        >
                          <span className="mt-0.5 text-[10px] font-semibold text-[#D4AF37]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <span className="break-words text-xs leading-5 text-[#C5CDD5]">
                            {factor}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-white/[0.07] bg-[#03070C]/70 p-3 text-xs text-[#7F8A96]">
                    No contributing factors recorded.
                  </p>
                )}
              </DetailSection>

              {/* Employee account control */}
              {selectedUser && (
                <DetailSection
                  title="Employee account control"
                  icon={Fingerprint}
                  accent="gold"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                          isUserFrozen(selectedUser)
                            ? "border-red-400/25 bg-red-400/[0.07] text-red-300"
                            : "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]"
                        }`}
                      >
                        {isUserFrozen(selectedUser) ? (
                          <UserX size={18} />
                        ) : (
                          <UserCheck size={18} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F4F7FA]">
                          {selectedUser.name || "Unknown Employee"}
                        </p>
                        <p className="mt-1 break-all text-[11px] text-[#7F8A96]">
                          {selectedUser.email ||
                            selectedUser.employeeId ||
                            selectedUser.id ||
                            selectedUser._id ||
                            "—"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-lg border px-3 py-1.5 text-[10px] font-semibold tracking-wider ${
                        isUserFrozen(selectedUser)
                          ? "border-red-400/30 bg-red-400/[0.07] text-red-300"
                          : "border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] text-[#67E8F9]"
                      }`}
                    >
                      {isUserFrozen(selectedUser) ? "FROZEN" : "ACTIVE"}
                    </span>
                  </div>

                  {typeof selectedIncident.riskScore === "number" &&
                    ["HIGH", "CRITICAL"].includes(
                      String(selectedIncident.severity).toUpperCase()
                    ) && (
                      <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/[0.04] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-red-300">
                          Recorded incident risk
                        </div>
                        <p className="mt-1 text-xs text-[#A7B0BA]">
                          Current incident risk score:{" "}
                          <strong className="text-red-300">
                            {selectedIncident.riskScore}/100
                          </strong>
                        </p>
                      </div>
                    )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isUserFrozen(selectedUser) ? (
                      <button
                        type="button"
                        onClick={() => handleUnfreezeUser(selectedUserId)}
                        disabled={
                          !isAuthorized ||
                          freezingUserId === selectedUserId
                        }
                        className={primaryButton}
                      >
                        <UserCheck size={14} />
                        {freezingUserId === selectedUserId
                          ? "UNFREEZING..."
                          : "UNFREEZE ACCOUNT"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleFreezeUser(selectedUserId)}
                        disabled={
                          !isAuthorized ||
                          freezingUserId === selectedUserId
                        }
                        className={dangerButton}
                      >
                        <UserX size={14} />
                        {freezingUserId === selectedUserId
                          ? "FREEZING..."
                          : "FREEZE ACCOUNT"}
                      </button>
                    )}
                  </div>

                  {!isAuthorized && (
                    <p className="mt-3 text-[11px] leading-5 text-[#7F8A96]">
                      Account containment actions are available only to
                      authorized security administrators.
                    </p>
                  )}
                </DetailSection>
              )}

              {/* AI forensic explanation */}
              <DetailSection
                title="Gemini threat forensics"
                icon={BrainCircuit}
                accent="gold"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#7F8A96]">
                    AI-generated forensic explanation for this incident.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      handleGenerateAiExplanation(
                        getIncidentId(selectedIncident)
                      )
                    }
                    disabled={generatingAi}
                    className="text-xs font-semibold text-[#67E8F9] underline decoration-[#67E8F9]/40 underline-offset-4 transition hover:text-[#D4AF37] disabled:opacity-50"
                  >
                    {generatingAi ? "ANALYZING..." : "REFRESH AI REPORT"}
                  </button>
                </div>

                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#C5CDD5]">
                  {selectedIncident.aiExplanation ||
                    "No AI forensic explanation has been generated for this incident."}
                </p>
              </DetailSection>

              {/* SOC resolution */}
              <section className="rounded-xl border border-[#D4AF37]/25 bg-[#050A10] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-[#D4AF37]">
                  <ShieldCheck size={17} />
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em]">
                    SOC Analyst Resolution &amp; Remediation
                  </h4>
                </div>

                <textarea
                  rows={3}
                  aria-label="Resolution notes"
                  value={resolutionNotes}
                  onChange={(event) =>
                    setResolutionNotes(event.target.value)
                  }
                  placeholder="Enter containment justification, mitigation notes, or adjustment reason..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#03070C] p-3 text-sm text-[#F4F7FA] outline-none transition placeholder:text-[#59636E] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10"
                />

                <p className="mt-3 text-[11px] leading-5 text-[#7F8A96]">
                  Incident outcomes record the investigation. Resource approval
                  and account restoration are separate actions.
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={!isAuthorized || resolving}
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "APPROVED"
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/[0.05] px-3 py-2.5 text-xs font-semibold text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.1] disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} />
                    Approve outcome
                  </button>

                  <button
                    type="button"
                    disabled={!isAuthorized || resolving}
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "REJECTED"
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/[0.05] px-3 py-2.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/[0.1] disabled:opacity-40"
                  >
                    <XCircle size={14} />
                    Reject outcome
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "UNDER_REVIEW"
                      )
                    }
                    disabled={!isAuthorized || resolving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] px-3 py-2.5 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/[0.1] disabled:opacity-40"
                  >
                    <AlertTriangle size={14} />
                    Mark under review
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleResolveIncident(
                        getIncidentId(selectedIncident),
                        "RESOLVED"
                      )
                    }
                    disabled={!isAuthorized || resolving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-3 py-2.5 text-xs font-semibold text-[#03070C] transition hover:bg-transparent hover:text-[#67E8F9] disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} />
                    {resolving ? "PROCESSING..." : "Resolve & close"}
                  </button>
                </div>

                {!isAuthorized && (
                  <p className="mt-3 text-[11px] text-[#7F8A96]">
                    You need Security Admin or System Admin access to update
                    incident outcomes.
                  </p>
                )}
              </section>

              {/* Incident metadata */}
              <DetailSection
                title="Incident metadata"
                icon={FileSearch}
                accent="gold"
              >
                <div className="space-y-3 text-xs">
                  {[
                    {
                      label: "Incident ID",
                      value: getIncidentId(selectedIncident) || "—",
                    },
                    {
                      label: "Event type",
                      value: getIncidentEventType(selectedIncident),
                    },
                    {
                      label: "Detected at",
                      value: formatDate(selectedIncident.detectedAt),
                    },
                    {
                      label: "Device",
                      value:
                        selectedIncident.deviceName ||
                        selectedIncident.deviceId ||
                        selectedIncident.device ||
                        "—",
                    },
                    {
                      label: "Recommended action",
                      value: selectedIncident.recommendedAction || "—",
                    },
                    {
                      label: "Admin action taken",
                      value: selectedIncident.adminActionTaken || "—",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"
                    >
                      <span className="shrink-0 text-[#7F8A96]">
                        {item.label}
                      </span>
                      <span className="break-words text-right font-medium text-[#C5CDD5]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            </div>
          ) : (
            <div
              className={`${panelClass} flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
                <AlertOctagon size={30} />
              </div>

              <h3 className="mt-5 text-xl font-medium text-[#F4F7FA]">
                Select an Incident to Investigate
              </h3>

              <p className="mt-2 max-w-sm text-xs leading-6 text-[#7F8A96]">
                Select an incident from the queue to inspect its telemetry, ML
                scores, XAI explanation, AI forensic analysis, and account
                containment state.
              </p>

              <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-[#D4AF37]">
                <Laptop size={13} />
                Incident investigation workspace
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
