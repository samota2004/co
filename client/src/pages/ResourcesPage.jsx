import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Database,
  Plus,
  Building2,
  FileText,
  LockKeyhole,
  CheckCircle2,
  AlertCircle,
  Layers3,
  Search,
  X,
  LoaderCircle,
} from "lucide-react";
import { requestApi } from "../services/api.js";

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const panel =
  "rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/20";

const inputClass =
  "mt-2 block w-full rounded-xl border border-white/10 bg-[#03070C] px-4 py-3 text-sm text-[#F4F7FA] outline-none transition-all placeholder:text-[#596570] hover:border-white/20 focus:border-[#67E8F9]/50 focus:ring-1 focus:ring-[#67E8F9]/15";

const labelClass =
  "block text-xs font-medium text-[#C5CDD5]";

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

export function ResourcesPage({
  resources = [],
  users = [],
  onCreated,
  fetchJson = requestApi,
}) {
  // --------------------------------------------------
  // DEPARTMENT OPTIONS
  // --------------------------------------------------

  const departmentCodes = useMemo(() => {
    return [
      ...new Set(
        users
          .map(
            (user) =>
              user.departmentCode || user.department
          )
          .filter(Boolean)
      ),
    ];
  }, [users]);

  // --------------------------------------------------
  // FORM STATE
  // --------------------------------------------------

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentCode, setDepartmentCode] = useState(
    departmentCodes[0] || "ENGINEERING"
  );
  const [protectedText, setProtectedText] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // --------------------------------------------------
  // DEPARTMENT SYNC
  // --------------------------------------------------

  useEffect(() => {
    if (
      departmentCodes.length > 0 &&
      !departmentCodes.includes(departmentCode)
    ) {
      setDepartmentCode(departmentCodes[0]);
    }
  }, [departmentCodes, departmentCode]);

  // --------------------------------------------------
  // RESOURCE STATISTICS
  // --------------------------------------------------

  const totalResources = resources.length;

  const internalResources = resources.filter(
    (resource) =>
      String(resource.sensitivity || "").toUpperCase() ===
      "INTERNAL"
  ).length;

  const departmentCount = new Set(
    resources
      .map(
        (resource) =>
          resource.departmentCode || resource.department
      )
      .filter(Boolean)
  ).size;

  // --------------------------------------------------
  // RESOURCE SEARCH
  // --------------------------------------------------

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return resources;

    return resources.filter((resource) => {
      const searchableValues = [
        resource.name,
        resource.description,
        resource.departmentCode,
        resource.department,
        resource.sensitivity,
      ];

      return searchableValues.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [resources, search]);

  // --------------------------------------------------
  // CREATE RESOURCE
  // --------------------------------------------------

  const createResource = async (event) => {
    event.preventDefault();

    if (busy) return;

    if (!name.trim()) {
      setError("Please enter a resource name.");
      return;
    }

    if (!departmentCode.trim()) {
      setError("Please enter a department code.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await fetchJson("/api/resources", {
        method: "POST",
        body: {
          name: name.trim(),
          description: description.trim(),
          departmentCode: departmentCode.trim(),
          sensitivity: "INTERNAL",
          requiredRoles: ["EMPLOYEE", "MANAGER"],
          protectedData: protectedText.trim()
            ? { text: protectedText.trim() }
            : null,
        },
      });

      setName("");
      setDescription("");
      setProtectedText("");

      await onCreated?.();

      setSuccess("Resource registered successfully.");
    } catch (failure) {
      console.error("Unable to create resource:", failure);

      setError(
        failure?.message || "Unable to create resource."
      );
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------
  // RESET FORM
  // --------------------------------------------------

  const resetForm = () => {
    setName("");
    setDescription("");
    setProtectedText("");
    setError("");
    setSuccess("");
  };

  // --------------------------------------------------
  // PAGE UI
  // --------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">

      {/* PAGE HEADER */}

      <section className="group relative min-h-[245px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">

        {/* BACKGROUND VISUAL */}

        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
              maskImage:
                "linear-gradient(to right, transparent 0%, black 48%, black 100%)",
            }}
          />

          <div className="absolute right-[12%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />

          <div className="absolute right-[9%] top-1/2 h-28 w-56 -translate-y-1/2 rotate-12 rounded-[50%] border border-[#D4AF37]/20" />

          <div className="absolute right-[15%] top-1/2 h-16 w-40 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#67E8F9]/20" />

          <div className="absolute right-[19%] top-[27%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.7)]" />
        </div>

        {/* HEADER CONTENT */}

        <div className="relative z-10 flex min-h-[245px] items-center px-6 py-8 sm:px-8 lg:px-9">

          <div className="flex w-full flex-col justify-between gap-8 lg:flex-row lg:items-center">

            <div className="max-w-3xl">

              <div className="mb-4 flex flex-wrap items-center gap-3">

                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                  Resource Governance
                </span>

                <span className="text-[11px] uppercase tracking-[0.15em] text-[#7F8A96]">
                  Zero Trust Access Management
                </span>

              </div>

              <h1 className="text-4xl font-light leading-[0.98] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
                Protected{" "}
                <span className="font-medium text-[#67E8F9]">
                  Resources
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
                Register and manage company resources within
                the CyberOrbit Zero Trust environment.
                Control resource ownership, department
                association, and policy-governed access.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">

                <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/5 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#67E8F9]">
                  Resource Registry
                </span>

                <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#D4AF37]">
                  Policy Controlled
                </span>

              </div>

            </div>

            <div className="hidden h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-[#67E8F9]/30 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.07)] lg:flex">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#D4AF37]/20">
                <Database
                  className="h-8 w-8 text-[#67E8F9]"
                  strokeWidth={1.4}
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* STATISTICS */}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Database className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <Layers3 className="h-4 w-4 text-white/15" />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs font-medium text-[#A7B0BA]">
              Total Resources
            </span>

            <span className="text-2xl font-semibold tabular-nums text-[#F4F7FA]">
              {totalResources}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[#7F8A96]">
            Registered resource records
          </p>

        </div>

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5">
              <LockKeyhole className="h-5 w-5 text-[#D4AF37]" />
            </div>

            <ShieldCheck className="h-4 w-4 text-white/15" />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs font-medium text-[#A7B0BA]">
              Internal Resources
            </span>

            <span className="text-2xl font-semibold tabular-nums text-[#F4F7FA]">
              {internalResources}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[#7F8A96]">
            Resources marked as internal
          </p>

        </div>

        <div className="group rounded-2xl border border-white/10 bg-[#050A10] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#070C12]">

          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Building2 className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <Layers3 className="h-4 w-4 text-white/15" />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs font-medium text-[#A7B0BA]">
              Departments
            </span>

            <span className="text-2xl font-semibold tabular-nums text-[#F4F7FA]">
              {departmentCount}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[#7F8A96]">
            Departments represented in registry
          </p>

        </div>

      </section>

      {/* NOTIFICATIONS */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <span className="flex-1 leading-5">
            {error}
          </span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="rounded-md p-1 transition hover:bg-red-500/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4 text-sm text-emerald-300"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

          <span className="flex-1 leading-5">
            {success}
          </span>

          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success message"
            className="rounded-md p-1 transition hover:bg-emerald-400/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* RESOURCE REGISTRATION FORM */}

      <section className={`${panel} overflow-hidden`}>

        <div className="flex flex-col gap-3 border-b border-white/10 bg-[#070C12] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Plus className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-[#F4F7FA]">
                Register a Resource
              </h2>

              <p className="mt-1 text-xs text-[#7F8A96]">
                Add a protected company resource to the registry
              </p>
            </div>

          </div>

          <span className="w-fit rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#D4AF37]">
            Internal Classification
          </span>

        </div>

        <form
          className="space-y-6 p-5 sm:p-6 lg:p-7"
          onSubmit={createResource}
        >

          {/* BASIC INFORMATION */}

          <div>
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#67E8F9]" />

              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C5CDD5]">
                Resource Information
              </h3>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">

              <label className={labelClass}>
                Resource Name
                <input
                  type="text"
                  aria-label="Resource name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Enter resource name"
                  className={inputClass}
                />
                <span className="mt-1.5 block text-[10px] font-normal text-[#596570]">
                  Maximum 100 characters
                </span>
              </label>

              <label className={labelClass}>
                Department Code
                <input
                  type="text"
                  aria-label="Department code"
                  required
                  maxLength={80}
                  list="resource-departments"
                  value={departmentCode}
                  onChange={(event) =>
                    setDepartmentCode(event.target.value)
                  }
                  placeholder="e.g. ENGINEERING"
                  className={inputClass}
                />

                <datalist id="resource-departments">
                  {departmentCodes.map((department) => (
                    <option
                      key={department}
                      value={department}
                    />
                  ))}
                </datalist>

                <span className="mt-1.5 block text-[10px] font-normal text-[#596570]">
                  Select or enter a department code
                </span>
              </label>

            </div>

            <label className={`${labelClass} mt-5`}>
              Description

              <textarea
                aria-label="Description"
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Describe the purpose of this resource..."
                className={`${inputClass} resize-y`}
              />

              <span className="mt-1.5 block text-right text-[10px] font-normal text-[#596570]">
                {description.length}/2000 characters
              </span>
            </label>
          </div>

          {/* PROTECTED DATA */}

          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.025] p-4 sm:p-5">

            <div className="mb-4 flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5">
                <LockKeyhole className="h-4 w-4 text-[#D4AF37]" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#F4F7FA]">
                  Protected Resource Data
                </h3>

                <p className="mt-1 text-xs leading-5 text-[#7F8A96]">
                  Optional protected content associated with
                  this resource. This content is submitted
                  separately and is not displayed in the
                  resource catalog.
                </p>
              </div>

            </div>

            <label className={labelClass}>
              Protected Content

              <textarea
                aria-label="Protected resource data"
                rows={5}
                value={protectedText}
                onChange={(event) =>
                  setProtectedText(event.target.value)
                }
                placeholder="Enter protected resource content..."
                className="mt-2 block w-full resize-y rounded-xl border border-white/10 bg-[#03070C] px-4 py-3 text-sm text-[#F4F7FA] outline-none transition-all placeholder:text-[#596570] focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/15"
              />
            </label>

            <div className="mt-3 flex items-center gap-2 text-[10px] text-[#D4AF37]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Protected content is excluded from the resource catalog.
            </div>

          </div>

          {/* ACCESS POLICY */}

          <div className="rounded-xl border border-white/10 bg-[#070C12] p-4 sm:p-5">

            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#67E8F9]" />

              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C5CDD5]">
                Default Access Configuration
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">

              <div className="rounded-lg border border-white/5 bg-[#050A10] p-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
                  Sensitivity
                </p>

                <p className="mt-2 text-sm font-semibold text-[#D4AF37]">
                  INTERNAL
                </p>
              </div>

              <div className="rounded-lg border border-white/5 bg-[#050A10] p-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-[#7F8A96]">
                  Required Roles
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-md border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-2 py-1 text-[10px] font-medium text-[#67E8F9]">
                    EMPLOYEE
                  </span>

                  <span className="rounded-md border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-2 py-1 text-[10px] font-medium text-[#67E8F9]">
                    MANAGER
                  </span>
                </div>
              </div>

            </div>

            <p className="mt-3 text-[10px] leading-5 text-[#7F8A96]">
              These are the default values sent to the backend
              when a resource is registered.
            </p>

          </div>

          {/* FORM ACTIONS */}

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">

            <p className="text-[10px] leading-5 text-[#7F8A96]">
              Required fields are marked by the browser's
              standard validation.
            </p>

            <div className="flex flex-wrap items-center gap-3">

              <button
                type="button"
                onClick={resetForm}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-[#070C12] px-5 py-3 text-xs font-semibold text-[#A7B0BA] transition hover:border-white/20 hover:text-[#F4F7FA] disabled:opacity-50"
              >
                Clear Form
              </button>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/50 bg-[#67E8F9] px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-[#03070C] shadow-[0_8px_24px_rgba(103,232,249,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#67E8F9] hover:bg-transparent hover:text-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create Resource
                  </>
                )}
              </button>

            </div>

          </div>

        </form>
      </section>

      {/* RESOURCE CATALOG */}

      <section
        aria-label="Resource catalog"
        className={`${panel} overflow-hidden`}
      >

        <div className="flex flex-col gap-4 border-b border-white/10 bg-[#070C12] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
              <Database className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-[#F4F7FA]">
                Registered Resources
              </h2>

              <p className="mt-1 text-xs text-[#7F8A96]">
                Company resource catalog
              </p>
            </div>

          </div>

          <div className="relative w-full sm:max-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search resources..."
              aria-label="Search resources"
              className="w-full rounded-xl border border-white/10 bg-[#03070C] py-2.5 pl-9 pr-9 text-xs text-[#F4F7FA] outline-none transition placeholder:text-[#596570] focus:border-[#67E8F9]/50"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear resource search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7F8A96] transition hover:text-[#F4F7FA]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

        </div>

        <div className="p-5 sm:p-6">

          {filteredResources.length > 0 ? (

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              {filteredResources.map((resource) => (
                <article
                  key={resource.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#080F16]"
                >

                  <div className="flex items-start justify-between gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.05] text-[#67E8F9]">
                      <Database className="h-5 w-5" />
                    </div>

                    <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#D4AF37]">
                      {resource.sensitivity || "INTERNAL"}
                    </span>

                  </div>

                  <h3 className="mt-5 break-words text-base font-semibold text-[#F4F7FA] transition-colors group-hover:text-[#67E8F9]">
                    {resource.name}
                  </h3>

                  <p className="mt-2 min-h-[40px] break-words text-xs leading-5 text-[#7F8A96]">
                    {resource.description || "No description available."}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">

                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#050A10] px-2.5 py-1.5 text-[10px] text-[#A7B0BA]">
                      <Building2 className="h-3 w-3 text-[#67E8F9]" />

                      {resource.departmentCode ||
                        resource.department ||
                        "Unassigned"}
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#050A10] px-2.5 py-1.5 text-[10px] text-[#A7B0BA]">
                      <LockKeyhole className="h-3 w-3 text-[#D4AF37]" />

                      Policy Controlled
                    </span>

                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[10px] text-[#67E8F9]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Registered Resource
                  </div>

                </article>
              ))}

            </div>

          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center">

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#67E8F9]/20 bg-[#67E8F9]/5">
                {resources.length === 0 ? (
                  <Database className="h-6 w-6 text-[#67E8F9]" />
                ) : (
                  <Search className="h-6 w-6 text-[#67E8F9]" />
                )}
              </div>

              <h3 className="mt-4 text-sm font-semibold text-[#F4F7FA]">
                {resources.length === 0
                  ? "No Resources Registered"
                  : "No Matching Resources"}
              </h3>

              <p className="mt-2 max-w-sm text-xs leading-5 text-[#7F8A96]">
                {resources.length === 0
                  ? "Register your first company resource using the form above. Registered resources will appear here."
                  : "No resources match your search. Try a different resource name or department."}
              </p>

              {resources.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-4 rounded-lg border border-[#67E8F9]/25 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.07]"
                >
                  Clear Search
                </button>
              )}

            </div>
          )}

        </div>

        {/* CATALOG FOOTER */}

        <div className="flex flex-col justify-between gap-2 border-t border-white/10 bg-[#070C12] px-5 py-4 sm:flex-row sm:items-center sm:px-6">

          <p className="text-[10px] uppercase tracking-[0.12em] text-[#7F8A96]">
            CyberOrbit Resource Governance
          </p>

          <p className="text-[10px] text-[#7F8A96]">
            Displaying {filteredResources.length} of {resources.length} resources
          </p>

        </div>

      </section>

    </div>
  );
}

export default ResourcesPage;