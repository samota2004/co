import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  X,
  ShieldAlert,
  Lock,
  Unlock,
  UserRound,
  Laptop,
  Clock,
  RefreshCw,
  Radar,
} from "lucide-react";
import {requestApi} from '../services/api.js';
import {confirmAccountAction} from '../services/confirm-account-action.js';

const normalizeValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const getIncidentId = (incident) =>
  incident?.id || incident?.incidentId || incident?._id || "";

const getIncidentTitle = (incident) =>
  incident?.title ||
  incident?.eventType ||
  incident?.type ||
  "Security Incident";

const getUserDepartment = (user) =>
  user?.departmentName || user?.department || user?.departmentCode || "";

const getUserStatus = (user) =>
  user?.status ||
  user?.accountStatus ||
  (user?.isFrozen || user?.accountFrozen ? "FROZEN" : "ACTIVE");

const getUserRiskScore = (user) =>
  user?.riskScore ?? user?.currentRiskScore ?? null;

const getUserRiskLevel = (user) =>
  user?.riskLevel || user?.currentRiskLevel || "";

const getUserTrustScore = (user) =>
  user?.trustScore ?? user?.currentTrustScore ?? null;

export const AlertsPage = ({
  users = [],
  incidents = [],
  currentUser,
  onRefreshData,
  onSelectUser,
  onSelectIncident,
}) => {

  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notificationPermission,setNotificationPermission]=useState(()=>typeof window!=='undefined'&&'Notification' in window?Notification.permission:'unsupported');
  const [investigatingId,setInvestigatingId]=useState(null);
  useEffect(() => {
    if (!selectedAlert) return;
    const previous = document.activeElement;
    document.querySelector('[aria-label="Close alert details"]')?.focus();
    const close = event => { if (event.key === 'Escape') setSelectedAlert(null); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); previous?.focus?.(); };
  }, [selectedAlert?.id]);

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
    });

    return map;
  }, [users]);

  const getIncidentUser = (incident) => {
    if (!incident) {
      return null;
    }

    const userId = incident.userId;

    if (userId !== undefined && userId !== null) {
      const user =
        userMap.get(String(userId)) ||
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

  const alerts = useMemo(() => {
    return incidents.filter(Boolean).map((incident) => {
      const user = getIncidentUser(incident);

      return {
        incident,
        user,
        id: getIncidentId(incident),
        severity: incident.severity || "UNKNOWN",
        type: getIncidentTitle(incident),
        employeeName: user?.name || incident.user?.name || incident.userName || "Unknown Employee",
        employeeEmail: user?.email || incident.userEmail || "",
        employeeId: user?.employeeId || incident.employeeId || "",
        userId: incident.userId || user?.id || user?._id || "",
        department: getUserDepartment(user) || incident.userDepartment || "",
        device:
          incident.deviceName ||
          incident.deviceId ||
          incident.device ||
          "Unknown Device",
        riskScore: incident.riskScore ?? incident.risk ?? null,
        detectedAt:
          incident.detectedAt ||
          incident.createdAt ||
          incident.timestamp ||
          null,
        status: incident.status || "OPEN",
        details:
          incident.description ||
          incident.details ||
          "No incident description available.",
        recommendedAction: incident.recommendedAction || "",
        contributingFactors: Array.isArray(incident.contributingFactors)
          ? incident.contributingFactors
          : [],
        accountStatus: getUserStatus(user),
        riskLevel: getUserRiskLevel(user),
        userRiskScore: getUserRiskScore(user),
        trustScore: getUserTrustScore(user),
      };
    });
  }, [incidents, userMap]);

  const severityOptions = useMemo(() => {
    const values = new Set();

    incidents.forEach((incident) => {
      if (incident?.severity) {
        values.add(String(incident.severity).toUpperCase());
      }
    });

    ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach((value) => {
      values.add(value);
    });

    return Array.from(values);
  }, [incidents]);

  const statusOptions = useMemo(() => {
    const values = new Set();

    incidents.forEach((incident) => {
      if (incident?.status) {
        values.add(String(incident.status).toUpperCase());
      }
    });

    ["OPEN", "UNDER_REVIEW", "RESOLVED"].forEach((value) => {
      values.add(value);
    });

    return Array.from(values);
  }, [incidents]);

  const filteredAlerts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return alerts.filter((alert) => {
      const searchableValues = [
        alert.id,
        alert.type,
        alert.employeeName,
        alert.employeeEmail,
        alert.employeeId,
        alert.department,
        alert.device,
        alert.severity,
        alert.status,
        alert.details,
        alert.recommendedAction,
      ];

      const matchesSearch =
        !query ||
        searchableValues.some((value) =>
          normalizeValue(value).toLowerCase().includes(query),
        );

      const matchesSeverity =
        severityFilter === "ALL" ||
        String(alert.severity).toUpperCase() === severityFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        String(alert.status).toUpperCase() === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter]);

  const totalCount = alerts.length;

  const criticalCount = alerts.filter(
    (alert) =>
      String(alert.severity).toUpperCase() === "CRITICAL" &&
      String(alert.status).toUpperCase() !== "RESOLVED",
  ).length;

  const openCount = alerts.filter(
    (alert) => String(alert.status).toUpperCase() === "OPEN",
  ).length;

  const unresolvedCount = alerts.filter(
    (alert) => String(alert.status).toUpperCase() !== "RESOLVED",
  ).length;

  const getSeverityStyle = (severity) => {
    switch (String(severity).toUpperCase()) {
      case "CRITICAL":
        return "border-red-500 text-red-400 bg-red-500/10";
      case "HIGH":
        return "border-orange-500 text-orange-400 bg-orange-500/10";
      case "MEDIUM":
        return "border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10";
      case "LOW":
        return "border-emerald-500 text-emerald-400 bg-emerald-500/10";
      default:
        return "border-gray-500 text-gray-400 bg-gray-500/10";
    }
  };

  const getStatusStyle = (status) => {
    switch (String(status).toUpperCase()) {
      case "OPEN":
        return "border-red-500 text-red-400 bg-red-500/10";
      case "UNDER_REVIEW":
        return "border-orange-500 text-orange-400 bg-orange-500/10";
      case "RESOLVED":
        return "border-emerald-500 text-emerald-400 bg-emerald-500/10";
      default:
        return "border-gray-500 text-gray-400 bg-gray-500/10";
    }
  };

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  };

  const handleRefresh = async () => {
    if (!onRefreshData) {
      return;
    }

    try {
      setRefreshing(true);
      await onRefreshData();
    } catch (error) {
      console.error("Failed to refresh alerts:", error);
      setActionError(error.message || "Failed to refresh alerts.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleFreeze = async (userId) => {
    if (!userId || !isAuthorized) {
      return;
    }
    const reason=confirmAccountAction('freeze',selectedAlert?.userName||'this employee');if(!reason)return;

    try {
      setActionError("");
      setUpdatingUserId(userId);

      const data = await requestApi(`/api/users/${encodeURIComponent(userId)}/freeze`, {
        method: "POST",
        body: {
          reason,
          source: "ALERT_RESPONSE",
        },
      });

      if (onRefreshData) {
        await onRefreshData();
      }

      setSelectedAlert((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          accountStatus:
            data?.user?.status || data?.user?.accountStatus || "FROZEN",
        };
      });
    } catch (error) {
      console.error("Failed to freeze user account:", error);

      setActionError(error.message || "Failed to freeze user account.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleUnfreeze = async (userId) => {
    if (!userId || !isAuthorized) {
      return;
    }
    const reason=confirmAccountAction('unfreeze',selectedAlert?.userName||'this employee');if(!reason)return;

    try {
      setActionError("");
      setUpdatingUserId(userId);

      const data = await requestApi(`/api/users/${encodeURIComponent(userId)}/unfreeze`, {method:"POST",body:{reason}});

      if (onRefreshData) {
        await onRefreshData();
      }

      setSelectedAlert((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          accountStatus:
            data?.user?.status || data?.user?.accountStatus || "ACTIVE",
        };
      });
    } catch (error) {
      console.error("Failed to unfreeze user account:", error);

      setActionError(error.message || "Failed to unfreeze user account.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleOpenAlert = (alert) => {
    setActionError("");
    setSelectedAlert(alert);


  };

  const enableNotifications=async()=>{if(!('Notification' in window)){setNotificationPermission('unsupported');return;}const permission=await Notification.requestPermission();setNotificationPermission(permission);};
  const acknowledgeAlert=async alert=>{const id=getIncidentId(alert);if(!id)return;setActionError('');setInvestigatingId(id);try{const result=await requestApi(`/api/incidents/${encodeURIComponent(id)}`,{method:'PATCH',body:{status:'INVESTIGATING',notes:'Acknowledged from the security alert inbox.'}});setSelectedAlert(current=>current?{...current,...result.incident,status:'INVESTIGATING'}:current);await onRefreshData?.();}catch(error){setActionError(error.message||'Unable to acknowledge this incident.');}finally{setInvestigatingId(null);}};

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">
      <section className="console-hero group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />
          <div className="absolute right-0 top-0 h-full w-[52%] bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.09),transparent_48%)]" />
        </div>
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="pointer-events-none absolute right-10 top-1/2 hidden h-52 w-[52%] -translate-y-1/2 lg:block">
          <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />
          <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/25" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#67E8F9]/55 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.12)] flex items-center justify-center">
            <Radar className="h-9 w-9 text-[#67E8F9]" />
          </div>
          <div className="absolute left-[24%] top-[28%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          <div className="absolute right-[22%] top-[25%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.85)]" />
          <div className="absolute bottom-[24%] left-[30%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          <div className="absolute bottom-[20%] right-[28%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.85)]" />
          <div className="absolute left-1/2 top-1/2 h-px w-48 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#67E8F9]/35 to-transparent" />
          <div className="absolute left-1/2 top-1/2 h-48 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-[#67E8F9]/25 to-transparent" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-lg border border-[#67E8F9]/20 bg-[#050A10]/85 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#7F8A96]">
            LIVE TRIAGE
          </div>
        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[74%]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />
                SOC Alert Inbox
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">Real-Time Threat Triage</span>
            </div>
            <h1 className="mt-3 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Security Alerts &amp; Behavioral
              <span className="block text-[#67E8F9]">Warnings</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Security alerts are generated dynamically from persisted incident records and current employee risk state.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#67E8F9]">Threat Triage</span>
              <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#D4AF37]">Behavioral Risk</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">{unresolvedCount} Active</span>
              <button type="button" onClick={enableNotifications} disabled={notificationPermission==='granted'||notificationPermission==='unsupported'} className="rounded-full border border-cyan-700/50 px-3 py-1.5 text-[11px] text-cyan-200 disabled:opacity-50">{notificationPermission==='granted'?'Browser notifications enabled':notificationPermission==='denied'?'Browser notifications blocked':notificationPermission==='unsupported'?'Notifications unavailable':'Enable browser notifications'}</button>
            </div>
          </div>

          <div className="absolute bottom-7 right-7 hidden items-center gap-3 lg:flex">
            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#070C12]/90 px-4 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#7F8A96]">Active Unresolved</div>
              <div className="mt-1 text-lg font-medium text-[#D4AF37]">{unresolvedCount}</div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#67E8F9]/[0.06] px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-[#67E8F9] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/70 hover:bg-[#67E8F9]/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <div
        className="p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-4 items-center justify-between shadow-[0_14px_40px_rgba(0,0,0,0.14)] transition-all duration-300 hover:border-white/15 bg-[#050A10]"
      >
        <div className="relative w-full md:w-96">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search incident ID, employee, device..."
            className="w-full rounded-xl border border-white/10 bg-[#070C12] pl-10 pr-3 py-2.5 text-[14px] text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#59636E] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/15"
          />

          <Search className="w-4 h-4 text-[#67E8F9] absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">SEVERITY:</span>

            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#070C12] px-3 py-2 text-[13px] text-[#F4F7FA] outline-none transition-all duration-300 hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"
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
            <span className="text-gray-400">STATUS:</span>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#070C12] px-3 py-2 text-[13px] text-[#F4F7FA] outline-none transition-all duration-300 hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"
            >
              <option value="ALL">All Statuses</option>

              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <span className="px-3 py-1.5 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/5 text-[#D4AF37]">
            {totalCount} TOTAL
          </span>

          <span className="px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/5 text-red-400">
            {criticalCount} CRITICAL
          </span>

          <span className="px-3 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/5 text-orange-400">
            {openCount} OPEN
          </span>
        </div>
      </div>

      <div
        className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.16)] transition-all duration-300 hover:border-white/15 bg-[#050A10]"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead
              className="border-b border-white/10 bg-[#070C12] text-[12px] uppercase tracking-[0.16em] text-[#D4AF37]"
            >
              <tr>
                <th className="py-4 px-4 text-center">SEVERITY</th>

                <th className="py-4 px-4">INCIDENT</th>

                <th className="py-4 px-4">EMPLOYEE</th>

                <th className="py-4 px-4">DEVICE</th>

                <th className="py-4 px-4 text-center">RISK</th>

                <th className="py-4 px-4">DETECTED</th>

                <th className="py-4 px-4 text-center">ACCOUNT</th>

                <th className="py-4 px-4 text-center">STATUS</th>

                <th className="py-4 px-4 text-right">ACTION</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {filteredAlerts.length > 0 ? (
                filteredAlerts.map((alert) => (
                  <tr
                    key={alert.id || `${alert.type}-${alert.detectedAt}`}
                    className="hover:bg-[#67E8F9]/[0.05] hover:shadow-[inset_3px_0_0_#67E8F9] hover:text-[#F4F7FA] transition-all duration-300"
                  >
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block text-[12px] px-2 py-0.5 border font-bold ${getSeverityStyle(
                          alert.severity,
                        )}`}
                      >
                        {alert.severity}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span className="text-sm font-medium block text-white">
                        {alert.type}
                      </span>

                      <span className="text-[12px] text-gray-500">
                        {alert.id || "—"}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span className="text-sm block text-[#F4F7FA]">
                        {alert.employeeName}
                      </span>

                      <span className="text-[12px] text-gray-500 block">
                        {alert.employeeEmail || "—"}
                      </span>

                      <span className="text-[12px] text-gray-500">
                        {alert.department || "—"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-gray-400 text-[12px]">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-3.5 h-3.5" />
                        <span>{alert.device}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-sm font-semibold text-[#D4AF37]">
                        {alert.riskScore ?? "—"}
                      </span>

                      {alert.riskScore !== null &&
                        alert.riskScore !== undefined && (
                          <span className="text-[12px] text-gray-500">
                            /100
                          </span>
                        )}
                    </td>

                    <td className="py-3.5 px-4 text-gray-400 text-[12px]">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {formatDate(alert.detectedAt)}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span
                        className={`text-[12px] px-2 py-0.5 border font-semibold ${
                          alert.accountStatus === "FROZEN"
                            ? "border-red-500 text-red-400 bg-red-500/10"
                            : alert.accountStatus === "ACTIVE"
                              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                              : "border-gray-500 text-gray-400"
                        }`}
                      >
                        {alert.accountStatus || "UNKNOWN"}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span
                        className={`text-[12px] px-2 py-0.5 border font-semibold ${getStatusStyle(
                          alert.status,
                        )}`}
                      >
                        {alert.status}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleOpenAlert(alert)}
                        className="px-3.5 py-2 rounded-lg border border-[#67E8F9]/35 text-[#67E8F9] hover:bg-[#67E8F9]/10 hover:border-[#67E8F9]/60 hover:-translate-y-0.5 text-sm font-medium cursor-pointer transition-all duration-300"
                      >
                        REVIEW
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="py-14 text-center text-xs text-gray-500"
                  >
                    No incidents match the current criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAlert && (
        <div role="dialog" aria-label="Alert investigation" className="fixed inset-0 z-50 flex justify-end bg-[#03070C]/75 backdrop-blur-md">
          <div
            className="w-full max-w-xl h-full overflow-y-auto border-l border-[#67E8F9]/15 bg-[#03070C] p-6 text-[#F4F7FA] shadow-[-24px_0_80px_rgba(0,0,0,0.35)] sm:p-7"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <span className="text-[12px] font-mono tracking-[0.12em] text-[#67E8F9]">
                  INCIDENT INVESTIGATION
                </span>

                <h2 className="text-2xl font-medium mt-1 tracking-tight">
                  {selectedAlert.type}
                </h2>

                <span className="text-[12px] font-mono text-gray-500">
                  {selectedAlert.id || "—"}
                </span>
              </div>

              <button
                aria-label="Close alert details"
                onClick={() => setSelectedAlert(null)}
                className="w-10 h-10 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-[#67E8F9]/40 hover:bg-[#67E8F9]/5 cursor-pointer flex items-center justify-center transition-all duration-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 mt-6">
              <div className="flex flex-wrap gap-3">
                {selectedAlert.status!=='INVESTIGATING'&&selectedAlert.status!=='RESOLVED'&&<button disabled={investigatingId===getIncidentId(selectedAlert)} className="rounded-lg border border-amber-700 px-4 py-2 text-amber-200 disabled:opacity-50" onClick={()=>acknowledgeAlert(selectedAlert)}>{investigatingId===getIncidentId(selectedAlert)?'Acknowledging…':'Acknowledge & investigate'}</button>}
                <button className="rounded-lg border border-cyan-800 px-4 py-2 text-cyan-200" onClick={() => onSelectIncident?.(selectedAlert.id)}>Open incident</button>
                <button className="rounded-lg border border-slate-600 px-4 py-2" onClick={() => onSelectUser?.(selectedAlert.userId)}>Employee profile</button>
              </div>
              <div className="flex gap-2">
                <span
                  className={`px-2 py-1 border text-[12px] font-bold ${getSeverityStyle(
                    selectedAlert.severity,
                  )}`}
                >
                  {selectedAlert.severity}
                </span>

                <span
                  className={`px-2 py-1 border text-[12px] font-bold ${getStatusStyle(
                    selectedAlert.status,
                  )}`}
                >
                  {selectedAlert.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                  <span className="text-[12px] text-gray-500 block mb-1">
                    INCIDENT RISK
                  </span>

                  <span className="text-2xl font-bold text-[#D4AF37]">
                    {selectedAlert.riskScore ?? "—"}
                  </span>

                  {selectedAlert.riskScore !== null &&
                    selectedAlert.riskScore !== undefined && (
                      <span className="text-xs text-gray-500">/100</span>
                    )}
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                  <span className="text-[12px] text-gray-500 block mb-1">
                    ACCOUNT RISK
                  </span>

                  <span className="text-2xl font-bold text-[#D4AF37]">
                    {selectedAlert.userRiskScore ?? "—"}
                  </span>

                  {selectedAlert.userRiskScore !== null &&
                    selectedAlert.userRiskScore !== undefined && (
                      <span className="text-xs text-gray-500">/100</span>
                    )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] space-y-3 transition-all duration-300 hover:border-[#67E8F9]/25">
                <div className="flex items-center gap-2 text-[#D4AF37]">
                  <UserRound className="w-4 h-4" />

                  <span className="text-sm">EMPLOYEE</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 block">Name</span>

                    <span>{selectedAlert.employeeName || "—"}</span>
                  </div>

                  <div>
                    <span className="text-gray-500 block">Employee ID</span>

                    <span>{selectedAlert.employeeId || "—"}</span>
                  </div>

                  <div>
                    <span className="text-gray-500 block">Email</span>

                    <span>{selectedAlert.employeeEmail || "—"}</span>
                  </div>

                  <div>
                    <span className="text-gray-500 block">Department</span>

                    <span>{selectedAlert.department || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                <span className="text-[12px] text-[#D4AF37] font-mono block mb-3">
                  ACCOUNT SECURITY STATE
                </span>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-gray-500 block">
                      Current account status
                    </span>

                    <span
                      className={`text-sm font-semibold ${
                        selectedAlert.accountStatus === "FROZEN"
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {selectedAlert.accountStatus || "UNKNOWN"}
                    </span>
                  </div>

                  {selectedAlert.userId &&
                    isAuthorized &&
                    (selectedAlert.accountStatus === "FROZEN" ? (
                      <button
                        onClick={() => handleUnfreeze(selectedAlert.userId)}
                        disabled={updatingUserId === selectedAlert.userId}
                        className="px-4 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:-translate-y-0.5 text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all duration-300"
                      >
                        <Unlock className="w-4 h-4" />

                        {updatingUserId === selectedAlert.userId
                          ? "UNFREEZING..."
                          : "UNFREEZE ACCOUNT"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleFreeze(selectedAlert.userId)}
                        disabled={updatingUserId === selectedAlert.userId}
                        className="px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:-translate-y-0.5 text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all duration-300"
                      >
                        <Lock className="w-4 h-4" />

                        {updatingUserId === selectedAlert.userId
                          ? "FREEZING..."
                          : "FREEZE ACCOUNT"}
                      </button>
                    ))}
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm flex gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />

                  <span>{actionError}</span>
                </div>
              )}

              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                <span className="text-[12px] text-[#D4AF37] font-mono block mb-2">
                  INCIDENT DESCRIPTION
                </span>

                <p className="text-xs leading-relaxed text-gray-300">
                  {selectedAlert.details}
                </p>
              </div>

              {selectedAlert.recommendedAction && (
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                  <span className="text-[12px] text-[#D4AF37] font-mono block mb-2">
                    RECOMMENDED ACTION
                  </span>

                  <p className="text-xs">{selectedAlert.recommendedAction}</p>
                </div>
              )}

              {selectedAlert.contributingFactors.length > 0 && (
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.015] transition-all duration-300 hover:border-[#D4AF37]/30">
                  <span className="text-[12px] text-[#D4AF37] font-mono block mb-3">
                    CONTRIBUTING FACTORS
                  </span>

                  <div className="space-y-2">
                    {selectedAlert.contributingFactors.map((factor, index) => (
                      <div
                        key={`${selectedAlert.id}-${index}`}
                        className="p-2.5 rounded-lg border border-white/10 text-sm hover:border-[#D4AF37]/30 transition-all duration-300"
                      >
                        {factor}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 border border-[#D4AF37]/20 text-xs font-mono space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Detected</span>

                  <span>{formatDate(selectedAlert.detectedAt)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-500">Risk Level</span>

                  <span>{selectedAlert.riskLevel || "—"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-500">Trust Score</span>

                  <span>{selectedAlert.trustScore ?? "—"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-500">Device</span>

                  <span>{selectedAlert.device || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
