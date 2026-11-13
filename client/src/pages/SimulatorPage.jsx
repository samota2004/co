import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  FlaskConical,
  History,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ConsoleHeader } from "../components/ConsoleHeader.jsx";
import { requestApi } from "../services/api.js";

/* -------------------------------------------------------------------------- */
/*                                THEME STYLES                                */
/* -------------------------------------------------------------------------- */

const panel =
  "rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)]";

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#03070C] px-4 py-3 text-sm text-[#F4F7FA] outline-none transition-all placeholder:text-[#7F8A96] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/10 px-4 py-3 text-sm font-semibold text-[#67E8F9] transition-all hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/15 disabled:cursor-not-allowed disabled:opacity-40";

const scenarioDescriptions = {
  "scenario-1-normal":
    "Baseline request with ordinary volume and a known device. Use it to confirm that routine context stays in the expected policy band.",

  "scenario-2-suspicious-login":
    "Hypothetical off-hours sign-in from an unverified device with failed authentication evidence.",

  "scenario-3-insider-exfiltration":
    "Hypothetical large-volume transfer to a resource outside the employee department, with off-hours context.",

  "scenario-4-critical-compromise":
    "Hypothetical combination of failed authentication, an unknown device, privilege activity and removable-media transfer.",

  "scenario-5-privilege-escalation":
    "Hypothetical privileged-role change. The scenario shows the configured policy response without changing the account.",

  "scenario-6-usb-exfiltration":
    "Hypothetical explicit removable-media transfer. A device attachment alone is not considered a transfer.",

  "scenario-7-large-scale-exfiltration":
    "Hypothetical high-volume transfer combined with unknown-device and cross-department context.",

  "scenario-8-compromised-endpoint":
    "Hypothetical suspicious shell/network context. It does not execute commands or inspect a real endpoint.",
};

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

const getUserId = (user) => user?.id || user?._id || "";

const getResourceId = (resource) =>
  resource?.id || resource?._id || "";

const getDeviceId = (device) =>
  device?.id || device?._id || "";

const getUserRole = (user) =>
  user?.roleCode || user?.role || "UNKNOWN";

const getUserDepartment = (user) =>
  user?.departmentCode || user?.department || "Unassigned";

const formatDate = (value) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString();
};

/* -------------------------------------------------------------------------- */
/*                              SMALL COMPONENTS                              */
/* -------------------------------------------------------------------------- */

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "cyan",
}) {
  const accentStyles = {
    cyan: {
      icon: "border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]",
      value: "text-[#67E8F9]",
    },
    gold: {
      icon: "border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#D4AF37]",
      value: "text-[#D4AF37]",
    },
  };

  const style = accentStyles[accent] || accentStyles.cyan;

  return (
    <div
      className={`${panel} group p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#A7B0BA]">{title}</p>

          <p
            className={`mt-3 text-3xl font-semibold tracking-tight ${style.value}`}
          >
            {value}
          </p>

          <p className="mt-2 text-xs leading-5 text-[#7F8A96]">
            {description}
          </p>
        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${style.icon}`}
        >
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, icon: Icon }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]">
          <Icon size={19} />
        </div>
      )}

      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
            {eyebrow}
          </p>
        )}

        <h2 className="mt-1 text-lg font-semibold text-[#F4F7FA] sm:text-xl">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm leading-6 text-[#7F8A96]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon = Database,
  title,
  description,
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#03070C]/60 px-5 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#67E8F9]/15 bg-[#67E8F9]/5 text-[#67E8F9]">
        <Icon size={22} />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-[#F4F7FA]">
        {title}
      </h3>

      <p className="mt-2 max-w-md text-xs leading-5 text-[#7F8A96]">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              MAIN COMPONENT                                */
/* -------------------------------------------------------------------------- */

export function SimulatorPage({
  users = [],
  resources = [],
  devices = [],
}) {
  const [scenarios, setScenarios] = useState([]);
  const [runs, setRuns] = useState([]);

  const [employee, setEmployee] = useState("");
  const [resource, setResource] = useState("");
  const [device, setDevice] = useState("");

  const [volume, setVolume] = useState(20);
  const [failures, setFailures] = useState(0);
  const [offHours, setOffHours] = useState(false);
  const [privilege, setPrivilege] = useState(false);

  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [scenariosLoading, setScenariosLoading] = useState(true);

  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  /* ---------------------------------------------------------------------- */
  /*                            FETCH SIMULATIONS                           */
  /* ---------------------------------------------------------------------- */

  async function refreshHistory(showLoading = false) {
    if (showLoading) {
      setHistoryLoading(true);
    }

    try {
      const response = await requestApi("/api/simulation/history");

      setRuns(Array.isArray(response?.runs) ? response.runs : []);
    } catch (error) {
      setError(error?.message || "Unable to load simulation history.");
    } finally {
      if (showLoading) {
        setHistoryLoading(false);
      }
    }
  }

  async function loadScenarios() {
    setScenariosLoading(true);

    try {
      const response = await requestApi("/api/simulation/scenarios");

      setScenarios(
        Array.isArray(response?.scenarios) ? response.scenarios : []
      );
    } catch (error) {
      setError(error?.message || "Unable to load predefined scenarios.");
    } finally {
      setScenariosLoading(false);
    }
  }

  useEffect(() => {
    loadScenarios();
    refreshHistory();
  }, []);

  /* ---------------------------------------------------------------------- */
  /*                            DERIVED INFORMATION                         */
  /* ---------------------------------------------------------------------- */

  const eligibleUsers = useMemo(() => {
    return users.filter((user) =>
      ["EMPLOYEE", "MANAGER"].includes(getUserRole(user))
    );
  }, [users]);

  const selectedUser = useMemo(() => {
    return eligibleUsers.find((user) => getUserId(user) === employee);
  }, [eligibleUsers, employee]);

  const selectedResource = useMemo(() => {
    return resources.find(
      (item) => getResourceId(item) === resource
    );
  }, [resources, resource]);

  const availableDevices = useMemo(() => {
    return devices.filter(
      (item) => String(item?.userId || "") === String(employee)
    );
  }, [devices, employee]);

  const chartData = useMemo(() => {
    return runs
      .slice()
      .reverse()
      .map((row, index) => ({
        run: index + 1,
        risk:
          typeof row?.riskScore === "number"
            ? row.riskScore
            : null,
      }))
      .filter((row) => row.risk !== null);
  }, [runs]);

  const averageRisk = useMemo(() => {
    if (!chartData.length) return "—";

    const total = chartData.reduce(
      (sum, item) => sum + item.risk,
      0
    );

    return Math.round(total / chartData.length);
  }, [chartData]);

  const highRiskRuns = useMemo(() => {
    return runs.filter(
      (row) => Number(row?.riskScore) >= 75
    ).length;
  }, [runs]);

  /* ---------------------------------------------------------------------- */
  /*                          RUN SIMULATION                                */
  /* ---------------------------------------------------------------------- */

  async function runSimulation(scenarioId = null) {
    if (busy) return;

    setBusy(true);
    setError("");
    setResult(null);

    try {
      if (!employee) {
        throw new Error(
          "Select a target role and department context before running a simulation."
        );
      }

      const context = {
        userId: employee,
        ...(resource ? { resourceId: resource } : {}),
        ...(device ? { deviceId: device } : {}),
      };

      let response;

      if (scenarioId) {
        response = await requestApi(
          `/api/simulation/scenario/${encodeURIComponent(scenarioId)}`,
          {
            method: "POST",
            body: context,
          }
        );
      } else {
        response = await requestApi("/api/simulation/custom", {
          method: "POST",
          body: {
            ...context,
            downloadVolumeMB: volume,
            failedAuthCount: failures,
            isOffHours: offHours,
            isPrivilegeEscalation: privilege,
          },
        });
      }

      setResult(response);

      await refreshHistory();
    } catch (error) {
      setError(
        error?.message || "The simulation could not be completed."
      );
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                           RESULT INFORMATION                           */
  /* ---------------------------------------------------------------------- */

  const evaluation = result?.decision?.evaluation;

  const contributingFactors = Array.isArray(
    evaluation?.contributingFactors
  )
    ? evaluation.contributingFactors
    : [];

  /* ---------------------------------------------------------------------- */
  /*                                  UI                                    */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 px-4 pb-10 sm:px-6 lg:px-10">

      <ConsoleHeader
        title="Threat Simulation Lab"
        description="Run repeatable, read-only synthetic scenarios against the saved company policy."
        kind="ai"
      />

      {/* SYNTHETIC MODE NOTICE */}

      <section className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#050A10] p-5 sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-[#D4AF37]/5 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#D4AF37]">
            <ShieldCheck size={21} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#D4AF37]">
                Synthetic Simulation Mode
              </h2>

              <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                Read-only
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-[#A7B0BA]">
              A scenario does not create employee activity, risk or trust
              history, incidents, access requests, freeze actions, or model
              predictions. It evaluates hypothetical activity against current
              policy and records the run under the administrator’s audit
              history.
            </p>

            <p className="mt-2 text-xs leading-5 text-[#7F8A96]">
              The selected identity contributes role and department. Selected
              device posture and resource classification are read as context
              only.
            </p>
          </div>
        </div>
      </section>

      {/* ERROR MESSAGE */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-950/20 p-4 text-sm text-red-300"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />

          <p className="flex-1 leading-6">{error}</p>

          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 text-red-300/70 transition hover:text-red-200"
            aria-label="Dismiss error"
          >
            <XCircle size={18} />
          </button>
        </div>
      )}

      {/* TOP METRICS */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Available Scenarios"
          value={scenarios.length}
          description="Predefined synthetic test cases"
          icon={FlaskConical}
          accent="cyan"
        />

        <MetricCard
          title="Simulation Runs"
          value={runs.length}
          description="Recorded administrator test runs"
          icon={Activity}
          accent="gold"
        />

        <MetricCard
          title="Average Risk"
          value={averageRisk === "—" ? "—" : `${averageRisk}/100`}
          description="Average risk across recorded runs"
          icon={BarChart3}
          accent="cyan"
        />

        <MetricCard
          title="High-Risk Runs"
          value={highRiskRuns}
          description="Runs with a risk score of 75 or higher"
          icon={ShieldAlert}
          accent="gold"
        />
      </section>

      {/* SCENARIO CONTEXT */}

      <section className={`${panel} p-5 sm:p-6`}>
        <SectionHeading
          eyebrow="Simulation configuration"
          title="Scenario Context"
          description="Choose the employee identity and optional resource and device context for your hypothetical evaluation."
          icon={UserRound}
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

          <label className="block min-w-0 text-sm font-medium text-[#C5CDD5]">
            Target Role and Department

            <select
              aria-label="Scenario employee"
              required
              value={employee}
              onChange={(event) => {
                setEmployee(event.target.value);
                setDevice("");
                setResult(null);
              }}
              className={inputClass}
            >
              <option value="">Select employee context</option>

              {eligibleUsers.map((user) => {
                const id = getUserId(user);

                return (
                  <option key={id} value={id}>
                    {getUserRole(user)} · {getUserDepartment(user)} (
                    {user.employeeId || user.email || id})
                  </option>
                );
              })}
            </select>

            <span className="mt-2 block text-xs font-normal text-[#7F8A96]">
              Only employee and manager roles are available.
            </span>
          </label>

          <label className="block min-w-0 text-sm font-medium text-[#C5CDD5]">
            Resource Context

            <select
              aria-label="Scenario resource"
              value={resource}
              onChange={(event) => {
                setResource(event.target.value);
                setResult(null);
              }}
              className={inputClass}
            >
              <option value="">No resource context</option>

              {resources.map((item) => {
                const id = getResourceId(item);

                return (
                  <option key={id} value={id}>
                    {item.name || "Unnamed resource"} (
                    {getUserDepartment(item)})
                  </option>
                );
              })}
            </select>

            <span className="mt-2 block text-xs font-normal text-[#7F8A96]">
              Optional resource classification context.
            </span>
          </label>

          <label className="block min-w-0 text-sm font-medium text-[#C5CDD5]">
            Device Posture Context

            <select
              aria-label="Scenario device"
              value={device}
              onChange={(event) => {
                setDevice(event.target.value);
                setResult(null);
              }}
              className={inputClass}
              disabled={!employee}
            >
              <option value="">Unverified device context</option>

              {availableDevices.map((item) => {
                const id = getDeviceId(item);

                return (
                  <option key={id} value={id}>
                    {item.name || "Unnamed device"} · {item.status || "Unknown"}
                  </option>
                );
              })}
            </select>

            <span className="mt-2 block text-xs font-normal text-[#7F8A96]">
              {employee
                ? "Devices associated with the selected employee."
                : "Select an employee to view associated devices."}
            </span>
          </label>
        </div>

        {selectedUser && (
          <div className="mt-5 rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]">
                <UserRound size={17} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F4F7FA]">
                  Selected Simulation Identity
                </p>

                <p className="mt-1 text-xs leading-5 text-[#A7B0BA]">
                  {getUserRole(selectedUser)} in{" "}
                  {getUserDepartment(selectedUser)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-white/10 bg-[#03070C] px-3 py-1.5 text-xs text-[#C5CDD5]">
                    Employee:{" "}
                    {selectedUser.employeeId ||
                      selectedUser.email ||
                      getUserId(selectedUser)}
                  </span>

                  {selectedResource && (
                    <span className="rounded-lg border border-white/10 bg-[#03070C] px-3 py-1.5 text-xs text-[#C5CDD5]">
                      Resource: {selectedResource.name}
                    </span>
                  )}

                  {device && (
                    <span className="rounded-lg border border-white/10 bg-[#03070C] px-3 py-1.5 text-xs text-[#C5CDD5]">
                      Device:{" "}
                      {availableDevices.find(
                        (item) => getDeviceId(item) === device
                      )?.name || "Selected"}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs leading-5 text-[#7F8A96]">
                  The production account’s risk/trust scores and its event,
                  incident, session, and trust-history records are not read
                  or modified.
                </p>
              </div>
            </div>
          </div>
        )}

        {!eligibleUsers.length && (
          <div className="mt-5">
            <EmptyState
              icon={UserRound}
              title="No eligible employee identities"
              description="Employee and manager accounts are required to run a simulation."
            />
          </div>
        )}
      </section>

      {/* PREDEFINED SCENARIOS */}

      <section>
        <SectionHeading
          eyebrow="Preconfigured test cases"
          title="Predefined Test Scenarios"
          description="Each case produces a risk score, policy action and factor explanation without enforcing that action."
          icon={FlaskConical}
        />

        {scenariosLoading ? (
          <div className={`${panel} flex items-center justify-center gap-3 p-10`}>
            <RefreshCw size={19} className="animate-spin text-[#67E8F9]" />
            <span className="text-sm text-[#A7B0BA]">
              Loading predefined scenarios...
            </span>
          </div>
        ) : scenarios.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No predefined scenarios available"
            description="The simulation API did not return any predefined test cases. Check the backend scenario configuration."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {scenarios.map((item, index) => (
              <article
                key={item.id}
                className={`${panel} group flex flex-col p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6`}
              >
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]">
                      <FlaskConical size={19} />
                    </div>

                    <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                      Test {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#67E8F9]">
                    Synthetic Case
                  </p>

                  <h3 className="mt-2 text-base font-semibold text-[#F4F7FA]">
                    {item.name || "Unnamed scenario"}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-[#A7B0BA]">
                    {scenarioDescriptions[item.id] ||
                      item.description ||
                      "No scenario description is available."}
                  </p>

                  {item.eventType && (
                    <div className="mt-4 flex items-center gap-2">
                      <Activity size={14} className="text-[#D4AF37]" />

                      <span className="text-xs text-[#7F8A96]">
                        Hypothetical event type:
                      </span>

                      <span className="text-xs font-medium text-[#C5CDD5]">
                        {item.eventType}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy || !employee}
                  className={`${primaryButton} mt-6 w-full`}
                  onClick={() => runSimulation(item.id)}
                >
                  {busy ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Run Read-Only Scenario
                    </>
                  )}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* CUSTOM SIMULATION */}

      <section className={`${panel} p-5 sm:p-6`}>
        <SectionHeading
          eyebrow="Manual scenario configuration"
          title="Custom Synthetic Context"
          description="Configure hypothetical activity values and evaluate them against the current policy."
          icon={Cpu}
        />

        <div className="mb-5 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-[#D4AF37]"
            />

            <p className="text-xs leading-5 text-[#A7B0BA]">
              These values are hypothetical and bounded by server validation.
              They do not represent actual employee activity or modify a
              production account.
            </p>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSimulation();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

            <label className="block text-sm font-medium text-[#C5CDD5]">
              Download Volume (MB)

              <input
                type="number"
                min={0}
                max={1000000}
                required
                value={volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  setResult(null);
                }}
                className={inputClass}
              />

              <span className="mt-2 block text-xs font-normal text-[#7F8A96]">
                Hypothetical data transfer volume.
              </span>
            </label>

            <label className="block text-sm font-medium text-[#C5CDD5]">
              Failed Authentications

              <input
                type="number"
                min={0}
                max={100}
                required
                value={failures}
                onChange={(event) => {
                  setFailures(Number(event.target.value));
                  setResult(null);
                }}
                className={inputClass}
              />

              <span className="mt-2 block text-xs font-normal text-[#7F8A96]">
                Number of hypothetical failed login attempts.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#03070C] p-4 transition hover:border-[#67E8F9]/30">
              <input
                type="checkbox"
                checked={offHours}
                onChange={(event) => {
                  setOffHours(event.target.checked);
                  setResult(null);
                }}
                className="mt-1 h-4 w-4 accent-[#67E8F9]"
              />

              <span>
                <span className="block text-sm font-medium text-[#F4F7FA]">
                  Off-Hours Context
                </span>

                <span className="mt-1 block text-xs leading-5 text-[#7F8A96]">
                  Simulate activity outside normal working hours.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#03070C] p-4 transition hover:border-[#D4AF37]/30">
              <input
                type="checkbox"
                checked={privilege}
                onChange={(event) => {
                  setPrivilege(event.target.checked);
                  setResult(null);
                }}
                className="mt-1 h-4 w-4 accent-[#D4AF37]"
              />

              <span>
                <span className="block text-sm font-medium text-[#F4F7FA]">
                  Privilege-Change Context
                </span>

                <span className="mt-1 block text-xs leading-5 text-[#7F8A96]">
                  Simulate a hypothetical privilege escalation event.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#7F8A96]">
              The selected employee context above is required.
            </p>

            <button
              type="submit"
              disabled={busy || !employee}
              className={primaryButton}
            >
              {busy ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Evaluating Context...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Evaluate Synthetic Context
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* SIMULATION RESULT */}

      {result && (
        <section
          role="status"
          className="overflow-hidden rounded-2xl border border-[#67E8F9]/30 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]">
                <ShieldCheck size={18} />
              </div>

              <div>
                <p className="text-sm font-semibold text-[#F4F7FA]">
                  Simulation Evaluation Result
                </p>

                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#67E8F9]">
                  Read-Only Result
                </p>
              </div>
            </div>

            <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1.5 text-xs font-medium text-[#D4AF37]">
              {result.scenario || "Synthetic Evaluation"}
            </span>
          </div>

          {!evaluation ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Incomplete simulation response"
                description="The API returned a response, but the expected decision evaluation data was not available."
              />
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-3">

                <div className="rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#A7B0BA]">
                      Calculated Risk
                    </p>

                    <Activity size={17} className="text-[#67E8F9]" />
                  </div>

                  <p className="mt-3 text-3xl font-semibold text-[#67E8F9]">
                    {evaluation.riskScore ?? "—"}

                    <span className="ml-1 text-sm font-normal text-[#7F8A96]">
                      / 100
                    </span>
                  </p>
                </div>

                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#A7B0BA]">
                      Risk Band
                    </p>

                    <ShieldAlert size={17} className="text-[#D4AF37]" />
                  </div>

                  <p className="mt-3 text-2xl font-semibold text-[#D4AF37]">
                    {evaluation.riskLevel || "Unknown"}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#03070C] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#A7B0BA]">
                      Policy Action
                    </p>

                    <Shield size={17} className="text-[#67E8F9]" />
                  </div>

                  <p className="mt-3 break-words text-2xl font-semibold text-[#F4F7FA]">
                    {result.decision?.decision || "Not available"}
                  </p>
                </div>
              </div>

              {result.decision?.reason && (
                <div className="mt-5 rounded-xl border border-white/10 bg-[#03070C] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
                    Policy Evaluation Reason
                  </p>

                  <p className="mt-2 text-sm leading-6 text-[#C5CDD5]">
                    {result.decision.reason}
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/5 p-4">
                <AlertTriangle
                  size={17}
                  className="mt-0.5 shrink-0 text-[#D4AF37]"
                />

                <p className="text-xs leading-5 text-[#A7B0BA]">
                  ML inference: not run. Production account, current scores,
                  sessions, incidents and device restrictions remain unchanged.
                </p>
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/10 text-[#67E8F9]">
                        <BarChart3 size={17} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-[#F4F7FA]">
                          Risk Factor Breakdown
                        </p>

                        <p className="mt-0.5 text-xs text-[#7F8A96]">
                          {contributingFactors.length} contributing factor
                          {contributingFactors.length === 1 ? "" : "s"} identified
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-medium text-[#67E8F9] transition group-open:rotate-180">
                      <span className="inline-block">⌄</span>
                    </span>
                  </summary>

                  <div className="mt-4 space-y-3">
                    {contributingFactors.length > 0 ? (
                      contributingFactors.map((factor, index) => (
                        <div
                          key={`${factor.factor || "factor"}-${index}`}
                          className="rounded-xl border border-white/10 bg-[#03070C] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#F4F7FA]">
                              {factor.factor || "Unspecified factor"}
                            </p>

                            <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-2.5 py-1 text-xs font-semibold text-[#D4AF37]">
                              {factor.scoreImpact > 0 ? "+" : ""}
                              {factor.scoreImpact ?? 0} points
                            </span>
                          </div>

                          {factor.description && (
                            <p className="mt-2 text-xs leading-5 text-[#A7B0BA]">
                              {factor.description}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-white/10 bg-[#03070C] p-4 text-sm text-[#7F8A96]">
                        No qualifying hypothetical risk factors.
                      </p>
                    )}
                  </div>
                </details>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SIMULATION HISTORY */}

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <SectionHeading
            eyebrow="Administrator audit records"
            title="Synthetic Test History"
            description="Review previous read-only simulation runs and their evaluated risk scores."
            icon={History}
          />

          <button
            type="button"
            onClick={() => refreshHistory(true)}
            disabled={historyLoading}
            className={primaryButton}
          >
            <RefreshCw
              size={15}
              className={historyLoading ? "animate-spin" : ""}
            />

            {historyLoading ? "Refreshing..." : "Refresh History"}
          </button>
        </div>

        <div className="p-5 sm:p-6">

          {chartData.length > 0 && (
            <div className="mb-6 rounded-xl border border-white/10 bg-[#03070C] p-4 sm:p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#F4F7FA]">
                    Risk Score Trend
                  </h3>

                  <p className="mt-1 text-xs text-[#7F8A96]">
                    Risk scores across recorded synthetic runs.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-[#67E8F9]">
                  <span className="h-2 w-2 rounded-full bg-[#67E8F9]" />
                  Synthetic Risk
                </div>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="simulatorRiskGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#67E8F9"
                          stopOpacity={0.25}
                        />

                        <stop
                          offset="95%"
                          stopColor="#67E8F9"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#253244"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="run"
                      stroke="#7F8A96"
                      tick={{ fill: "#7F8A96", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      domain={[0, 100]}
                      stroke="#7F8A96"
                      tick={{ fill: "#7F8A96", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={35}
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#050A10",
                        border: "1px solid rgba(103,232,249,0.25)",
                        borderRadius: "12px",
                        color: "#F4F7FA",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "#67E8F9" }}
                      formatter={(value) => [
                        `${value}/100`,
                        "Synthetic Risk",
                      ]}
                      labelFormatter={(value) => `Run ${value}`}
                    />

                    <Area
                      type="monotone"
                      dataKey="risk"
                      stroke="#67E8F9"
                      strokeWidth={2}
                      fill="url(#simulatorRiskGradient)"
                      activeDot={{
                        r: 5,
                        fill: "#67E8F9",
                        stroke: "#03070C",
                        strokeWidth: 2,
                      }}
                      name="Synthetic risk"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {runs.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#F4F7FA]">
                  Recent Simulation Runs
                </h3>

                <span className="text-xs text-[#7F8A96]">
                  Showing latest {Math.min(runs.length, 10)} records
                </span>
              </div>

              {runs.slice(0, 10).map((row, index) => (
                <div
                  key={row.id || `${row.timestamp}-${index}`}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#03070C] p-4 transition-all hover:border-[#67E8F9]/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/5 text-[#67E8F9]">
                      <FlaskConical size={17} />
                    </div>

                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-[#F4F7FA]">
                        {row.scenario || "Synthetic Scenario"}
                      </p>

                      <p className="mt-1 text-xs text-[#7F8A96]">
                        Policy action:{" "}
                        <span className="text-[#C5CDD5]">
                          {row.policyAction || "Not recorded"}
                        </span>
                      </p>

                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7F8A96]">
                        <Clock3 size={12} />
                        {formatDate(row.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className="text-xs text-[#7F8A96]">
                      Risk Score
                    </span>

                    <span className="text-lg font-semibold text-[#67E8F9]">
                      {row.riskScore ?? "—"}
                      <span className="ml-1 text-xs font-normal text-[#7F8A96]">
                        /100
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={History}
              title="No simulation history yet"
              description="No synthetic scenarios have been run by this administrator. Run a predefined or custom scenario to create the first audit record."
            />
          )}
        </div>
      </section>

      {/* FOOTER NOTE */}

      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#050A10] p-4">
        <CheckCircle2
          size={17}
          className="mt-0.5 shrink-0 text-[#67E8F9]"
        />

        <p className="text-xs leading-5 text-[#7F8A96]">
          Simulation results represent hypothetical policy evaluations.
          They do not independently enforce access restrictions, freeze
          accounts, trigger incidents, or run ML inference.
        </p>
      </div>
    </div>
  );
}

export default SimulatorPage;