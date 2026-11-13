
import React from "react";
import {
  ShieldCheck,
  UserRound,
  Mail,
  BriefcaseBusiness,
  Activity,
  LockKeyhole,
} from "lucide-react";

export function SecurityProfilePage({ currentUser }) {
  const profileItems = [
    {
      label: "Full name",
      value: currentUser?.name || "Unavailable",
      icon: UserRound,
      accent: "cyan",
    },
    {
      label: "Email address",
      value: currentUser?.email || "Unavailable",
      icon: Mail,
      accent: "cyan",
    },
    {
      label: "Administrative role",
      value:
        currentUser?.roleCode ||
        currentUser?.role ||
        "Unavailable",
      icon: BriefcaseBusiness,
      accent: "gold",
    },
    {
      label: "Account status",
      value: currentUser?.status || "Unavailable",
      icon: Activity,
      accent: "gold",
    },
  ];

  const isActive =
    typeof currentUser?.status === "string" &&
    currentUser.status.toLowerCase() === "active";

  return (
    <div className="min-h-full overflow-x-hidden bg-[#03070C] px-4 pb-10 pt-2 text-[#F4F7FA] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1100px] space-y-6">

        {/* Page hero */}
        <section className="group relative overflow-hidden rounded-2xl border border-[#67E8F9]/45 bg-[#050A10] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:border-[#67E8F9]/70 sm:p-8">

          {/* Background grid */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[45%] opacity-30 sm:block"
            style={{
              backgroundImage:
                "linear-gradient(rgba(103,232,249,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.07) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          {/* Decorative circles */}
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#67E8F9]/[0.05] blur-3xl" />

          <div className="pointer-events-none absolute right-[12%] top-1/2 hidden h-44 w-44 -translate-y-1/2 rounded-full border border-[#67E8F9]/10 sm:block" />

          <div className="pointer-events-none absolute right-[17%] top-1/2 hidden h-28 w-28 -translate-y-1/2 rounded-full border border-[#67E8F9]/15 sm:block" />

          <div className="pointer-events-none absolute right-[22%] top-1/2 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#03070C] text-[#67E8F9] sm:flex">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <div className="pointer-events-none absolute right-[8%] top-[25%] hidden h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.5)] sm:block" />

          <div className="pointer-events-none absolute right-[5%] bottom-[24%] hidden h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.5)] sm:block" />

          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#D4AF37]">
                ● ADMINISTRATOR IDENTITY
              </span>

              <span className="text-[11px] uppercase tracking-wider text-[#7F8A96]">
                SECURITY · ACCOUNT INFORMATION
              </span>
            </div>

            <h1 className="text-4xl font-light tracking-tight text-[#F4F7FA] sm:text-5xl">
              Security{" "}
              <span className="text-[#67E8F9]">
                Profile
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-[#A7B0BA]">
              Review your authenticated account identity,
              administrative role, and current account status.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] px-3 py-2 text-xs text-[#67E8F9]">
                <ShieldCheck className="h-4 w-4" />
                Authenticated session
              </span>

              <span className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#D4AF37]">
                <LockKeyhole className="h-4 w-4" />
                Administrator identity
              </span>
            </div>
          </div>
        </section>

        {/* Profile overview */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#67E8F9]">
                ACCOUNT OVERVIEW
              </span>

              <h2 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Authenticated Security Profile
              </h2>

              <p className="mt-1 text-xs text-[#7F8A96]">
                Identity information provided by the current session.
              </p>
            </div>

            <span className="text-[11px] text-[#7F8A96]">
              Session information
            </span>
          </div>

          {/* Profile information cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {profileItems.map((item) => {
              const Icon = item.icon;

              const isGold = item.accent === "gold";

              return (
                <article
                  key={item.label}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#7F8A96]">
                        {item.label}
                      </p>

                      <p className="mt-3 break-all text-lg font-medium leading-7 text-[#F4F7FA]">
                        {item.value}
                      </p>
                    </div>

                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                        isGold
                          ? "border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#D4AF37]"
                          : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]"
                      }`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                  </div>

                  <div
                    className={`mt-5 h-px w-full ${
                      isGold
                        ? "bg-gradient-to-r from-[#D4AF37]/25 to-transparent"
                        : "bg-gradient-to-r from-[#67E8F9]/25 to-transparent"
                    }`}
                  />

                  <p className="mt-3 text-[10px] uppercase tracking-wider text-[#596570]">
                    Authenticated account data
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Account security status */}
        <section className="rounded-2xl border border-[#67E8F9]/20 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#67E8F9]">
                  ACCOUNT SECURITY
                </span>

                <h2 className="mt-1 text-lg font-medium text-[#F4F7FA]">
                  Current account status
                </h2>
              </div>
            </div>

            {currentUser?.status ? (
              <span
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  isActive
                    ? "border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] text-[#67E8F9]"
                    : "border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] text-[#D4AF37]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActive ? "bg-[#67E8F9]" : "bg-[#D4AF37]"
                  }`}
                />

                {currentUser.status}
              </span>
            ) : (
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#7F8A96]">
                Unavailable
              </span>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-[#A7B0BA]">
            This section displays the account status received from
            your authenticated session. It does not independently
            verify account permissions or modify security settings.
          </p>
        </section>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <p className="text-[11px] tracking-wide text-[#7F8A96]">
            CyberOrbit · Security Profile
          </p>

          <p className="text-[11px] text-[#596570]">
            Authenticated identity information
          </p>
        </footer>

      </div>
    </div>
  );
}

export default SecurityProfilePage;
