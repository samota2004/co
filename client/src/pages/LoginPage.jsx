import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  Shield,
} from "lucide-react";
import LoginPageImage from "../images/Loginpage.png";

export const LoginPage = ({ onLoginSuccess, onBackToHome }) => {
  // =========================
  // ADMIN ACCOUNTS
  // =========================
  const [admins, setAdmins] = useState([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
  const [adminLoadError, setAdminLoadError] = useState(null);

  // =========================
  // LOGIN STATES
  // =========================
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // =========================
  // FORGOT PASSWORD STATES
  // =========================
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // =========================
  // MFA STATES
  // =========================
  const [isMfaStep, setIsMfaStep] = useState(false);

  const [authenticatedUser, setAuthenticatedUser] = useState(null);

  const [challengeId, setChallengeId] = useState(null);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const [countdown, setCountdown] = useState(300);

  const [mfaError, setMfaError] = useState(null);
  const [developmentOtp,setDevelopmentOtp]=useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // =========================
  // LOAD ADMINS FROM DATABASE
  // =========================
  useEffect(() => { setIsLoadingAdmins(false); }, []);

  // =========================
  // MFA COUNTDOWN
  // =========================
  useEffect(() => {
    let timer;

    if (isMfaStep && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }

          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isMfaStep, countdown]);

  // =========================
  // START MFA
  // =========================
  const startMfa = (user, newChallengeId) => {
    setAuthenticatedUser(user);
    setChallengeId(newChallengeId);
    setIsMfaStep(true);
    setCountdown(300);

    setOtp(["", "", "", "", "", ""]);

    setMfaError(null);
  };

  // =========================
  // SELECT ADMIN
  // =========================
  const handleSelectAdmin = (admin) => {
    if (!admin?.email) {
      return;
    }

    setIdentifier(admin.email);
    setForgotEmail(admin.email);
    setPassword("");
    setError(null);
    setForgotMessage(null);
  };

  // =========================
  // ADMIN ROLE LABEL
  // =========================
  const getAdminRoleLabel = (role) => {
    if (role === "SYSTEM_ADMIN") {
      return "SYSTEM ADMIN";
    }

    return "SECURITY ADMIN";
  };

  // =========================
  // LOGIN
  // =========================
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();

    setError(null);
    setIsSubmitting(true);

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier) {
      setError("Please enter your administrator email.");
      setIsSubmitting(false);
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: cleanIdentifier,
          password,
        }),
      });

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      // =========================
      // LOGIN FAILED
      // =========================
      if (!res.ok || !data?.success) {
        setError(data?.error?.message || "Invalid credentials.");

        return;
      }

      // =========================
      // ADMIN ROLE CHECK
      // =========================
      // =========================
      // FROZEN ACCOUNT
      // =========================
      if (data.user?.status === "FROZEN") {
        setError(
          "Account is currently locked by Zero Trust policy containment.",
        );

        return;
      }

      // =========================
      // MFA REQUIRED
      // =========================
      if (data.requiresMfa && data.challengeId && data.user) {
        setDevelopmentOtp(data.developmentOtp||null);
        startMfa(data.user, data.challengeId);

        return;
      }

      if(data.token){localStorage.setItem("zero_trust_token",data.token);onLoginSuccess(data.user);return;}
      setError("Authentication challenge was not created. Please try again.");
    } catch (err) {
      console.error("Login error:", err);

      setError(
        "Unable to connect to the authentication server. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================
  // OTP CHANGE
  // =========================
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    const newOtp = [...otp];

    newOtp[index] = value.slice(-1);

    setOtp(newOtp);
    setMfaError(null);

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);

      nextInput?.focus();
    }
  };

  // =========================
  // OTP BACKSPACE
  // =========================
  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const previousInput = document.getElementById(`otp-input-${index - 1}`);

      previousInput?.focus();
    }
  };

  // =========================
  // VERIFY OTP
  // =========================
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    const enteredCode = otp.join("").trim();

    if (enteredCode.length !== 6) {
      setMfaError("Please enter the complete 6-digit OTP.");

      return;
    }

    if (!challengeId) {
      setMfaError(
        "Authentication challenge is missing. Please return to login.",
      );

      return;
    }

    if (countdown === 0) {
      setMfaError("This OTP has expired. Please request a new code.");

      return;
    }

    setIsVerifying(true);
    setMfaError(null);

    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          challengeId,
          otp: enteredCode,
        }),
      });

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      // =========================
      // OTP FAILED
      // =========================
      if (!res.ok || !data?.success) {
        setMfaError(data?.error?.message || "Invalid verification code.");

        return;
      }

      // =========================
      // FINAL TOKEN
      // =========================
      if (!data.token) {
        setMfaError("Authentication completed without a valid session token.");

        return;
      }

      localStorage.setItem("zero_trust_token", data.token);

      if (rememberMe) {
        localStorage.setItem("zero_trust_remember", "true");
      } else {
        localStorage.removeItem("zero_trust_remember");
      }

      // =========================
      // LOGIN SUCCESS
      // =========================
      if (onLoginSuccess) {
        onLoginSuccess(data.user || authenticatedUser);
      }
    } catch (err) {
      console.error("MFA error:", err);

      setMfaError("Unable to verify OTP. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  // =========================
  // RESEND OTP
  // =========================
  const handleResendOtp = async () => {
    if (!challengeId) {
      setMfaError("Authentication challenge is missing.");

      return;
    }

    setMfaError(null);
    setIsResending(true);

    try {
      const res = await fetch("/api/auth/mfa/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          challengeId,
        }),
      });

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success) {
        setMfaError(data?.error?.message || "Unable to resend OTP.");

        return;
      }

      if (data.challengeId) {
        setChallengeId(data.challengeId);
      }
      setDevelopmentOtp(data.developmentOtp || null);

      setOtp(["", "", "", "", "", ""]);

      setCountdown(300);

      setTimeout(() => {
        document.getElementById("otp-input-0")?.focus();
      }, 50);
    } catch (err) {
      console.error("Resend OTP error:", err);

      setMfaError("Unable to resend OTP. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // =========================
  // FORGOT PASSWORD
  // =========================
  const handleForgotPassword = async (e) => {
    e.preventDefault();

    setForgotMessage(null);
    setError(null);

    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setForgotMessage("Please enter your administrator email.");

      return;
    }

    setIsSendingReset(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success) {
        setForgotMessage(
          data?.error?.message ||
            "Unable to process your password reset request.",
        );

        return;
      }

      setForgotMessage(
        data.message ||
          "If this admin email exists, password reset instructions have been sent.",
      );
    } catch (err) {
      console.error("Forgot password error:", err);

      setForgotMessage(
        "Unable to connect to the authentication server. Please try again.",
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  // =========================
  // BACK TO LOGIN
  // =========================
  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotMessage(null);
    setError(null);
  };

  // =========================
  // BACK FROM MFA
  // =========================
  const handleBackFromMfa = () => {
    setIsMfaStep(false);
    setChallengeId(null);
    setAuthenticatedUser(null);

    setOtp(["", "", "", "", "", ""]);

    setMfaError(null);
    setCountdown(0);
  };

  // =========================
  // FORMAT COUNTDOWN
  // =========================
  const formatCountdown = () => {
    const minutes = Math.floor(countdown / 60);

    const seconds = countdown % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div
      id="cyberorbit-login-portal"
      className="min-h-screen bg-[#03070C] text-[#F4F7FA] flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif]"
    >
      {/* =========================
          HEADER
      ========================= */}
      <header className="relative z-30 border-b border-white/10 bg-[#050A10]/96 px-6 py-4 shadow-[0_14px_42px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between">
          <button
            onClick={onBackToHome}
            className="group flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#070C12]/85 px-3.5 py-2.5 text-[11px] font-mono tracking-[0.12em] text-[#A7B0BA] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:bg-[#070C12] hover:text-[#F4F7FA] hover:shadow-[0_0_20px_rgba(103,232,249,0.08)]"
          >
            <ArrowLeft className="h-4 w-4 text-[#D4AF37] transition-transform duration-200 group-hover:-translate-x-1" />
            <span>BACK TO HOME</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.65)]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#D4AF37]">
                SECURE AUTHENTICATION GATEWAY
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#070C12] text-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.05)]">
              <Shield className="h-4 w-4" />
            </div>
          </div>
        </div>
      </header>

      {/* =========================
          MAIN
      ========================= */}
      <main className="relative isolate flex w-full flex-1 items-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
        <img
          src={LoginPageImage}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[#03070C]/62" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_22%_42%,rgba(103,232,249,0.10),transparent_30%),radial-gradient(circle_at_78%_48%,rgba(212,175,55,0.08),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative z-10 mx-auto w-full max-w-[1080px]">
          <div className="group relative grid grid-cols-1 overflow-hidden rounded-3xl border border-[#67E8F9]/45 bg-[#050A10]/78 shadow-[0_24px_80px_rgba(0,0,0,0.52)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#67E8F9]/80 hover:bg-[#050A10]/84 hover:shadow-[0_30px_95px_rgba(0,0,0,0.62),0_0_38px_rgba(103,232,249,0.10)] lg:grid-cols-12">
            {/* =========================
              LEFT COLUMN
          ========================= */}
            <div className="relative z-10 flex flex-col justify-between border-b border-white/10 bg-[#050A10]/78 p-6 backdrop-blur-md transition-all duration-300 hover:bg-[#070C12]/88 hover:shadow-[inset_0_0_40px_rgba(103,232,249,0.035)] sm:p-8 lg:col-span-5 lg:border-b-0 lg:border-r">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />

                  <span className="text-[10px] font-mono tracking-[0.25em] text-[#D4AF37] uppercase">
                    CYBERORBIT ZERO TRUST
                  </span>
                </div>

                <h2 className="font-serif-display text-[31px] sm:text-[35px] font-light leading-[1.08] tracking-[-0.025em] text-[#F4F7FA]">
                  Continuous Trust &amp; Behavioral Verification
                </h2>

                <div className="w-16 h-[1px] bg-[#D4AF37] my-4" />

                <p className="text-[13px] text-[#A7B0BA] font-sans leading-6 mb-6">
                  All logins undergo continuous risk scoring, contextual device
                  assessment, and email MFA following Zero Trust
                  principles.
                </p>

                {/* =========================
                  DATABASE ADMINS
              ========================= */}
                <div className="space-y-2.5">
                  <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#D4AF37] block">
                    COMPANY ACCOUNTS
                  </span>

                  {isLoadingAdmins ? (
                    <div className="w-full rounded-xl border border-white/10 bg-[#070C12] p-4 text-[12px] font-mono text-[#A7B0BA] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/25 hover:bg-[#070C12]/95 hover:shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                      Loading administrator accounts...
                    </div>
                  ) : adminLoadError ? (
                    <div className="w-full rounded-xl p-4 border border-red-500/40 bg-red-500/10 text-[12px] font-mono text-red-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400/60 hover:shadow-[0_10px_24px_rgba(239,68,68,0.06)]">
                      {adminLoadError}
                    </div>
                  ) : admins.length === 0 ? (
                    <div className="w-full rounded-xl border border-white/10 bg-[#070C12] p-4 text-[12px] font-mono text-[#A7B0BA] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/25 hover:bg-[#070C12]/95 hover:shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                      Administrator access only. Employee sign-in is disabled.
                    </div>
                  ) : (
                    admins.map((admin) => {
                      const adminEmail = String(
                        admin?.email || "",
                      ).toLowerCase();

                      const selectedEmail = String(
                        identifier || "",
                      ).toLowerCase();

                      const isSelected =
                        adminEmail && selectedEmail === adminEmail;

                      // Support both possible backend names.
                      const adminRole = admin.role || admin.roleCode || "";

                      return (
                        <button
                          key={admin.id}
                          type="button"
                          onClick={() => handleSelectAdmin(admin)}
                          className={`group w-full rounded-xl border p-3.5 text-left text-[12px] font-mono transition-all duration-200 flex items-center justify-between cursor-pointer hover:-translate-y-0.5 hover:border-[#67E8F9]/55 hover:bg-[#070C12]/95 hover:shadow-[0_10px_28px_rgba(0,0,0,0.25),0_0_20px_rgba(103,232,249,0.07)] ${
                            isSelected
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_20px_rgba(212,175,55,0.06)]"
                              : "border-white/10 bg-[#070C12] hover:border-[#67E8F9]/50 hover:bg-[#070C12]/95"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-current flex items-center gap-2">
                              <span>{admin.name}</span>
                            </div>

                            <div className="text-[10px] text-[#A7B0BA] mt-0.5 break-all">
                              {admin.email}
                            </div>

                            {admin.departmentCode && (
                              <div className="text-[9px] text-[#7F8A96] mt-1 uppercase">
                                {String(admin.departmentCode).replaceAll(
                                  "_",
                                  " ",
                                )}
                              </div>
                            )}
                          </div>

                          <span className="text-[10px] font-mono rounded-md px-2 py-1 rounded-md border text-[#D4AF37] border-[#D4AF37]/40 bg-[#D4AF37]/10 shrink-0 ml-3">
                            {getAdminRoleLabel(adminRole)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6 text-[10px] font-mono text-[#7F8A96]">
                <span>NIST SP 800-207</span>

                <span className="text-[#D4AF37]">DEVELOPMENT BUILD</span>
              </div>
            </div>

            {/* =========================
              RIGHT COLUMN
          ========================= */}
            <div className="relative z-10 flex flex-col justify-center bg-[#050A10]/76 p-6 backdrop-blur-md transition-all duration-300 hover:bg-[#070C12]/84 sm:p-10 lg:col-span-7">
              {/* =========================
                FORGOT PASSWORD
            ========================= */}
              {showForgotPassword ? (
                <div className="max-w-md mx-auto w-full space-y-6">
                  <div>
                    <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-[0.22em] block mb-1">
                      ACCOUNT RECOVERY
                    </span>

                    <h3 className="font-serif-display text-[30px] sm:text-[32px] font-light leading-tight tracking-[-0.02em]">
                      Forgot Password
                    </h3>

                    <p className="text-[13px] text-[#A7B0BA] mt-2 leading-6">
                      Enter your Security Admin email address to receive
                      password reset instructions.
                    </p>
                  </div>

                  {forgotMessage && (
                    <div
                      className={`p-3 border text-xs font-mono flex items-center gap-2 ${
                        forgotMessage.toLowerCase().includes("sent")
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/40 bg-red-500/10 text-red-400"
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />

                      <span>{forgotMessage}</span>
                    </div>
                  )}

                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="space-y-2">
                      <label className="block text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                        Administrator email
                      </label>

                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="admin@example.com"
                        className="w-full rounded-xl border border-white/10 bg-[#070C12]/90 px-4 py-3.5 text-[13px] font-mono text-[#F4F7FA] outline-none transition-all hover:border-[#67E8F9]/30 focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingReset}
                      className="w-full rounded-xl py-3.5 text-[12px] font-semibold tracking-[0.18em] uppercase border border-[#67E8F9] bg-[#67E8F9] text-[#03070C] hover:bg-transparent hover:text-[#67E8F9] transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>
                        {isSendingReset
                          ? "PROCESSING..."
                          : "SEND RESET INSTRUCTIONS"}
                      </span>

                      <span className="font-serif text-sm">→</span>
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="w-full rounded-xl border border-transparent px-3 py-2.5 text-center text-[11px] font-mono text-[#A7B0BA] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D4AF37]/30 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37] hover:shadow-[0_0_18px_rgba(212,175,55,0.06)] cursor-pointer"
                  >
                    ← BACK TO LOGIN
                  </button>
                </div>
              ) : !isMfaStep ? (
                /* =========================
                 LOGIN SCREEN
              ========================= */
                <div className="max-w-md mx-auto w-full space-y-6">
                  <div>
                    <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-[0.22em] block mb-1">
                      CYBERORBIT PLATFORM
                    </span>

                    <h3 className="font-serif-display text-[30px] sm:text-[32px] font-light leading-tight tracking-[-0.02em]">
                      Sign In
                    </h3>

                    <p className="text-xs text-[#A7B0BA] mt-1">
                      Sign in with your company account.
                    </p>
                  </div>

                  {/* ADMIN ROLE */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                      ACCESS ROLE
                    </label>

                    <div className="border border-[#67E8F9] bg-[#67E8F9] text-[#03070C] py-3 px-4 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 font-bold">
                      <Shield className="w-3.5 h-3.5" />

                      <span>Role verified after login</span>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />

                      <span>{error}</span>
                    </div>
                  )}

                  <form
                    onSubmit={handleCredentialsSubmit}
                    className="space-y-5"
                  >
                    {/* EMAIL */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                        Administrator email
                      </label>

                      <input
                        id="username-email-input"
                        type="email"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="admin@example.com"
                        className="w-full rounded-xl border border-white/10 bg-[#070C12]/90 px-4 py-3.5 text-[13px] font-mono text-[#F4F7FA] outline-none transition-all hover:border-[#67E8F9]/30 focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10"
                      />
                    </div>

                    {/* PASSWORD */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                          Password
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setForgotEmail(identifier);

                            setShowForgotPassword(true);

                            setError(null);
                          }}
                          className="text-[10px] font-mono text-[#D4AF37] hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          id="password-input"
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          className="w-full rounded-xl border border-white/10 bg-[#070C12]/90 px-4 py-3 pr-10 text-sm font-mono text-[#F4F7FA] outline-none transition-all hover:border-[#67E8F9]/30 focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10"
                        />

                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-[#A7B0BA] hover:bg-white/5 hover:text-[#67E8F9] transition-all duration-200 cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* REMEMBER SESSION */}
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-[#A7B0BA] hover:text-gray-300">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="accent-[#D4AF37]"
                        />

                        <span className="text-xs font-mono">
                          Remember session
                        </span>
                      </label>

                      <span className="text-[10px] font-mono text-[#7F8A96]">
                        Redirects to SOC Dashboard
                      </span>
                    </div>

                    {/* LOGIN BUTTON */}
                    <button
                      id="btn-login-submit"
                      type="submit"
                      disabled={
                        isSubmitting
                      }
                      className="w-full rounded-xl py-3.5 text-[12px] font-semibold tracking-[0.18em] uppercase border border-[#67E8F9] bg-[#67E8F9] text-[#03070C] hover:bg-transparent hover:text-[#67E8F9] transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(103,232,249,0.10)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>
                        {isSubmitting ? "AUTHENTICATING..." : "SIGN IN"}
                      </span>

                      <span className="font-serif text-sm">→</span>
                    </button>
                  </form>
                </div>
              ) : (
                /* =========================
                 MFA SCREEN
              ========================= */
                <div className="max-w-md mx-auto w-full space-y-6">
                  <div>
                    <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-[0.22em] block mb-2">
                      MULTI-FACTOR CHALLENGE
                    </span>

                    <h3 className="font-serif-display text-[30px] sm:text-[32px] font-light leading-tight tracking-[-0.02em]">
                      Verification Code
                    </h3>

                    <p className="text-[13px] text-[#A7B0BA] mt-2 leading-6">
                      A 6-digit OTP has been issued to{" "}
                      <strong className="text-[#D4AF37]">
                        {authenticatedUser?.email}
                      </strong>
                      .
                    </p>
                  </div>

                  {developmentOtp && <p role="status" className="text-amber-300">Local development MFA code: {developmentOtp}</p>}
                  {mfaError && (
                    <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />

                      <span>{mfaError}</span>
                    </div>
                  )}

                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    {/* OTP INPUTS */}
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`otp-input-${idx}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={1}
                          value={digit}
                          disabled={isVerifying}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          className="h-14 w-11 rounded-xl border border-white/10 bg-[#070C12]/90 text-center text-2xl font-serif-display font-light text-[#D4AF37] outline-none transition-all hover:border-[#67E8F9]/30 focus:border-[#67E8F9] focus:ring-2 focus:ring-[#67E8F9]/10 sm:h-16 sm:w-12"
                        />
                      ))}
                    </div>

                    {/* OTP TIMER */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1 text-[#A7B0BA]">
                        <Clock className="w-3.5 h-3.5" />

                        <span>
                          {countdown > 0 ? formatCountdown() : "Expired"}
                        </span>
                      </div>

                      <span className="text-[10px] text-[#7F8A96]">
                        OTP expires in 5 minutes
                      </span>
                    </div>

                    {/* VERIFY */}
                    <div className="space-y-3 pt-2">
                      <button
                        id="btn-mfa-verify-submit"
                        type="submit"
                        disabled={isVerifying || countdown === 0}
                        className="w-full rounded-xl py-3.5 text-[12px] font-semibold tracking-[0.18em] uppercase border border-[#67E8F9] bg-[#67E8F9] text-[#03070C] hover:bg-transparent hover:text-[#67E8F9] transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>
                          {isVerifying ? "VERIFYING..." : "VERIFY & ACCESS"}
                        </span>

                        <span className="font-serif">→</span>
                      </button>

                      <div className="flex items-center justify-between text-xs pt-2">
                        <button
                          type="button"
                          disabled={countdown > 0 || isResending}
                          onClick={handleResendOtp}
                          className={`font-mono text-[11px] ${
                            countdown > 0 || isResending
                              ? "text-[#7F8A96] cursor-not-allowed"
                              : "rounded-lg px-2.5 py-1.5 text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-[#F4F7FA] transition-all duration-200 cursor-pointer"
                          }`}
                        >
                          {isResending ? "Sending..." : "Resend Code"}
                        </button>

                        <button
                          type="button"
                          onClick={handleBackFromMfa}
                          className="rounded-lg px-2.5 py-1.5 text-[#A7B0BA] hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer text-[11px] font-mono"
                        >
                          Back to Login
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* =========================
          FOOTER
      ========================= */}
      <footer className="relative z-30 border-t border-white/10 bg-[#050A10]/96 px-6 py-6 text-center shadow-[0_-12px_35px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
          <span className="h-px w-10 bg-[#D4AF37]/60" />
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#7F8A96]">
            CyberOrbit • Zero Trust &amp; UEBA Security Platform
          </span>
          <span className="h-px w-10 bg-[#67E8F9]/60" />
        </div>
        <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[#59636E]">
          Continuous Identity Verification • Secure Session Gateway
        </div>
      </footer>
    </div>
  );
};
