import React, { useEffect, useState } from "react";
import {
  UserPlus,
  Edit2,
  Trash2,
  Search,
  X,
  AlertTriangle,
  Users,
  ShieldCheck,
  Activity,
  UserX,
  Building2,
  Mail,
  Fingerprint,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

// ======================================================
// CONSTANTS / CONFIGURATION
// ======================================================

const PANEL_CLASS =
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7";

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-[#070C12] px-3.5 py-2.5 text-[14px] text-[#F4F7FA] outline-none transition-all placeholder:text-[#64707D] focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20";

const SELECT_CLASS =
  "w-full rounded-xl border border-white/10 bg-[#070C12] px-3.5 py-2.5 text-[14px] text-[#F4F7FA] outline-none transition-all focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20 cursor-pointer";

const departments = ["ENGINEERING", "FINANCE", "SECURITY", "HR", "LEGAL", "IT", "SALES", "MARKETING", "ADMINISTRATION"];

const roles = ["EMPLOYEE", "MANAGER"];

// ======================================================
// HELPER FUNCTIONS
// ======================================================

const getStatusClasses = (status) => {
  if (status === "FROZEN") {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }

  if (status === "RESTRICTED") {
    return "border-amber-400/30 bg-amber-400/10 text-[#D4AF37]";
  }

  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
};

const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";

// ======================================================
// MAIN COMPONENT
// ======================================================

export const EmployeeManagementPage = ({
  users = [],
  onSelectUser,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onFreezeUser,
  onUnfreezeUser,
}) => {
  const { isDark } = useTheme();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError,setFormError]=useState('');
  const [managerId,setManagerId]=useState('');
  const [assignedAdminId,setAssignedAdminId]=useState('');
  const [administratorOptions,setAdministratorOptions]=useState([]);
  const [canReassignAdmin,setCanReassignAdmin]=useState(false);
  const [managerOptions,setManagerOptions]=useState([]);
  const [assignmentLoading,setAssignmentLoading]=useState(true);
  const [assignmentError,setAssignmentError]=useState('');
  const [assignmentRetry,setAssignmentRetry]=useState(0);
  useEffect(()=>{
    if(!isAddModalOpen&&!editingUser)return;
    let active=true;
    setAssignmentLoading(true);setAssignmentError('');
    const token=localStorage.getItem('zero_trust_token');
    fetch('/api/assignment-options',{headers:{Authorization:`Bearer ${token||''}`}})
      .then(async response=>{
        if(response.status===404)throw new Error('Assignment options are unavailable. Restart the backend to load this update, then retry.');
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error?.message||'Unable to load assignment options. Please sign in again or retry.');
        if(!Array.isArray(data.administrators)||!Array.isArray(data.managers))throw new Error('Restart the backend to load the updated assignment options, then retry.');
        return data;
      })
      .then(data=>{if(active){setAdministratorOptions(data.administrators);setManagerOptions(data.managers);setCanReassignAdmin(data.canReassign===true);if(!data.canReassign)setAssignedAdminId(data.administrators[0]?.id||'');}})
      .catch(error=>{if(active){setAdministratorOptions([]);setManagerOptions([]);setAssignmentError(error.message||'Unable to load assignment options. Retry after checking the backend.');}})
      .finally(()=>{if(active)setAssignmentLoading(false);});
    return()=>{active=false;};
  },[isAddModalOpen,editingUser?.id,assignmentRetry]);
  const [accountPending,setAccountPending]=useState('');

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    employeeId: "",
    department: "ENGINEERING",
    role: "EMPLOYEE",
    status: "ACTIVE",
  });

  // Keep the existing theme context dependency intact while the
  // management surface follows the finalized CyberOrbit dark system.
  void isDark;
  const confirmWindowsFreeze=()=>window.confirm('Freeze this employee? On locally configured Windows laptops this disables their Windows sign-in and signs out their sessions. Unsaved work may be lost. The separate administrator remains available. Offline devices apply the change after reconnecting.');
  const changeAccount=async user=>{
    const frozen=user.status==='FROZEN';
    if(!frozen&&!confirmWindowsFreeze())return;
    setAccountPending(user.id);
    try{await (frozen?onUnfreezeUser:onFreezeUser)?.(user.id);}finally{setAccountPending('');}
  };

  // ======================================================
  // EMPLOYEE ID GENERATION
  // ======================================================

  const generateEmployeeId = () => {
    const existingNumbers = users
      .map((user) => {
        const match = String(user.employeeId || "").match(/^EMP(\d+)$/i);
        return match ? Number(match[1]) : 0;
      })
      .filter((number) => number > 0);

    const nextNumber =
      existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

    return `EMP${nextNumber.toString().padStart(3, "0")}`;
  };

  // ======================================================
  // MODAL / FORM HANDLERS
  // ======================================================

  const handleOpenAdd = () => {
    setManagerId('');setAssignedAdminId('');setFormError('');
    setFormData({
      name: "",
      email: "",
      employeeId: generateEmployeeId(),
      department: "ENGINEERING",
      role: "EMPLOYEE",
      status: "ACTIVE",
    });

    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setManagerId(user.managerId||'');setAssignedAdminId(user.assignedAdminId||'');setFormError('');
    setEditingUser(user);

    setFormData({
      name: user.name || "",
      email: user.email || "",
      employeeId: user.employeeId || "",
      department: user.department?.toUpperCase() || "ENGINEERING",
      role: user.role || "EMPLOYEE",
      status: user.status || "ACTIVE",
    });
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();

    if (isSubmitting || assignmentLoading || assignmentError) return;

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const employeeId = formData.employeeId.trim();

    if (!name || !email || !employeeId) return;

    try {
      setIsSubmitting(true);

      const token = localStorage.getItem("zero_trust_token");

      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          email,
          employeeId,
          department: formData.department,
          role: formData.role,
          status: formData.status,
          managerId:formData.role==='EMPLOYEE'?managerId:null,
          assignedAdminId:formData.role==='MANAGER'?assignedAdminId:undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message || data?.message || "Failed to create employee.",
        );
      }

      if (!data?.user) {
        throw new Error("Employee was not returned by the server.");
      }

      if (onAddUser) {
        onAddUser(data.user);
      }

      setIsAddModalOpen(false);

      setFormData({
        name: "",
        email: "",
        employeeId: "",
        department: "ENGINEERING",
        role: "EMPLOYEE",
        status: "ACTIVE",
      });
    } catch (error) {
      console.error("Failed to add employee:", error);
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();

    if (isSubmitting || !editingUser || assignmentLoading || assignmentError) return;
    if(formData.status==='FROZEN'&&editingUser.status!=='FROZEN'&&!confirmWindowsFreeze())return;

    if (!onUpdateUser) {
      console.error("onUpdateUser callback is not available.");
      return;
    }

    const updatedUser = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      employeeId: formData.employeeId.trim(),
      department: formData.department,
      role: formData.role,
      status: formData.status,
      managerId:formData.role==='EMPLOYEE'?managerId:null,
      assignedAdminId:formData.role==='MANAGER'?assignedAdminId:undefined,
    };

    if (!updatedUser.name || !updatedUser.email || !updatedUser.employeeId) {
      return;
    }

    try {
      setIsSubmitting(true);

      await onUpdateUser(editingUser.id, updatedUser);

      setEditingUser(null);
    } catch (error) {
      console.error("Failed to update employee:", error);
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteUser || !onDeleteUser || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      await onDeleteUser(confirmDeleteUser.id);

      setConfirmDeleteUser(null);
    } catch (error) {
      console.error("Failed to delete employee:", error);
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ======================================================
  // FILTERING / METRICS
  // ======================================================

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch =
      !query ||
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.employeeId?.toLowerCase().includes(query);

    const matchesDept =
      selectedDept === "ALL" || user.department?.toUpperCase() === selectedDept;

    return matchesSearch && matchesDept;
  });

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;

  const watchlistUsers = users.filter(
    (user) => (user.currentRiskScore || 0) >= 60,
  ).length;

  const frozenUsers = users.filter((user) => user.status === "FROZEN").length;

  // ======================================================
  // SHARED FORM
  // ======================================================

  const renderEmployeeForm = ({ mode }) => {
    const isEdit = mode === "edit";

    return (
      <form
        onSubmit={isEdit ? handleSubmitEdit : handleSubmitAdd}
        className="space-y-5"
      >
        {formError&&<p role="alert" className="text-red-400">{formError}</p>}
        <p className="text-sm text-slate-400">Employees are registered for monitoring only. They cannot sign in to the console and do not need a password.</p>
        {assignmentLoading&&<p role="status" className="text-slate-400">Loading managers and administrators...</p>}
        {assignmentError&&<div role="alert" className="text-red-400">{assignmentError} <button type="button" onClick={()=>setAssignmentRetry(n=>n+1)} className="underline">Retry</button></div>}
        {formData.role==='EMPLOYEE'?<>
          <label className="block">Assigned manager<select required disabled={assignmentLoading||!!assignmentError} value={managerId} onChange={e=>setManagerId(e.target.value)} className={SELECT_CLASS}><option value="">Select a manager</option>{managerOptions.filter(manager=>manager.id!==editingUser?.id).map(manager=><option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
          {!assignmentLoading&&!assignmentError&&!managerOptions.length&&<p className="text-amber-300">Add a manager and assign their administrator before adding an employee.</p>}
          <p className="text-sm text-slate-400">This employee will use their manager's assigned administrator.</p>
        </>:<>
          <label className="block">Assigned administrator<select required value={assignedAdminId} onChange={e=>setAssignedAdminId(e.target.value)} disabled={assignmentLoading||!!assignmentError||!canReassignAdmin} className={SELECT_CLASS}><option value="">Select an administrator</option>{administratorOptions.map(admin=><option key={admin.id} value={admin.id}>{admin.name}</option>)}</select></label>
          {!assignmentLoading&&!assignmentError&&!administratorOptions.length&&<p className="text-amber-300">No active administrator is available. Ask the main admin to check administrator accounts.</p>}
        </>}
        <div>
          <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
            Full Name
          </label>

          <div className="relative">
            <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65717E]" />

            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  name: e.target.value,
                })
              }
              placeholder="Employee Name"
              className={`${INPUT_CLASS} pl-10`}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
            Corporate Email
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65717E]" />

            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  email: e.target.value,
                })
              }
              placeholder="employee@company.com"
              className={`${INPUT_CLASS} pl-10`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
              Employee ID
            </label>

            <div className="relative">
              <Fingerprint className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65717E]" />

              <input
                type="text"
                required
                value={formData.employeeId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    employeeId: e.target.value,
                  })
                }
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
              Status
            </label>

            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value,
                })
              }
              className={SELECT_CLASS}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="RESTRICTED">RESTRICTED</option>
              <option value="FROZEN">FROZEN</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
              Assign Department
            </label>

            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65717E]" />

              <select
                value={formData.department}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    department: e.target.value,
                  })
                }
                className={`${SELECT_CLASS} pl-10`}
              >
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
              Assign Role
            </label>

            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value,
                })
              }
              className={SELECT_CLASS}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() =>
              isEdit ? setEditingUser(null) : setIsAddModalOpen(false)
            }
            disabled={isSubmitting}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-mono font-semibold tracking-wide text-[#8E99A5] transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            CANCEL
          </button>

          <button
            type="submit"
            disabled={isSubmitting || assignmentLoading || !!assignmentError || (formData.role==='EMPLOYEE'?!managerId:!assignedAdminId)}
            className="rounded-xl border border-[#67E8F9]/50 bg-[#67E8F9] px-5 py-2.5 text-xs font-mono font-bold tracking-wide text-[#031015] transition-all hover:bg-transparent hover:text-[#67E8F9] hover:shadow-[0_0_24px_rgba(103,232,249,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEdit
              ? isSubmitting
                ? "SAVING..."
                : "SAVE CHANGES"
              : isSubmitting
                ? "ADDING..."
                : "CONFIRM ADD"}
          </button>
        </div>
      </form>
    );
  };

  // ======================================================
  // PAGE
  // ======================================================

  return (
    <div className="min-h-full bg-[#03070C] text-[#F4F7FA]">
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
        {/* ---------------- PAGE HEADER ---------------- */}

        <section className="console-hero group relative min-h-[210px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
          {/* Enterprise grid / circuit field */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] opacity-80">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(103,232,249,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(103,232,249,0.08)_1px,transparent_1px)] bg-[size:98px_54px]" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-[#67E8F9]/10" />
            <div className="absolute right-0 top-1/2 h-px w-full bg-[#67E8F9]/10" />
          </div>

          {/* Gold identity accent */}
          <div className="pointer-events-none absolute left-0 top-0 h-10 w-1 rounded-r-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.35)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-1 rounded-l-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.35)]" />

          {/* Technical identity visual */}
          <div className="pointer-events-none absolute right-[9%] top-1/2 hidden h-[170px] w-[170px] -translate-y-1/2 lg:block">
            <div className="absolute inset-0 rounded-full border border-[#67E8F9]/10" />
            <div className="absolute inset-[16px] rounded-full border border-[#D4AF37]/20" />
            <div className="absolute inset-[34px] rounded-full border border-[#67E8F9]/25" />
            <div className="absolute inset-[52px] rounded-2xl border border-[#67E8F9]/35 bg-[#050A10]/75 shadow-[0_0_30px_rgba(103,232,249,0.08)]" />
            <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[#67E8F9]/60 bg-[#070C12]">
              <Users className="h-7 w-7 text-[#67E8F9]" />
            </div>
            <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.8)]" />
            <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
          </div>

          <div className="relative z-10 flex min-h-[210px] items-center px-6 py-7 sm:px-8 lg:px-9">
            <div className="max-w-[74%]">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                  IDENTITY GOVERNANCE
                </span>
                <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                  LIFECYCLE / ACCESS PROVISIONING
                </span>
              </div>

              <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Employee
                <span className="block text-[#67E8F9]">Management</span>
              </h1>

              <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
                Create, update, and manage employee identities, department
                alignments, and role-based access privileges across the
                CyberOrbit Zero Trust perimeter.
              </p>
            </div>

            <button
              id="btn-add-employee"
              onClick={handleOpenAdd}
              className="absolute bottom-9 right-9 z-20 inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/50 bg-[#67E8F9] px-5 py-3 text-[12px] font-semibold tracking-[0.08em] text-[#031015] transition-all duration-200 hover:bg-transparent hover:text-[#67E8F9] hover:shadow-[0_0_30px_rgba(103,232,249,0.12)]"
            >
              <UserPlus className="h-4 w-4" />
              ADD EMPLOYEE
            </button>
          </div>
        </section>

        {/* ---------------- METRICS / OVERVIEW ---------------- */}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={`${PANEL_CLASS} group transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  Total Identities
                </div>

                <div className="mt-3 text-3xl font-light tracking-tight text-[#F4F7FA]">
                  {users.length}
                </div>

                <div className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Governed in directory
                </div>
              </div>

              <div className="rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/5 p-2.5">
                <Users className="h-4 w-4 text-[#67E8F9]" />
              </div>
            </div>

            <div className="mt-5 h-px bg-gradient-to-r from-[#67E8F9]/30 to-transparent" />
          </div>

          <div
            className={`${PANEL_CLASS} group transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400/30`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  Active Sessions
                </div>

                <div className="mt-3 text-3xl font-light tracking-tight text-emerald-300">
                  {activeUsers}
                </div>

                <div className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Continuous verification
                </div>
              </div>

              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-2.5">
                <Activity className="h-4 w-4 text-emerald-300" />
              </div>
            </div>

            <div className="mt-5 h-px bg-gradient-to-r from-emerald-400/30 to-transparent" />
          </div>

          <div
            className={`${PANEL_CLASS} group transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/30`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  Risk Watchlist
                </div>

                <div className="mt-3 text-3xl font-light tracking-tight text-[#D4AF37]">
                  {watchlistUsers}
                </div>

                <div className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Score â‰¥ 60 threshold
                </div>
              </div>

              <div className="rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/5 p-2.5">
                <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />
              </div>
            </div>

            <div className="mt-5 h-px bg-gradient-to-r from-[#D4AF37]/30 to-transparent" />
          </div>

          <div
            className={`${PANEL_CLASS} group transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/30`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  Frozen Accounts
                </div>

                <div className="mt-3 text-3xl font-light tracking-tight text-red-300">
                  {frozenUsers}
                </div>

                <div className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Policy containment active
                </div>
              </div>

              <div className="rounded-xl border border-red-400/15 bg-red-400/5 p-2.5">
                <UserX className="h-4 w-4 text-red-300" />
              </div>
            </div>

            <div className="mt-5 h-px bg-gradient-to-r from-red-400/30 to-transparent" />
          </div>
        </section>

        {/* ---------------- SEARCH / FILTERS ---------------- */}

        <section
          className={`${PANEL_CLASS} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}
        >
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65717E]" />

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee, email, or ID..."
              className={`${INPUT_CLASS} pl-10`}
            />
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <span className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
              DEPARTMENT
            </span>

            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#070C12] px-3.5 py-2.5 text-[14px] font-mono text-[#D9E0E6] outline-none transition-all focus:border-[#67E8F9]/60 sm:w-56"
            >
              <option value="ALL">All Departments</option>

              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ---------------- EMPLOYEE TABLE ---------------- */}

        <section className={`${PANEL_CLASS} overflow-hidden`}>
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                IDENTITY DIRECTORY
              </div>

              <h2 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                Managed Employees
              </h2>
            </div>

            <div className="text-[12px] font-mono text-[#7F8A96]">
              SHOWING{" "}
              <span className="text-[#B8C1CA]">{filteredUsers.length}</span> OF{" "}
              <span className="text-[#B8C1CA]">{users.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="border-b border-white/10 bg-[#070C12]">
                <tr className="text-[12px] uppercase tracking-[0.14em] text-[#7F8A96]">
                  <th className="px-5 py-4">Employee ID</th>
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.06]">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="group transition-colors duration-150 hover:bg-white/[0.025]"
                    >
                      <td className="px-5 py-4">
                        <span className="rounded-lg border border-[#67E8F9]/15 bg-[#67E8F9]/5 px-2.5 py-1 text-[12px] font-mono font-semibold text-[#67E8F9]">
                          {user.employeeId}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[12px] font-mono font-semibold text-[#AAB4BE]">
                            {getInitials(user.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#E8EDF1]">
                              <button onClick={()=>onSelectUser?.(user.id)} className="text-cyan-200 hover:underline">{user.name}</button>
                            </div>

                            <div className="mt-0.5 text-[12px] font-mono text-[#7F8A96]">
                              IDENTITY RECORD
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-xs text-[#8D98A4]">
                          {user.email}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-[12px] font-mono font-semibold tracking-wide text-[#C0C8D0]">
                          {user.department}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-2.5 py-1 text-[12px] font-mono font-semibold text-[#67E8F9]">
                          {user.role?.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-lg border px-2.5 py-1 text-[12px] font-mono font-semibold tracking-wide ${getStatusClasses(
                            user.status,
                          )}`}
                        >
                          {user.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {(user.status==='FROZEN'?onUnfreezeUser:onFreezeUser)&&<button type="button" disabled={Boolean(accountPending)} onClick={()=>changeAccount(user)} className="rounded-lg border border-amber-300/30 px-2.5 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50">{accountPending===user.id?'SAVING...':user.status==='FROZEN'?'UNFREEZE':'FREEZE'}</button>}
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[12px] font-mono font-semibold tracking-wide text-[#A7B0BA] transition-all hover:border-[#67E8F9]/30 hover:bg-[#67E8F9]/5 hover:text-[#67E8F9]"
                          >
                            <Edit2 className="h-3 w-3" />
                            UPDATE
                          </button>

                          <button
                            onClick={() => { setFormError(''); setConfirmDeleteUser(user); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/15 px-2.5 py-2 text-[12px] font-mono font-semibold tracking-wide text-red-300/80 transition-all hover:border-red-400/40 hover:bg-red-400/5 hover:text-red-300"
                          >
                            <Trash2 className="h-3 w-3" />
                            DELETE
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                        <Search className="h-5 w-5 text-[#56616D]" />
                      </div>

                      <div className="mt-4 text-sm text-[#A0AAB4]">
                        No employees match your search query.
                      </div>

                      <div className="mt-1 text-[12px] font-mono text-[#56616D]">
                        ADJUST SEARCH OR DEPARTMENT FILTER
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ======================================================
          ADD EMPLOYEE MODAL
          ====================================================== */}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-2xl rounded-2xl border border-[#67E8F9]/20 bg-[#050A10] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-5 border-b border-white/10 pb-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_10px_rgba(103,232,249,0.7)]" />

                  <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                    NEW IDENTITY REGISTRATION
                  </span>
                </div>

                <h2 className="text-2xl font-light tracking-[-0.03em] text-[#F4F7FA] sm:text-3xl">
                  {formData.role==='MANAGER'?'Add Manager':'Add Employee'}
                </h2>

                <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Register a new identity inside the CyberOrbit directory.
                </p>
              </div>

              <button
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-white/10 p-2 text-[#697581] transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderEmployeeForm({ mode: "add" })}
          </div>
        </div>
      )}

      {/* ======================================================
          UPDATE EMPLOYEE MODAL
          ====================================================== */}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-2xl rounded-2xl border border-[#67E8F9]/20 bg-[#050A10] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-5 border-b border-white/10 pb-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />

                  <span className="text-[12px] font-mono font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                    IDENTITY MODIFICATION
                  </span>
                </div>

                <h2 className="text-2xl font-light tracking-[-0.03em] text-[#F4F7FA] sm:text-3xl">
                  Update Employee
                </h2>

                <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
                  Modify identity attributes and access alignment.
                </p>
              </div>

              <button
                onClick={() => setEditingUser(null)}
                disabled={isSubmitting}
                className="rounded-xl border border-white/10 p-2 text-[#697581] transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderEmployeeForm({ mode: "edit" })}
          </div>
        </div>
      )}

      {/* ======================================================
          DELETE CONFIRMATION MODAL
          ====================================================== */}

      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-400/20 bg-[#050A10] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/5">
              <AlertTriangle className="h-5 w-5 text-red-300" />
            </div>

            <div className="mt-5">
              <div className="text-[12px] font-mono font-semibold uppercase tracking-[0.2em] text-red-300">
                CONFIRM DISABLE
              </div>

              <h3 className="mt-2 text-2xl font-light tracking-[-0.03em] text-[#F4F7FA]">
                Delete {confirmDeleteUser.name}?
              </h3>

              <p className="mt-3 text-sm leading-6 text-[#7F8A96]">
                This action removes account{" "}
                <strong className="font-mono font-semibold text-[#D7DEE5]">
                  {confirmDeleteUser.employeeId}
                </strong>{" "}
                from the directory and invalidates its sessions. Security history is retained. Employees of a deleted manager will need a new manager.
              </p>
            </div>

            {formError&&<p role="alert" className="mt-4 text-red-400">{formError}</p>}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmDeleteUser(null)}
                disabled={isSubmitting}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-mono font-semibold text-[#8E99A5] transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="rounded-xl border border-red-400/50 bg-red-400 px-5 py-2.5 text-xs font-mono font-bold text-[#160507] transition-all hover:bg-transparent hover:text-red-300 disabled:opacity-50"
              >
                {isSubmitting ? "DELETING..." : "DELETE ACCOUNT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
