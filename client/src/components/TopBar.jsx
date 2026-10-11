import React from "react";

import { Sparkles, RefreshCw, Menu } from "lucide-react";

// CyberOrbit is now dark-only.
// ThemeContext is intentionally not used here so the TopBar stays
// consistent with the SettingsPage master visual system.

/* ======================================================
   CONSTANTS / CONFIGURATION
   ====================================================== */

const TOPBAR_HEIGHT = 76;

/* ======================================================
   MAIN COMPONENT
   ====================================================== */

export const TopBar = ({
  currentUser,
  currentPageTitle = "Admin Dashboard",
  onOpenCopilot,
  onRefreshData,
  isRefreshing,
  onLogout,
  onToggleMobileNav,
}) => {
  const adminName = currentUser?.name || "Account";

  const adminRole =
    (currentUser?.role || currentUser?.roleCode) === "SECURITY_ADMIN"
      ? "SOC Lead"
      : (currentUser?.role || currentUser?.roleCode) === "SYSTEM_ADMIN"
        ? "System Admin"
        : "Security Analyst";

  const adminInitials = adminName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /* ======================================================
     RENDER
     ====================================================== */

  return (
    <header
      id="cyberorbit-topbar"
      style={{ height: `${TOPBAR_HEIGHT}px` }}
      className="
        relative
        w-full
        border-b
        border-white/10
        flex
        items-center
        justify-between
        px-4
        sm:px-6
        lg:px-8
        z-30
        shrink-0
        bg-[#03070C]/95
        text-[#F4F7FA]
        backdrop-blur-xl
        shadow-[0_8px_35px_rgba(0,0,0,0.12)]
        transition-all
        duration-300
      "
    >
      {/* ==================================================
          TECHNICAL BACKGROUND
          ================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          opacity-[0.045]
        "
        style={{
          backgroundImage:
            "linear-gradient(rgba(103,232,249,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.12) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      {/* ==================================================
          LEFT SIDE
          ================================================== */}

      <div
        className="
          relative
          z-10
          flex
          items-center
          gap-3
          sm:gap-4
          min-w-0
        "
      >
        {/* ==================================================
            MOBILE NAVIGATION
            ================================================== */}

        <button
          id="btn-topbar-mobile-menu"
          onClick={onToggleMobileNav}
          title="Open Navigation"
          aria-label="Open Navigation"
          className="
            md:hidden
            w-10
            h-10
            shrink-0
            flex
            items-center
            justify-center
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            text-[#67E8F9]
            cursor-pointer
            transition-all
            duration-200
            hover:border-[#67E8F9]/30
            hover:bg-[#67E8F9]/[0.05]
            hover:shadow-[0_0_18px_rgba(103,232,249,0.07)]
          "
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>

        {/* ==================================================
            CURRENT PAGE TITLE
            ================================================== */}

        {currentPageTitle && (
          <div className="min-w-0">
            <div
              className="
                hidden
                sm:block
                mb-1
                text-[9px]
                uppercase
                tracking-[0.20em]
                text-[#D4AF37]
              "
            >
              CyberOrbit Security Console
            </div>

            <h1
              className="
                truncate
                text-[18px]
                sm:text-[20px]
                lg:text-[21px]
                font-light
                tracking-[-0.025em]
                leading-none
                text-[#F4F7FA]
              "
            >
              {currentPageTitle}
            </h1>
          </div>
        )}

        {/* ==================================================
            DATA REFRESH
            ================================================== */}

        <button
          id="btn-topbar-refresh"
          onClick={onRefreshData}
          disabled={isRefreshing}
          title="Re-sync Telemetry"
          aria-label="Re-sync Telemetry"
          className="
            group
            w-9
            h-9
            shrink-0
            flex
            items-center
            justify-center
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            text-[#7F8A96]
            transition-all
            duration-200
            cursor-pointer
            disabled:cursor-not-allowed
            disabled:opacity-50
            hover:text-[#67E8F9]
            hover:border-[#67E8F9]/30
            hover:bg-[#67E8F9]/[0.05]
            hover:shadow-[0_0_18px_rgba(103,232,249,0.07)]
          "
        >
          <RefreshCw
            className={`
              w-3.5
              h-3.5
              transition-all
              duration-300
              ${
                isRefreshing
                  ? "animate-spin text-[#67E8F9]"
                  : "group-hover:rotate-90"
              }
            `}
          />
        </button>
      </div>

      {/* ==================================================
          RIGHT SIDE
          ================================================== */}

      <div
        className="
          relative
          z-10
          flex
          items-center
          gap-2
          sm:gap-3
          shrink-0
        "
      >
        {/* ==================================================
            AI COPILOT
            ================================================== */}

        {onOpenCopilot && (
          <button
            id="btn-topbar-copilot"
            onClick={onOpenCopilot}
            title="Open AI Copilot"
            aria-label="Open AI Copilot"
            className="
              inline-flex
              items-center
              gap-1.5
              h-10
              px-3
              sm:px-3.5
              rounded-xl
              border
              border-[#D4AF37]/40
              bg-[#D4AF37]/[0.06]
              text-[#D4AF37]
              text-[11px]
              sm:text-[12px]
              font-medium
              uppercase
              tracking-[0.12em]
              transition-all
              duration-200
              cursor-pointer
              shadow-[0_8px_25px_rgba(212,175,55,0.04)]
              hover:bg-[#D4AF37]/10
              hover:border-[#D4AF37]/70
              hover:-translate-y-0.5
              hover:shadow-[0_10px_28px_rgba(212,175,55,0.07)]
            "
          >
            <Sparkles className="w-3.5 h-3.5" />

            <span className="hidden sm:inline">AI COPILOT</span>
          </button>
        )}

        {/* ==================================================
            USER PROFILE
            ================================================== */}

        <div
          id="topbar-admin-profile"
          className="
            group
            h-10
            flex
            items-center
            gap-2
            px-2
            sm:px-2.5
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            shadow-[0_8px_25px_rgba(0,0,0,0.12)]
            transition-all
            duration-200
            hover:border-[#67E8F9]/25
            hover:bg-[#070C12]
          "
        >
          {/* Avatar */}

          <div
            className="
              w-7
              h-7
              rounded-lg
              border
              border-[#D4AF37]/60
              bg-[#D4AF37]/10
              flex
              items-center
              justify-center
              text-[10px]
              font-semibold
              text-[#D4AF37]
              shrink-0
              shadow-[0_0_12px_rgba(212,175,55,0.06)]
            "
          >
            {adminInitials}
          </div>

          {/* User Details */}

          <div
            className="
              hidden
              sm:block
              text-left
              min-w-0
            "
          >
            <div
              className="
                text-[12px]
                font-semibold
                leading-tight
                truncate
                max-w-[120px]
                text-[#F4F7FA]
              "
            >
              {adminName}
            </div>

            <div
              className="
                mt-0.5
                text-[10px]
                font-medium
                tracking-[0.12em]
                uppercase
                truncate
                max-w-[120px]
                text-[#67E8F9]
              "
            >
              {adminRole}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
