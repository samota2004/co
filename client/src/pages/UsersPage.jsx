import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Lock,
  Unlock,
  RotateCcw,
  X,
  Sparkles,
  Laptop,
} from "lucide-react";

export const UsersPage = ({
  users = [],
  devices = [],
  onRefreshData,
  onOpenCopilot,
}) => {
  const isDark = true;

  // Search, Filter, Sort, Pagination States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedRiskTier, setSelectedRiskTier] = useState("ALL");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Selected User Detail Drawer
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

  // Filtered and Sorted Users
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
        {/* Corner accents */}
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

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
              <span className="rounded-full border border-white/10 bg-[#070C12] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#7F8A96]">
                {users.length} IDENTITIES
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-7 right-7 z-20 hidden items-center gap-3 sm:flex">
          <div className="rounded-xl border border-white/10 bg-[#070C12] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]/90 px-4 py-2.5 backdrop-blur-sm">
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
      <div
        className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 ${
          isDark ? "bg-[#050A10] border-white/10" : "bg-white border-black/10"
        }`}
      >
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
            className={`w-full h-11 rounded-lg border text-sm pl-10 pr-3 outline-none transition-all duration-200 ${
              isDark
                ? "bg-[#070C12] border-white/10 text-[#F4F7FA] placeholder:text-[#7F8A96] focus:border-[#67E8F9]/50 focus:ring-1 focus:ring-[#67E8F9]/20"
                : "bg-white border-black/10 text-[#03070C] placeholder:text-gray-400 focus:border-[#67E8F9]/50 focus:ring-1 focus:ring-[#67E8F9]/20"
            }`}
          />

          <Search className="w-4 h-4 text-[#67E8F9] absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Department Filter */}
          <div className="flex items-center gap-2 text-sm">
            <span className={isDark ? "text-[#A7B0BA]" : "text-gray-500"}>
              DEPT:
            </span>

            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className={`h-10 rounded-lg border text-sm px-3 outline-none cursor-pointer transition-all duration-200 ${
                isDark
                  ? "bg-[#070C12] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]/50"
                  : "bg-white border-black/10 text-[#03070C] focus:border-[#67E8F9]/50"
              }`}
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
            <span className={isDark ? "text-[#A7B0BA]" : "text-gray-500"}>
              RISK TIER:
            </span>

            <select
              value={selectedRiskTier}
              onChange={(e) => {
                setSelectedRiskTier(e.target.value);
                setCurrentPage(1);
              }}
              className={`h-10 rounded-lg border text-sm px-3 outline-none cursor-pointer transition-all duration-200 ${
                isDark
                  ? "bg-[#070C12] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]/50"
                  : "bg-white border-black/10 text-[#03070C] focus:border-[#67E8F9]/50"
              }`}
            >
              <option value="ALL">All Levels</option>
              <option value="HIGH">High (60+)</option>
              <option value="MEDIUM">Medium (40-59)</option>
              <option value="LOW">Safe (&lt;40)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Full-Width Sophisticated Table */}
      {/* Required Columns: PHOTO, EMPLOYEE, DEPARTMENT, RISK, TRUST, STATUS, LAST LOGIN, TRUST BADGE, ACTIVE SESSION */}
      <div
        className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/20 ${
          isDark ? "bg-[#050A10] border-white/10" : "bg-white border-black/10"
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead
              className={`border-b font-medium text-[11px] uppercase tracking-[0.12em] ${
                isDark
                  ? "bg-[#070C12] border-white/10 text-[#67E8F9]"
                  : "bg-[#F2F5F5] border-black/10 text-[#167783]"
              }`}
            >
              <tr>
                <th className="py-4 px-4 w-12 text-center">PHOTO</th>

                <th
                  className="py-4 px-4 cursor-pointer hover:text-[#F4F7FA] select-none transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>EMPLOYEE</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="py-4 px-4 cursor-pointer hover:text-[#F4F7FA] select-none transition-colors"
                  onClick={() => handleSort("department")}
                >
                  <div className="flex items-center gap-1">
                    <span>DEPARTMENT</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="py-4 px-4 cursor-pointer hover:text-[#F4F7FA] select-none text-center transition-colors"
                  onClick={() => handleSort("currentRiskScore")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>RISK</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  className="py-4 px-4 cursor-pointer hover:text-[#F4F7FA] select-none text-center transition-colors"
                  onClick={() => handleSort("currentTrustScore")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>TRUST</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th className="py-4 px-4">STATUS</th>
                <th className="py-4 px-4">LAST LOGIN</th>
                <th className="py-4 px-4 text-center">TRUST BADGE</th>
                <th className="py-4 px-4 text-center">ACTIVE SESSION</th>
                <th className="py-4 px-4 text-right">ACTION</th>
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
                      className={`group transition-all duration-200 ${
                        isDark
                          ? "hover:-translate-y-0.5 hover:bg-[#070C12] hover:shadow-[inset_3px_0_0_#67E8F9,0_0_24px_rgba(103,232,249,0.05)]"
                          : "hover:bg-[#67E8F9]/[0.04]"
                      }`}
                    >
                      {/* PHOTO */}
                      <td className="py-4 px-4 text-center">
                        <div className="w-9 h-9 rounded-xl border border-[#67E8F9]/20 flex items-center justify-center text-xs font-semibold text-[#67E8F9] bg-[#67E8F9]/5 mx-auto group-hover:border-[#67E8F9]/50 group-hover:bg-[#67E8F9]/10 transition-all duration-200">
                          {initials}
                        </div>
                      </td>

                      {/* EMPLOYEE */}
                      <td className="py-4 px-4">
                        <button
                          onClick={() => openUserDetails(u)}
                          className={`text-[15px] font-semibold hover:text-[#67E8F9] transition-colors text-left block ${
                            isDark ? "text-[#F4F7FA]" : "text-[#03070C]"
                          }`}
                        >
                          {u.name}
                        </button>

                        <span className="text-[12px] text-[#7F8A96] block mt-0.5">
                          {u.employeeId} • {u.email}
                        </span>
                      </td>

                      {/* DEPARTMENT */}
                      <td className="py-4 px-4">
                        <span
                          className={`text-sm ${
                            isDark ? "text-[#F4F7FA]" : "text-[#03070C]"
                          }`}
                        >
                          {u.department}
                        </span>

                        <span className="text-[12px] text-[#7F8A96] block mt-0.5">
                          {u.role?.replace("_", " ")}
                        </span>
                      </td>

                      {/* RISK */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`text-sm font-semibold px-2.5 py-1 rounded-md border ${
                            isHighRisk
                              ? "border-red-400/40 text-red-300 bg-red-400/10"
                              : (u.currentRiskScore || 0) >= 40
                                ? "border-[#D4AF37]/50 text-[#D4AF37] bg-[#D4AF37]/10"
                                : "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                          }`}
                        >
                          {u.currentRiskScore ?? 15}
                        </span>
                      </td>

                      {/* TRUST */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            isDark ? "text-[#F4F7FA]" : "text-[#03070C]"
                          }`}
                        >
                          {trustScore}
                        </span>

                        <span className="text-[12px] text-[#7F8A96]">/100</span>
                      </td>

                      {/* STATUS */}
                      <td className="py-4 px-4">
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-md border uppercase font-semibold ${
                            isFrozen
                              ? "border-red-400/40 text-red-300 bg-red-400/10"
                              : u.status === "RESTRICTED"
                                ? "border-orange-400/40 text-orange-300 bg-orange-400/10"
                                : "border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/5"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      {/* LAST LOGIN */}
                      <td className="py-4 px-4 text-[13px] text-[#7F8A96]">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString()
                          : "Today"}
                      </td>

                      {/* TRUST BADGE */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border ${
                            trustScore >= 85
                              ? "border-[#D4AF37]/50 text-[#D4AF37] bg-[#D4AF37]/5"
                              : trustScore >= 60
                                ? "border-gray-500/50 text-gray-400 bg-gray-500/5"
                                : "border-red-400/40 text-red-300 bg-red-400/5"
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />

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
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-sm ${
                            isDark ? "text-[#A7B0BA]" : "text-gray-600"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{activeSessionsCount} active</span>
                        </span>
                      </td>

                      {/* ACTION */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openUserDetails(u)}
                            className="px-3 py-1.5 rounded-lg border border-[#67E8F9]/25 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5 text-[11px] font-medium text-[#67E8F9] transition-all duration-200 cursor-pointer"
                          >
                            INSPECT
                          </button>

                          {isFrozen ? (
                            <button
                              onClick={() => handleUnfreeze(u.id)}
                              className="px-3 py-1.5 rounded-lg border border-emerald-400/40 text-[11px] font-medium text-emerald-300 hover:bg-emerald-400/10 transition-all duration-200 cursor-pointer"
                            >
                              UNFREEZE
                            </button>
                          ) : (
                            <button
                              onClick={() => handleFreeze(u.id)}
                              className="px-3 py-1.5 rounded-lg border border-red-400/40 text-[11px] font-medium text-red-300 hover:bg-red-400/10 transition-all duration-200 cursor-pointer"
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
                    className="py-14 px-4 text-center text-sm text-[#7F8A96]"
                  >
                    No employees match the specified filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div
          className={`p-4 border-t border-white/10 flex items-center justify-between text-sm bg-[#070C12] ${
            isDark
              ? "bg-[#070C12] border-white/10"
              : "bg-[#F2F5F5] border-black/10"
          }`}
        >
          <span className="text-[#7F8A96] text-[13px]">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, processedUsers.length)} of{" "}
            {processedUsers.length} employees
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`w-9 h-9 rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                currentPage === 1
                  ? "border-gray-500/20 text-gray-600 cursor-not-allowed"
                  : "border-[#67E8F9]/25 text-[#67E8F9] hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5"
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-3 text-sm font-medium text-[#67E8F9]">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className={`w-9 h-9 rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                currentPage === totalPages
                  ? "border-gray-500/20 text-gray-600 cursor-not-allowed"
                  : "border-[#67E8F9]/25 text-[#67E8F9] hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/5"
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* User Detail Side Drawer */}
      {userDrawerOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#03070C]/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-lg h-full border-l p-7 sm:p-8 overflow-y-auto space-y-7 shadow-[-20px_0_70px_rgba(0,0,0,0.35)] ${
              isDark
                ? "bg-[#050A10] text-[#F4F7FA] border-[#67E8F9]/30 shadow-[-24px_0_80px_rgba(0,0,0,0.45)]"
                : "bg-white text-[#03070C] border-black/10"
            }`}
          >
            <div className="flex items-center justify-between pb-5 border-b border-white/10">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#67E8F9]">
                IDENTITY INSPECTOR
              </span>

              <button
                onClick={() => setUserDrawerOpen(false)}
                className="w-9 h-9 rounded-lg border border-white/10 text-[#7F8A96] hover:text-[#F4F7FA] hover:border-white/20 hover:bg-white/5 flex items-center justify-center cursor-pointer transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Summary */}
            <div>
              <div className="text-3xl font-light">{selectedUser.name}</div>

              <div className="text-[13px] text-[#7F8A96] mt-1">
                {selectedUser.employeeId} • {selectedUser.department} •{" "}
                {selectedUser.email}
              </div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className={`p-5 rounded-xl border ${
                  isDark
                    ? "border-white/10 bg-[#070C12] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]"
                    : "border-black/10 bg-[#F8F8F5]"
                }`}
              >
                <span className="text-[11px] text-[#7F8A96] uppercase tracking-[0.14em] block">
                  TRUST SCORE
                </span>

                <div className="text-3xl font-light mt-1">
                  {selectedUser.currentTrustScore ?? 95} / 100
                </div>
              </div>

              <div
                className={`p-5 rounded-xl border ${
                  isDark
                    ? "border-white/10 bg-[#070C12] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]"
                    : "border-black/10 bg-[#F8F8F5]"
                }`}
              >
                <span className="text-[11px] text-[#7F8A96] uppercase tracking-[0.14em] block">
                  CURRENT RISK
                </span>

                <div className="text-3xl font-light text-[#D4AF37] mt-1">
                  {selectedUser.currentRiskScore ?? 15} / 100
                </div>
              </div>
            </div>

            {/* Baseline Parameters */}
            <div
              className={`p-5 rounded-xl border space-y-3 text-sm ${
                isDark
                  ? "border-white/10 bg-[#070C12] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#080E15]"
                  : "border-black/10 bg-[#F8F8F5]"
              }`}
            >
              <span className="text-[11px] text-[#67E8F9] tracking-[0.14em] uppercase block mb-3">
                BEHAVIORAL BASELINES
              </span>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Normal Hours:</span>
                <span className={isDark ? "text-[#F4F7FA]" : "text-[#03070C]"}>
                  09:00 - 18:00
                </span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Avg Daily Downloads:</span>
                <span className={isDark ? "text-[#F4F7FA]" : "text-[#03070C]"}>
                  4 files / day
                </span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Max Safe Volume:</span>
                <span className={isDark ? "text-[#F4F7FA]" : "text-[#03070C]"}>
                  500 MB
                </span>
              </div>

              <div className="flex justify-between text-[#A7B0BA]">
                <span>Primary Office:</span>
                <span className={isDark ? "text-[#F4F7FA]" : "text-[#03070C]"}>
                  HQ Campus
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3 pt-5 border-t border-white/10">
              <span className="text-[11px] text-[#7F8A96] tracking-[0.14em] uppercase block">
                SOC CONTAINMENT CONTROLS
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedUser.status === "FROZEN" ? (
                  <button
                    onClick={() => handleUnfreeze(selectedUser.id)}
                    className="py-3 rounded-lg border border-emerald-400/40 text-emerald-300 text-sm font-medium hover:bg-emerald-400/10 transition-all duration-200 cursor-pointer"
                  >
                    UNFREEZE ACCOUNT
                  </button>
                ) : (
                  <button
                    onClick={() => handleFreeze(selectedUser.id)}
                    className="py-3 rounded-lg border border-red-400/40 text-red-300 text-sm font-medium hover:bg-red-400/10 transition-all duration-200 cursor-pointer"
                  >
                    FREEZE ACCOUNT
                  </button>
                )}

                <button
                  onClick={() => handleResetRisk(selectedUser.id)}
                  className="py-3 rounded-lg border border-[#D4AF37]/40 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 text-[#D4AF37] text-sm font-medium transition-all duration-200 cursor-pointer"
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
