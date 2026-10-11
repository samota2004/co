import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Database,
  Edit3,
  KeyRound,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

const DEPARTMENTS = [
  "HR",
  "FINANCE",
  "ENGINEERING",
  "SALES",
  "LEGAL",
  "EXECUTIVE",
  "SECURITY",
  "IT",
  "MARKETING",
  "ADMINISTRATION",
];

const ROLES = ["SECURITY_ADMIN", "SYSTEM_ADMIN"];

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  department: "ENGINEERING",
  role: "SECURITY_ADMIN",
  status: "ACTIVE",
};

const getToken = () => localStorage.getItem("zero_trust_token");

const getErrorMessage = (data, fallback) =>
  data?.error?.message || data?.message || fallback;

const normalizeAdmin = (admin) => ({
  ...admin,
  department: admin.department || admin.departmentCode || "ENGINEERING",
  role: admin.role || admin.roleCode || "SECURITY_ADMIN",
  status: admin.status || "ACTIVE",
});

const StatusBadge = ({ status, isDark }) => {
  const active = status === "ACTIVE";

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-1
        rounded-full
        border
        text-[12px]
        
        uppercase
        tracking-wider
        ${
          active
            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
            : "border-red-500/30 text-red-400 bg-red-500/5"
        }
      `}
    >
      <span
        className={`
          w-1.5 h-1.5 rounded-full
          ${active ? "bg-emerald-400" : "bg-red-400"}
        `}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
};

const RoleBadge = ({ role }) => {
  const label = role === "SYSTEM_ADMIN" ? "System Admin" : "Security Admin";

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 text-[13px] text-[#D4AF37] uppercase tracking-wider">
      <Shield className="w-3 h-3" />
      {label}
    </span>
  );
};

const Panel = ({ children, className = "", isDark }) => (
  <div
    className={`
      border
      bg-[#050A10] border-white/10 rounded-2xl
      shadow-[0_18px_60px_rgba(0,0,0,0.18)]
      transition-all duration-300
      ${className}
    `}
  >
    {children}
  </div>
);

export const AdminManagementPage = ({ currentUser, onBack }) => {
  const isDark = true;

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);

  const [form, setForm] = useState(INITIAL_FORM);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const currentAdminRecord = admins.find(
    (admin) =>
      (currentUser?.id && admin.id === currentUser.id) ||
      (currentUser?.email && admin.email === currentUser.email),
  );

  const isMainAdmin = Boolean(
    currentUser?.isMainAdmin ||
    currentUser?.is_main_admin ||
    currentAdminRecord?.isMainAdmin ||
    currentAdminRecord?.is_main_admin,
  );

  const adminCount = admins.length;

  const activeCount = useMemo(
    () => admins.filter((admin) => admin.status === "ACTIVE").length,
    [admins],
  );

  const inactiveCount = useMemo(
    () => admins.filter((admin) => admin.status !== "ACTIVE").length,
    [admins],
  );

  const loadAdmins = async () => {
    const token = getToken();

    if (!token) {
      setError("Authentication token not found.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admins", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to load administrators."),
        );
      }

      setAdmins((data.admins || []).map(normalizeAdmin));
    } catch (err) {
      setError(err.message || "Unable to load administrators.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const openCreateForm = () => {
    setEditingAdmin(null);
    setForm(INITIAL_FORM);
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEditForm = (admin) => {
    setEditingAdmin(admin);

    setForm({
      name: admin.name || "",
      email: admin.email || "",
      password: "",
      department: admin.department || admin.departmentCode || "ENGINEERING",
      role: admin.role || admin.roleCode || "SECURITY_ADMIN",
      status: admin.status || "ACTIVE",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingAdmin(null);
    setForm(INITIAL_FORM);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = getToken();

    if (!token) {
      setError("Authentication token not found.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        departmentCode: form.department,
        roleCode: form.role,
        status: form.status,
      };

      if (!editingAdmin) {
        payload.password = form.password;
      } else if (form.password.trim()) {
        payload.password = form.password;
      }

      const url = editingAdmin
        ? `/api/admins/${editingAdmin.id}`
        : "/api/admins";

      const method = editingAdmin ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            editingAdmin
              ? "Unable to update administrator."
              : "Unable to create administrator.",
          ),
        );
      }

      const savedAdmin = normalizeAdmin(data.admin);

      setAdmins((previous) => {
        if (!editingAdmin) {
          return [savedAdmin, ...previous];
        }

        return previous.map((admin) =>
          admin.id === savedAdmin.id ? savedAdmin : admin,
        );
      });

      setSuccess(
        editingAdmin
          ? "Administrator updated successfully."
          : "Administrator created successfully.",
      );

      setForm(INITIAL_FORM);
      setEditingAdmin(null);
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Unable to save administrator.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Authentication token not found.");
      return;
    }

    try {
      setError("");
      setSuccess("");

      const response = await fetch(`/api/admins/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to delete administrator."),
        );
      }

      setAdmins((previous) =>
        previous.filter((admin) => admin.id !== deleteTarget.id),
      );

      setDeleteTarget(null);

      setSuccess("Administrator deleted successfully.");
    } catch (err) {
      setError(err.message || "Unable to delete administrator.");
    }
  };

  const canManageAdmin = isMainAdmin;
  const canCreateAdmin = true;

  return (
    <div
      className={`
    mx-auto
    w-full
    max-w-[1500px]
    px-5
    sm:px-8
    lg:px-12
    pb-6
    text-[#F4F7FA]
  `}
    >
      <section
        className="console-hero 
          relative overflow-hidden
          min-h-[190px]
          rounded-2xl
          border border-[#67E8F9]/45
          bg-[#050A10]
          shadow-[0_18px_60px_rgba(0,0,0,0.24)]
          transition-all duration-300
          hover:-translate-y-0.5
          hover:border-[#67E8F9]/80
          hover:bg-[#070C12]
          hover:shadow-[0_20px_65px_rgba(103,232,249,0.12)]
        "
      >
        {/* Technical security background */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[60%] opacity-70">
          <div className="absolute inset-y-0 left-0 w-px bg-[#67E8F9]/15" />
          <div className="absolute left-[12%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[24%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[36%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[48%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[60%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[72%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute left-[84%] inset-y-0 w-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[22%] h-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[46%] h-px bg-[#67E8F9]/10" />
          <div className="absolute inset-x-0 top-[70%] h-px bg-[#67E8F9]/10" />
        </div>

        {/* Central security motif */}
        <div className="pointer-events-none absolute right-[19%] top-1/2 hidden h-36 w-36 -translate-y-1/2 sm:block">
          <div className="absolute inset-1 rounded-full border border-[#67E8F9]/20" />
          <div className="absolute inset-5 rounded-full border border-[#D4AF37]/35" />
          <div className="absolute inset-9 rounded-full border border-[#67E8F9]/30" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[18px] border-2 border-[#67E8F9]/75 bg-[#050A10]/90 shadow-[0_0_30px_rgba(103,232,249,0.18)]" />
          <ShieldCheck className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-[#67E8F9]" />
          <div className="absolute -left-3 top-7 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.8)]" />
          <div className="absolute -right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
        </div>

        <div className="pointer-events-none absolute left-0 top-0 h-10 w-1 rounded-r-full bg-[#D4AF37]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-1 rounded-l-full bg-[#67E8F9]" />

        <div className="relative z-10 flex min-h-[190px] items-center px-6 py-6 sm:px-7 lg:px-8">
          <div className="max-w-[62%]">
            <button
              onClick={onBack}
              className="
                inline-flex items-center gap-2
                mb-4
                text-[12px]
                uppercase tracking-[0.15em]
                text-[#7F8A96]
                transition-all duration-300
                hover:-translate-x-0.5
                hover:text-[#67E8F9]
              "
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Security Operations
            </button>

            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.45)]" />
              <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
                Identity Administration
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Admin
              <span className="block text-[#67E8F9]">Management</span>
            </h1>

            <p className="mt-3 max-w-xl text-[13px] leading-5 text-[#A7B0BA]">
              Manage administrator accounts, authentication credentials, roles
              and account access.
            </p>

            {canCreateAdmin && (
              <button
                onClick={openCreateForm}
                className="
                  absolute bottom-6 right-6
                  inline-flex items-center justify-center gap-2
                  rounded-xl border border-[#67E8F9]
                  bg-[#67E8F9] px-4 py-2.5
                  text-[12px] font-semibold uppercase tracking-wider
                  text-[#03070C]
                  transition-all duration-300
                  hover:-translate-y-0.5
                  hover:bg-transparent hover:text-[#67E8F9]
                  hover:shadow-[0_10px_28px_rgba(103,232,249,0.16)]
                  sm:bottom-7 sm:right-7
                  lg:bottom-8 lg:right-8
                "
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Administrator
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-500/45 bg-red-500/[0.06] px-4 py-2.5 text-[12px] text-red-400 transition-all duration-300 hover:border-red-500/70 hover:bg-red-500/[0.09]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.05] px-4 py-2.5 text-[12px] text-emerald-400 transition-all duration-300 hover:border-emerald-500/60">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel
          isDark={isDark}
          className="
            group relative overflow-hidden rounded-xl p-4
            border-[#D4AF37]/60
            hover:-translate-y-1 hover:border-[#D4AF37]
            hover:shadow-[0_12px_35px_rgba(212,175,55,0.12)]
          "
        >
          <div className="absolute right-4 top-3 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] text-[#D4AF37] transition-all duration-300 group-hover:border-[#D4AF37]/70 group-hover:bg-[#D4AF37]/[0.12]">
              <UsersRound className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[12px] uppercase tracking-[0.18em] text-[#7F8A96]">
                Total Administrators
              </span>
              <span className="mt-1 block text-2xl leading-none text-[#D4AF37]">
                {adminCount}
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          isDark={isDark}
          className="
            group relative overflow-hidden rounded-xl p-4
            border-[#67E8F9]/55
            hover:-translate-y-1 hover:border-[#67E8F9]
            hover:shadow-[0_12px_35px_rgba(103,232,249,0.12)]
          "
        >
          <div className="absolute right-4 top-3 h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#67E8F9]/30 bg-[#67E8F9]/[0.06] text-[#67E8F9] transition-all duration-300 group-hover:border-[#67E8F9]/70 group-hover:bg-[#67E8F9]/[0.12]">
              <UserRoundCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[12px] uppercase tracking-[0.18em] text-[#7F8A96]">
                Active
              </span>
              <span className="mt-1 block text-2xl leading-none text-emerald-400">
                {activeCount}
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          isDark={isDark}
          className="
            group relative overflow-hidden rounded-xl p-4
            border-red-500/55
            hover:-translate-y-1 hover:border-red-500
            hover:shadow-[0_12px_35px_rgba(239,68,68,0.12)]
          "
        >
          <div className="absolute right-4 top-3 h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/[0.06] text-red-400 transition-all duration-300 group-hover:border-red-500/70 group-hover:bg-red-500/[0.12]">
              <UserRoundX className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[12px] uppercase tracking-[0.18em] text-[#7F8A96]">
                Inactive
              </span>
              <span className="mt-1 block text-2xl leading-none text-red-400">
                {inactiveCount}
              </span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mt-5">
        <Panel
          isDark={isDark}
          className="relative overflow-hidden rounded-2xl border-[#67E8F9]/45 hover:border-[#67E8F9]/80 hover:bg-[#070C12] hover:shadow-[0_18px_60px_rgba(103,232,249,0.08)]"
        >
          <div className="pointer-events-none absolute bottom-0 right-0 h-8 w-1 rounded-l-full bg-[#D4AF37]" />
          <div className="p-4 sm:p-5 transition-colors duration-300 hover:bg-[#67E8F9]/[0.012]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] text-[#D4AF37]">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] mb-1.5">
                    Administrator Directory
                  </span>

                  <h2 className="text-2xl sm:text-3xl font-light leading-none">
                    Administrator Accounts
                  </h2>

                  <p className="mt-2 text-[13px] text-[#7F8A96]">
                    Only security and system administrator accounts are shown
                    here.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="block text-[12px]  uppercase text-[#7F8A96]">
                  Accounts
                </span>

                <span className=" text-2xl">{adminCount}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-4 sm:px-5 pb-5">
              <div className="min-h-[105px] flex items-center justify-center rounded-xl border border-dashed border-white/10 transition-all duration-300 hover:border-[#67E8F9]/35 hover:bg-[#67E8F9]/[0.02]">
                <span className="text-[13px]  uppercase tracking-wider text-[#7F8A96]">
                  Loading administrators...
                </span>
              </div>
            </div>
          ) : admins.length === 0 ? (
            <div className="px-4 sm:px-5 pb-5">
              <div
                className={`
                  min-h-[105px]
                  flex items-center justify-center
                  rounded-xl
                  border border-dashed
                  border-white/10
                  transition-all duration-300
                  hover:border-[#67E8F9]/35
                  hover:bg-[#67E8F9]/[0.02]
                `}
              >
                <div className="text-center">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#67E8F9]/15 bg-[#67E8F9]/[0.03]">
                    <Shield className="h-5 w-5 text-[#7F8A96]" />
                  </div>

                  <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#7F8A96]">
                    No administrators found
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left">
                <thead>
                  <tr
                    className={`
                      border-y
                      text-[12px]
                      
                      uppercase
                      tracking-[0.15em]
                      border-white/10 text-[#7F8A96]
                    `}
                  >
                    <th className="px-6 py-4">Administrator</th>

                    <th className="px-4 py-4">Department</th>

                    <th className="px-4 py-4">Role</th>

                    <th className="px-4 py-4">Status</th>

                    <th className="px-4 py-4">Access</th>

                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {admins.map((admin) => {
                    const initials =
                      admin.name
                        ?.split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "AD";

                    const isMain = Boolean(admin.isMainAdmin);

                    return (
                      <tr
                        key={admin.id}
                        className={`
                            border-b
                            transition-all duration-300
                            border-white/10 hover:bg-[#67E8F9]/[0.035] hover:border-[#67E8F9]/35 hover:shadow-[inset_2px_0_0_rgba(103,232,249,0.45)]
                          `}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div
                              className="
                                w-10 h-10
                                rounded-xl
                                flex items-center justify-center
                                border border-[#D4AF37]/40
                                bg-[#D4AF37]/5
                                text-[#D4AF37]
                                text-[13px]
                                
                                font-bold
                              "
                            >
                              {initials}
                            </div>

                            <div>
                              <div className="text-sm font-medium">
                                {admin.name}
                              </div>

                              <div className="mt-1 text-[13px]  text-[#7F8A96]">
                                {admin.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-5">
                          <span className="text-sm text-[#A7B0BA]">
                            {admin.department}
                          </span>
                        </td>

                        <td className="px-4 py-5">
                          <RoleBadge role={admin.role} />
                        </td>

                        <td className="px-4 py-5">
                          <StatusBadge status={admin.status} isDark={isDark} />
                        </td>

                        <td className="px-4 py-5">
                          {isMain ? (
                            <span className="inline-flex px-2.5 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 text-[#D4AF37] text-[12px]  uppercase tracking-wider">
                              Main Admin
                            </span>
                          ) : (
                            <span className="text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                              Administrator
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-2">
                            {canManageAdmin && !isMain && (
                              <>
                                <button
                                  onClick={() => openEditForm(admin)}
                                  className={`
                                        w-9 h-9
                                        rounded-lg
                                        flex items-center justify-center
                                        border border-white/10
                                        text-[#A7B0BA]
                                        hover:text-[#67E8F9]
                                        hover:border-[#67E8F9]/70
                                        hover:bg-[#67E8F9]/[0.08]
                                        hover:-translate-y-0.5
                                        hover:shadow-[0_8px_20px_rgba(103,232,249,0.12)]
                                        transition-all duration-300
                                      `}
                                  title="Edit administrator"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => setDeleteTarget(admin)}
                                  className="
                                        w-9 h-9
                                        rounded-lg
                                        flex items-center justify-center
                                        border border-red-500/20
                                        text-red-400
                                        hover:bg-red-500/12
                                        hover:border-red-500/60
                                        hover:text-red-300
                                        hover:-translate-y-0.5
                                        hover:shadow-[0_8px_20px_rgba(239,68,68,0.10)]
                                        transition-all duration-300
                                      "
                                  title="Delete administrator"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                            {canManageAdmin && isMain && (
                              <span className="text-[12px]  uppercase tracking-wider text-[#A7B0BA]">
                                Protected
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeForm}
          />

          <div
            className={`
              relative
              w-full
              max-w-2xl
              max-h-[90vh]
              overflow-y-auto
              rounded-2xl
              border
              bg-[#050A10] border-white/10
              shadow-[0_24px_80px_rgba(0,0,0,0.42)]
              hover:border-[#67E8F9]/30
            `}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div>
                <span className="block text-[12px]  uppercase tracking-[0.2em] text-[#D4AF37]">
                  {editingAdmin
                    ? "Administrator Update"
                    : "Administrator Provisioning"}
                </span>

                <h3 className="mt-1  text-2xl font-light">
                  {editingAdmin ? "Edit Administrator" : "Add Administrator"}
                </h3>
              </div>

              <button
                onClick={closeForm}
                className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/10 text-[#A7B0BA] hover:text-[#67E8F9] hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/[0.06] hover:-translate-y-0.5 transition-all duration-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                  Full Name
                </label>

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className={`
                    w-full
                    px-4 py-3
                    border rounded-xl
                    outline-none
                    text-sm transition-all duration-200
                    hover:border-[#67E8F9]/30
                    bg-[#050A10]/[0.02] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10
                  `}
                  placeholder="Administrator name"
                />
              </div>

              <div>
                <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                  Corporate Email
                </label>

                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className={`
                    w-full
                    px-4 py-3
                    border rounded-xl
                    outline-none
                    text-sm transition-all duration-200
                    hover:border-[#67E8F9]/30
                    bg-[#050A10]/[0.02] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10
                  `}
                  placeholder="admin@company.com"
                />
              </div>

              <div>
                <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                  {editingAdmin ? "New Password" : "Password"}
                </label>

                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7F8A96]" />

                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required={!editingAdmin}
                    minLength={12}
                    maxLength={128}
                    className={`
                      w-full
                      pl-11 pr-4 py-3
                      border rounded-xl
                      outline-none
                      text-sm transition-all duration-200
                      hover:border-[#67E8F9]/30
                      bg-[#050A10]/[0.02] border-white/10 text-[#F4F7FA] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10
                    `}
                    placeholder={
                      editingAdmin
                        ? "Leave blank to keep current password"
                        : "12–128 characters"
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                    Department
                  </label>

                  <select
                    name="department"
                    value={form.department}
                    onChange={handleChange}
                    className={`
                      w-full
                      px-4 py-3
                      border rounded-xl
                      outline-none
                      text-sm transition-all duration-200
                      hover:border-[#67E8F9]/30
                      bg-[#050A10] border-white/10 text-[#F4F7FA]
                    `}
                  >
                    {DEPARTMENTS.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                    Role
                  </label>

                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className={`
                      w-full
                      px-4 py-3
                      border rounded-xl
                      outline-none
                      text-sm transition-all duration-200
                      hover:border-[#67E8F9]/30
                      bg-[#050A10] border-white/10 text-[#F4F7FA]
                    `}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role === "SYSTEM_ADMIN"
                          ? "System Admin"
                          : "Security Admin"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-2 text-[12px]  uppercase tracking-wider text-[#7F8A96]">
                    Status
                  </label>

                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    disabled={Boolean(editingAdmin?.isMainAdmin)}
                    className={`
                      w-full
                      px-4 py-3
                      border rounded-xl
                      outline-none
                      text-sm transition-all duration-200
                      hover:border-[#67E8F9]/30
                      disabled:opacity-50
                      bg-[#050A10] border-white/10 text-[#F4F7FA]
                    `}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Inactive</option>
                  </select>
                </div>
              </div>

              <div
                className={`
                  rounded-xl
                  border
                  p-4
                  border-white/10 bg-[#070C12]
                  transition-all duration-300
                  hover:border-[#D4AF37]/30
                `}
              >
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-[#D4AF37] mt-0.5" />

                  <div>
                    <div className="text-[13px]  uppercase tracking-wider text-[#D4AF37]">
                      Authentication
                    </div>

                    <p className="mt-1 text-[13px] leading-relaxed text-[#7F8A96]">
                      The password is hashed by the backend before storage. The
                      administrator will use this email and password for website
                      authentication followed by MFA.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className={`
                    px-5 py-3
                    rounded-xl
                    border
                    text-[13px]
                    
                    uppercase
                    tracking-wider
                    text-[#7F8A96]
                    hover:text-[#F4F7FA]
                    hover:border-[#67E8F9]/50
                    hover:bg-[#67E8F9]/[0.04]
                    hover:-translate-y-0.5
                    transition-all duration-300
                    border-white/10
                  `}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="
                    inline-flex
                    items-center
                    gap-2
                    px-5 py-3
                    rounded-xl
                    bg-[#67E8F9]
                    border border-[#67E8F9]
                    text-[#03070C]
                    rounded-xl
                    hover:bg-transparent
                    hover:text-[#67E8F9]
                    hover:-translate-y-0.5
                    hover:shadow-[0_10px_28px_rgba(103,232,249,0.14)]
                    transition-all duration-300
                    text-[13px]
                    
                    font-semibold
                    uppercase
                    tracking-wider
                    disabled:opacity-50
                  "
                >
                  <Plus className="w-3.5 h-3.5" />

                  {saving
                    ? "Saving..."
                    : editingAdmin
                      ? "Update Administrator"
                      : "Create Administrator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />

          <div
            className={`
              relative
              w-full
              max-w-md
              border rounded-2xl
              p-6
              bg-[#050A10] border-white/10
              shadow-[0_24px_80px_rgba(0,0,0,0.42)]
              hover:border-[#67E8F9]/30
            `}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/30 bg-red-500/5 text-red-400 transition-all duration-300 hover:border-red-500/60 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </div>

            <h3 className="mt-5  text-2xl font-light">Delete Administrator</h3>

            <p className="mt-3 text-sm leading-relaxed text-[#7F8A96]">
              Delete{" "}
              <span className="text-[#F4F7FA]">{deleteTarget.name}</span>? This
              removes the account from the directory and revokes access. Security history is retained. The main admin must reassign its staff.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="
                  px-5 py-3
                  border border-white/10
                  text-[13px]
                  rounded-xl
                  hover:border-[#67E8F9]/40
                  hover:text-[#67E8F9]
                  hover:bg-[#67E8F9]/5
                  transition-all duration-300
                  
                  uppercase
                  tracking-wider
                  text-[#7F8A96]
                "
              >
                Cancel
              </button>

              <button
                onClick={handleDelete}
                className="
                  px-5 py-3
                  bg-red-500
                  border border-red-500
                  text-[#F4F7FA]
                  text-[13px]
                  rounded-xl
                  hover:bg-red-600
                  hover:border-red-400
                  hover:-translate-y-0.5
                  hover:shadow-[0_10px_28px_rgba(239,68,68,0.16)]
                  transition-all duration-300
                  
                  font-semibold
                  uppercase
                  tracking-wider
                "
              >
                Delete Administrator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
