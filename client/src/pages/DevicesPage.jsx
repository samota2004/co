import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Laptop,
  Smartphone,
  Search,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  Wifi,
  Monitor,
  LockKeyhole,
  AlertTriangle,
  Server,
  Filter,
  Globe2,
  X,
  CheckCircle2,
  CircleHelp,
} from "lucide-react";
import { EndpointMonitor } from "../components/EndpointMonitor.jsx";
import { requestApi } from "../services/api.js";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const STATUS_CONFIG = {
  TRUSTED: {
    className:
      "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300",
    dot: "bg-emerald-400",
  },
  SUSPICIOUS: {
    className:
      "border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] text-[#D4AF37]",
    dot: "bg-[#D4AF37]",
  },
  REVOKED: {
    className:
      "border-red-400/25 bg-red-400/[0.07] text-red-300",
    dot: "bg-red-400",
  },
  MONITORED: {
    className:
      "border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] text-[#67E8F9]",
    dot: "bg-[#67E8F9]",
  },
  DEFAULT: {
    className: "border-white/10 bg-white/[0.03] text-[#9AA5AF]",
    dot: "bg-[#7A8691]",
  },
};

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
};

const formatTrustScore = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue.toFixed(2);
};

const getTrustScoreColor = (value) => {
  const score = Number(value);

  if (!Number.isFinite(score)) return "text-[#A7B0BA]";
  if (score >= 80) return "text-emerald-300";
  if (score >= 50) return "text-[#D4AF37]";

  return "text-red-300";
};

const getStatusClass = (status) => {
  return (
    STATUS_CONFIG[String(status || "").toUpperCase()] ||
    STATUS_CONFIG.DEFAULT
  ).className;
};

const getStatusIcon = (status) => {
  switch (String(status || "").toUpperCase()) {
    case "TRUSTED":
      return <ShieldCheck className="h-3.5 w-3.5" />;

    case "SUSPICIOUS":
      return <ShieldAlert className="h-3.5 w-3.5" />;

    case "REVOKED":
      return <ShieldX className="h-3.5 w-3.5" />;

    case "MONITORED":
      return <Activity className="h-3.5 w-3.5" />;

    default:
      return <CircleHelp className="h-3.5 w-3.5" />;
  }
};

const getDeviceIcon = (device) => {
  const type = String(
    device?.deviceType ?? device?.type ?? ""
  ).toUpperCase();

  if (
    type.includes("MOBILE") ||
    type.includes("PHONE") ||
    type.includes("TABLET")
  ) {
    return <Smartphone className="h-4 w-4" strokeWidth={1.7} />;
  }

  return <Laptop className="h-4 w-4" strokeWidth={1.7} />;
};

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

export const DevicesPage = ({
  devices = [],
  users = [],
  onRefreshData,
}) => {
  const endpointMonitor = useRef(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState(null);
  const [localDevices, setLocalDevices] = useState(
    Array.isArray(devices) ? devices : []
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // --------------------------------------------------
  // DEVICE DATA SYNC
  // --------------------------------------------------

  useEffect(() => {
    setLocalDevices(Array.isArray(devices) ? devices : []);
  }, [devices]);

  // --------------------------------------------------
  // REFRESH DEVICES
  // --------------------------------------------------

  const refreshDevices = async () => {
    try {
      setRefreshing(true);
      setError("");
      setSuccessMessage("");

      // Refresh device records and endpoint telemetry.
      const [deviceResult, endpointResult] = await Promise.allSettled([
        requestApi("/api/devices").then((result) => {
          if (!Array.isArray(result?.devices)) {
            throw new Error(
              "Invalid device response from server."
            );
          }

          setLocalDevices(result.devices);
          return result;
        }),
        endpointMonitor.current?.refresh(),
      ]);

      if (deviceResult.status === "rejected") {
        throw deviceResult.reason;
      }

      if (endpointResult.status === "rejected") {
        throw endpointResult.reason;
      }

      setSuccessMessage("Device registry refreshed successfully.");
    } catch (err) {
      console.error("Failed to refresh devices:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to refresh devices."
      );
    } finally {
      setRefreshing(false);
    }
  };

  // --------------------------------------------------
  // ENRICH DEVICE DATA
  // --------------------------------------------------

  const enrichedDevices = useMemo(() => {
    return localDevices.map((device) => {
      const user =
        users.find(
          (item) =>
            String(item.id) === String(device.userId)
        ) ||
        device.user ||
        null;

      return {
        ...device,
        employeeName:
          user?.name ?? device.userName ?? null,
        employeeId:
          user?.employeeId ?? device.employeeId ?? null,
        browser:
          device.browser ?? device.browserName ?? null,
        os:
          device.os ?? device.operatingSystem ?? null,
        ipAddress:
          device.ipAddress ?? device.ip ?? null,
        lastUsed:
          device.lastSeenAt ??
          device.lastSeen ??
          device.lastUsed ??
          null,
        activeSession:
          typeof device.activeSession === "boolean"
            ? device.activeSession
            : typeof device.isActive === "boolean"
              ? device.isActive
              : null,
      };
    });
  }, [localDevices, users]);

  // --------------------------------------------------
  // FILTER DEVICES
  // --------------------------------------------------

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return enrichedDevices.filter((device) => {
      const searchableValues = [
        device.id,
        device.deviceName,
        device.employeeName,
        device.employeeId,
        device.ipAddress,
        device.os,
        device.browser,
        device.status,
      ];

      const matchesSearch =
        !query ||
        searchableValues.some((value) =>
          String(value ?? "").toLowerCase().includes(query)
        );

      const matchesStatus =
        statusFilter === "ALL" ||
        String(device.status || "").toUpperCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [enrichedDevices, search, statusFilter]);

  // --------------------------------------------------
  // DEVICE TRUST ACTION
  // --------------------------------------------------

  const handleToggleTrust = async (device) => {
    if (!device?.id) return;

    try {
      setUpdatingId(device.id);
      setError("");
      setSuccessMessage("");

      const isCurrentlyTrusted =
        String(device.status || "").toUpperCase() === "TRUSTED";

      const newTrustState = !isCurrentlyTrusted;

      const data = await requestApi(
        `/api/devices/${device.id}`,
        {
          method: "PATCH",
          body: {
            trustScore: newTrustState ? 80 : 0,
            status: newTrustState ? "TRUSTED" : "MONITORED",
          },
        }
      );

      if (data?.device) {
        setLocalDevices((current) =>
          current.map((item) =>
            item.id === device.id
              ? {
                  ...item,
                  ...data.device,
                }
              : item
          )
        );
      } else {
        setLocalDevices((current) =>
          current.map((item) =>
            item.id === device.id
              ? {
                  ...item,
                  trustScore: newTrustState ? 80 : 0,
                  status: newTrustState ? "TRUSTED" : "MONITORED",
                }
              : item
          )
        );
      }

      if (onRefreshData) {
        await onRefreshData();
      }

      setSuccessMessage(
        newTrustState
          ? "Device marked as trusted."
          : "Device trust has been removed. It is now monitored."
      );
    } catch (err) {
      console.error("Failed to update device trust:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update device trust."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // --------------------------------------------------
  // DEVICE REVOKE ACTION
  // --------------------------------------------------

  const handleRevoke = async (deviceId) => {
    if (!deviceId) return;

    try {
      setUpdatingId(deviceId);
      setError("");
      setSuccessMessage("");

      const data = await requestApi(
        `/api/devices/${deviceId}`,
        {
          method: "PATCH",
          body: {
            status: "REVOKED",
            trustScore: 0,
          },
        }
      );

      if (data?.device) {
        setLocalDevices((current) =>
          current.map((device) =>
            device.id === deviceId
              ? {
                  ...device,
                  ...data.device,
                }
              : device
          )
        );
      } else {
        setLocalDevices((current) =>
          current.map((device) =>
            device.id === deviceId
              ? {
                  ...device,
                  status: "REVOKED",
                  trustScore: 0,
                }
              : device
          )
        );
      }

      if (onRefreshData) {
        await onRefreshData();
      }

      setSuccessMessage("Device access has been revoked.");
    } catch (err) {
      console.error("Failed to revoke device:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to revoke device."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // --------------------------------------------------
  // METRICS
  // --------------------------------------------------

  const registeredCount = localDevices.length;

  const trustedCount = localDevices.filter(
    (device) => device.status === "TRUSTED"
  ).length;

  const suspiciousCount = localDevices.filter(
    (device) => device.status === "SUSPICIOUS"
  ).length;

  const revokedCount = localDevices.filter(
    (device) => device.status === "REVOKED"
  ).length;

  const activeSessionCount = enrichedDevices.filter(
    (device) => device.activeSession === true
  ).length;

  // --------------------------------------------------
  // PAGE UI
  // --------------------------------------------------

  return (
    <div className="min-h-full bg-[#03070C] text-[#F4F7FA]">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">

        <EndpointMonitor
          ref={endpointMonitor}
          administrator
          users={users}
        />

        {/* PAGE HEADER */}

        <section className="group relative min-h-[285px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)] lg:min-h-[295px]">

          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] overflow-hidden lg:block">
            <div className="absolute inset-0 opacity-80">
              <div className="absolute left-[8%] right-0 top-[22%] border-t border-[#67E8F9]/10" />
              <div className="absolute left-[2%] right-0 top-[50%] border-t border-[#67E8F9]/10" />
              <div className="absolute left-[8%] right-0 top-[78%] border-t border-[#67E8F9]/10" />
              <div className="absolute left-[14%] top-0 bottom-0 border-l border-[#67E8F9]/10" />
              <div className="absolute left-[34%] top-0 bottom-0 border-l border-[#67E8F9]/10" />
              <div className="absolute left-[54%] top-0 bottom-0 border-l border-[#67E8F9]/10" />
              <div className="absolute left-[74%] top-0 bottom-0 border-l border-[#67E8F9]/10" />
              <div className="absolute right-[6%] top-0 bottom-0 border-l border-[#67E8F9]/10" />
            </div>

            <div className="absolute right-[11%] top-1/2 h-[265px] w-[265px] -translate-y-1/2">
              <div className="absolute inset-0 rounded-full border border-[#67E8F9]/10" />
              <div className="absolute inset-7 rounded-full border border-[#D4AF37]/20" />
              <div className="absolute inset-14 rounded-full border border-[#67E8F9]/20" />
              <div className="absolute inset-[68px] rounded-full border border-[#67E8F9]/10" />

              <div className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/45 bg-[#070C12]/90 shadow-[0_0_45px_rgba(103,232,249,0.08)]">
                <div className="absolute inset-3 rounded-xl border border-[#D4AF37]/20" />
                <ShieldCheck
                  className="relative z-10 h-10 w-10 text-[#67E8F9]"
                  strokeWidth={1.35}
                />
              </div>

              <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.75)]" />
              <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.75)]" />
              <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#67E8F9]" />
              <div className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#D4AF37]" />
            </div>

            <div className="absolute right-[44%] top-[18%] rounded-lg border border-[#67E8F9]/15 bg-[#070C12]/80 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#7F8A96]">
                <Monitor className="h-3.5 w-3.5 text-[#67E8F9]" />
                Endpoint
              </div>
            </div>

            <div className="absolute bottom-[17%] right-[7%] rounded-lg border border-[#D4AF37]/20 bg-[#070C12]/85 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#7F8A96]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                Zero Trust
              </div>
            </div>
          </div>

          <div className="relative z-10 flex min-h-[285px] items-center px-6 py-7 sm:px-8 lg:min-h-[295px] lg:px-9 lg:py-8">
            <div className="w-full max-w-full lg:max-w-[68%]">

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                  CyberOrbit Endpoint Security
                </div>

                <span className="text-[11px] uppercase tracking-wider text-[#7F8A96]">
                  Zero Trust Device Posture
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-light leading-[0.98] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Device Trust &amp;
                <span className="block text-[#67E8F9]">
                  Hardware Registry
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
                Monitor endpoint identity, hardware posture,
                trust state, and active sessions across the
                CyberOrbit Zero Trust environment.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">

                <div className="flex items-center gap-2.5 border-r border-white/[0.08] pr-5">
                  <Server className="h-4 w-4 shrink-0 text-[#67E8F9]" />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {registeredCount}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#7F8A96]">
                    Registered
                  </span>
                </div>

                <div className="flex items-center gap-2.5 border-r border-white/[0.08] pr-5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {trustedCount}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#7F8A96]">
                    Trusted
                  </span>
                </div>

                <div className="flex items-center gap-2.5 border-r border-white/[0.08] pr-5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {suspiciousCount}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#7F8A96]">
                    Suspicious
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Wifi className="h-4 w-4 shrink-0 text-[#67E8F9]" />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {activeSessionCount}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#7F8A96]">
                    Active Sessions
                  </span>
                </div>

              </div>
            </div>
          </div>
        </section>
                {/* QUICK OVERVIEW */}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
                <Monitor className="h-4 w-4" />
              </div>
              <Activity className="h-4 w-4 text-white/15" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-[#C7D0D8]">
                Registered Endpoints
              </div>
              <div className="text-2xl font-light tracking-tight text-[#F4F7FA]">
                {registeredCount}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#7F8A96]">
              Total registered devices
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-[#070C12] sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <Activity className="h-4 w-4 text-white/15" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-[#C7D0D8]">
                Trusted Devices
              </div>
              <div className="text-2xl font-light tracking-tight text-[#F4F7FA]">
                {trustedCount}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#7F8A96]">
              Devices with trusted status
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/30 hover:bg-[#070C12] sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] text-[#D4AF37]">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <Activity className="h-4 w-4 text-white/15" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-[#C7D0D8]">
                Suspicious Devices
              </div>
              <div className="text-2xl font-light tracking-tight text-[#F4F7FA]">
                {suspiciousCount}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#7F8A96]">
              Devices requiring investigation
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/30 hover:bg-[#070C12] sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/[0.05] text-red-300">
                <ShieldX className="h-4 w-4" />
              </div>
              <Activity className="h-4 w-4 text-white/15" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-[#C7D0D8]">
                Revoked Devices
              </div>
              <div className="text-2xl font-light tracking-tight text-[#F4F7FA]">
                {revokedCount}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#7F8A96]">
              Devices with revoked access
            </p>
          </div>

        </section>

        {/* ERROR MESSAGE */}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/[0.05] px-5 py-4 text-xs text-red-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

            <span className="flex-1 leading-5">
              {error}
            </span>

            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="rounded-md p-1 text-red-300 transition hover:bg-red-400/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SUCCESS MESSAGE */}

        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] px-5 py-4 text-xs text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

            <span className="flex-1 leading-5">
              {successMessage}
            </span>

            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              aria-label="Dismiss success message"
              className="rounded-md p-1 text-emerald-300 transition hover:bg-emerald-400/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SEARCH AND FILTER */}

        <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">

          <div className="mb-5 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#67E8F9]" />

            <h2 className="text-xs font-semibold uppercase tracking-[0.17em] text-[#F4F7FA]">
              Device Search &amp; Filters
            </h2>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

            <div className="relative w-full lg:max-w-[430px]">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7F8A96]">
                Search device registry
              </label>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Device ID, Employee, IP, or OS..."
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#03070C] pl-10 pr-4 text-xs text-[#F4F7FA] outline-none transition-all placeholder:text-[#596570] hover:border-white/20 focus:border-[#67E8F9]/50 focus:ring-1 focus:ring-[#67E8F9]/15"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7F8A96]">
                  Trust Status
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                  className="h-11 min-w-[180px] cursor-pointer rounded-xl border border-white/10 bg-[#03070C] px-3 text-xs text-[#E5EAEE] outline-none transition-colors hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/50"
                >
                  <option value="ALL">All Endpoints</option>
                  <option value="TRUSTED">Trusted Only</option>
                  <option value="SUSPICIOUS">Suspicious</option>
                  <option value="MONITORED">Monitored</option>
                  <option value="REVOKED">Revoked</option>
                </select>
              </div>

              <button
                type="button"
                onClick={refreshDevices}
                aria-label="Refresh device registry"
                disabled={refreshing}
                className="flex h-11 items-center gap-2 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-4 text-xs font-semibold text-[#67E8F9] transition-all hover:border-[#67E8F9]/50 hover:bg-[#67E8F9]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />

                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">

            <p className="text-xs text-[#7F8A96]">
              Showing{" "}
              <span className="font-semibold text-[#67E8F9]">
                {filteredDevices.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-[#F4F7FA]">
                {enrichedDevices.length}
              </span>{" "}
              devices
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setError("");
                setSuccessMessage("");
              }}
              className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#D4AF37] transition hover:text-[#F4F7FA]"
            >
              Reset Filters
            </button>

          </div>
        </section>
                {/* DEVICE REGISTRY */}

        <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/20">

          {/* TABLE HEADER */}

          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05]">
                <Server className="h-5 w-5 text-[#67E8F9]" />
              </div>

              <div>
                <h2 className="text-base font-semibold tracking-tight text-[#F4F7FA]">
                  Device Registry
                </h2>

                <p className="mt-1 text-xs text-[#7D8994]">
                  {filteredDevices.length} devices displayed
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#7D8994]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
              Logical Browser / Device Registry
            </div>

          </div>

          {/* TABLE */}

          <div className="overflow-x-auto">

            <table className="w-full min-w-[1150px] border-collapse">

              <thead>
                <tr className="border-b border-white/[0.07] bg-[#070C12]">

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Device ID
                  </th>

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Employee
                  </th>

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Browser
                  </th>

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Operating System
                  </th>

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    IP Address
                  </th>

                  <th className="px-5 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Trust Status
                  </th>

                  <th className="px-5 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Trust Score
                  </th>

                  <th className="px-5 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Last Used
                  </th>

                  <th className="px-5 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Active Session
                  </th>

                  <th className="px-5 py-4 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-[#67E8F9]">
                    Actions
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.055]">

                {filteredDevices.length > 0 ? (
                  filteredDevices.map((device) => {
                    const normalizedStatus = String(
                      device.status || ""
                    ).toUpperCase();

                    const isTrusted =
                      normalizedStatus === "TRUSTED";

                    const isRevoked =
                      normalizedStatus === "REVOKED";

                    const isUpdating =
                      updatingId === device.id;

                    return (
                      <tr
                        key={device.id}
                        className="group/row transition-colors duration-200 hover:bg-[#67E8F9]/[0.025] hover:shadow-[inset_3px_0_0_#67E8F9]"
                      >

                        {/* DEVICE ID */}

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">

                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                              {getDeviceIcon(device)}
                            </div>

                            <div className="min-w-0">
                              <div className="max-w-[160px] truncate font-mono text-xs text-[#DCE3E8]">
                                {formatValue(device.id)}
                              </div>

                              {device.deviceName && (
                                <div className="mt-1 max-w-[160px] truncate text-[10px] text-[#68747F]">
                                  {device.deviceName}
                                </div>
                              )}
                            </div>

                          </div>
                        </td>

                        {/* EMPLOYEE */}

                        <td className="px-5 py-4">
                          <div className="max-w-[170px] truncate text-xs font-medium text-[#E0E5E9]">
                            {formatValue(device.employeeName)}
                          </div>

                          {device.employeeId && (
                            <div className="mt-1 text-[10px] text-[#68747F]">
                              {device.employeeId}
                            </div>
                          )}
                        </td>

                        {/* BROWSER */}

                        <td className="px-5 py-4">
                          <span className="text-xs text-[#A7B0BA]">
                            {formatValue(device.browser)}
                          </span>
                        </td>

                        {/* OPERATING SYSTEM */}

                        <td className="px-5 py-4">
                          <span className="text-xs text-[#A7B0BA]">
                            {formatValue(device.os)}
                          </span>
                        </td>

                        {/* IP ADDRESS */}

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />

                            <span className="font-mono text-xs text-[#A7B0BA]">
                              {formatValue(device.ipAddress)}
                            </span>
                          </div>
                        </td>

                        {/* TRUST STATUS */}

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-semibold ${getStatusClass(
                              normalizedStatus
                            )}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                STATUS_CONFIG[normalizedStatus]?.dot ||
                                STATUS_CONFIG.DEFAULT.dot
                              }`}
                            />

                            {getStatusIcon(normalizedStatus)}

                            {formatValue(normalizedStatus)}
                          </span>
                        </td>

                        {/* TRUST SCORE */}

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`font-mono text-sm font-semibold ${getTrustScoreColor(
                              device.trustScore
                            )}`}
                          >
                            {formatTrustScore(device.trustScore)}
                          </span>

                          {device.trustScore !== null &&
                            device.trustScore !== undefined &&
                            device.trustScore !== "" && (
                              <span className="ml-1 text-[10px] text-[#596570]">
                                /100
                              </span>
                            )}
                        </td>

                        {/* LAST USED */}

                        <td className="px-5 py-4">
                          <span className="whitespace-nowrap text-xs text-[#89949E]">
                            {formatDate(device.lastUsed)}
                          </span>
                        </td>

                        {/* ACTIVE SESSION */}

                        <td className="px-5 py-4 text-center">
                          {device.activeSession === true ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-emerald-300">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                              CONNECTED
                            </span>
                          ) : device.activeSession === false ? (
                            <span className="text-[10px] text-[#697581]">
                              IDLE
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#697581]">
                              —
                            </span>
                          )}
                        </td>

                        {/* ACTIONS */}

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                handleToggleTrust(device)
                              }
                              disabled={isUpdating || isRevoked}
                              title={
                                isRevoked
                                  ? "Revoked devices cannot be trusted from this action."
                                  : isTrusted
                                    ? "Remove device trust"
                                    : "Mark device as trusted"
                              }
                              className={`rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                isTrusted
                                  ? "border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] text-[#D4AF37] hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/10"
                                  : "border-[#67E8F9]/25 bg-[#67E8F9]/[0.04] text-[#67E8F9] hover:border-[#67E8F9]/45 hover:bg-[#67E8F9]/10"
                              }`}
                            >
                              {isUpdating
                                ? "UPDATING..."
                                : isTrusted
                                  ? "UNTRUST"
                                  : "TRUST"}
                            </button>

                            {!isRevoked && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRevoke(device.id)
                                }
                                disabled={isUpdating}
                                className="rounded-lg border border-red-400/20 bg-red-400/[0.03] px-2.5 py-2 text-[10px] font-semibold text-red-300 transition-all hover:border-red-400/40 hover:bg-red-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isUpdating
                                  ? "UPDATING..."
                                  : "REVOKE"}
                              </button>
                            )}

                          </div>
                        </td>

                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-16 text-center"
                    >

                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.04] text-[#67E8F9]">
                        <Laptop
                          className="h-7 w-7"
                          strokeWidth={1.4}
                        />
                      </div>

                      <div className="mt-4 text-sm font-medium text-[#A7B0BA]">
                        {localDevices.length === 0
                          ? "No registered devices found."
                          : "No devices match the specified query."}
                      </div>

                      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#596570]">
                        {localDevices.length === 0
                          ? "Device records will appear here when they are returned by the backend."
                          : "Try changing your search term or trust status filter to find the required device."}
                      </p>

                      {localDevices.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setStatusFilter("ALL");
                          }}
                          className="mt-4 rounded-lg border border-[#67E8F9]/25 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.07]"
                        >
                          Clear Filters
                        </button>
                      )}

                    </td>
                  </tr>
                )}

              </tbody>
            </table>

          </div>

          {/* TABLE FOOTER */}

          <div className="flex flex-col justify-between gap-3 border-t border-white/[0.06] bg-[#070C12] px-5 py-4 sm:flex-row sm:items-center sm:px-6">

            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[#7D8994]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
              Endpoint telemetry registry
            </div>

            <div className="flex items-center gap-2 text-[10px] text-[#7D8994]">
              <LockKeyhole className="h-3.5 w-3.5 text-[#67E8F9]" />
              Zero Trust Device Registry
              <span className="font-semibold text-[#67E8F9]">
                Active
              </span>
            </div>

          </div>

        </section>

        {/* PAGE FOOTER */}

        <div className="flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">

          <div className="flex items-center gap-2 text-[11px] text-[#7D8994]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            Device registry interface
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#7D8994]">
            <Globe2 className="h-3.5 w-3.5 text-[#D4AF37]" />
            CyberOrbit Endpoint Security
          </div>

        </div>

      </div>
    </div>
  );
};

export default DevicesPage;