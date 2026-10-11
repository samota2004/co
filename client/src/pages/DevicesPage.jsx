// ======================================================
// IMPORTS
// ======================================================

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
  Globe2,
  Monitor,
  LockKeyhole,
  AlertTriangle,
  Server,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { EndpointMonitor } from '../components/EndpointMonitor.jsx';
import { requestApi } from '../services/api.js';

// ======================================================
// CONSTANTS / CONFIGURATION
// ======================================================

const STATUS_CONFIG = {
  TRUSTED: {
    className: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300",
    dot: "bg-emerald-400",
  },

  SUSPICIOUS: {
    className: "border-amber-400/25 bg-amber-400/[0.06] text-amber-300",
    dot: "bg-amber-400",
  },

  REVOKED: {
    className: "border-red-400/25 bg-red-400/[0.06] text-red-300",
    dot: "bg-red-400",
  },

  DEFAULT: {
    className: "border-white/10 bg-white/[0.03] text-[#9AA5AF]",
    dot: "bg-[#7A8691]",
  },
};

// ======================================================
// HELPER FUNCTIONS
// ======================================================

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

  if (!Number.isFinite(score)) {
    return "text-[#A7B0BA]";
  }

  if (score >= 80) {
    return "text-emerald-300";
  }

  if (score >= 50) {
    return "text-[#D4AF37]";
  }

  return "text-red-300";
};

const getStatusClass = (status) => {
  switch (status) {
    case "TRUSTED":
      return STATUS_CONFIG.TRUSTED.className;

    case "SUSPICIOUS":
      return STATUS_CONFIG.SUSPICIOUS.className;

    case "REVOKED":
      return STATUS_CONFIG.REVOKED.className;

    default:
      return STATUS_CONFIG.DEFAULT.className;
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case "TRUSTED":
      return <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />;

    case "SUSPICIOUS":
      return <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />;

    case "REVOKED":
      return <ShieldX className="h-3.5 w-3.5" strokeWidth={1.8} />;

    default:
      return null;
  }
};

const getDeviceIcon = (device) => {
  const type = String(device.deviceType ?? device.type ?? "").toUpperCase();

  if (
    type.includes("MOBILE") ||
    type.includes("PHONE") ||
    type.includes("TABLET")
  ) {
    return <Smartphone className="h-4 w-4" strokeWidth={1.7} />;
  }

  return <Laptop className="h-4 w-4" strokeWidth={1.7} />;
};

// ======================================================
// MAIN COMPONENT
// ======================================================

export const DevicesPage = ({ devices = [], users = [], onRefreshData }) => {
  const endpointMonitor = useRef(null);
  const { isDark } = useTheme();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState(null);
  const [localDevices, setLocalDevices] = useState(devices);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ======================================================
  // DEVICE DATA SYNC
  // ======================================================

  useEffect(() => {
    setLocalDevices(Array.isArray(devices) ? devices : []);
  }, [devices]);

  // ======================================================
  // REFRESH DEVICES
  // ======================================================

  const refreshDevices = async () => {
    try {
      setRefreshing(true);
      setError("");

      // Refresh the two real device stores directly. The parent SOC refresh
      // intentionally tolerates failures and cannot confirm this page's reload.
      const [data, endpointResult] = await Promise.allSettled([
        requestApi('/api/devices').then(result => {
          if (!Array.isArray(result.devices)) throw new Error('Invalid device response from server');
          setLocalDevices(result.devices);
          return result;
        }),
        endpointMonitor.current?.refresh()
      ]);
      if (data.status === 'rejected') throw data.reason;
      if (endpointResult.status === 'rejected') throw endpointResult.reason;

    } catch (err) {
      console.error("Failed to refresh devices:", err);

      setError(
        err instanceof Error ? err.message : "Failed to refresh devices",
      );
    } finally {
      setRefreshing(false);
    }
  };

  // ======================================================
  // ENRICH DEVICE DATA
  // ======================================================

  const enrichedDevices = useMemo(() => {
    return localDevices.map((device) => {
      const user =
        users.find((user) => user.id === device.userId) || device.user || null;

      return {
        ...device,

        employeeName: user?.name ?? device.userName ?? null,

        employeeId: user?.employeeId ?? device.employeeId ?? null,

        browser: device.browser ?? device.browserName ?? null,

        os: device.os ?? device.operatingSystem ?? null,

        ipAddress: device.ipAddress ?? device.ip ?? null,

        lastUsed: device.lastSeenAt ?? device.lastSeen ?? device.lastUsed ?? null,

        activeSession:
          typeof device.activeSession === "boolean"
            ? device.activeSession
            : typeof device.isActive === "boolean"
              ? device.isActive
              : null,
      };
    });
  }, [localDevices, users]);

  // ======================================================
  // FILTER DEVICES
  // ======================================================

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
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        );

      const matchesStatus =
        statusFilter === "ALL" || device.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [enrichedDevices, search, statusFilter]);

  // ======================================================
  // DEVICE TRUST ACTION
  // ======================================================

  const handleToggleTrust = async (device) => {
    if (!device?.id) {
      return;
    }

    try {
      setUpdatingId(device.id);
      setError("");

      const newTrustState = device.isTrusted === true ? false : true;

      const data = await requestApi(`/api/devices/${device.id}`, {
        method: "PATCH",
        body: { trustScore: newTrustState ? 80 : 0, status: newTrustState ? "TRUSTED" : "MONITORED" }
      });

      if (data?.device) {
        setLocalDevices((current) =>
          current.map((item) =>
            item.id === device.id
              ? {
                  ...item,
                  ...data.device,
                }
              : item,
          ),
        );
      }

      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err) {
      console.error("Failed to update device trust:", err);

      setError(
        err instanceof Error ? err.message : "Failed to update device trust",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // ======================================================
  // DEVICE REVOKE ACTION
  // ======================================================

  const handleRevoke = async (deviceId) => {
    if (!deviceId) {
      return;
    }

    try {
      setUpdatingId(deviceId);
      setError("");

      const data = await requestApi(`/api/devices/${deviceId}`, {
        method: "PATCH", body: { status: "REVOKED", trustScore: 0 }
      });

      if (data?.device) {
        setLocalDevices((current) =>
          current.map((device) =>
            device.id === deviceId
              ? {
                  ...device,
                  ...data.device,
                }
              : device,
          ),
        );
      }

      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err) {
      console.error("Failed to revoke device:", err);

      setError(err instanceof Error ? err.message : "Failed to revoke device");
    } finally {
      setUpdatingId(null);
    }
  };

  // ======================================================
  // METRICS
  // ======================================================

  const registeredCount = localDevices.length;

  const trustedCount = localDevices.filter(
    (device) => device.status === "TRUSTED",
  ).length;

  const suspiciousCount = localDevices.filter(
    (device) => device.status === "SUSPICIOUS",
  ).length;

  const revokedCount = localDevices.filter(
    (device) => device.status === "REVOKED",
  ).length;

  const activeSessionCount = enrichedDevices.filter(
    (device) => device.activeSession === true,
  ).length;

  // ======================================================
  // PAGE
  // ======================================================

  return (
    <div className="min-h-full bg-[#03070C] text-[#F4F7FA]">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
        <EndpointMonitor ref={endpointMonitor} administrator users={users} />
        {/* ==================================================
            PAGE HEADER
            ================================================== */}

        <section className="console-hero group relative min-h-[285px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)] lg:min-h-[295px]">
          {/* Enterprise grid / endpoint network visual */}
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
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                <Monitor
                  className="h-3.5 w-3.5 text-[#67E8F9]"
                  strokeWidth={1.5}
                />
                Endpoint
              </div>
            </div>

            <div className="absolute bottom-[17%] right-[7%] rounded-lg border border-[#D4AF37]/20 bg-[#070C12]/85 px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                <ShieldCheck
                  className="h-3.5 w-3.5 text-[#D4AF37]"
                  strokeWidth={1.5}
                />
                Zero Trust
              </div>
            </div>
          </div>

          <div className="absolute left-0 top-0 h-10 w-1 rounded-r-full bg-[#D4AF37]" />
          <div className="absolute bottom-0 right-0 h-10 w-1 rounded-l-full bg-[#67E8F9]" />

          <div className="relative z-10 flex min-h-[285px] items-center px-6 py-7 sm:px-8 lg:min-h-[295px] lg:px-9 lg:py-8">
            <div className="w-full max-w-[74%] lg:max-w-[68%]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                  CYBERORBIT ENDPOINT SECURITY
                </div>
                <span className="text-[12px] uppercase tracking-wider text-[#7F8A96]">
                  ZERO TRUST DEVICE POSTURE
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Device Trust &amp;
                <span className="block text-[#67E8F9]">Hardware Registry</span>
              </h1>

              <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
                Monitor endpoint identity, hardware posture, trust state, and
                active sessions across the CyberOrbit Zero Trust environment.
              </p>

              <div className="mt-6 flex w-full flex-nowrap items-center gap-0 overflow-visible">
                <div className="flex shrink-0 items-center gap-2.5 border-r border-white/[0.08] pr-5">
                  <Server
                    className="h-4 w-4 shrink-0 text-[#67E8F9]"
                    strokeWidth={1.7}
                  />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {registeredCount}
                  </span>
                  <span className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                    Registered Endpoints
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 border-r border-white/[0.08] px-5">
                  <ShieldCheck
                    className="h-4 w-4 shrink-0 text-emerald-300"
                    strokeWidth={1.7}
                  />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {trustedCount}
                  </span>
                  <span className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                    Trusted
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 border-r border-white/[0.08] px-5">
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-[#D4AF37]"
                    strokeWidth={1.7}
                  />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {suspiciousCount}
                  </span>
                  <span className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                    Suspicious
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 pl-5">
                  <Wifi
                    className="h-4 w-4 shrink-0 text-[#67E8F9]"
                    strokeWidth={1.7}
                  />
                  <span className="font-mono text-sm font-semibold text-[#E5EAEE]">
                    {activeSessionCount}
                  </span>
                  <span className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-[#7F8A96]">
                    Active Sessions
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================
            QUICK OVERVIEW
            ================================================== */}

        <section className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
                <Monitor className="h-4 w-4" strokeWidth={1.7} />
              </div>

              <Activity
                className="h-3.5 w-3.5 text-white/15"
                strokeWidth={1.5}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[12px] font-medium text-[#C7D0D8]">
                Registered Endpoints
              </div>

              <div className="shrink-0 text-2xl font-light tracking-[-0.03em] text-[#F4F7FA]">
                {registeredCount}
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.7} />
              </div>

              <Activity
                className="h-3.5 w-3.5 text-white/15"
                strokeWidth={1.5}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[12px] font-medium text-[#C7D0D8]">
                Trusted Devices
              </div>

              <div className="shrink-0 text-2xl font-light tracking-[-0.03em] text-[#F4F7FA]">
                {trustedCount}
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] text-[#D4AF37]">
                <ShieldAlert className="h-4 w-4" strokeWidth={1.7} />
              </div>

              <Activity
                className="h-3.5 w-3.5 text-white/15"
                strokeWidth={1.5}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[12px] font-medium text-[#C7D0D8]">
                Suspicious Devices
              </div>

              <div className="shrink-0 text-2xl font-light tracking-[-0.03em] text-[#F4F7FA]">
                {suspiciousCount}
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 bg-red-400/[0.05] text-red-300">
                <ShieldX className="h-4 w-4" strokeWidth={1.7} />
              </div>

              <Activity
                className="h-3.5 w-3.5 text-white/15"
                strokeWidth={1.5}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[12px] font-medium text-[#C7D0D8]">
                Revoked Devices
              </div>

              <div className="shrink-0 text-2xl font-light tracking-[-0.03em] text-[#F4F7FA]">
                {revokedCount}
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================
            ERROR
            ================================================== */}

        {error && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-red-400/20 bg-[#050A10] px-5 py-4 text-xs text-red-300 shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.7} />

            {error}
          </div>
        )}

        {/* ==================================================
            SEARCH / FILTER
            ================================================== */}

        <section className="mt-5 group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[430px]">
              <Search
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]"
                strokeWidth={1.7}
              />

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Device ID, Employee, IP, or OS..."
                className="h-11 w-full rounded-xl border border-white/10 bg-[#03070C] pl-10 pr-4 text-xs text-[#F4F7FA] outline-none placeholder:text-[#596570] transition-colors focus:border-[#67E8F9]/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-medium text-[#A7B0BA]">
                TRUST STATUS:
              </span>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-white/10 bg-[#03070C] px-3 text-xs text-[#E5EAEE] outline-none transition-colors focus:border-[#67E8F9]/40"
              >
                <option value="ALL">All Endpoints</option>

                <option value="TRUSTED">Trusted Only</option>

                <option value="SUSPICIOUS">Suspicious</option>

                <option value="REVOKED">Revoked</option>
              </select>

              <button
                type="button"
                onClick={refreshDevices}
                aria-label="Refresh device registry"
                disabled={refreshing}
                className="flex h-10 items-center gap-2 rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.04] px-3 text-xs font-medium text-[#67E8F9] transition-colors hover:border-[#67E8F9]/40 hover:bg-[#67E8F9]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  strokeWidth={1.7}
                />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        {/* ==================================================
            DEVICE TABLE
            ================================================== */}

        <section className="mt-5 group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/20">
          <div className="flex flex-col gap-2 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium tracking-[-0.02em] text-[#F4F7FA]">
                Device Registry
              </h2>

              <p className="mt-1 text-xs text-[#7D8994]">
                {filteredDevices.length} devices displayed
              </p>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-[#7D8994]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
              Logical browser/device registry
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] bg-[#070C12]">
                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    DEVICE ID
                  </th>

                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    EMPLOYEE
                  </th>

                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    BROWSER
                  </th>

                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    OS
                  </th>

                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    IP
                  </th>

                  <th className="px-5 py-3.5 text-center text-[12px] font-medium text-[#C7D0D8]">
                    TRUST STATUS
                  </th>

                  <th className="px-5 py-3.5 text-center text-[12px] font-medium text-[#C7D0D8]">
                    TRUST SCORE
                  </th>

                  <th className="px-5 py-3.5 text-left text-[12px] font-medium text-[#C7D0D8]">
                    LAST USED
                  </th>

                  <th className="px-5 py-3.5 text-center text-[12px] font-medium text-[#C7D0D8]">
                    ACTIVE SESSION
                  </th>

                  <th className="px-5 py-3.5 text-right text-[12px] font-medium text-[#C7D0D8]">
                    ACTION
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.055]">
                {filteredDevices.length > 0 ? (
                  filteredDevices.map((device) => {
                    const isTrusted = device.status === "TRUSTED";

                    const isRevoked = device.status === "REVOKED";

                    const isUpdating = updatingId === device.id;

                    return (
                      <tr
                        key={device.id}
                        className="group transition-colors hover:bg-white/[0.018]"
                      >
                        {/* DEVICE ID */}

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                              {getDeviceIcon(device)}
                            </div>

                            <div>
                              <div className="font-mono text-xs text-[#DCE3E8]">
                                {formatValue(device.id)}
                              </div>

                              {device.deviceName && (
                                <div className="mt-1 text-[12px] text-[#68747F]">
                                  {device.deviceName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* EMPLOYEE */}

                        <td className="px-5 py-4">
                          <div className="text-sm text-[#E0E5E9]">
                            {formatValue(device.employeeName)}
                          </div>

                          {device.employeeId && (
                            <div className="mt-1 text-[12px] text-[#68747F]">
                              {device.employeeId}
                            </div>
                          )}
                        </td>

                        {/* BROWSER */}

                        <td className="px-5 py-4 text-xs text-[#A7B0BA]">
                          {formatValue(device.browser)}
                        </td>

                        {/* OS */}

                        <td className="px-5 py-4 text-xs text-[#A7B0BA]">
                          {formatValue(device.os)}
                        </td>

                        {/* IP */}

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Wifi
                              className="h-3.5 w-3.5 text-[#D4AF37]"
                              strokeWidth={1.7}
                            />

                            <span className="font-mono text-xs text-[#A7B0BA]">
                              {formatValue(device.ipAddress)}
                            </span>
                          </div>
                        </td>

                        {/* TRUST STATUS */}

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${getStatusClass(
                              device.status,
                            )}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                STATUS_CONFIG[device.status]?.dot ||
                                STATUS_CONFIG.DEFAULT.dot
                              }`}
                            />

                            {getStatusIcon(device.status)}

                            {formatValue(device.status)}
                          </span>
                        </td>

                        {/* TRUST SCORE */}

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`font-mono text-sm font-semibold ${getTrustScoreColor(
                              device.trustScore,
                            )}`}
                          >
                            {formatTrustScore(device.trustScore)}
                          </span>

                          {device.trustScore !== null &&
                            device.trustScore !== undefined &&
                            device.trustScore !== "" && (
                              <span className="ml-1 text-[12px] text-[#596570]">
                                /100
                              </span>
                            )}
                        </td>

                        {/* LAST USED */}

                        <td className="px-5 py-4 text-xs text-[#89949E]">
                          {formatDate(device.lastUsed)}
                        </td>

                        {/* ACTIVE SESSION */}

                        <td className="px-5 py-4 text-center">
                          {device.activeSession === true ? (
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-300">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                              CONNECTED
                            </span>
                          ) : device.activeSession === false ? (
                            <span className="text-[12px] text-[#697581]">
                              IDLE
                            </span>
                          ) : (
                            <span className="text-[12px] text-[#697581]">
                              —
                            </span>
                          )}
                        </td>

                        {/* ACTION */}

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleTrust(device)}
                              disabled={isUpdating}
                              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isTrusted
                                  ? "border-amber-400/20 bg-amber-400/[0.04] text-amber-300 hover:bg-amber-400/10"
                                  : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.04] text-[#67E8F9] hover:bg-[#67E8F9]/10"
                              }`}
                            >
                              {isUpdating
                                ? "UPDATING"
                                : isTrusted
                                  ? "UNTRUST"
                                  : "TRUST"}
                            </button>

                            {!isRevoked && (
                              <button
                                type="button"
                                onClick={() => handleRevoke(device.id)}
                                disabled={isUpdating}
                                className="rounded-lg border border-red-400/15 bg-red-400/[0.03] px-2.5 py-1.5 text-[12px] font-medium text-red-300 transition-colors hover:border-red-400/30 hover:bg-red-400/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isUpdating ? "UPDATING" : "REVOKE"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.04] text-[#67E8F9]">
                        <Laptop className="h-7 w-7" strokeWidth={1.4} />
                      </div>

                      <div className="mt-4 text-sm text-[#A7B0BA]">
                        {localDevices.length === 0
                          ? "No registered devices found."
                          : "No devices match the specified query."}
                      </div>

                      {localDevices.length === 0 && (
                        <div className="mt-2 text-xs text-[#596570]">
                          Device records will appear here when they are returned
                          by the backend.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ==================================================
            FOOTER STATUS
            ================================================== */}

        <div className="mt-5 flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-[12px] text-[#7D8994]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            Endpoint telemetry synchronized
          </div>

          <div className="flex items-center gap-2 text-[12px] text-[#7D8994]">
            <LockKeyhole
              className="h-3.5 w-3.5 text-[#67E8F9]"
              strokeWidth={1.7}
            />
            Zero Trust Device Registry
            <span className="text-[#67E8F9]">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevicesPage;
