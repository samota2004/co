
import React, { useState } from "react";
import { Sparkles, RefreshCw, Menu, Bell } from "lucide-react";

// CyberOrbit uses a consistent dark-only visual system.
const TOPBAR_HEIGHT = 76;

export const TopBar = ({
  currentUser,
  currentPageTitle = "Admin Dashboard",
  onOpenCopilot,
  onRefreshData,
  isRefreshing,
  onLogout,
  onToggleMobileNav,
  notifications = [],
  unreadNotifications = 0,
  onReadNotification,
  onReadAllNotifications,
  onNotificationSelect,
}) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const adminName = currentUser?.name || "Account";

  const userRole = currentUser?.role || currentUser?.roleCode;

  const adminRole =
    userRole === "SECURITY_ADMIN"
      ? "SOC Lead"
      : userRole === "SYSTEM_ADMIN"
        ? "System Admin"
        : "Security Analyst";

  const adminInitials = adminName
    .split(" ")
    .filter(Boolean)
    .map((name) => name[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isAdmin = ["SECURITY_ADMIN", "SYSTEM_ADMIN"].includes(userRole);

  const handleNotificationSelect = (item) => {
    onReadNotification?.(item.id);
    onNotificationSelect?.(item);
    setNotificationsOpen(false);
  };

  const handleEnableBrowserNotifications = () => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  };

  return (
    <header
      id="cyberorbit-topbar"
      style={{ height: `${TOPBAR_HEIGHT}px` }}
      className="
        relative
        z-30
        flex
        w-full
        shrink-0
        items-center
        justify-between
        border-b
        border-white/10
        bg-[#03070C]/95
        px-4
        text-[#F4F7FA]
        shadow-[0_8px_35px_rgba(0,0,0,0.12)]
        backdrop-blur-xl
        transition-all
        duration-300
        sm:px-6
        lg:px-8
      "
    >
      {/* Technical Background */}
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

      {/* Left Side */}
      <div
        className="
          relative
          z-10
          flex
          min-w-0
          items-center
          gap-3
          sm:gap-4
        "
      >
        {/* Mobile Navigation */}
        <button
          id="btn-topbar-mobile-menu"
          type="button"
          onClick={onToggleMobileNav}
          title="Open Navigation"
          aria-label="Open Navigation"
          className="
            flex
            h-10
            w-10
            shrink-0
            cursor-pointer
            items-center
            justify-center
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            text-[#67E8F9]
            transition-all
            duration-200
            hover:border-[#67E8F9]/30
            hover:bg-[#67E8F9]/[0.05]
            hover:shadow-[0_0_18px_rgba(103,232,249,0.07)]
            md:hidden
          "
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        {/* Current Page Title */}
        {currentPageTitle && (
          <div className="min-w-0">
            <div
              className="
                mb-1
                hidden
                text-[9px]
                uppercase
                tracking-[0.20em]
                text-[#D4AF37]
                sm:block
              "
            >
              CyberOrbit Security Console
            </div>

            <h1
              className="
                truncate
                text-[18px]
                font-light
                leading-none
                tracking-[-0.025em]
                text-[#F4F7FA]
                sm:text-[20px]
                lg:text-[21px]
              "
            >
              {currentPageTitle}
            </h1>
          </div>
        )}

        {/* Data Refresh */}
        <button
          id="btn-topbar-refresh"
          type="button"
          onClick={onRefreshData}
          disabled={isRefreshing}
          title="Re-sync Telemetry"
          aria-label="Re-sync Telemetry"
          className="
            group
            flex
            h-9
            w-9
            shrink-0
            cursor-pointer
            items-center
            justify-center
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            text-[#7F8A96]
            transition-all
            duration-200
            hover:border-[#67E8F9]/30
            hover:bg-[#67E8F9]/[0.05]
            hover:text-[#67E8F9]
            hover:shadow-[0_0_18px_rgba(103,232,249,0.07)]
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          <RefreshCw
            className={`
              h-3.5
              w-3.5
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

      {/* Right Side */}
      <div
        className="
          relative
          z-10
          flex
          shrink-0
          items-center
          gap-2
          sm:gap-3
        "
      >
        {/* Security Notifications */}
        {isAdmin && (
          <div className="relative">
            <button
              type="button"
              aria-label={`Notifications${
                unreadNotifications
                  ? `, ${unreadNotifications} unread`
                  : ""
              }`}
              aria-expanded={notificationsOpen}
              aria-haspopup="true"
              onClick={() =>
                setNotificationsOpen((value) => !value)
              }
              className="
                relative
                inline-flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                border
                border-white/10
                bg-[#050A10]
                text-[#67E8F9]
                transition-all
                duration-200
                hover:border-[#67E8F9]/40
                hover:bg-[#67E8F9]/[0.05]
              "
            >
              <Bell className="h-4 w-4" />

              {unreadNotifications > 0 && (
                <span
                  className="
                    absolute
                    -right-1
                    -top-1
                    min-w-5
                    rounded-full
                    bg-[#D4AF37]
                    px-1
                    text-[10px]
                    font-bold
                    text-[#03070C]
                  "
                >
                  {unreadNotifications > 99
                    ? "99+"
                    : unreadNotifications}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {notificationsOpen && (
              <section
                aria-label="Security notifications"
                className="
                  absolute
                  right-0
                  top-12
                  z-[60]
                  w-[min(24rem,calc(100vw-2rem))]
                  rounded-2xl
                  border
                  border-white/10
                  bg-[#050A10]
                  p-4
                  shadow-[0_20px_60px_rgba(0,0,0,0.55)]
                  backdrop-blur-xl
                "
              >
                {/* Dropdown Header */}
                <div
                  className="
                    mb-3
                    flex
                    items-center
                    justify-between
                    gap-3
                    border-b
                    border-white/10
                    pb-3
                  "
                >
                  <div>
                    <h2 className="text-sm font-semibold text-[#F4F7FA]">
                      Security Notifications
                    </h2>

                    <p className="mt-1 text-[11px] text-[#7F8A96]">
                      Recent administrator activity
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onReadAllNotifications}
                    className="
                      shrink-0
                      text-[11px]
                      font-medium
                      text-[#67E8F9]
                      transition-colors
                      hover:text-white
                    "
                  >
                    Mark all read
                  </button>
                </div>

                {/* Notification List */}
                {notifications.length > 0 ? (
                  <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() =>
                            handleNotificationSelect(item)
                          }
                          className={`
                            w-full
                            rounded-xl
                            border
                            p-3
                            text-left
                            transition-all
                            duration-200
                            hover:border-[#67E8F9]/30
                            hover:bg-[#67E8F9]/[0.04]
                            ${
                              item.readAt
                                ? "border-white/10 opacity-70"
                                : "border-[#67E8F9]/20 bg-[#67E8F9]/[0.035]"
                            }
                          `}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] font-medium text-[#F4F7FA]">
                              {item.title}
                            </span>

                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-[#D4AF37]">
                              {item.severity}
                            </span>
                          </div>

                          <span className="mt-1.5 block text-xs leading-relaxed text-[#A7B0BA]">
                            {item.message}
                          </span>

                          <time className="mt-2 block text-[10px] text-[#7F8A96]">
                            {new Date(
                              item.createdAt
                            ).toLocaleString()}
                          </time>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-[#7F8A96]">
                    No administrator activity available.
                  </p>
                )}

                {/* Browser Notifications */}
                <button
                  type="button"
                  onClick={handleEnableBrowserNotifications}
                  className="
                    mt-3
                    w-full
                    rounded-xl
                    border
                    border-white/10
                    px-3
                    py-2.5
                    text-xs
                    text-[#A7B0BA]
                    transition-all
                    duration-200
                    hover:border-[#67E8F9]/30
                    hover:text-[#67E8F9]
                  "
                >
                  Enable browser notifications
                </button>
              </section>
            )}
          </div>
        )}

        {/* AI Copilot */}
        {onOpenCopilot && (
          <button
            id="btn-topbar-copilot"
            type="button"
            onClick={onOpenCopilot}
            title="Open AI Copilot"
            aria-label="Open AI Copilot"
            className="
              inline-flex
              h-10
              cursor-pointer
              items-center
              gap-1.5
              rounded-xl
              border
              border-[#D4AF37]/40
              bg-[#D4AF37]/[0.06]
              px-3
              text-[11px]
              font-medium
              uppercase
              tracking-[0.12em]
              text-[#D4AF37]
              shadow-[0_8px_25px_rgba(212,175,55,0.04)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:border-[#D4AF37]/70
              hover:bg-[#D4AF37]/10
              hover:shadow-[0_10px_28px_rgba(212,175,55,0.07)]
              sm:px-3.5
              sm:text-[12px]
            "
          >
            <Sparkles className="h-3.5 w-3.5" />

            <span className="hidden sm:inline">
              AI COPILOT
            </span>
          </button>
        )}

        {/* User Profile */}
        <div
          id="topbar-admin-profile"
          className="
            group
            flex
            h-10
            items-center
            gap-2
            rounded-xl
            border
            border-white/10
            bg-[#050A10]
            px-2
            shadow-[0_8px_25px_rgba(0,0,0,0.12)]
            transition-all
            duration-200
            hover:border-[#67E8F9]/25
            hover:bg-[#070C12]
            sm:px-2.5
          "
        >
          {/* Avatar */}
          <div
            className="
              flex
              h-7
              w-7
              shrink-0
              items-center
              justify-center
              rounded-lg
              border
              border-[#D4AF37]/60
              bg-[#D4AF37]/10
              text-[10px]
              font-semibold
              text-[#D4AF37]
              shadow-[0_0_12px_rgba(212,175,55,0.06)]
            "
          >
            {adminInitials}
          </div>

          {/* User Details */}
          <div className="hidden min-w-0 text-left sm:block">
            <div
              className="
                max-w-[120px]
                truncate
                text-[12px]
                font-semibold
                leading-tight
                text-[#F4F7FA]
              "
            >
              {adminName}
            </div>

            <div
              className="
                mt-0.5
                max-w-[120px]
                truncate
                text-[10px]
                font-medium
                uppercase
                tracking-[0.12em]
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
