
import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Fingerprint,
  History,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  XCircle,
  Eye,
  EyeOff,
  Monitor,
} from "lucide-react";

import { ConsoleHeader } from "../components/ConsoleHeader.jsx";
import { requestApi } from "../services/api.js";

const panelClass =
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#070C12] hover:shadow-[0_22px_65px_rgba(103,232,249,0.06)] sm:p-6";

const headingClass =
  "flex items-center gap-2 text-xs font-mono uppercase tracking-[0.17em] text-[#67E8F9]";

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#070C12] px-4 py-3 text-sm text-[#F4F7FA] outline-none transition-all duration-200 placeholder:text-[#53616D] hover:border-white/20 focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10";

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-[#A7B0BA] transition-all duration-200 hover:border-[#67E8F9]/40 hover:bg-[#67E8F9]/[0.06] hover:text-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-40";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/30 bg-[#67E8F9]/10 px-5 py-3 text-sm font-semibold text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/15 hover:shadow-[0_0_25px_rgba(103,232,249,0.10)] disabled:cursor-not-allowed disabled:opacity-40";

const getSessionStatusStyle = (status) => {
  const value = String(status || "").toLowerCase();

  if (
    value === "active" ||
    value === "success" ||
    value === "authenticated"
  ) {
    return "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]";
  }

  if (
    value === "revoked" ||
    value === "expired" ||
    value === "terminated"
  ) {
    return "border-red-400/20 bg-red-400/[0.06] text-red-400";
  }

  return "border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] text-[#D4AF37]";
};

const formatDate = (value) => {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date.toLocaleString();
};

const SettingLabel = ({ children }) => (
  <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-[#A7B0BA]">
    {children}
  </label>
);

const SettingSection = ({
  icon: Icon,
  title,
  description,
  children,
  badge,
}) => (
  <section className={`${panelClass} space-y-5`}>
    <div className="flex flex-wrap items-start justify-between gap-3">

      <div className="flex items-start gap-3">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className={headingClass}>{title}</h2>

          {description && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[#7F8A96]">
              {description}
            </p>
          )}
        </div>

      </div>

      {badge && (
        <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#D4AF37]">
          {badge}
        </span>
      )}

    </div>

    <div>{children}</div>
  </section>
);

export function SettingsPage({ currentUser, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [alerts, setAlerts] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("cyberorbit_preferences") || "{}"
        ).inAppAlerts !== false
      );
    } catch {
      return true;
    }
  });

  const [sessionHistory, setSessionHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");

  // LOAD ACTIVE SESSIONS

  const load = async () => {
    setRefreshingSessions(true);

    try {
      const data = await requestApi("/api/auth/sessions");
      setSessions(data.sessions || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingSessions(false);
    }
  };

  // LOAD SESSION HISTORY

  const loadHistory = async () => {
    setRefreshingHistory(true);

    try {
      const data = await requestApi("/api/auth/sessions/history");

      setSessionHistory(data.sessions ?? []);
      setHistoryError("");
    } catch (e) {
      setHistoryError(e.message);
    } finally {
      setRefreshingHistory(false);
    }
  };

  useEffect(() => {
    load();
    loadHistory();
  }, []);

  // CHANGE PASSWORD

  async function change(e) {
    e.preventDefault();

    setError("");
    setNotice("");

    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const result = await requestApi(
        "/api/auth/password/change",
        {
          method: "POST",
          body: {
            currentPassword: form.currentPassword,
            newPassword: form.newPassword,
          },
        }
      );

      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setNotice(result.message);

      setTimeout(() => onLogout?.(), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // REVOKE SESSION

  async function revoke(id) {
    setError("");
    setNotice("");
    setRevokingId(id);

    try {
      const result = await requestApi(
        "/api/auth/sessions/" + id + "/revoke",
        {
          method: "POST",
          body: {},
        }
      );

      setNotice(result.message);

      await Promise.all([
        load(),
        loadHistory(),
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setRevokingId(null);
    }
  }

  // NOTIFICATION PREFERENCES

  function toggleAlerts(checked) {
    setAlerts(checked);

    try {
      localStorage.setItem(
        "cyberorbit_preferences",
        JSON.stringify({
          inAppAlerts: checked,
        })
      );
    } catch {
      setError("Unable to save notification preferences.");
    }
  }

  const activeSessionCount = sessions.length;

  const passwordFields = [
    {
      key: "currentPassword",
      label: "Current Password",
      placeholder: "Enter your current password",
      autoComplete: "current-password",
      minLength: 1,
    },
    {
      key: "newPassword",
      label: "New Password",
      placeholder: "Enter your new password",
      autoComplete: "new-password",
      minLength: 12,
    },
    {
      key: "confirmPassword",
      label: "Confirm New Password",
      placeholder: "Re-enter your new password",
      autoComplete: "new-password",
      minLength: 12,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 pb-10 pt-5 sm:space-y-6 sm:px-8 lg:px-12">

      {/* PAGE HEADER */}

      <section className="console-hero group relative isolate overflow-hidden rounded-2xl border border-[#67E8F9]/35 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:border-[#67E8F9]/60">

        <div
          aria-hidden="true"
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

        <div className="pointer-events-none absolute left-0 top-0 h-16 w-px bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />

        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-px bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div className="pointer-events-none absolute right-[5%] top-1/2 hidden h-52 w-52 -translate-y-1/2 rounded-full border border-[#67E8F9]/10 sm:block" />

        <div className="pointer-events-none absolute right-[8%] top-1/2 hidden h-40 w-40 -translate-y-1/2 rounded-full border border-[#D4AF37]/20 sm:block" />

        <div className="pointer-events-none absolute right-[12%] top-1/2 hidden h-28 w-28 -translate-y-1/2 rounded-full border border-[#67E8F9]/25 sm:block" />

        <div className="relative z-10 px-5 py-8 sm:px-8 sm:py-9 lg:px-9">

          <div className="flex flex-wrap items-center gap-3">

            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] sm:text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
              Security Configuration Center
            </span>

            <span className="text-[11px] uppercase tracking-wider text-[#7F8A96] sm:text-xs">
              Account &amp; Access Management
            </span>

          </div>

          <h1 className="mt-4 text-3xl font-light leading-tight tracking-tight text-[#F4F7FA] sm:text-4xl lg:text-5xl">
            Account{" "}
            <span className="text-[#67E8F9]">
              Settings &amp; Security
            </span>
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#A7B0BA]">
            Manage your authentication credentials, monitor active
            sessions, review login history, and configure your
            security notification preferences.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">

            <span className="rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#67E8F9]">
              Secure Account
            </span>

            <span className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#D4AF37]">
              Zero Trust
            </span>

            <span className="rounded-lg border border-white/10 bg-[#070C12]/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#7F8A96]">
              Access Control
            </span>

          </div>

        </div>
      </section>

      {/* ACCOUNT OVERVIEW */}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <div className={`${panelClass} flex items-center gap-4`}>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
            <Fingerprint className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#7F8A96]">
              Account Identity
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-[#F4F7FA]">
              {currentUser?.name || "Employee"}
            </p>

            <p className="mt-1 truncate text-xs text-[#A7B0BA]">
              {currentUser?.email || "No email available"}
            </p>
          </div>

        </div>

        <div className={`${panelClass} flex items-center gap-4`}>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] text-[#D4AF37]">
            <Laptop className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#7F8A96]">
              Active Sessions
            </p>

            <p className="mt-1 text-2xl font-semibold text-[#F4F7FA]">
              {activeSessionCount}
            </p>

            <p className="mt-1 text-xs text-[#A7B0BA]">
              Persisted login sessions
            </p>
          </div>

        </div>

        <div className={`${panelClass} flex items-center gap-4 sm:col-span-2 lg:col-span-1`}>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
            <Bell className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#7F8A96]">
              In-App Notifications
            </p>

            <p className="mt-1 text-sm font-semibold text-[#F4F7FA]">
              {alerts ? "Enabled" : "Disabled"}
            </p>

            <p className="mt-1 text-xs text-[#A7B0BA]">
              Routine activity notices
            </p>
          </div>

        </div>

      </section>

      {/* GLOBAL FEEDBACK */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-300"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] p-4 text-sm text-[#67E8F9]"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* AUTHENTICATION POLICY */}

      <SettingSection
        icon={ShieldCheck}
        title="Authentication Policy"
        description="Organizational authentication and access control requirements."
        badge="Company Policy"
      >

        <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">

          <div className="flex items-start gap-3">

            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />

            <div className="space-y-2">

              <p className="text-sm font-semibold text-[#F4F7FA]">
                Enterprise Authentication Controls
              </p>

              <p className="text-xs leading-6 text-[#A7B0BA]">
                Console access is restricted to administrators and
                requires email MFA. Employee sign-in is disabled.
                Resource access may require fresh MFA.
                Authentication requirements are controlled by
                company policy.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">

                <span className="rounded-md border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] px-2 py-1 text-[10px] font-mono text-[#67E8F9]">
                  EMAIL MFA
                </span>

                <span className="rounded-md border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-2 py-1 text-[10px] font-mono text-[#D4AF37]">
                  ADMIN CONTROLLED
                </span>

              </div>

            </div>

          </div>

        </div>

      </SettingSection>

      {/* CHANGE PASSWORD */}

      <SettingSection
        icon={KeyRound}
        title="Change Password"
        description="Update your account credentials. Changing your password will invalidate existing sessions."
        badge="Credential Security"
      >

        <form onSubmit={change} className="space-y-4">

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {passwordFields.map((field) => (

              <div
                key={field.key}
                className={field.key === "currentPassword" ? "lg:col-span-2" : ""}
              >

                <SettingLabel>{field.label}</SettingLabel>

                <div className="relative">

                  <input
                    required
                    type={
                      showPasswords[field.key]
                        ? "text"
                        : "password"
                    }
                    minLength={field.minLength}
                    maxLength={128}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    value={form[field.key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [field.key]: e.target.value,
                      })
                    }
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    aria-label={
                      showPasswords[field.key]
                        ? "Hide password"
                        : "Show password"
                    }
                    onClick={() =>
                      setShowPasswords((previous) => ({
                        ...previous,
                        [field.key]: !previous[field.key],
                      }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7F8A96] transition-colors hover:text-[#67E8F9]"
                  >
                    {showPasswords[field.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>

                </div>

              </div>

            ))}

          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#070C12] p-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-start gap-3">

              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />

              <div>
                <p className="text-xs font-semibold text-[#F4F7FA]">
                  Password Requirements
                </p>

                <p className="mt-1 text-xs leading-5 text-[#7F8A96]">
                  Use 12–128 characters. Your new password
                  must match the confirmation field.
                </p>
              </div>

            </div>

            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#D4AF37]">
              12–128 CHARACTERS
            </span>

          </div>

          <button
            type="submit"
            disabled={busy}
            className={primaryButtonClass}
          >

            {busy ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}

            {busy
              ? "Updating Password..."
              : "Change Password & Invalidate Sessions"}

          </button>

        </form>

      </SettingSection>

      {/* ACTIVE SESSIONS */}

      <SettingSection
        icon={Laptop}
        title="Active Sessions"
        description="Monitor authenticated sessions and revoke access from individual devices."
        badge={`${activeSessionCount} Sessions`}
      >

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

          <p className="text-xs text-[#7F8A96]">
            Review your persisted login sessions.
          </p>

          <button
            type="button"
            onClick={load}
            disabled={refreshingSessions}
            className={secondaryButtonClass}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                refreshingSessions ? "animate-spin" : ""
              }`}
            />
            Refresh Sessions
          </button>

        </div>

        {sessions.length === 0 ? (

          <div className="rounded-xl border border-white/10 bg-[#070C12] p-7 text-center">

            <Monitor className="mx-auto h-7 w-7 text-[#7F8A96]" />

            <p className="mt-3 text-sm font-medium text-[#A7B0BA]">
              No persisted sessions found.
            </p>

            <p className="mt-1 text-xs text-[#7F8A96]">
              Sign in again to create a managed session.
            </p>

          </div>

        ) : (

          <div className="space-y-3">

            {sessions.map((session) => (

              <div
                key={session.id}
                className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#67E8F9]/30 sm:flex-row sm:items-center sm:justify-between"
              >

                <div className="flex min-w-0 items-start gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">

                    <Smartphone className="h-5 w-5" />

                  </div>

                  <div className="min-w-0">

                    <p className="break-words text-sm font-semibold text-[#F4F7FA]">
                      {session.userAgent || "Unknown browser"}
                    </p>

                    <p className="mt-1 break-all font-mono text-xs text-[#A7B0BA]">
                      IP: {session.ip || "Unavailable"}
                    </p>

                    <div className="mt-2 space-y-1 text-[11px] text-[#7F8A96]">

                      <p>
                        Created: {formatDate(session.createdAt)}
                      </p>

                      <p>
                        Expires: {formatDate(session.expiresAt)}
                      </p>

                    </div>

                  </div>

                </div>

                <button
                  type="button"
                  disabled={revokingId === session.id}
                  onClick={() => revoke(session.id)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:border-red-400/40 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                >

                  {revokingId === session.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}

                  {revokingId === session.id
                    ? "Revoking..."
                    : "Revoke Session"}

                </button>

              </div>

            ))}

          </div>

        )}

        <div className="mt-5 border-t border-white/10 pt-4">

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-xs font-semibold text-red-400 transition-all hover:border-red-400/40 hover:bg-red-400/10"
          >

            <LogOut className="h-4 w-4" />

            Sign Out &amp; Invalidate All Sessions

          </button>

        </div>

      </SettingSection>

      {/* SESSION HISTORY */}

      <SettingSection
        icon={History}
        title="Session History"
        description="Review recorded authentication activity and previously established login sessions."
        badge={`${sessionHistory.length} Records`}
      >

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

          <p className="text-xs text-[#7F8A96]">
            Historical authentication records.
          </p>

          <button
            type="button"
            onClick={loadHistory}
            disabled={refreshingHistory}
            className={secondaryButtonClass}
          >

            <RefreshCw
              className={`h-3.5 w-3.5 ${
                refreshingHistory ? "animate-spin" : ""
              }`}
            />

            Refresh History

          </button>

        </div>

        {historyError && (

          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {historyError}
          </div>

        )}

        {sessionHistory.length > 0 ? (

          <div className="overflow-x-auto rounded-xl border border-white/10">

            <table className="w-full min-w-[650px] text-left text-xs">

              <thead className="bg-[#070C12]">

                <tr className="border-b border-white/10">

                  <th className="px-4 py-4 font-mono font-medium uppercase tracking-wider text-[#7F8A96]">
                    Browser / Device
                  </th>

                  <th className="px-4 py-4 font-mono font-medium uppercase tracking-wider text-[#7F8A96]">
                    IP Address
                  </th>

                  <th className="px-4 py-4 font-mono font-medium uppercase tracking-wider text-[#7F8A96]">
                    Login Time
                  </th>

                  <th className="px-4 py-4 font-mono font-medium uppercase tracking-wider text-[#7F8A96]">
                    Status
                  </th>

                </tr>

              </thead>

              <tbody>

                {sessionHistory.map((session) => (

                  <tr
                    key={session.id}
                    className="border-b border-white/[0.06] transition-colors hover:bg-[#67E8F9]/[0.025]"
                  >

                    <td className="max-w-[240px] px-4 py-4 font-medium text-[#F4F7FA]">
                      <div className="flex items-center gap-2">

                        <Laptop className="h-4 w-4 shrink-0 text-[#67E8F9]" />

                        <span className="break-words">
                          {session.userAgent || "Unknown"}
                        </span>

                      </div>
                    </td>

                    <td className="px-4 py-4 font-mono text-[#A7B0BA]">
                      {session.ip || "Unavailable"}
                    </td>

                    <td className="px-4 py-4 text-[#A7B0BA]">
                      {formatDate(session.createdAt)}
                    </td>

                    <td className="px-4 py-4">

                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${getSessionStatusStyle(session.status)}`}
                      >
                        {session.status || "Unknown"}
                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        ) : (

          !historyError && (
            <div className="rounded-xl border border-white/10 bg-[#070C12] p-7 text-center">

              <Clock className="mx-auto h-7 w-7 text-[#7F8A96]" />

              <p className="mt-3 text-sm text-[#A7B0BA]">
                No session history available.
              </p>

              <p className="mt-1 text-xs text-[#7F8A96]">
                Authentication records will appear here when available.
              </p>

            </div>
          )

        )}

      </SettingSection>

      {/* NOTIFICATION PREFERENCES */}

      <SettingSection
        icon={Bell}
        title="Notification Preferences"
        description="Control routine in-app activity notifications for your account."
        badge="Preferences"
      >

        <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#070C12] p-4 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-start gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.06] text-[#67E8F9]">
              <Bell className="h-5 w-5" />
            </div>

            <div>

              <p className="text-sm font-semibold text-[#F4F7FA]">
                Routine In-App Activity Notices
              </p>

              <p className="mt-1 max-w-lg text-xs leading-5 text-[#7F8A96]">
                Show routine notifications and activity updates
                within the CyberOrbit console.
              </p>

              <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]">
                Critical security notices remain visible.
              </p>

            </div>

          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-3">

            <span className="text-xs font-semibold text-[#A7B0BA]">
              {alerts ? "Enabled" : "Disabled"}
            </span>

            <input
              type="checkbox"
              checked={alerts}
              onChange={(e) => toggleAlerts(e.target.checked)}
              className="peer sr-only"
            />

            <span
              className={`relative h-6 w-11 rounded-full border transition-all duration-200 ${
                alerts
                  ? "border-[#67E8F9]/40 bg-[#67E8F9]/25"
                  : "border-white/15 bg-white/[0.06]"
              }`}
            >

              <span
                className={`absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full transition-all duration-200 ${
                  alerts
                    ? "translate-x-5 bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.5)]"
                    : "translate-x-0 bg-[#7F8A96]"
                }`}
              />

            </span>

          </label>

        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.035] p-4">

          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />

          <p className="text-xs leading-5 text-[#A7B0BA]">
            Critical account and security notices remain visible.
            Email digests and hardware MFA are not currently implemented.
          </p>

        </div>

      </SettingSection>

      {/* FOOTER */}

      <div className="flex flex-col items-center justify-between gap-2 border-t border-white/10 py-5 text-center sm:flex-row sm:text-left">

        <p className="text-[10px] font-mono uppercase tracking-wider text-[#53616D]">
          CyberOrbit Security Console
        </p>

        <p className="text-[10px] font-mono uppercase tracking-wider text-[#53616D]">
          Identity • Authentication • Access Control
        </p>

      </div>

    </main>
  );
}
