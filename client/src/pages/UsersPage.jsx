import React, { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  X,
} from "lucide-react";

export const UsersPage = ({
  users = [],
  devices = [],
  onRefreshData,
  onOpenCopilot,
}) => {
  const isDark = true;

  // Search, filter, sort, and pagination states.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedRiskTier, setSelectedRiskTier] = useState("ALL");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Selected user detail drawer state.
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const departments = [
    "ALL",
    "HR",
    "Finance",
    "Engineering",
    "IT",
    "Security",
    "Sales",
    "Marketing",
    "Legal",
    "Operations",
  ];

  // Filtered and sorted users.
  const processedUsers = useMemo(() => {
    let result = users.filter((u) => {
      const q = searchQuery.toLowerCase();

      const matchesSearch =
        u.name?.toLowerCase().includes(q) ||
        u.employeeId?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q);

      const matchesDept =
        selectedDept === "ALL" ||
        u.department?.toUpperCase() === selectedDept.toUpperCase();

      const risk = u.currentRiskScore || 0;

      const matchesRisk =
        selectedRiskTier === "ALL" ||
        (selectedRiskTier === "HIGH" && risk >= 60) ||
        (selectedRiskTier === "MEDIUM" && risk >= 40 && risk < 60) ||
        (selectedRiskTier === "LOW" && risk < 40);

      return matchesSearch && matchesDept && matchesRisk;
    });

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;

      return 0;
    });

    return result;
  }, [
    users,
    searchQuery,
    selectedDept,
    selectedRiskTier,
    sortField,
    sortOrder,
  ]);

  const totalPages = Math.ceil(processedUsers.length / pageSize) || 1;

  const paginatedUsers = processedUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const openUserDetails = async (user) => {
    setSelectedUser(user);
    setUserDrawerOpen(true);
    setLoadingDetails(true);
    setUserDetails(null);

    try {
      const res = await fetch(`/api/users/${user.id}`);
      const data = await res.json();

      if (data.success) {
        setUserDetails(data);
      }
    } catch (err) {
      console.error("Failed to fetch user details", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleFreeze = async (userId) => {
    try {
      await fetch(`/api/users/${userId}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "SOC manual containment" }),
      });

      if (onRefreshData) onRefreshData();

      if (selectedUser?.id === userId) {
        openUserDetails({ ...selectedUser, status: "FROZEN" });
      }
    } catch (err) {
      console.error("Failed to freeze user", err);
    }
  };

  const handleUnfreeze = async (userId) => {
    try {
      await fetch(`/api/users/${userId}/unfreeze`, { method: "POST" });

      if (onRefreshData) onRefreshData();

      if (selectedUser?.id === userId) {
        openUserDetails({
          ...selectedUser,
          status: "ACTIVE",
          currentRiskScore: 20,
          currentRiskLevel: "LOW",
        });
      }
    } catch (err) {
      console.error("Failed to unfreeze user", err);
    }
  };

  const handleResetRisk = async (userId) => {
    try {
      await fetch(`/api/users/${userId}/reset-risk`, { method: "POST" });

      if (onRefreshData) onRefreshData();

      if (selectedUser?.id === userId) {
        openUserDetails({
          ...selectedUser,
          currentRiskScore: 15,
          currentRiskLevel: "LOW",
          currentTrustScore: 95,
        });
      }
    } catch (err) {
      console.error("Failed to recalibrate risk", err);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-12">
      {/* Enterprise Identity Registry Hero */}
      <div className="group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        {/* Technical grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.55) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        {/* Right-side identity network visual */}
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] overflow-hidden lg:block">
          <div className="absolute inset-0 bg-gradient-to-l from-[#67E8F9]/[0.045] via-transparent to-transparent" />
          <div className="absolute right-[12%] top-1/2 h-[230px] w-[230px] -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
          <div className="absolute right-[16%] top-1/2 h-[185px] w-[185px] -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />
          <div className="absolute right-[20%] top-1/2 h-[140px] w-[140px] -translate-y-1/2 rounded-full border border-[#D4AF37]/25" />

          <div className="absolute right-[25%] top-1/2 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/45 bg-[#070C12] shadow-[0_0_35px_rgba(103,232,249,0.10)]">
            <ShieldCheck className="h-9 w-9 text-[#67E8F9]" />
          </div>

          <div className="absolute right-[42%] top-[22%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          <div className="absolute right-[15%] bottom-[24%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.9)]" />
          <div className="absolute right-[35%] bottom-[17%] h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
          <div className="absolute right-[30%] top-[14%] h-px w-32 rotate-[28deg] bg-gradient-to-r from-transparent via-[#67E8F9]/30 to-transparent" />
          <div className="absolute right-[19%] bottom-[31%] h-px w-28 -rotate-[24deg] bg-gradient-to-r from-transparent via-[#D4AF37]/30 to-transparent" />
        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[74%]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />
                Enterprise Identity Registry
              </span>

              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                Continuous Access Directory
              </span>
            </div>

            <h1 className="mt-4 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Employee Directory &amp; Risk
              <span className="block text-[#67E8F9]">Posture</span>
            </h1>

            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Real-time user identity inventory with dynamic UEBA risk scoring,
              Bayesian trust calculation, active session counts, and one-click
              containment actions.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#67E8F9]">
                UEBA ACTIVE
              </span>

              <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                ZERO TRUST
              </span>

              <span className="rounded-full border border-white/10 bg-[#070C12] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#7F8A96]">
                {users.length} IDENTITIES
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-7 right-7 z-20 hidden items-center gap-3 sm:flex">
          <div className="rounded-xl border border-white/10 bg-[#070C12] px-4 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.8)]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#A7B0BA]">
                Registry Online
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-4 py-2.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#67E8F9]">
              {users.length} Total Identities
            </span>
          </div>
        </div>
      </div>
            {/* Filter, Search & Sort Controls */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative w-full md:w-96">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search employee, ID, or email..."
              className="h-11 w-full rounded-lg border border-white/10 bg-[#070C12] py-2 pl-10 pr-3 text-sm text-[#F4F7FA] outline-none transition-all duration-200 placeholder:text-[#7F8A96] focus:border-[#67E8F9]/50 focus:ring-1 focus:ring-[#67E8F9]/20"
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />
          </div>

          {/* Filters */}
          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            {/* Department Filter */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#A7B0BA]">DEPT:</span>

              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 cursor-pointer rounded-lg border border-white/10 bg-[#070C12] px-3 text-sm text-[#F4F7FA] outline-none transition-all duration-200 focus:border-[#67E8F9]/50"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Risk Tier Filter */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#A7B0BA]">RISK TIER:</span>

              <select
                value={selectedRiskTier}
                onChange={(e) => {
                  setSelectedRiskTier(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 cursor-pointer rounded-lg border border-white/10 bg-[#070C12] px-3 text-sm text-[#F4F7FA] outline-none transition-all duration-200 focus:border-[#67E8F9]/50"
              >
                <option value="ALL">All Levels</option>
                <option value="HIGH">High (60+)</option>
                <option value="MEDIUM">Medium (40-59)</option>
                <option value="LOW">Safe (&lt;40)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Sophisticated Table */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#070C12] text-[11px] font-medium uppercase tracking-[0.12em] text-[#67E8F9]">
              <tr>
                <th className="w-12 px-4 py-4 text-center">PHOTO</th>

                <th
                  className="cursor-pointer select-none px-4 py-4 transition-colors hover:text-[#F4F7FA]"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>EMPLOYEE</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="cursor-pointer select-none px-4 py-4 transition-colors hover:text-[#F4F7FA]"
                  onClick={() => handleSort("department")}
                >
                  <div className="flex items-center gap-1">
                    <span>DEPARTMENT</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="cursor-pointer select-none px-4 py-4 text-center transition-colors hover:text-[#F4F7FA]"
                  onClick={() => handleSort("currentRiskScore")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>RISK</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="cursor-pointer select-none px-4 py-4 text-center transition-colors hover:text-[#F4F7FA]"
                  onClick={() => handleSort("currentTrustScore")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>TRUST</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </th>

                <th className="px-4 py-4">STATUS</th>
                <th className="px-4 py-4">LAST LOGIN</th>
                <th className="px-4 py-4 text-center">TRUST BADGE</th>
                <th className="px-4 py-4 text-center">ACTIVE SESSION</th>
                <th className="px-4 py-4 text-right">ACTION</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {paginatedUsers.length > 0 ? (
                paginatedUsers.map((u) => {
                  const initials =
                    u.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "U";

                  const isHighRisk = (u.currentRiskScore || 0) >= 60;
                  const isFrozen = u.status === "FROZEN";
                  const trustScore = u.currentTrustScore ?? 95;

                  const activeSessionsCount =
                    devices.filter((d) => d.userId === u.id).length || 1;

                  return (
                    <tr
                      key={u.id}
                      className="group transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#070C12] hover:shadow-[inset_3px_0_0_#67E8F9,0_0_24px_rgba(103,232,249,0.05)]"
                    >
                      {/* PHOTO */}
                      <td className="px-4 py-4 text-center">
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5 text-xs font-semibold text-[#67E8F9] transition-all duration-200 group-hover:border-[#67E8F9]/50 group-hover:bg-[#67E8F9]/10">
                          {initials}
                        </div>
                      </td>

                      {/* EMPLOYEE */}
                      <td className="px-4 py-4">
                        <button
                          onClick={() => openUserDetails(u)}
                          className="block text-left text-[15px] font-semibold text-[#F4F7FA] transition-colors hover:text-[#67E8F9]"
                        >
                          {u.name}
                        </button>

                        <span className="mt-0.5 block text-[12px] text-[#7F8A96]">
                          {u.employeeId} • {u.email}
                        </span>
                      </td>

                      {/* DEPARTMENT */}
                      <td className="px-4 py-4">
                        <span className="text-sm text-[#F4F7FA]">
                          {u.department}
                        </span>

                        <span className="mt-0.5 block text-[12px] text-[#7F8A96]">
                          {u.role?.replace("_", " ")}
                        </span>
                      </td>

                      {/* RISK */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${
                            isHighRisk
                              ? "border-red-400/40 bg-red-400/10 text-red-300"
                              : (u.currentRiskScore || 0) >= 40
                                ? "border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]"
                                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                          }`}
                        >
                          {u.currentRiskScore ?? 15}
                        </span>
                      </td>

                      {/* TRUST */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-semibold text-[#F4F7FA]">
                          {trustScore}
                        </span>
                        <span className="text-[12px] text-[#7F8A96]">
                          /100
                        </span>
                      </td>

                      {/* STATUS */}
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase ${
                            isFrozen
                              ? "border-red-400/40 bg-red-400/10 text-red-300"
                              : u.status === "RESTRICTED"
                                ? "border-orange-400/40 bg-orange-400/10 text-orange-300"
                                : "border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[#D4AF37]"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      {/* LAST LOGIN */}
                      <td className="px-4 py-4 text-[13px] text-[#7F8A96]">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString()
                          : "Today"}
                      </td>

                      {/* TRUST BADGE */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] ${
                            trustScore >= 85
                              ? "border-[#D4AF37]/50 bg-[#D4AF37]/5 text-[#D4AF37]"
                              : trustScore >= 60
                                ? "border-gray-500/50 bg-gray-500/5 text-gray-400"
                                : "border-red-400/40 bg-red-400/5 text-red-300"
                          }`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          <span>
                            {trustScore >= 85
                              ? "HIGH TRUST"
                              : trustScore >= 60
                                ? "PROBATION"
                                : "AT RISK"}
                          </span>
                        </span>
                      </td>

                      {/* ACTIVE SESSION */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-sm text-[#A7B0BA]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          <span>{activeSessionsCount} active</span>
                        </span>
                      </td>

                      {/* ACTION */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openUserDetails(u)}
                            className="cursor-pointer rounded-lg border border-[#67E8F9]/25 px-3 py-1.5 text-[11px] font-medium text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5"
                          >
                            INSPECT
                          </button>

                          {isFrozen ? (
                            <button
                              onClick={() => handleUnfreeze(u.id)}
                              className="cursor-pointer rounded-lg border border-emerald-400/40 px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-400/10"
                            >
                              UNFREEZE
                            </button>
                          ) : (
                            <button
                              onClick={() => handleFreeze(u.id)}
                              className="cursor-pointer rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] font-medium text-red-300 transition-all duration-200 hover:bg-red-400/10"
                            >
                              FREEZE
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
                    className="px-4 py-14 text-center text-sm text-[#7F8A96]"
                  >
                    No employees match the specified filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
                {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-[#070C12] p-4 text-sm">
          <span className="text-[13px] text-[#7F8A96]">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, processedUsers.length)} of{" "}
            {processedUsers.length} employees
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.max(1, prev - 1))
              }
              disabled={currentPage === 1}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
                currentPage === 1
                  ? "cursor-not-allowed border-gray-500/20 text-gray-600"
                  : "border-[#67E8F9]/25 text-[#67E8F9] hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5"
              }`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="px-3 text-sm font-medium text-[#67E8F9]">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
                currentPage === totalPages
                  ? "cursor-not-allowed border-gray-500/20 text-gray-600"
                  : "border-[#67E8F9]/25 text-[#67E8F9] hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5"
              }`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* User Detail Side Drawer */}
      {userDrawerOpen && selectedUser && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#03070C]/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setUserDrawerOpen(false);
            }
          }}
        >
          <div className="h-full w-full max-w-lg space-y-7 overflow-y-auto border-l border-[#67E8F9]/30 bg-[#050A10] p-7 text-[#F4F7FA] shadow-[-24px_0_80px_rgba(0,0,0,0.45)] sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#67E8F9]">
                IDENTITY INSPECTOR
              </span>

              <button
                onClick={() => setUserDrawerOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-[#7F8A96] transition-all duration-200 hover:border-white/20 hover:bg-white/5 hover:text-[#F4F7FA]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Profile Summary */}
            <div>
              <div className="text-3xl font-light">
                {selectedUser.name}
              </div>

              <div className="mt-1 text-[13px] text-[#7F8A96]">
                {selectedUser.employeeId} • {selectedUser.department} •{" "}
                {selectedUser.email}
              </div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]">
                <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  TRUST SCORE
                </span>

                <div className="mt-1 text-3xl font-light">
                  {selectedUser.currentTrustScore ?? 95} / 100
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]">
                <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  CURRENT RISK
                </span>

                <div className="mt-1 text-3xl font-light text-[#D4AF37]">
                  {selectedUser.currentRiskScore ?? 15} / 100
                </div>
              </div>
            </div>

            {/* Baseline Parameters */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-[#070C12] p-5 text-sm transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]">
              <span className="mb-3 block text-[11px] uppercase tracking-[0.14em] text-[#67E8F9]">
                BEHAVIORAL BASELINES
              </span>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Normal Hours:</span>
                <span className="text-[#F4F7FA]">09:00 - 18:00</span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Avg Daily Downloads:</span>
                <span className="text-[#F4F7FA]">4 files / day</span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Max Safe Volume:</span>
                <span className="text-[#F4F7FA]">500 MB</span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Primary Office:</span>
                <span className="text-[#F4F7FA]">HQ Campus</span>
              </div>
            </div>
                        {/* User Details */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-[#070C12] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[#67E8F9]">
                  IDENTITY DETAILS
                </span>

                {loadingDetails && (
                  <span className="text-[11px] text-[#7F8A96]">
                    Loading...
                  </span>
                )}
              </div>

              {!loadingDetails && userDetails && (
                <div className="space-y-3 text-sm">
                  {[
                    ["Account Status", selectedUser.status || "UNKNOWN"],
                    ["Department", selectedUser.department || "N/A"],
                    ["Role", selectedUser.role?.replace("_", " ") || "N/A"],
                    [
                      "Risk Level",
                      selectedUser.currentRiskLevel || "N/A",
                    ],
                    [
                      "Last Login",
                      selectedUser.lastLoginAt
                        ? new Date(
                            selectedUser.lastLoginAt,
                          ).toLocaleString()
                        : "Not available",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-4"
                    >
                      <span className="text-[#7F8A96]">{label}</span>
                      <span className="text-right text-[#F4F7FA]">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!loadingDetails && !userDetails && (
                <p className="text-xs leading-5 text-[#7F8A96]">
                  Additional identity details are currently unavailable.
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="space-y-3 border-t border-white/10 pt-5">
              <span className="block text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
                SOC CONTAINMENT CONTROLS
              </span>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedUser.status === "FROZEN" ? (
                  <button
                    onClick={() => handleUnfreeze(selectedUser.id)}
                    className="cursor-pointer rounded-lg border border-emerald-400/40 py-3 text-sm font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-400/10"
                  >
                    UNFREEZE ACCOUNT
                  </button>
                ) : (
                  <button
                    onClick={() => handleFreeze(selectedUser.id)}
                    className="cursor-pointer rounded-lg border border-red-400/40 py-3 text-sm font-medium text-red-300 transition-all duration-200 hover:bg-red-400/10"
                  >
                    FREEZE ACCOUNT
                  </button>
                )}

                <button
                  onClick={() => handleResetRisk(selectedUser.id)}
                  className="cursor-pointer rounded-lg border border-[#D4AF37]/40 py-3 text-sm font-medium text-[#D4AF37] transition-all duration-200 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5"
                >
                  RECALIBRATE RISK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;