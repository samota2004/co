import React, { useEffect, useMemo, useState } from "react";

import { requestApi } from "../services/api.js";

import {

  Shield,

  ShieldCheck,

  CheckCircle2,

  Lock,

  Activity,

  TrendingUp,

  Clock,

  Wifi,

  Monitor,

  AlertCircle,

} from "lucide-react";

import {

  LineChart,

  Line,

  XAxis,

  YAxis,

  CartesianGrid,

  Tooltip,

  ResponsiveContainer,

  PieChart,

  Pie,

  Cell,

} from "recharts";

import { useTheme } from "../context/ThemeContext";

import { EndpointMonitor } from "../components/EndpointMonitor.jsx";

const employeeRole = (user) =>

  ["EMPLOYEE", "MANAGER"].includes(user?.roleCode || user?.role);

export const EmployeeDashboard = ({

  currentUser,

  users = [],

  isAdminView = false,

  selectedEmployeeId = "",

  ...props

}) => {

  const [selectedId, setSelectedId] = useState(() =>

    isAdminView &&

    users.some(

      (user) => user.id === selectedEmployeeId && employeeRole(user)

    )

      ? selectedEmployeeId

      : ""

  );

  const [detail, setDetail] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const employeeRows = users.filter(employeeRole);

  useEffect(() => {

    if (!isAdminView) return;

    setSelectedId(

      employeeRows.some((user) => user.id === selectedEmployeeId)

        ? selectedEmployeeId

        : ""

    );

    setDetail(null);

    setError("");

  }, [selectedEmployeeId, isAdminView]);

  useEffect(() => {

    if (!isAdminView || !selectedId) return undefined;

    let cancelled = false;

    setLoading(true);

    setError("");

    setDetail(null);

    requestApi(`/api/users/${encodeURIComponent(selectedId)}`)

      .then((result) => {

        if (

          result.user?.id !== selectedId ||

          !employeeRole(result.user)

        ) {

          throw new Error(

            "The server did not return the selected employee."

          );

        }

        if (!cancelled) setDetail(result);

      })

      .catch((reason) => {

        if (!cancelled) {

          setError(

            reason.message || "Unable to load this employee."

          );

        }

      })

      .finally(() => {

        if (!cancelled) setLoading(false);

      });

    return () => {

      cancelled = true;

    };

  }, [isAdminView, selectedId]);

  if (isAdminView && !selectedId) {

    return (

      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">

        <header className="rounded-2xl border border-[#67E8F9]/40 bg-[#050A10] p-6">

          <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">

            EMPLOYEE MONITORING

          </p>

          <h1 className="mt-2 text-3xl font-light">

            Select an employee

          </h1>

          <p className="mt-2 text-sm text-[#A7B0BA]">

            Choose an authorized employee to view their recorded risk and

            trust history, activity, incidents, and assigned endpoint agent.

          </p>

        </header>

        <section

          className="overflow-x-auto rounded-2xl border border-white/10 bg-[#050A10] p-5"

          aria-label="Employee list"

        >

          <h2 className="mb-4 text-xl">Employee List</h2>

          {employeeRows.length ? (

            <table className="w-full text-left">

              <thead>

                <tr>

                  <th className="p-3">Name</th>

                  <th className="p-3">Employee ID</th>

                  <th className="p-3">Department</th>

                  <th className="p-3">Role</th>

                  <th className="p-3">Status</th>

                  <th className="p-3">Risk</th>

                  <th className="p-3">Trust</th>

                </tr>

              </thead>

              <tbody>

                {employeeRows.map((user) => (

                  <tr

                    key={user.id}

                    tabIndex={0}

                    role="button"

                    aria-label={`View ${user.name}`}

                    onClick={() => setSelectedId(user.id)}

                    onKeyDown={(event) => {

                      if (

                        event.key === "Enter" ||

                        event.key === " "

                      ) {

                        event.preventDefault();

                        setSelectedId(user.id);

                      }

                    }}

                    className="cursor-pointer border-t border-white/10 hover:bg-white/5 focus-visible:outline focus-visible:outline-cyan-300"

                  >

                    <td className="p-3">{user.name}</td>

                    <td className="p-3">

                      {user.employeeId || "—"}

                    </td>

                    <td className="p-3">

                      {user.department || user.departmentCode || "—"}

                    </td>

                    <td className="p-3">

                      {user.roleCode || user.role}

                    </td>

                    <td className="p-3">{user.status}</td>

                    <td className="p-3">

                      {user.currentRiskScore ?? user.riskScore ?? "—"}

                    </td>

                    <td className="p-3">

                      {user.currentTrustScore ?? user.trustScore ?? "—"}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          ) : (

            <p role="status">

              No authorized employees available.

            </p>

          )}

        </section>

      </div>

    );

  }

  if (isAdminView) {

    if (loading) {

      return (

        <div className="p-6">

          <button

            type="button"

            onClick={() => {

              setSelectedId("");

              setDetail(null);

            }}

          >

            Employee List

          </button>

          <p role="status" className="mt-4">

            Loading selected employee…

          </p>

        </div>

      );

    }

    if (error || !detail) {

      return (

        <div className="p-6">

          <button

            type="button"

            onClick={() => {

              setSelectedId("");

              setDetail(null);

              setError("");

            }}

          >

            Employee List

          </button>

          {error && (

            <p role="alert" className="mt-4 text-red-400">

              {error}

            </p>

          )}

        </div>

      );

    }

    return (

      <div>

        <div className="px-5 pt-4 sm:px-8 lg:px-12">

          <button

            type="button"

            onClick={() => {

              setSelectedId("");

              setDetail(null);

            }}

            className="rounded border border-cyan-700 px-3 py-2"

          >

            ← Employee List

          </button>

        </div>

        <EmployeeDashboardDetails

          {...props}

          currentUser={detail.user}

          events={detail.events || []}

          devices={detail.devices || []}

          endpointEvents={detail.endpointEvents || []}

          monitoringData={detail}

        />

      </div>

    );

  }

  return (

    <EmployeeDashboardDetails

      {...props}

      currentUser={currentUser}

    />

  );

};

const EmployeeDashboardDetails = ({

  currentUser,

  events = [],

  devices = [],

  endpointEvents = [],

  monitoringData = null,

}) => {

  const { isDark } = useTheme();

  // ======================================================
  // DATA / EMPLOYEE CONTEXT
  // ======================================================
  const userEvents = events.filter(

    (event) => event.userId === currentUser?.id

  );

  const userDevices = devices.filter(

    (device) => device.userId === currentUser?.id

  );

  const displayEvents = userEvents;

  const displayDevices = userDevices;

  // The profile API returns verified, employee-attributed endpoint events
  // separately from policy ActivityEvent rows. Include both persisted sources
  // in the distribution without treating endpoint observations as risk/trust
  // assessments.
  const employeeActivity = [...userEvents, ...endpointEvents.filter(
    (event) => event.userId === currentUser?.id
  )];

  const [liveRiskState, setLiveRiskState] = useState({

    analysis: null,

    loading: false,

    error: "",

  });

  useEffect(() => {

    if (!monitoringData || !currentUser?.id) {

      setLiveRiskState({

        analysis: null,

        loading: false,

        error: "",

      });

      return undefined;

    }

    let cancelled = false;

    let inFlight = false;

    let queued = false;

    let debounce;

    const refresh = async () => {

      if (cancelled) return;

      if (inFlight) {

        queued = true;

        return;

      }

      inFlight = true;

      setLiveRiskState((state) => ({

        ...state,

        loading: true,

      }));

      try {

        const response = await requestApi(

          `/api/risk/analysis/${encodeURIComponent(currentUser.id)}`

        );

        if (response.analysis?.userId !== currentUser.id) {

          throw new Error(

            "Risk analysis returned a different employee."

          );

        }

        if (!cancelled) {

          setLiveRiskState({

            analysis: response.analysis,

            loading: false,

            error: "",

          });

        }

      } catch (error) {

        if (!cancelled) {

          setLiveRiskState((state) => ({

            ...state,

            loading: false,

            error:

              error.message || "Live risk analysis is unavailable.",

          }));

        }

      } finally {

        inFlight = false;

        if (!cancelled && queued) {

          queued = false;

          refresh();

        }

      }

    };

    const onEndpointUpdate = () => {

      clearTimeout(debounce);

      debounce = setTimeout(refresh, 300);

    };

    refresh();

    const timer = setInterval(refresh, 30000);

    window.addEventListener(

      "cyberorbit-endpoint-updated",

      onEndpointUpdate

    );

    return () => {

      cancelled = true;

      clearTimeout(debounce);

      clearInterval(timer);

      window.removeEventListener(

        "cyberorbit-endpoint-updated",

        onEndpointUpdate

      );

    };

  }, [currentUser?.id, Boolean(monitoringData)]);

  // ======================================================
  // SECURITY STATUS
  // ======================================================
  const riskScore =

    currentUser?.assessmentStatus === "NOT_ASSESSED"

      ? null

      : currentUser?.currentRiskScore ??

        currentUser?.riskScore ??

        null;

  const observedRiskState = liveRiskState.analysis?.activityDetected

    ? liveRiskState.analysis.observedRiskScore === null

      ? "Activity detected; no qualifying risk evidence in the available signals."

      : "Activity detected; qualifying evidence is reflected in the current policy score."

    : "No employee-attributed activity in the last 24 hours.";

  const trustScore =

    currentUser?.assessmentStatus === "NOT_ASSESSED"

      ? null

      : currentUser?.currentTrustScore ??

        currentUser?.trustScore ??

        null;

  const currentRiskFactors = (monitoringData?.riskHistory || [])

    .slice()

    .reverse()

    .find((item) => item.score === riskScore)?.factors;

  const getSecurityStatus = (score) => {

    if (score === null || !Number.isFinite(score)) {

      return {

        label: "NOT ASSESSED",

        color: "text-[#A7B0BA]",

        border: "border-white/10",

      };

    }

    if (score < 40) {

      return {

        label: "HEALTHY & SAFE",

        color: "text-emerald-400",

        border: "border-cyan-300/25",

      };

    }

    if (score < 60) {

      return {

        label: "ELEVATED MONITORING",

        color: "text-cyan-300",

        border: "border-cyan-300/60",

      };

    }

    if (score < 75) {

      return {

        label: "RESTRICTED PRIVILEGES",

        color: "text-orange-400",

        border: "border-orange-500/50",

      };

    }

    return {

      label: "FROZEN / CONTAINED",

      color: "text-red-400",

      border: "border-red-500/50",

    };

  };

  const status = getSecurityStatus(riskScore);

  // ======================================================
  // CHART DATA
  // ======================================================
  const [history, setHistory] = useState({

    trustHistory: [],

    riskHistory: [],

    dailyRiskHistory: [],

  });

  const [historyError, setHistoryError] = useState("");

  const [historyRange, setHistoryRange] = useState("90d");

  useEffect(() => {

    if (!currentUser?.id) return;

    if (monitoringData) {

      setHistory({

        trustHistory: monitoringData.trustHistory || [],

        riskHistory: monitoringData.riskHistory || [],

        dailyRiskHistory: monitoringData.dailyRiskHistory || [],

      });

      setHistoryError("");

      return;

    }

    const refresh = () =>

      requestApi("/api/users/" + currentUser.id)

        .then((data) => {

          setHistory({

            trustHistory: data.trustHistory || [],

            riskHistory: data.riskHistory || [],

            dailyRiskHistory: data.dailyRiskHistory || [],

          });

          setHistoryError("");

        })

        .catch((error) => setHistoryError(error.message));

    refresh();

    const timer = setInterval(refresh, 30000);

    return () => clearInterval(timer);

  }, [currentUser?.id, monitoringData]);

  const trendData = useMemo(() => {
    const now = Date.now();
    const rangeDays = {
      "24h": 1,
      "7d": 7,
      "30d": 30,
      "90d": 90,
    }[historyRange];

    const start = now - rangeDays * 86400000;
    const points = new Map();

    const getPoint = (timestamp) => {
      if (!points.has(timestamp)) {
        points.set(timestamp, {
          timestamp,
          risk: null,
          trust: null,
        });
      }
      return points.get(timestamp);
    };

    // Keep the original timestamps so multiple assessments on the same
    // day are not collapsed into a single daily bucket.
    for (const row of history.riskHistory || []) {
      const timestamp = +new Date(row.timestamp);
      if (
        !Number.isFinite(timestamp) ||
        timestamp < start ||
        timestamp > now
      ) {
        continue;
      }

      const point = getPoint(timestamp);
      const score = Number(row.score);
      if (Number.isFinite(score)) point.risk = score;
    }

    for (const row of history.trustHistory || []) {
      const timestamp = +new Date(row.timestamp);
      if (
        !Number.isFinite(timestamp) ||
        timestamp < start ||
        timestamp > now
      ) {
        continue;
      }

      const point = getPoint(timestamp);

      const trust = Number(row.trustScore);
      const risk = Number(row.riskScore);

      if (Number.isFinite(trust)) point.trust = trust;
      if (Number.isFinite(risk)) point.risk = risk;
    }

    // Use daily snapshots only when timestamped history is unavailable.
    // This keeps the graph grounded in recorded assessments.
    if (points.size === 0) {
      for (const row of history.dailyRiskHistory || []) {
        const timestamp = Date.parse(row.day);
        if (
          !Number.isFinite(timestamp) ||
          timestamp < start ||
          timestamp > now
        ) {
          continue;
        }

        const point = getPoint(timestamp);
        const risk = Number(row.riskScore);
        const trust = Number(row.trustScore);

        if (Number.isFinite(risk)) point.risk = risk;
        if (Number.isFinite(trust)) point.trust = trust;
      }
    }

    return [...points.values()].sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }, [history, historyRange]);

  const visibleSnapshots = (history.dailyRiskHistory || [])

    .filter((row) => {

      const day = Date.parse(row.day);

      return (

        Number.isFinite(day) &&

        Date.now() - day <

          ({

            "7d": 7,

            "30d": 30,

            "90d": 90,

            "24h": 1,

          }[historyRange]) *

            86400000

      );

    })

    .slice()

    .reverse();

  const groups = new Map();

  for (const event of employeeActivity) {

    const name = event.eventType || event.type || "Unknown";

    groups.set(name, (groups.get(name) || 0) + 1);

  }

  const totalActivity = [...groups.values()].reduce(

    (total, value) => total + value,

    0

  );

  const activityDist = [...groups].map(([name, value], index) => ({

    name,

    value: totalActivity

      ? Math.round((value * 100) / totalActivity)

      : 0,

    color: [

      "#67E8F9",

      "#D4AF37",

      "#F59E0B",

      "#94A3B8",

    ][index % 4],

  }));

  // ======================================================
  // MAIN COMPONENT
  // ======================================================
  return (

    <div className="employee-dashboard-content mx-auto w-full max-w-[1500px] space-y-6 px-5 pb-10 sm:px-8 lg:px-12">

      {historyError && (

        <p role="alert" className="text-red-400">

          {historyError}

        </p>

      )}

      {/* Editorial Profile Header */}

      <div className="console-hero group relative min-h-[210px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">

        <div className="relative z-10 flex min-h-[210px] items-center px-6 py-7 sm:px-8 lg:px-9">

          <div className="relative z-10 max-w-[74%]">

            <div className="mb-4 flex flex-wrap items-center gap-3">

              <span className="text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">

                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />

                EMPLOYEE SECURITY CENTER

              </span>

              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">

                ID: {currentUser?.employeeId || "EMP001"}

              </span>

            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">

              {currentUser?.name || "Employee Profile"}

            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#A7B0BA]">

              <div>

                <span className="text-[#7F8A96]">DEPARTMENT: </span>

                <span className="font-semibold text-current">

                  {currentUser?.department || "Engineering"}

                </span>

              </div>

              <div>

                <span className="text-[#7F8A96]">ROLE: </span>

                <span className="font-semibold text-current">

                  {currentUser?.role?.replace("_", " ") || "Main Admin"}

                </span>

              </div>

              {currentUser?.email && (

                <div>

                  <span className="text-[#7F8A96]">EMAIL: </span>

                  <span className="font-semibold text-current">

                    {currentUser.email}

                  </span>

                </div>

              )}

              <div>

                <span className="text-[#7F8A96]">SECURITY STATUS: </span>

                <span className={`font-semibold ${status.color}`}>

                  {status.label}

                </span>

              </div>

            </div>

            <p className="mt-4 max-w-[560px] text-[14px] leading-6 text-[#A7B0BA]">

              Continuous employee security visibility across identity,

              devices, trust posture, and behavioral activity.

            </p>

          </div>

          {/* Employee security visual */}

          <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] overflow-hidden">

            <div

              className="absolute inset-0 opacity-70"

              style={{

                backgroundImage:

                  "linear-gradient(rgba(103,232,249,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.08) 1px, transparent 1px)",

                backgroundSize: "49px 54px",

              }}

            />

            <div className="absolute right-[18%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />

            <div className="absolute right-[18%] top-1/2 h-32 w-32 -translate-y-1/2 rounded-full border border-[#D4AF37]/30" />

            <div className="absolute right-[18%] top-1/2 h-24 w-24 -translate-y-1/2 rounded-full border border-[#67E8F9]/25" />

            <div className="absolute right-[18%] top-1/2 flex h-20 w-20 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/45 bg-[#050A10]/80 shadow-[0_0_35px_rgba(103,232,249,0.08)]">

              <ShieldCheck

                className="h-9 w-9 text-[#67E8F9]"

                strokeWidth={1.5}

              />

            </div>

            <span className="absolute right-[18%] top-[20%] h-2 w-2 translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.8)]" />

            <span className="absolute right-[18%] bottom-[20%] h-2 w-2 translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />

          </div>

          <div className="absolute left-0 top-0 h-10 w-1 rounded-br-full bg-[#D4AF37]" />

          <div className="absolute bottom-0 right-0 h-10 w-1 rounded-tl-full bg-[#67E8F9]" />

        </div>

      </div>

      {/* Current measured trust, risk and policy posture. */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {/* Trust Score */}

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">

          <div className="mb-2 flex items-center justify-between">

            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              TRUST SCORE

            </span>

            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />

          </div>

          <div className="text-3xl font-light tracking-tight text-current sm:text-4xl">

            {trustScore === null ? "Not assessed" : trustScore}{" "}

            {trustScore !== null && (

              <span className="text-sm font-mono text-[#A7B0BA]">

                / 100

              </span>

            )}

          </div>

          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">

            Recorded trust standing from contextual policy assessments

          </p>

          {monitoringData && riskScore !== null && (

            <details className="mt-3 text-xs text-[#A7B0BA]">

              <summary className="cursor-pointer text-[#67E8F9]">

                Why this score?

              </summary>

              {Array.isArray(currentRiskFactors) &&

              currentRiskFactors.length ? (

                <ul className="mt-2 space-y-1">

                  {currentRiskFactors.map((factor, index) => (

                    <li

                      key={`${factor.factor || "factor"}-${index}`}

                    >

                      {factor.factor || "Recorded factor"}

                      {typeof factor.scoreImpact === "number"

                        ? ` · ${factor.scoreImpact} points`

                        : ""}

                      {factor.description

                        ? ` — ${factor.description}`

                        : ""}

                    </li>

                  ))}

                </ul>

              ) : (

                <p className="mt-2">

                  No contributing-factor breakdown is stored with this

                  assessment.

                </p>

              )}

            </details>

          )}

        </div>

        {/* Current Risk Score */}

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">

          <div className="mb-2 flex items-center justify-between">

            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              CURRENT POLICY RISK

            </span>

            <Activity className="h-4 w-4 text-[#D4AF37]" />

          </div>

          <div className="text-3xl font-light tracking-tight text-[#D4AF37] sm:text-4xl">

            {riskScore === null ? "Not assessed" : riskScore}{" "}

            {riskScore !== null && (

              <span className="text-sm font-mono text-[#A7B0BA]">

                / 100

              </span>

            )}

          </div>

          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">

            {monitoringData

              ? `${riskScore === null

                  ? "No recorded account risk assessment yet."

                  : "Latest persisted policy assessment; this is the current score used by policy."

                } Recent endpoint activity: ${

                  liveRiskState.loading && !liveRiskState.analysis

                    ? "Loading…"

                    : observedRiskState

                }${

                  liveRiskState.error

                    ? ` Analysis refresh failed: ${liveRiskState.error}`

                    : ""

                }`

              : "Latest persisted contextual policy assessment. Endpoint observations are reviewed separately in Risk Analysis."}

          </p>

        </div>

        {/* Security Status */}

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">

          <div className="mb-2 flex items-center justify-between">

            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              POLICY POSTURE

            </span>

            <Lock className="h-4 w-4 text-[#D4AF37]" />

          </div>

          <div className={`text-2xl font-light tracking-tight ${status.color}`}>

            {status.label}

          </div>

          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">

            Account state: {currentUser?.status || "ACTIVE"}

          </p>

          {monitoringData && (

            <p className="mt-1 text-xs leading-5 text-[#7F8A96]">

              {riskScore === null

                ? "No recorded policy assessment. Endpoint observations alone do not establish account risk or trust."

                : `Posture follows the latest saved account risk assessment (${riskScore}/100).`}

            </p>

          )}

        </div>

      </div>

            {/* 3 Dashboard Charts: Risk & Trust Trend, Activity Distribution */}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">

        {/* Risk Trend & Trust Trend (8 cols) */}

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:col-span-8 lg:p-7">

          <div className="mb-6 flex items-center justify-between">

            <div>

              <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

                BEHAVIORAL POSTURE

              </span>

              <h3 className="mt-1 text-2xl font-light tracking-tight">

                Risk &amp; Trust Trend

              </h3>

            </div>

            <div className="flex items-center gap-4 text-xs font-mono">

              <label className="text-[#A7B0BA]">

                History

                <select

                  aria-label="Risk and trust history range"

                  value={historyRange}

                  onChange={(event) =>

                    setHistoryRange(event.target.value)

                  }

                  className="ml-2 rounded border border-white/15 bg-slate-900 px-2 py-1 text-white"

                >

                  <option value="24h">24 hours</option>

                  <option value="7d">7 days</option>

                  <option value="30d">30 days</option>

                  <option value="90d">90 days</option>

                </select>

              </label>

              <span className="flex items-center gap-1.5 text-[#67E8F9]">

                <span className="h-0.5 w-2.5 bg-[#67E8F9]" />

                Risk

              </span>

              <span className="flex items-center gap-1.5 text-[#A7B0BA]">

                <span className="h-0.5 w-2.5 bg-gray-400" />

                Trust

              </span>

            </div>

          </div>

          <div className="h-[360px] w-full sm:h-[420px]">
            {!trendData.some(
              (row) =>
                typeof row.risk === "number" ||
                typeof row.trust === "number"
            ) ? (
              <div
                role="status"
                className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-slate-950/30 p-6 text-center text-[#A7B0BA]"
              >
                No recorded risk or trust assessments are available for
                this employee in the selected period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 18, right: 18, left: 4, bottom: 8 }}
                >

                  <CartesianGrid
                    stroke={isDark ? "#26313D" : "#DCE4EA"}
                    strokeDasharray="4 5"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fill: isDark ? "#A7B0BA" : "#526171", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: isDark ? "#42505E" : "#C5D0D9" }}
                    minTickGap={24}
                  />

                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tick={{ fill: isDark ? "#A7B0BA" : "#526171", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                  />

                  <Tooltip
                    labelFormatter={(value) =>
                      new Date(value).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                    formatter={(value, name) => [
                      typeof value === "number" ? `${value.toFixed(1)} / 100` : "No data",
                      name,
                    ]}
                    labelStyle={{
                      color: isDark ? "#F4F7FA" : "#17212B",
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                    contentStyle={{
                      backgroundColor: isDark ? "#050A10" : "#FFFFFF",
                      border: "1px solid #67E8F9",
                      borderRadius: "10px",
                      color: isDark ? "#F4F7FA" : "#17212B",
                      fontSize: "12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="risk"
                    stroke="#67E8F9"
                    strokeWidth={2.5}
                    connectNulls={true}
                    dot={{
                      r: 3.5,
                      fill: "#050A10",
                      stroke: "#67E8F9",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: "#67E8F9",
                      stroke: isDark ? "#050A10" : "#FFFFFF",
                      strokeWidth: 2,
                    }}
                    name="Risk Score"
                  />

                  <Line
                    type="monotone"
                    dataKey="trust"
                    stroke={isDark ? "#E5E7EB" : "#526171"}
                    strokeWidth={2.5}
                    connectNulls={true}
                    dot={{
                      r: 3.5,
                      fill: isDark ? "#050A10" : "#FFFFFF",
                      stroke: isDark ? "#E5E7EB" : "#526171",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: isDark ? "#E5E7EB" : "#526171",
                      stroke: isDark ? "#050A10" : "#FFFFFF",
                      strokeWidth: 2,
                    }}
                    name="Trust Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {historyRange !== "24h" && (

            <div className="mt-5 overflow-x-auto border-t border-white/10 pt-4">

              <h4 className="mb-3 text-sm font-semibold text-slate-200">

                Recorded daily assessments

              </h4>

              {visibleSnapshots.length ? (

                <table className="w-full min-w-[620px] text-left text-xs">

                  <thead>

                    <tr className="text-slate-400">

                      <th className="p-2">UTC day</th>

                      <th className="p-2">Risk</th>

                      <th className="p-2">Severity</th>

                      <th className="p-2">Trust</th>

                      <th className="p-2">Monitoring</th>

                      <th className="p-2">Evidence</th>

                    </tr>

                  </thead>

                  <tbody>

                    {visibleSnapshots.map((row) => (

                      <tr

                        key={row.id}

                        className="border-t border-white/10 align-top"

                      >

                        <td className="p-2">

                          {new Date(row.day).toISOString().slice(0, 10)}

                        </td>

                        <td className="p-2">

                          {row.riskScore ?? "Not assessed"}

                        </td>

                        <td className="p-2">

                          {row.riskLevel || "—"}

                        </td>

                        <td className="p-2">

                          {row.trustScore ?? "Not assessed"}

                          {row.trustAsOf && (

                            <span className="block text-slate-500">

                              as of{" "}

                              {new Date(row.trustAsOf).toLocaleString()}

                            </span>

                          )}

                        </td>

                        <td className="p-2">

                          {row.monitoringStatus}

                        </td>

                        <td className="max-w-sm p-2">

                          {(row.riskFactors || [])

                            .map((factor) =>

                              factor.factor || factor.description

                            )

                            .filter(Boolean)

                            .join("; ") ||

                            "No qualifying risk factors recorded"}

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              ) : (

                <p className="text-sm text-slate-400">

                  No daily observation snapshots in this period. No score

                  is inferred for missing days.

                </p>

              )}

            </div>

          )}

        </div>

        {/* Activity Distribution (4 cols) */}

        <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:col-span-4 lg:p-7">

          <div>

            <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              BREAKDOWN

            </span>

            <h3 className="mt-1 text-2xl font-light tracking-tight">

              Activity Distribution

            </h3>

          </div>

          <div className="my-4 h-44">

            <ResponsiveContainer width="100%" height="100%">

              <PieChart>

                <Pie

                  data={activityDist}

                  cx="50%"

                  cy="50%"

                  innerRadius={48}

                  outerRadius={68}

                  paddingAngle={3}

                  dataKey="value"

                >

                  {activityDist.map((entry, index) => (

                    <Cell

                      key={`cell-${index}`}

                      fill={entry.color}

                      stroke={isDark ? "#000" : "#FFF"}

                      strokeWidth={2}

                    />

                  ))}

                </Pie>

                <Tooltip

                  contentStyle={{

                    backgroundColor: isDark ? "#000000" : "#FFFFFF",

                    borderColor: "#67E8F9",

                    borderWidth: "1px",

                    borderRadius: "12px",

                    fontSize: "0.75rem",

                    fontFamily: "monospace",

                  }}

                />

              </PieChart>

            </ResponsiveContainer>

          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">

            {activityDist.map((item, index) => (

              <div

                key={index}

                className="flex items-center justify-between text-xs font-mono"

              >

                <span className="flex items-center gap-2 text-[#A7B0BA]">

                  <span

                    className="h-2 w-2"

                    style={{ backgroundColor: item.color }}

                  />

                  {item.name}

                </span>

                <span className="font-semibold text-current">

                  {item.value}%

                </span>

              </div>

            ))}

          </div>

        </div>

      </div>

      {/* RECENT ACTIVITIES & SECURITY EVENTS */}

      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">

        <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-3">

          <div>

            <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              USER AUDIT LOG

            </span>

            <h3 className="mt-1 text-2xl font-light tracking-tight">

              Recent Activities &amp; Security Events

            </h3>

          </div>

          <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">

            RECORDED BY ZERO TRUST PDP

          </span>

        </div>

        <div className="space-y-3">

          {displayEvents.length > 0 ? (

            displayEvents.map((evt) => (

              <div

                key={evt.id}

                className={`rounded-xl border p-4 text-xs transition-all ${

                  evt.isAnomalous ||

                  (evt.riskContribution && evt.riskContribution >= 50)

                    ? "border-red-500/40 bg-red-500/5"

                    : "border-white/10 bg-[#070C12]"

                }`}

              >

                <div className="mb-1 flex items-center justify-between gap-3">

                  <span className="text-sm font-medium">

                    {evt.eventType}{" "}

                    {evt.resourceName

                      ? `→ ${evt.resourceName}`

                      : ""}

                  </span>

                  <span className="shrink-0 text-[13px] uppercase tracking-wider text-[#7F8A96]">

                    {new Date(evt.timestamp).toLocaleTimeString()}

                  </span>

                </div>

                <div className="flex flex-col justify-between gap-2 text-[13px] font-mono text-[#A7B0BA] sm:flex-row">

                  <span>

                    Location / Device:{" "}

                    {evt.ipAddress || "Corporate Intranet"}

                  </span>

                  <span className="text-[#D4AF37]">

                    Risk contribution:{" "}

                    {typeof evt.riskContribution === "number" &&

                    Number.isFinite(evt.riskContribution)

                      ? `${evt.riskContribution}/100`

                      : "Not assessed"}

                  </span>

                </div>

              </div>

            ))

          ) : (

            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">

              <Activity className="mx-auto mb-3 h-6 w-6 text-[#67E8F9]" />

              <p className="text-sm text-[#A7B0BA]">

                No recent activity recorded for this employee.

              </p>

            </div>

          )}

        </div>

      </div>

      {/* INCIDENTS & AUDIT HISTORY */}

      {monitoringData && (

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Incidents */}

          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 sm:p-6">

            <div className="mb-4 flex items-center justify-between">

              <div>

                <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

                  SECURITY RESPONSE

                </span>

                <h2 className="mt-1 text-xl font-light">

                  Incidents

                </h2>

              </div>

              <AlertCircle className="h-5 w-5 text-[#67E8F9]" />

            </div>

            {monitoringData.incidents?.length ? (

              <div className="space-y-3">

                {monitoringData.incidents.map((item) => (

                  <div

                    key={item.id}

                    className="rounded-xl border border-white/10 bg-[#070C12] p-4"

                  >

                    <p className="text-sm font-medium text-[#F4F7FA]">

                      {item.title || "Security Incident"}

                    </p>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#A7B0BA]">

                      <span>

                        Severity: {item.severity || "—"}

                      </span>

                      <span>

                        Status: {item.status || "—"}

                      </span>

                    </div>

                  </div>

                ))}

              </div>

            ) : (

              <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-[#A7B0BA]">

                No incidents recorded for this employee.

              </p>

            )}

          </section>

          {/* Audit History */}

          <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 sm:p-6">

            <div className="mb-4 flex items-center justify-between">

              <div>

                <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

                  COMPLIANCE &amp; TRACEABILITY

                </span>

                <h2 className="mt-1 text-xl font-light">

                  Audit History

                </h2>

              </div>

              <Clock className="h-5 w-5 text-[#67E8F9]" />

            </div>

            {monitoringData.auditEvents?.length ? (

              <div className="space-y-3">

                {monitoringData.auditEvents.map((item) => (

                  <div

                    key={item.id}

                    className="rounded-xl border border-white/10 bg-[#070C12] p-4"

                  >

                    <p className="text-sm font-medium text-[#F4F7FA]">

                      {item.action || "Audit Event"}

                    </p>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#A7B0BA]">

                      <span>

                        Severity: {item.severity || "—"}

                      </span>

                      <span>

                        {item.timestamp

                          ? new Date(item.timestamp).toLocaleString()

                          : "—"}

                      </span>

                    </div>

                  </div>

                ))}

              </div>

            ) : (

              <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-[#A7B0BA]">

                No audit activity available for this employee.

              </p>

            )}

          </section>

        </div>

      )}

      {/* ENDPOINT MONITOR */}

      {currentUser?.id && (

        <section className="mt-6">

          <div className="mb-5">

            <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">

              ENDPOINT INTELLIGENCE

            </span>

            <h2 className="mt-1 text-2xl font-light tracking-tight">

              Device &amp; Endpoint Monitoring

            </h2>

            <p className="mt-2 text-sm text-[#A7B0BA]">

              Assigned endpoint agent, device telemetry, application

              activity and endpoint security observations.

            </p>

          </div>

          <EndpointMonitor employeeId={currentUser.id} />

        </section>

      )}

    </div>

  );

};
