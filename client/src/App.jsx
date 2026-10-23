import { PageErrorBoundary } from "./components/PageErrorBoundary";
import React, { useState, useEffect, useCallback } from "react";
import {refreshSession} from './services/session.js';
import {requestApi} from './services/api.js';
import {ResourcesPage} from './pages/ResourcesPage.jsx';
import {AccessRequestsPage} from './pages/AccessRequestsPage.jsx';
import {SecurityProfilePage} from './pages/SecurityProfilePage.jsx';

import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CopilotModal } from "./components/CopilotModal";

import { ShieldAlert, CheckCircle2, AlertTriangle, X } from "lucide-react";

import ResetPasswordPage from "./pages/ResetPasswordPage";

import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";

import { DashboardPage } from "./pages/DashboardPage";
import { AdminManagementPage } from "./pages/AdminManagementPage";

import { EmployeeDashboard } from "./pages/EmployeeDashboard";
import { EmployeeManagementPage } from "./pages/EmployeeManagementPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { DevicesPage } from "./pages/DevicesPage";
import { AiRiskAnalysisPage } from "./pages/AiRiskAnalysisPage";
import { ExplainableAiPage } from "./pages/ExplainableAiPage";
import { AlertsPage } from "./pages/AlertsPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { MlAnalyticsPage } from "./pages/MlAnalyticsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { SettingsPage } from "./pages/SettingsPage";

const ADMIN_ROLES = ["SECURITY_ADMIN", "SYSTEM_ADMIN"];

const EMPLOYEE_ROLES = ["EMPLOYEE", "MANAGER"];

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

const isEmployeeRole = (role) => EMPLOYEE_ROLES.includes(role);

const getStoredUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem("zero_trust_user");

    if (!stored) {
      return null;
    }

    return JSON.parse(stored);
  } catch {
    return null;
  }
};

const getUserRole = (user) => user?.roleCode || user?.role || null;

const pathToTab = (pathname) => {
  const clean = (pathname || "").replace(/^\/+|\/+$/g, "").toLowerCase();

  if (!clean) {
    return "landing";
  }

  if (clean === "login") {
    return "login";
  }

  if (clean === "reset-password") {
    return "reset-password";
  }

  if (
    clean === "admin-management" ||
    clean === "admin-mgmt" ||
    clean === "administrators"
  ) {
    return "admin-management";
  }

  if (clean === "dashboard") {
    return "dashboard";
  }

  if (
    clean === "employee-dashboard" ||
    clean === "my-trust" ||
    clean === "employee-portal" ||
    clean === "trust-portal"
  ) {
    return "employee-dashboard";
  }

  if (clean === "employees" || clean === "employee-mgmt" || clean === "users") {
    return "employees";
  }

  if (clean === "departments") {
    return "departments";
  }

  if (clean === "devices") {
    return "devices";
  }

  if (clean === "risk-analysis" || clean === "ai-risk") {
    return "risk-analysis";
  }

  if (clean === "xai") {
    return "xai";
  }

  if (clean === "alerts") {
    return "alerts";
  }

  if (clean === "incidents") {
    return "incidents";
  }

  if (clean === "policies") {
    return "policies";
  }

  if (clean === "ml-analytics") {
    return "ml-analytics";
  }

  if (clean === "audit-logs") {
    return "audit-logs";
  }

  if (clean === "simulator") {
    return "simulator";
  }

  if (clean === "settings") {
    return "settings";
  }
  if(['resources','access-requests','security-profile'].includes(clean))return clean;

  return "landing";
};

const tabToPath = (tab) => {
  if (tab === "landing") {
    return "/";
  }

  if (tab === "login") {
    return "/login";
  }

  if (tab === "reset-password") {
    return "/reset-password";
  }

  return `/${tab}`;
};

const pageTitles = {
  resources: "Enterprise Resources",
  "access-requests": "Access Requests and Reviews",
  "security-profile": "Employee Security Profile",
  dashboard: "SOC Executive Dashboard",

  "admin-management": "Administrator Account Management",

  "employee-dashboard": "Employee Security & Trust Portal",

  employees: "Employee Governance & Identities",

  departments: "Department Risk Intelligence",

  devices: "Devices and Endpoint Monitoring",

  "risk-analysis": "AI Behavioral Risk Telemetry",

  xai: "Explainable AI Attribution",

  alerts: "Real-Time Detections & Alerts",

  incidents: "Incident Response & Containment",

  policies: "Zero Trust Policy Enforcement",

  "ml-analytics": "ML Model Evidence",

  "audit-logs": "Security Audit Records",

  simulator: "Threat Telemetry Simulator",

  settings: "Administrator Preferences",
};

export default function App() {
  const storedUser = getStoredUser();

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean(localStorage.getItem("zero_trust_token"));
  });

  const [syncError, setSyncError] = useState("");
  const [focusedIncidentId, setFocusedIncidentId] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") {
      return "landing";
    }

    const initialPathTab = pathToTab(window.location.pathname);

    const authed = Boolean(localStorage.getItem("zero_trust_token"));

    if (!authed) {
      if (initialPathTab === "login") {
        return "login";
      }

      if (initialPathTab === "reset-password") {
        return "reset-password";
      }

      return "landing";
    }

    const initialUser = getStoredUser();

    const initialRole = getUserRole(initialUser);

    if (initialPathTab === "login") {
      return isAdminRole(initialRole) ? "dashboard" : "employee-dashboard";
    }

    if (
      isEmployeeRole(initialRole) &&
      (initialPathTab === "dashboard" || initialPathTab === "admin-management")
    ) {
      return "employee-dashboard";
    }

    return initialPathTab;
  });

  const [loading, setLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentUser, setCurrentUser] = useState(storedUser);

  const [currentUserId, setCurrentUserId] = useState(storedUser?.id || null);

  const [users, setUsers] = useState([]);

  const [incidents, setIncidents] = useState([]);

  const [resources, setResources] = useState([]);

  const [devices, setDevices] = useState([]);

  const [accessRequests, setAccessRequests] = useState([]);

  const [recentEvents, setRecentEvents] = useState([]);

  const [auditLogs, setAuditLogs] = useState([]);

  const [stats, setStats] = useState(null);

  const [sseStatus, setSseStatus] = useState("RECONNECTING");

  const [sseEventCount, setSseEventCount] = useState(0);

  const [liveToast, setToast] = useState(null);
  const setLiveToast=toast=>{let enabled=true;try{enabled=JSON.parse(localStorage.getItem('cyberorbit_preferences')||'{}').inAppAlerts!==false;}catch{}if(!toast||enabled||toast.type==='danger')setToast(toast);};

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [copilotOpen, setCopilotOpen] = useState(false);

  const [copilotContext, setCopilotContext] = useState(undefined);

  const userRole = getUserRole(currentUser);

  const isCurrentUserAdmin = isAdminRole(userRole);

  const isCurrentUserEmployee = isEmployeeRole(userRole);

  useEffect(() => {
    if (!liveToast) {
      return;
    }

    const timer = setTimeout(() => setLiveToast(null), 6000);

    return () => clearTimeout(timer);
  }, [liveToast]);

  const handleNavigate = useCallback(
    (tab) => {
      const authed = Boolean(localStorage.getItem("zero_trust_token"));

      let targetTab = tab;

      if (!authed) {
        if (tab !== "landing" && tab !== "login" && tab !== "reset-password") {
          targetTab = "landing";
        }
      } else {
        if (tab === "login") {
          targetTab = isCurrentUserAdmin ? "dashboard" : "employee-dashboard";
        }

        if (tab === "admin-management" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "employees" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "departments" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "devices" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "risk-analysis" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "xai" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "alerts" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "incidents" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "ml-analytics" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "audit-logs" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "simulator" && !isCurrentUserAdmin) {
          targetTab = "employee-dashboard";
        }

        if (tab === "dashboard" && isCurrentUserEmployee) {
          targetTab = "employee-dashboard";
        }

        if (tab === "reset-password") {
          targetTab = "reset-password";
        }
      }

      setActiveTab(targetTab);

      const targetPath = tabToPath(targetTab);

      if (
        typeof window !== "undefined" &&
        window.location.pathname !== targetPath
      ) {
        window.history.pushState({}, "", targetPath);
      }
    },
    [isCurrentUserAdmin, isCurrentUserEmployee],
  );

  useEffect(() => {
    const handlePopState = () => {
      const pathTab = pathToTab(window.location.pathname);

      const authed = Boolean(localStorage.getItem("zero_trust_token"));

      if (!authed) {
        if (pathTab === "login") {
          setActiveTab("login");
        } else if (pathTab === "reset-password") {
          setActiveTab("reset-password");
        } else {
          setActiveTab("landing");

          if (window.location.pathname !== "/") {
            window.history.replaceState({}, "", "/");
          }
        }

        return;
      }

      const role = getUserRole(getStoredUser());

      if (pathTab === "login") {
        const destination = isAdminRole(role)
          ? "dashboard"
          : "employee-dashboard";

        setActiveTab(destination);

        window.history.replaceState({}, "", tabToPath(destination));

        return;
      }

      if (pathTab === "admin-management" && !isAdminRole(role)) {
        setActiveTab("employee-dashboard");

        window.history.replaceState({}, "", "/employee-dashboard");

        return;
      }

      if (pathTab === "dashboard" && isEmployeeRole(role)) {
        setActiveTab("employee-dashboard");

        window.history.replaceState({}, "", "/employee-dashboard");

        return;
      }

      setActiveTab(pathTab);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const authed = Boolean(localStorage.getItem("zero_trust_token"));

    const currentTab = pathToTab(window.location.pathname);

    if (
      !authed &&
      currentTab !== "landing" &&
      currentTab !== "login" &&
      currentTab !== "reset-password"
    ) {
      handleNavigate("landing");

      return;
    }

    if (authed && currentTab === "login") {
      const role = getUserRole(getStoredUser());

      handleNavigate(isAdminRole(role) ? "dashboard" : "employee-dashboard");
    }
  }, [handleNavigate]);

  const handleLogout = useCallback(async () => {
    try{await fetch('/api/auth/logout',{method:'POST',signal:AbortSignal.timeout(10000)});}catch{}
    localStorage.removeItem("zero_trust_token");

    localStorage.removeItem("zero_trust_user");

    sessionStorage.clear();

    setIsAuthenticated(false);

    setCurrentUser(null);

    setCurrentUserId(null);

    setUsers([]);
    setIncidents([]);
    setResources([]);
    setDevices([]);
    setAccessRequests([]);
    setRecentEvents([]);
    setAuditLogs([]);
    setStats(null);

    setActiveTab("landing");

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const handleLoginSuccess = useCallback(
    (user) => {
      if (!user?.id) {
        return;
      }

      const role = getUserRole(user);

      setCurrentUser(user);

      setCurrentUserId(user.id);

      setIsAuthenticated(true);

      localStorage.setItem("zero_trust_user", JSON.stringify(user));

      if (isAdminRole(role)) {
        handleNavigate("dashboard");
      } else {
        handleNavigate("employee-dashboard");
      }
    },
    [handleNavigate],
  );

  useEffect(()=>{
    if(!isAuthenticated)return;
    const expire=()=>handleLogout();
    window.addEventListener('cyberorbit-session-expired',expire);
    const timer=setInterval(()=>refreshSession().catch(expire),12*60000);
    return()=>{clearInterval(timer);window.removeEventListener('cyberorbit-session-expired',expire);};
  },[isAuthenticated,handleLogout]);

  const safeFetchJson = useCallback(
    async (url, options = {}) => {
      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("zero_trust_token")
            : null;

        const headers = new Headers(options.headers || {});

        if (token && !headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        if (currentUserId && !headers.has("x-user-id")) {
          headers.set("x-user-id", currentUserId);
        }

        const res = await fetch(url, {
          ...options,
          headers,
        });

        if (res.status === 401) {
          return {
            success: false,
            unauthorized: true,
            error: "Authentication required.",
          };
        }

        if (!res.ok) {
          return {
            success: false,
            error: `HTTP ${res.status}`,
          };
        }

        const contentType = res.headers.get("content-type");

        if (contentType && contentType.includes("application/json")) {
          return await res.json();
        }

        return {
          success: false,
          error: "Non-JSON response",
        };
      } catch (error) {
        return {
          success: false,
          error: String(error),
        };
      }
    },
    [currentUserId],
  );

  const fetchAllData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);

      return;
    }

    setIsRefreshing(true);

    try {
      const userRequests = isCurrentUserAdmin || getUserRole(currentUser)==='MANAGER'
        ? [safeFetchJson("/api/users")]
        : [Promise.resolve(null)];

      const [
        usersRes,
        incidentsRes,
        resourcesRes,
        devicesRes,
        requestsRes,
        eventsRes,
        logsRes,
        statsRes,
      ] = await Promise.all([
        ...userRequests,
        isCurrentUserAdmin || getUserRole(currentUser)==='MANAGER' ? safeFetchJson("/api/incidents") : Promise.resolve(null),
        safeFetchJson("/api/resources"),
        safeFetchJson("/api/devices"),
        safeFetchJson("/api/access-requests"),
        safeFetchJson("/api/activity"),
        isCurrentUserAdmin ? safeFetchJson("/api/audit-logs") : Promise.resolve(null),
        safeFetchJson("/api/stats"),
      ]);

      const unavailable = [["Employees",usersRes],["Incidents",incidentsRes],["Resources",resourcesRes],["Devices",devicesRes],["Access requests",requestsRes],["Activity",eventsRes],["Audit logs",logsRes],["Statistics",statsRes]].filter(([,result])=>result && !result.success).map(([name])=>name);
      setSyncError(unavailable.length ? `Could not refresh: ${unavailable.join(", ")}. Previously loaded records may be out of date. Use Refresh to retry.` : "");

      if (usersRes?.success && usersRes.users) {
        setUsers(usersRes.users);
      }

      if (incidentsRes?.success && incidentsRes.incidents) {
        setIncidents(incidentsRes.incidents);
      }

      if (resourcesRes?.success && resourcesRes.resources) {
        setResources(resourcesRes.resources);
      }

      if (devicesRes?.success && devicesRes.devices) {
        setDevices(devicesRes.devices);
      }

      if (requestsRes?.success && requestsRes.requests) {
        setAccessRequests(requestsRes.requests);
      }

      if (eventsRes?.success && eventsRes.events) {
        setRecentEvents(eventsRes.events);
      }

      if (logsRes?.success && logsRes.auditLogs) {
        setAuditLogs(logsRes.auditLogs);
      }

      if (statsRes?.success && statsRes.stats) {
        setStats(statsRes.stats);
      }
      const me=await safeFetchJson('/api/auth/me');
      if(me.success&&me.user){setCurrentUser(me.user);localStorage.setItem('zero_trust_user',JSON.stringify(me.user));}
    } catch (error) {
      console.error("Failed to sync SOC telemetry state:", error);
    } finally {
      setIsRefreshing(false);

      setLoading(false);
    }
  }, [isAuthenticated, isCurrentUserAdmin, safeFetchJson, userRole]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    let eventSource = null;

    let retryCount = 0;
    let retryTimeout = null;

    let isUnmounted = false;

    const connectSSE = async () => {
      if (isUnmounted) {
        return;
      }

      try {
        const streamSession = await fetch('/api/events/stream-session', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('zero_trust_token') || ''}` } });
        if (!streamSession.ok || isUnmounted) return;
        eventSource = new EventSource("/api/events/stream");

        eventSource.onopen = () => {
          if (isUnmounted) {
            return;
          }

          setSseStatus("LIVE");

          retryCount = 0;
        };

        eventSource.onmessage = (e) => {
          if (isUnmounted) {
            return;
          }

          try {
            const payload = JSON.parse(e.data);

            if (!payload || !payload.type) {
              return;
            }

            if (payload.type === 'ENDPOINT_UPDATED') {
              window.dispatchEvent(new Event('cyberorbit-endpoint-updated'));
              return;
            }

            if (payload.type === "HEARTBEAT") {
              setSseStatus("LIVE");

              return;
            }

            setSseEventCount((prev) => prev + 1);

            switch (payload.type) {
              case "CONNECTED":
                setSseStatus("LIVE");
                break;

              case "ACTIVITY_EVENT": {
                const ev = payload.data?.event || payload.data;

                if (ev && ev.id) {
                  setRecentEvents((prev) => {
                    const exists = prev.some((x) => x.id === ev.id);

                    if (exists) {
                      return prev;
                    }

                    return [ev, ...prev].slice(0, 50);
                  });
                }

                break;
              }

              case "TELEMETRY_INGESTED": {
                const ev = payload.data?.event;

                if (ev && ev.id) {
                  setRecentEvents((prev) => {
                    const filtered = prev.filter((x) => x.id !== ev.id);

                    return [ev, ...filtered].slice(0, 50);
                  });

                  const risk = Number(
                    payload.data?.riskScore || ev.riskContribution || 0,
                  );

                  setLiveToast({
                    id: `toast-${Date.now()}`,
                    title: `Telemetry: ${ev.eventType || "Event Ingested"}`,
                    message: `Risk ${risk} (${
                      payload.data?.riskLevel || "EVALUATED"
                    }) • Action: ${
                      payload.data?.decision || ev.policyAction || "ALLOW"
                    }`,
                    type:
                      ['HIGH','VERY_HIGH','CRITICAL'].includes(payload.data?.riskLevel) || risk >= 60 ? "danger" : risk >= 40 ? "warning" : "info",
                    timestamp: new Date().toLocaleTimeString(),
                  });
                }

                break;
              }

              case "POLICY_DECISION": {
                const dec = payload.data;

                if (
                  dec &&
                  (dec.decision === "FREEZE" ||
                    dec.decision === "RESTRICT" ||
                    dec.requiresMfa)
                ) {
                  setLiveToast({
                    id: `toast-${Date.now()}`,
                    title: `Zero Trust Policy: ${dec.decision}`,
                    message: dec.reason || `Action enforced for ${dec.userId}`,
                    type: dec.decision === "FREEZE" ? "danger" : "warning",
                    timestamp: new Date().toLocaleTimeString(),
                  });
                }

                break;
              }

              case "CONTAINMENT_ACTION": {
                const cont = payload.data;

                if (cont) {
                  setLiveToast({
                    id: `toast-${Date.now()}`,
                    title: `Containment: ${cont.action}`,
                    message:
                      cont.reason || "Automated Zero Trust containment active",
                    type: "danger",
                    timestamp: new Date().toLocaleTimeString(),
                  });
                }

                break;
              }

              case "INCIDENT_CREATED":
              case "NEW_INCIDENT": {
                const inc = payload.data?.incident || payload.data;

                if (inc && inc.id) {
                  setIncidents((prev) => {
                    const filtered = prev.filter((x) => x.id !== inc.id);

                    return [inc, ...filtered];
                  });

                  setLiveToast({
                    id: `toast-${Date.now()}`,
                    title: `Security Incident: ${inc.title || inc.eventType}`,
                    message: `${inc.userName || ""} • Score: ${
                      inc.riskScore || 0
                    } • ${inc.severity || ""}`,
                    type: "danger",
                    timestamp: new Date().toLocaleTimeString(),
                  });
                }

                break;
              }

              case "INCIDENT_RESOLVED": {
                const inc = payload.data?.incident || payload.data;

                if (inc && inc.id) {
                  setIncidents((prev) =>
                    prev.map((i) =>
                      i.id === inc.id
                        ? {
                            ...i,
                            ...inc,
                            status: "RESOLVED",
                          }
                        : i,
                    ),
                  );
                }

                break;
              }

              case "RISK_SCORE_CHANGED":
                if (payload.data && isCurrentUserAdmin) {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === payload.data.userId
                        ? {
                            ...u,
                            currentRiskScore: payload.data.riskScore,
                            currentRiskLevel:
                              payload.data.riskLevel || u.currentRiskLevel,
                          }
                        : u,
                    ),
                  );
                }

                break;

              case "TRUST_SCORE_CHANGED":
                if (payload.data && isCurrentUserAdmin) {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === payload.data.userId
                        ? {
                            ...u,
                            currentTrustScore: payload.data.trustScore,
                          }
                        : u,
                    ),
                  );
                }

                break;

              case "ACCOUNT_STATUS_CHANGED":
                if (payload.data && isCurrentUserAdmin) {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === payload.data.userId
                        ? {
                            ...u,
                            status: payload.data.status,
                          }
                        : u,
                    ),
                  );
                }

                break;

              case "USER_UPDATED":
                if (payload.data?.user && isCurrentUserAdmin) {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === payload.data.user.id
                        ? {
                            ...u,
                            ...payload.data.user,
                          }
                        : u,
                    ),
                  );
                }

                break;

              case "DEVICE_UPDATED":
              case "DEVICE_REVOKED": {
                const dev = payload.data?.device || payload.data;

                if (dev && dev.id) {
                  setDevices((prev) =>
                    prev.map((d) =>
                      d.id === dev.id
                        ? {
                            ...d,
                            ...dev,
                          }
                        : d,
                    ),
                  );
                }

                break;
              }

              case "AUDIT_LOG_ENTRY":
              case "AUDIT_LOG": {
                const log = payload.data?.entry || payload.data;

                if (log && log.id) {
                  setAuditLogs((prev) => [log, ...prev].slice(0, 100));
                }

                break;
              }

              default:
                break;
            }
          } catch (error) {
            console.error("Failed to parse SSE message:", error);
          }
        };

        eventSource.onerror = () => {
          if (isUnmounted) {
            return;
          }

          eventSource?.close();
          eventSource = null;

          retryCount++;

          if (retryCount <= 4) {
            setSseStatus("RECONNECTING");

            retryTimeout = setTimeout(
              connectSSE,
              Math.min(1000 * Math.pow(2, retryCount), 10000),
            );
          } else {
            setSseStatus("FALLBACK");

            retryTimeout = setTimeout(connectSSE, 30000);
          }
        };
      } catch (error) {
        setSseStatus("FALLBACK");
      }
    };

    if (isAuthenticated) {
      connectSSE();
    }

    return () => {
      isUnmounted = true;

      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }

      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [isAuthenticated, isCurrentUserAdmin]);

  useEffect(() => {
    const pollInterval = sseStatus === "LIVE" ? 45000 : 15000;

    const interval = setInterval(() => {
      if (isAuthenticated) {
        fetchAllData();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchAllData, sseStatus, isAuthenticated]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (!isCurrentUserAdmin) {
      return;
    }

    const refreshedUser = users.find((user) => user.id === currentUser?.id);

    if (refreshedUser) {
      setCurrentUser((previous) => ({
        ...previous,
        ...refreshedUser,
      }));
    }
  }, [users, currentUserId, isCurrentUserAdmin]);

  const handleOpenCopilot = (context) => {
    setCopilotContext(context);

    setCopilotOpen(true);
  };

  const accountAction=async(userId,action)=>{
    try{
      const result=await requestApi('/api/users/'+userId+'/'+action,{method:'POST',body:{reason:'SOC account review'}});
      setLiveToast({type:'warning',title:'Account updated',message:result.message,timestamp:new Date().toLocaleTimeString()});
      await fetchAllData();
    }catch(error){setLiveToast({type:'danger',title:'Account update failed',message:error.message,timestamp:new Date().toLocaleTimeString()});}
  };
  const handleFreezeUser=userId=>accountAction(userId,'freeze');
  const handleUnfreezeUser=userId=>accountAction(userId,'unfreeze');

  const handleAddUser = (createdUser) => {
    if (!createdUser?.id) {
      return;
    }

    setUsers((previous) => [
      createdUser,
      ...previous.filter((user) => user.id !== createdUser.id),
    ]);
  };

  const handleUpdateUser = async (userId, updates) => {
    const token = localStorage.getItem("zero_trust_token");

    if (!token) {
      throw new Error("Authentication token not found. Please log in again.");
    }

    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message || data?.message || "Failed to update employee.",
      );
    }

    if (!data?.user) {
      throw new Error("Updated employee was not returned by the server.");
    }

    setUsers((previous) =>
      previous.map((user) => (user.id === userId ? data.user : user)),
    );

    return data.user;
  };

  const handleDeleteUser = async (userId) => {
    const token = localStorage.getItem("zero_trust_token");

    if (!token) {
      throw new Error("Authentication token not found. Please log in again.");
    }

    const response = await fetch(`/api/users/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message || data?.message || "Failed to delete employee.",
      );
    }

    setUsers((previous) => previous.filter((user) => user.id !== userId));
  };

  if (activeTab === "landing") {
    return (
      <LandingPage
        onLogin={() => handleNavigate("login")}
        onNavigateToLogin={() => handleNavigate("login")}
      />
    );
  }

  if (activeTab === "login") {
    return (
      <LoginPage
        users={users}
        onLoginSuccess={handleLoginSuccess}
        onBackToHome={() => handleNavigate("landing")}
      />
    );
  }

  if (activeTab === "reset-password") {
    return <ResetPasswordPage />;
  }

  if (!isAuthenticated) {
    return (
      <LandingPage
        onLogin={() => handleNavigate("login")}
        onNavigateToLogin={() => handleNavigate("login")}
      />
    );
  }

  return (
    <div
      className={`
        min-h-screen
        flex flex-col md:flex-row
        overflow-hidden
        font-['Plus_Jakarta_Sans',sans-serif]
        bg-[#03070C]
        text-[#F4F7FA]
        selection:bg-[#67E8F9]/20
        selection:text-[#F4F7FA]
      `}
    >
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "copilot") {
            handleOpenCopilot();
          } else {
            handleNavigate(tab);
          }
        }}
        incidentCount={
          incidents.filter((incident) => incident.status !== "RESOLVED").length
        }
        currentUser={currentUser}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div
        className={`
          min-h-screen
          flex flex-col
          min-w-0
          w-full
          overflow-hidden
          relative
          bg-[#03070C]
          transition-[margin-left,width]
          duration-300
          ease-in-out
          ${
            isSidebarOpen
              ? "md:ml-[280px] md:w-[calc(100%-280px)]"
              : "md:ml-[72px] md:w-[calc(100%-72px)]"
          }
        `}
      >
        <TopBar
          currentUser={currentUser}
          currentPageTitle={pageTitles[activeTab] || "Administrator Portal"}
          onOpenCopilot={isCurrentUserAdmin ? handleOpenCopilot : undefined}
          onRefreshData={fetchAllData}
          isRefreshing={isRefreshing}
          onLogout={handleLogout}
          onToggleMobileNav={() => setMobileNavOpen((previous) => !previous)}
        />

        {liveToast && (
          <div className="absolute bottom-6 right-6 z-50 w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div
              className={`
                rounded-2xl
                p-4
                border
                backdrop-blur-xl
                shadow-[0_20px_70px_rgba(0,0,0,0.45)]
                flex items-start gap-3
                transition-all
                duration-300
                ${
                  liveToast.type === "danger"
                    ? "bg-[#12090B]/95 border-red-500/40 text-[#F4F7FA] shadow-red-950/30"
                    : liveToast.type === "warning"
                      ? "bg-[#151108]/95 border-[#D4AF37]/40 text-[#F4F7FA] shadow-black/30"
                      : "bg-[#071315]/95 border-[#67E8F9]/35 text-[#F4F7FA] shadow-cyan-950/30"
                }
              `}
            >
              <div className="mt-0.5 shrink-0">
                {liveToast.type === "danger" && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                    <ShieldAlert className="w-5 h-5 text-red-400" />
                  </div>
                )}

                {liveToast.type === "warning" && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                    <AlertTriangle className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                )}

                {liveToast.type !== "danger" &&
                  liveToast.type !== "warning" && (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#67E8F9]/10 border border-[#67E8F9]/20">
                      <CheckCircle2 className="w-5 h-5 text-[#67E8F9]" />
                    </div>
                  )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-[13px] font-semibold tracking-wide text-[#F4F7FA]">
                    {liveToast.title}
                  </h4>

                  <span className="text-[11px] font-mono text-[#7F8A96] shrink-0">
                    {liveToast.timestamp}
                  </span>
                </div>

                <p className="text-[13px] leading-5 mt-1.5 text-[#A7B0BA]">
                  {liveToast.message}
                </p>
              </div>

              <button
                onClick={() => setLiveToast(null)}
                className="
                  shrink-0
                  text-[#7F8A96]
                  hover:text-[#F4F7FA]
                  p-1.5
                  rounded-lg
                  hover:bg-white/5
                  transition-all
                  duration-200
                  cursor-pointer
                "
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main
          id="cyberorbit-main-content"
          className="
            relative
            flex-1
            min-h-0
            overflow-y-auto
            pt-10
            bg-[#03070C]
            text-[#F4F7FA]
            transition-colors
          "
        >
          <div className="console-workspace w-full max-w-[1500px] mx-auto" data-page={activeTab}>
            {syncError && <p role="alert" className="mb-5">{syncError}</p>}
            <PageErrorBoundary key={activeTab}>
            {activeTab === "dashboard" && isCurrentUserAdmin && (
              <DashboardPage
                users={users}
                incidents={incidents}
                recentEvents={recentEvents}
                onSelectUser={(userId) => {
                  setCurrentUserId(userId);

                  handleNavigate("security-profile");
                }}
                onSelectIncident={(id) => { setFocusedIncidentId(typeof id === "object" ? id?.id || id?.incidentId : id || null); handleNavigate("incidents"); }}
                onNavigateToSimulator={() => handleNavigate("simulator")}
                onNavigateToCopilot={() => handleOpenCopilot()}
                onNavigateToAdminManagement={() =>
                  handleNavigate("admin-management")
                }
                onFreezeUser={handleFreezeUser}
                onUnfreezeUser={handleUnfreezeUser}
              />
            )}

            {activeTab === "admin-management" && isCurrentUserAdmin && (
              <AdminManagementPage
                currentUser={currentUser}
                onBack={() => handleNavigate("dashboard")}
              />
            )}

            {activeTab === "employee-dashboard" &&
              (isCurrentUserAdmin || isCurrentUserEmployee) && (
                <EmployeeDashboard
                  currentUser={currentUser}
                  users={users}
                  events={recentEvents}
                  devices={devices}
                  isAdminView={isCurrentUserAdmin}
                  onOpenAccessRequestModal={() => handleNavigate("access-requests")}
                />
              )}

            {activeTab === "employees" && isCurrentUserAdmin && (
              <EmployeeManagementPage
                users={users}
                onSelectUser={userId=>{setCurrentUserId(userId);handleNavigate('security-profile');}}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                onFreezeUser={handleFreezeUser}
                onUnfreezeUser={handleUnfreezeUser}
              />
            )}

            {activeTab === "departments" && isCurrentUserAdmin && (
              <DepartmentsPage
                users={users}
                incidents={incidents}
                onSelectUser={(userId) => {
                  setCurrentUserId(userId);

                  handleNavigate("security-profile");
                }}
              />
            )}

            {activeTab === "devices" && isCurrentUserAdmin && (
              <DevicesPage
                devices={devices}
                users={users}
                onRefreshData={fetchAllData}
              />
            )}

            {activeTab === "risk-analysis" && isCurrentUserAdmin && (
              <AiRiskAnalysisPage
  users={users}
  events={recentEvents}
  selectedUserId={currentUserId}
  onSelectUser={(userId) => setCurrentUserId(userId)}
  fetchJson={safeFetchJson}
  isRefreshing={isRefreshing}
/>
            )}

            {activeTab === "xai" && isCurrentUserAdmin && (
              <ExplainableAiPage
                users={users}
                events={recentEvents}
                fetchJson={safeFetchJson}
                isRefreshing={isRefreshing}
              />
            )}

            {activeTab === "alerts" && isCurrentUserAdmin && (
              <AlertsPage
                currentUser={currentUser}
                onRefreshData={fetchAllData}
                users={users}
                events={recentEvents}
                incidents={incidents}
                onSelectUser={(userId) => {
                  setCurrentUserId(userId);

                  handleNavigate("security-profile");
                }}
                onSelectIncident={(id) => { setFocusedIncidentId(typeof id === "object" ? id?.id || id?.incidentId : id || null); handleNavigate("incidents"); }}
              />
            )}

            {activeTab === "incidents" && isCurrentUserAdmin && (
              <IncidentsPage
                initialIncidentId={focusedIncidentId}
                incidents={incidents}
                users={users}
                currentUser={currentUser}
                onRefreshData={fetchAllData}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeTab === "policies" && (
              isCurrentUserAdmin ? <PoliciesPage onRefreshData={fetchAllData} /> : <ResourcesPage resources={resources} currentUser={currentUser} onRefreshData={fetchAllData}/>
            )}

            {activeTab==='resources'&&<ResourcesPage resources={resources} currentUser={currentUser} onRefreshData={fetchAllData}/>}
            {activeTab==='access-requests'&&<AccessRequestsPage requests={accessRequests} currentUser={currentUser} resources={resources} onRefreshData={fetchAllData}/>}
            {activeTab==='security-profile'&&<SecurityProfilePage currentUser={currentUser} users={users} selectedEmployeeId={currentUserId}/>}

            {activeTab === "ml-analytics" && isCurrentUserAdmin && (
              <MlAnalyticsPage />
            )}

            {activeTab === "audit-logs" && isCurrentUserAdmin && (
              <AuditLogsPage
                auditLogs={auditLogs}
                currentUser={currentUser}
                onRefreshData={fetchAllData}
              />
            )}

            {activeTab === "simulator" && isCurrentUserAdmin && (
              <SimulatorPage
                users={users}
                resources={resources}
                devices={devices}
                onRefreshData={fetchAllData}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeTab === "settings" && (
              <SettingsPage currentUser={currentUser} onLogout={handleLogout} />
            )}
            </PageErrorBoundary>
          </div>
        </main>
      </div>

      <CopilotModal
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        context={copilotContext}
      />
    </div>
  );
}
