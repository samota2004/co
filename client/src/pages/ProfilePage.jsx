
import React from "react";
import {
  Activity,
  Clock,
  FolderLock,
  Laptop,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { TrustGauge } from "../components/TrustGauge";
import { StatusBadge, SeverityBadge } from "../components/Badges";

const panelClass =
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6";

const sectionHeadingClass =
  "flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-[#67E8F9] sm:text-xs";

const detailCardClass =
  "rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:shadow-[0_10px_30px_rgba(103,232,249,0.06)]";

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
};

const ProfileDetail = ({
  icon: Icon,
  label,
  children,
  accent = "cyan",
}) => (
  <div className={detailCardClass}>
    <span className="flex items-center gap-2 text-xs font-mono text-[#A7B0BA]">
      <Icon
        className={`h-3.5 w-3.5 ${
          accent === "gold"
            ? "text-[#D4AF37]"
            : "text-[#67E8F9]"
        }`}
      />
      {label}
    </span>

    <span className="mt-2 block break-words text-sm font-semibold leading-6 text-[#F4F7FA]">
      {children}
    </span>
  </div>
);

export const ProfilePage = ({
  currentUser,
  devices = [],
  recentEvents = [],
  onOpenCopilot,
}) => {
  if (!currentUser) {
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-8 lg:px-12">
        <div className="rounded-2xl border border-white/10 bg-[#050A10] p-8 text-center">
          <UserRound className="mx-auto h-8 w-8 text-[#67E8F9]" />

          <p className="mt-3 text-sm text-[#A7B0BA]">
            Profile information is currently unavailable.
          </p>
        </div>
      </div>
    );
  }

  const userDevices = devices.filter(
    (device) => device.userId === currentUser.id
  );

  const userEvents = recentEvents
    .filter((event) => event.userId === currentUser.id)
    .sort(
      (a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

  const baseline = currentUser.baseline;

  const initials = (
    currentUser.name ||
    currentUser.employeeId ||
    "U"
  )
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 pb-10 pt-5 sm:space-y-6 sm:px-8 lg:px-12">

      {/* PROFILE HERO */}

      <section className="console-hero group relative isolate min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/35 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:border-[#67E8F9]/60 hover:shadow-[0_22px_70px_rgba(103,232,249,0.10)]">

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage:
              "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
          }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-[#67E8F9]/10 sm:right-[4%]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[8%] top-1/2 h-44 w-44 -translate-y-1/2 rounded-full border border-[#D4AF37]/20"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[13%] top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border border-[#67E8F9]/25"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[19%] top-1/2 hidden h-14 w-14 -translate-y-1/2 rounded-2xl border border-[#67E8F9]/45 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.12)] sm:block"
        />

        <div className="pointer-events-none absolute left-0 top-0 h-16 w-px bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />

        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-px bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="relative z-10 flex min-h-[250px] items-center px-5 py-8 sm:px-8 lg:px-9">

          <div className="max-w-3xl">

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">

              <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] sm:text-xs">

                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />

                Employee Identity Center

              </span>

              <span className="text-[11px] uppercase tracking-wider text-[#7F8A96] sm:text-xs">
                Trust &amp; Security Telemetry
              </span>

            </div>

            <h1 className="mt-4 max-w-3xl text-3xl font-light leading-[1.05] tracking-tight text-[#F4F7FA] sm:text-4xl lg:text-5xl">

              My Zero Trust Profile &amp;{" "}

              <span className="text-[#67E8F9]">
                Digital Identity
              </span>

            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
              Review your dynamic trust rating, verified hardware endpoints,
              behavioral baseline parameters, and recorded security activity.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">

              <span className="rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#67E8F9] sm:text-[11px]">
                Identity Verified
              </span>

              <span className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] sm:text-[11px]">
                Zero Trust
              </span>

              <span className="rounded-lg border border-white/10 bg-[#070C12]/80 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#7F8A96] sm:text-[11px]">
                Security Telemetry
              </span>

            </div>
          </div>

          {typeof onOpenCopilot === "function" && (
            <button
              type="button"
              onClick={onOpenCopilot}
              className="absolute bottom-5 right-5 hidden items-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#07131A]/90 px-4 py-2.5 text-xs font-semibold text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/10 hover:shadow-[0_0_24px_rgba(103,232,249,0.10)] sm:flex"
            >
              <Sparkles className="h-4 w-4" />
              Open Security Copilot
            </button>
          )}

        </div>
      </section>

      {/* IDENTITY AND TRUST OVERVIEW */}

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">

        {/* EMPLOYEE IDENTITY CARD */}

        <div className={`${panelClass} flex flex-col items-center space-y-5 text-center lg:p-7`}>

          <div className="absolute left-0 top-0 h-12 w-px bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.35)]" />

          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#67E8F9]/25 bg-[#67E8F9]/10 font-mono text-xl font-bold text-[#67E8F9] shadow-[0_0_30px_rgba(103,232,249,0.06)]">
            {initials}
          </div>

          <div className="min-w-0">

            <h2 className="break-words text-lg font-semibold text-[#F4F7FA]">
              {currentUser.name}
            </h2>

            <p className="mt-1 break-all font-mono text-xs text-[#A7B0BA] sm:text-sm">
              {currentUser.email}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">

              <span className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/10 px-2.5 py-1 text-xs font-semibold text-[#67E8F9]">
                {currentUser.department}
              </span>

              <StatusBadge status={currentUser.status} />

            </div>

            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[#7F8A96]">
              Employee ID: {currentUser.employeeId}
            </p>

          </div>

          <div className="w-full border-t border-white/10 pt-5">

            <span className="mb-4 block text-[11px] font-mono uppercase tracking-[0.14em] text-[#7F8A96]">
              Dynamic Real-Time Trust Rating
            </span>

            <div className="flex justify-center">
              <TrustGauge
                score={currentUser.currentTrustScore}
                size={150}
              />
            </div>

          </div>

        </div>

        {/* BASELINE AND REGISTERED DEVICES */}

        <div className="space-y-5 lg:col-span-2">

          {/* BEHAVIORAL BASELINE */}

          <section className={`${panelClass} space-y-4`}>

            <div className="flex flex-wrap items-center justify-between gap-3">

              <h3 className={sectionHeadingClass}>
                <ShieldCheck className="h-4 w-4" />
                Verified Organizational Baseline
              </h3>

              <span className="rounded-md border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]">
                Policy Profile
              </span>

            </div>

            {baseline ? (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">

                <ProfileDetail
                  icon={Clock}
                  label="Standard Work Hours"
                >
                  {baseline.normalWorkHours?.start ?? "--"}:00 –{" "}
                  {baseline.normalWorkHours?.end ?? "--"}:00
                </ProfileDetail>

                <ProfileDetail
                  icon={FolderLock}
                  label="Permitted Scopes"
                >
                  {baseline.allowedDepartments?.join(", ") || "Not specified"}
                </ProfileDetail>

                <ProfileDetail
                  icon={Activity}
                  label="Daily Download Quota"
                  accent="gold"
                >
                  {baseline.maxDownloadVolumeMB ?? "—"} MB / day
                </ProfileDetail>

                <ProfileDetail
                  icon={MapPin}
                  label="Common Geofence"
                >
                  {baseline.typicalLocations?.join(", ") || "Not specified"}
                </ProfileDetail>

              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-[#070C12] p-5 text-center text-sm text-[#7F8A96]">
                No organizational baseline profile is available.
              </p>
            )}

          </section>

          {/* REGISTERED ENDPOINTS */}

          <section className={`${panelClass} space-y-4`}>

            <div className="flex flex-wrap items-center justify-between gap-3">

              <h3 className={sectionHeadingClass}>
                <Laptop className="h-4 w-4" />
                Registered Hardware Endpoints
              </h3>

              <span className="rounded-md border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] px-2 py-1 text-[10px] font-mono text-[#67E8F9]">
                {userDevices.length} REGISTERED
              </span>

            </div>

            {userDevices.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-[#070C12] p-5 text-center text-sm text-[#7F8A96]">
                No registered hardware endpoints found for this employee.
              </p>
            ) : (
              <div className="space-y-2">

                {userDevices.map((device) => (

                  <div
                    key={device.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#070C12] p-4 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:shadow-[inset_3px_0_0_#67E8F9,0_10px_30px_rgba(103,232,249,0.06)] sm:flex-row sm:items-center sm:justify-between"
                  >

                    <div className="flex min-w-0 items-start gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
                        <Laptop className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">

                        <span className="block break-words font-semibold text-[#F4F7FA]">
                          {device.deviceName}
                        </span>

                        <span className="mt-1 block break-all font-mono text-xs text-[#A7B0BA]">
                          {device.os}{" "}
                          <span className="text-[#D4AF37]">•</span>{" "}
                          {device.ipAddress}
                        </span>

                      </div>

                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3 pl-13 sm:pl-0">

                      <span className="font-mono text-xs font-bold text-[#67E8F9]">
                        Trust: {device.trustScore}%
                      </span>

                      <StatusBadge status={device.status} />

                    </div>

                  </div>

                ))}

              </div>
            )}

          </section>

        </div>

      </section>

      {/* RECENT SECURITY TELEMETRY */}

      <section className={`${panelClass} space-y-4`}>

        <div className="flex flex-wrap items-center justify-between gap-3">

          <h3 className={sectionHeadingClass}>
            <Activity className="h-4 w-4" />
            My Recent Security Events
          </h3>

          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#7F8A96]">
            {userEvents.length} EVENTS
          </span>

        </div>

        {userEvents.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#070C12] p-7 text-center">

            <Activity className="mx-auto h-6 w-6 text-[#7F8A96]" />

            <p className="mt-3 text-sm text-[#A7B0BA]">
              No recent security events recorded for this persona.
            </p>

            <p className="mt-1 text-xs text-[#7F8A96]">
              New activity will appear here when telemetry is received.
            </p>

          </div>
        ) : (
          <div className="space-y-2">

            {userEvents.map((event) => (

              <div
                key={event.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#070C12] p-4 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:shadow-[inset_3px_0_0_#67E8F9,0_10px_30px_rgba(103,232,249,0.06)] sm:flex-row sm:items-center sm:justify-between"
              >

                <div className="flex min-w-0 items-start gap-3">

                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
                    <Activity className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">

                    <span className="block break-words font-semibold text-[#F4F7FA]">
                      {event.eventType}
                    </span>

                    {event.resourceName && (
                      <span className="mt-1 block break-words font-mono text-xs text-[#A7B0BA]">
                        <span className="text-[#D4AF37]">
                          Resource:
                        </span>{" "}
                        {event.resourceName}
                      </span>
                    )}

                  </div>

                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3 pl-12 sm:pl-0">

                  <span className="font-mono text-xs text-[#7F8A96]">
                    {formatTime(event.timestamp)}
                  </span>

                  <SeverityBadge severity={event.severity} />

                </div>

              </div>

            ))}

          </div>
        )}

      </section>

    </main>
  );
};
