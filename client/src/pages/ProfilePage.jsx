import React from "react";

import { TrustGauge } from "../components/TrustGauge";

import { StatusBadge, SeverityBadge } from "../components/Badges";

import {
  Laptop,
  ShieldCheck,
  Clock,
  MapPin,
  FolderLock,
  Activity,
} from "lucide-react";

export const ProfilePage = ({
  currentUser,
  devices,
  recentEvents,
  onOpenCopilot,
}) => {
  const userDevices = devices.filter((d) => d.userId === currentUser.id);

  const userEvents = recentEvents.filter((e) => e.userId === currentUser.id);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-12">
      {/* SettingsPage-style Profile Hero */}
      <section className="console-hero group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div
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
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="pointer-events-none absolute right-[4%] top-1/2 h-52 w-52 -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
        <div className="pointer-events-none absolute right-[7%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-[#D4AF37]/20" />
        <div className="pointer-events-none absolute right-[10%] top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border border-[#67E8F9]/25" />
        <div className="pointer-events-none absolute right-[15.5%] top-1/2 h-14 w-14 -translate-y-1/2 rounded-2xl border border-[#67E8F9]/45 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.12)]" />

        <div className="pointer-events-none absolute right-[6%] top-[18%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.8)]" />
        <div className="pointer-events-none absolute right-[19%] bottom-[20%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.8)]" />
        <div className="pointer-events-none absolute right-[26%] top-[31%] h-1.5 w-1.5 rounded-full bg-[#67E8F9]/80" />

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[74%]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                Employee Identity Center
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                Trust & Security Telemetry
              </span>
            </div>

            <h1 className="mt-3 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              My Zero Trust Profile &{" "}
              <span className="text-[#67E8F9]">Digital Identity</span>
            </h1>

            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Review your dynamic trust rating, verified hardware endpoints,
              behavioral baseline parameters and recorded security activity.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#67E8F9]">
                IDENTITY VERIFIED
              </span>
              <span className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#D4AF37]">
                ZERO TRUST
              </span>
              <span className="rounded-lg border border-white/10 bg-[#070C12]/80 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#7F8A96]">
                LIVE TELEMETRY
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* Main Grid: User Identity & Trust Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Persona & Gauge */}
        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:-translate-y-0.5 hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7 flex flex-col items-center text-center space-y-5 transition-all duration-300 hover:border-[#67E8F9]/20">
          <div className="absolute left-0 top-0 h-12 w-[1.5px] bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.35)]" />
          <div className="w-16 h-16 rounded-2xl bg-[#67E8F9]/10 border border-[#67E8F9]/25 flex items-center justify-center font-mono text-xl font-bold text-[#67E8F9] shadow-[0_0_30px_rgba(103,232,249,0.05)]">
            {currentUser.employeeId}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#F4F7FA]">
              {currentUser.name}
            </h2>

            <p className="text-sm text-[#A7B0BA] font-mono mt-1">
              {currentUser.email}
            </p>

            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-semibold text-[#67E8F9] bg-[#67E8F9]/10 px-2.5 py-1 rounded-lg border border-[#67E8F9]/20">
                {currentUser.department}
              </span>

              <StatusBadge status={currentUser.status} />
            </div>
          </div>

          <div className="w-full pt-5 border-t border-white/10">
            <span className="text-[12px] font-mono uppercase tracking-[0.14em] text-[#7F8A96] block mb-4">
              Dynamic Real-Time Trust Rating
            </span>

            <TrustGauge score={currentUser.currentTrustScore} size={150} />
          </div>
        </div>

        {/* Right 2 cols: Baseline & Registered Devices */}
        <div className="lg:col-span-2 space-y-5">
          {/* Established Behavioral Baseline */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:-translate-y-0.5 hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6 space-y-4 transition-all duration-300 hover:border-[#67E8F9]/15">
            <h3 className="text-[12px] font-mono uppercase tracking-[0.2em] text-[#67E8F9] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Verified Organizational Baseline Profile
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-[#070C12] p-4 rounded-xl border border-white/10 space-y-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:shadow-[0_10px_30px_rgba(103,232,249,0.06)]">
                <span className="text-[#A7B0BA] flex items-center gap-2 font-mono text-xs">
                  <Clock className="w-3.5 h-3.5 text-[#67E8F9]" />
                  Standard Work Hours:
                </span>

                <span className="font-semibold text-[#F4F7FA] block">
                  {currentUser.baseline.normalWorkHours.start}:00 -{" "}
                  {currentUser.baseline.normalWorkHours.end}:00
                </span>
              </div>

              <div className="bg-[#070C12] p-4 rounded-xl border border-white/10 space-y-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:shadow-[0_10px_30px_rgba(103,232,249,0.06)]">
                <span className="text-[#A7B0BA] flex items-center gap-2 font-mono text-xs">
                  <FolderLock className="w-3.5 h-3.5 text-[#67E8F9]" />
                  Permitted Scopes:
                </span>

                <span className="font-semibold text-[#F4F7FA] block">
                  {currentUser.baseline.allowedDepartments.join(", ")}
                </span>
              </div>

              <div className="bg-[#070C12] p-4 rounded-xl border border-white/10 space-y-2 transition-all duration-300 hover:border-[#D4AF37]/20">
                <span className="text-[#A7B0BA] font-mono text-xs">
                  Daily Download Quota:
                </span>

                <span className="font-semibold text-[#F4F7FA] block">
                  {currentUser.baseline.maxDownloadVolumeMB} MB / day
                </span>
              </div>

              <div className="bg-[#070C12] p-4 rounded-xl border border-white/10 space-y-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:shadow-[0_10px_30px_rgba(103,232,249,0.06)]">
                <span className="text-[#A7B0BA] flex items-center gap-2 font-mono text-xs">
                  <MapPin className="w-3.5 h-3.5 text-[#67E8F9]" />
                  Common Geofence:
                </span>

                <span className="font-semibold text-[#F4F7FA] block break-words">
                  {currentUser.baseline.typicalLocations.join(", ")}
                </span>
              </div>
            </div>
          </div>

          {/* Registered Endpoints */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:-translate-y-0.5 hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6 space-y-4 transition-all duration-300 hover:border-[#67E8F9]/15">
            <h3 className="text-[12px] font-mono uppercase tracking-[0.2em] text-[#67E8F9] flex items-center gap-2">
              <Laptop className="w-4 h-4" />
              Registered Hardware Endpoints ({userDevices.length})
            </h3>

            <div className="space-y-2">
              {userDevices.map((dev) => (
                <div
                  key={dev.id}
                  className="p-4 bg-[#070C12] rounded-xl border border-white/10 flex items-center justify-between gap-4 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:shadow-[inset_3px_0_0_#67E8F9,0_10px_30px_rgba(103,232,249,0.06)]"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[#F4F7FA] block">
                      {dev.deviceName}
                    </span>

                    <span className="text-xs text-[#A7B0BA] font-mono block mt-1 truncate">
                      {dev.os} • {dev.ipAddress}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      Trust: {dev.trustScore}%
                    </span>

                    <StatusBadge status={dev.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User's Recent Telemetry Stream */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:-translate-y-0.5 hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6 space-y-4 transition-all duration-300 hover:border-[#67E8F9]/15">
        <h3 className="text-[12px] font-mono uppercase tracking-[0.2em] text-[#67E8F9] flex items-center gap-2">
          <Activity className="w-4 h-4" />
          My Recent Security Events Stream
        </h3>

        <div className="space-y-2">
          {userEvents.length === 0 ? (
            <p className="text-sm text-[#7F8A96] italic p-5 text-center bg-[#070C12] rounded-xl border border-white/10">
              No recent security events recorded for this persona.
            </p>
          ) : (
            userEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-4 bg-[#070C12] rounded-xl border border-white/10 flex items-center justify-between gap-4 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:shadow-[inset_3px_0_0_#67E8F9,0_10px_30px_rgba(103,232,249,0.06)]"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[#F4F7FA]">
                    {evt.eventType}
                  </span>

                  <span className="text-[#A7B0BA] ml-2 font-mono text-xs">
                    {evt.resourceName ? `-> ${evt.resourceName}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-[#7F8A96]">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>

                  <SeverityBadge severity={evt.severity} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
