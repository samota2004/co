import React, { useEffect } from "react";

import {
  LayoutDashboard,
  UserCheck,
  Users,
  Building2,
  Laptop,
  Activity,
  Sparkles,
  ShieldAlert,
  Bell,
  Shield,
  BrainCircuit,
  FileText,
  FlaskConical,
  Settings,
  LogOut,
  Menu,
  X,
  UserCog,
} from "lucide-react";

// ======================================================
// CONSTANTS / CONFIGURATION
// ======================================================

const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 72;

// ======================================================
// MAIN COMPONENT
// ======================================================

export const Sidebar = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  onTabChange,
  incidentCount = 0,
  currentUser,
  onLogout,
  mobileOpen = false,
  onCloseMobile,
}) => {
  useEffect(() => {
    if (mobileOpen) {
      setIsSidebarOpen(true);
    }
  }, [mobileOpen]);

  // ======================================================
  // HELPER FUNCTIONS
  // ======================================================

  const handleTabSelect = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId);
    }

    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const getInitials = (name) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  // ======================================================
  // USER / ROLE DATA
  // ======================================================

  const isCurrentUserAdmin =
    currentUser?.role === "SECURITY_ADMIN" ||
    currentUser?.role === "SYSTEM_ADMIN" ||
    currentUser?.roleCode === "SECURITY_ADMIN" ||
    currentUser?.roleCode === "SYSTEM_ADMIN";

  const adminName = currentUser?.name || "Account";

  const adminRole =
    currentUser?.role === "SECURITY_ADMIN" ||
    currentUser?.roleCode === "SECURITY_ADMIN"
      ? "SOC Lead"
      : currentUser?.role === "SYSTEM_ADMIN" ||
          currentUser?.roleCode === "SYSTEM_ADMIN"
        ? "System Admin"
        : "Security Analyst";

  // ======================================================
  // NAVIGATION DATA
  // ======================================================

  const navSections = [
    {title:'Access and security',items:[
      {id:'security-profile',label:'Security Profile',icon:UserCheck},
      {id:'resources',label:'Protected Resources',icon:Shield},
      {id:'access-requests',label:'Access Requests',icon:Shield}
    ]},
    {
      title: "Dashboard",
      items: [
        {
          id: "dashboard",
          label: "Admin Dashboard",
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: "employee-dashboard",
          label: "Employee monitoring",
          icon: UserCheck,
          badge: null,
        },
      ],
    },
    {
      title: "Security",
      items: [
        {
          id: "risk-analysis",
          label: "Risk Analysis",
          icon: Activity,
          badge: null,
        },
        {
          id: "xai",
          label: "Explainable AI",
          icon: Sparkles,
          badge: "XAI",
        },
        {
          id: "devices",
          label: "Device Trust",
          icon: Laptop,
          badge: null,
        },
        { id: "alerts", label: "Detection alerts", icon: Bell },
        {
          id: "incidents",
          label: "Incidents",
          icon: ShieldAlert,
          badge: incidentCount > 0 ? incidentCount : null,
        },
        {
          id: "policies",
          label: "Policy Engine",
          icon: Shield,
          badge: null,
        },
      ],
    },
    {
      title: "Monitoring",
      items: [
        {
          id: "audit-logs",
          label: "Audit Logs",
          icon: FileText,
          badge: null,
        },
        ...(isCurrentUserAdmin
          ? [
              {
                id: "admin-management",
                label: "Admin Management",
                icon: UserCog,
                badge: null,
              },
            ]
          : []),
        {
          id: "employees",
          label: "Employee Management",
          icon: Users,
          badge: null,
        },
        {
          id: "departments",
          label: "Departments",
          icon: Building2,
          badge: null,
        },
        {
          id: "ml-analytics",
          label: "ML Analytics",
          icon: BrainCircuit,
          badge: null,
        },
        {
          id: "simulator",
          label: "Threat Simulator",
          icon: FlaskConical,
          badge: "SIM",
        },
      ],
    },
    {
      title: "System",
      items: [
        {
          id: "settings",
          label: "Settings",
          icon: Settings,
          badge: null,
        },
      ],
    },
  ].sort((a,b)=>(a.title === "Dashboard" ? -1 : b.title === "Dashboard" ? 1 : 0)).map(section=>({...section,items:section.items.filter(item=>isCurrentUserAdmin||['employee-dashboard','security-profile','resources','access-requests','settings'].includes(item.id))})).filter(section=>section.items.length);

  // ======================================================
  // SIDEBAR UI
  // ======================================================

  const sidebarContent = (
    <aside
      id="cyberorbit-sidebar"
      style={{
        width: `${
          isSidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH
        }px`,
      }}
      className="fixed left-0 top-0 z-40 flex h-screen shrink-0 select-none flex-col overflow-hidden border-r border-white/10 bg-[#03070C] text-[#F4F7FA] shadow-[12px_0_50px_rgba(0,0,0,0.18)] transition-[width] duration-300 ease-in-out"
    >
      {/* Technical background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(103,232,249,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.10) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ==================================================
          SIDEBAR HEADER
          ================================================== */}
      <div
        className={`relative z-10 shrink-0 border-b border-white/10 transition-all duration-300 ${
          isSidebarOpen
            ? "flex h-[76px] items-center justify-between px-4"
            : "flex h-[76px] items-center justify-center px-2"
        }`}
      >
        {isSidebarOpen ? (
          <>
            {/* CyberOrbit brand — kept exactly as the original logo UI */}
            <button
              id="btn-sidebar-dashboard"
              onClick={() => handleTabSelect("dashboard")}
              title="CyberOrbit Platform"
              className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
            >
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                <div className="absolute inset-0 rounded-full border border-[#D4AF37] rotate-45" />
                <div className="absolute inset-[5px] rounded-full border border-cyan-300/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              </div>

              <div className="min-w-0">
                <div className="text-[20px] tracking-[0.16em] text-white font-semibold leading-none whitespace-nowrap">
                  CYBERORBIT
                </div>

                <div className="mt-1 text-[7px] uppercase tracking-[0.27em] text-cyan-300 whitespace-nowrap">
                  Insider Threat Defense
                </div>
              </div>
            </button>

            <button
              id="btn-sidebar-toggle"
              onClick={() => setIsSidebarOpen(false)}
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-[#050A10] text-[#7F8A96] transition-all duration-200 hover:border-[#67E8F9]/30 hover:bg-[#67E8F9]/[0.05] hover:text-[#67E8F9] hover:shadow-[0_0_16px_rgba(103,232,249,0.06)]"
            >
              <Menu className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            id="btn-sidebar-toggle"
            onClick={() => setIsSidebarOpen(true)}
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-[#050A10] text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/35 hover:bg-[#67E8F9]/[0.06] hover:shadow-[0_0_20px_rgba(103,232,249,0.08)]"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {mobileOpen && (
          <button
            onClick={onCloseMobile}
            title="Close Sidebar"
            aria-label="Close Sidebar"
            className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-[#7F8A96] transition-colors hover:bg-white/5 hover:text-[#F4F7FA] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ==================================================
          NAVIGATION
          ================================================== */}
      <nav
        className={`relative z-10 min-h-0 flex-1 overflow-y-auto custom-scrollbar transition-all duration-300 ${
          isSidebarOpen ? "px-3 py-5" : "px-2 py-5"
        }`}
      >
        <div className={isSidebarOpen ? "space-y-6" : "space-y-3"}>
          {navSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {isSidebarOpen && (
                <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.2em] text-[#7F8A96]">
                  {section.title}
                </div>
              )}

              <div className={isSidebarOpen ? "space-y-1" : "space-y-2"}>
                {section.items.map((item) => {
                  const Icon = item.icon;

                  const isActive =
                    activeTab === item.id ||
                    (item.id === "employees" &&
                      (activeTab === "users" ||
                        activeTab === "employee-mgmt")) ||
                    (item.id === "risk-analysis" && activeTab === "ai-risk");

                  return (
                    <button
                      key={item.id}
                      id={`nav-tab-${item.id}`}
                      onClick={() => handleTabSelect(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={!isSidebarOpen ? item.label : undefined}
                      aria-label={!isSidebarOpen ? item.label : undefined}
                      className={`group relative flex cursor-pointer items-center border transition-all duration-200 ${
                        isSidebarOpen
                          ? "h-11 w-full gap-3 rounded-xl px-3"
                          : "mx-auto h-11 w-11 justify-center rounded-xl"
                      } ${
                        isActive
                          ? "border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[#F4F7FA] shadow-[inset_3px_0_0_#67E8F9,0_8px_24px_rgba(103,232,249,0.07)]"
                          : "border-transparent text-[#7F8A96] hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#070C12] hover:text-[#F4F7FA] hover:shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.65)]" />
                      )}

                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${
                          isActive
                            ? "text-[#67E8F9]"
                            : "text-[#7F8A96] group-hover:text-[#67E8F9]"
                        }`}
                      />

                      {isSidebarOpen && (
                        <>
                          <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium tracking-[-0.01em]">
                            {item.label}
                          </span>

                          {item.badge != null && (
                            <span
                              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                                isActive
                                  ? "border-[#67E8F9]/30 bg-[#67E8F9]/[0.06] text-[#67E8F9]"
                                  : typeof item.badge === "number"
                                    ? "border-red-400/30 bg-red-400/10 text-red-300"
                                    : "border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] text-[#D4AF37]"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ==================================================
          USER / ADMIN FOOTER
          ================================================== */}
      <div className="relative z-10 shrink-0 border-t border-white/10 p-3">
        {isSidebarOpen ? (
          <div className="group flex items-center justify-between rounded-2xl border border-white/10 bg-[#050A10] p-3 shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition-all duration-200 hover:border-[#67E8F9]/25 hover:bg-[#070C12]">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[10px] font-semibold text-[#67E8F9] shadow-[0_0_16px_rgba(103,232,249,0.05)]">
                {getInitials(adminName)}
              </div>

              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold leading-tight text-[#F4F7FA]">
                  {adminName}
                </div>
                <div className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.13em] text-[#D4AF37]">
                  {adminRole}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                id="btn-sidebar-logout"
                onClick={onLogout}
                title="Logout"
                aria-label="Logout"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#7F8A96] transition-all duration-200 hover:bg-red-400/10 hover:text-red-300"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/10 text-[10px] font-semibold text-[#67E8F9]">
            {getInitials(adminName)}
          </div>
        )}
      </div>
    </aside>
  );

  // ======================================================
  // RESPONSIVE / MOBILE
  // ======================================================

  return (
    <>
      <div className="hidden md:block">{sidebarContent}</div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onCloseMobile}
          />

          <div className="relative w-[280px] max-w-[86vw] h-full shadow-[20px_0_70px_rgba(0,0,0,0.35)]">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
