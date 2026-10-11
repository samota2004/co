import React, { useState } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!token) {
      setError("Invalid or missing password reset token.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError("Password must contain 12–128 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
          newPassword: password,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Unable to reset password.");
      }

      setMessage("Password reset successfully. Redirecting to login...");

      setTimeout(() => {
        window.history.pushState({}, "", "/login");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, 1500);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#03070C] text-[#F4F7FA]">
      {/* Ambient CyberOrbit background */}
      <div className="pointer-events-none absolute left-1/2 top-[-260px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#67E8F9]/[0.025] blur-3xl" />

      <div className="pointer-events-none absolute bottom-[-240px] right-[-180px] h-[500px] w-[500px] rounded-full bg-[#D4AF37]/[0.025] blur-3xl" />

      {/* Technical background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(103,232,249,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.45) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[520px]">
          {/* Security Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_24px_80px_rgba(0,0,0,0.38)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/80 hover:shadow-[0_28px_90px_rgba(103,232,249,0.10)]">
            {/* Top-left gold accent */}
            <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />

            {/* Bottom-right cyan accent */}
            <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

            {/* Technical grid inside card */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(103,232,249,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.7) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />

            {/* Top identity line */}
            <div className="pointer-events-none absolute left-10 right-10 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/70 to-transparent" />

            {/* Header */}
            <div className="relative z-10 border-b border-white/10 px-6 pb-6 pt-7 sm:px-8">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />

                    <p className="text-[12px] font-mono uppercase tracking-[0.22em] text-[#D4AF37]">
                      CyberOrbit Security
                    </p>
                  </div>

                  <p className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#7F8A96]">
                    Identity Recovery Protocol
                  </p>

                  <h1 className="mt-4 text-3xl font-light tracking-tight text-[#F4F7FA] sm:text-4xl">
                    Reset <span className="text-[#67E8F9]">Password</span>
                  </h1>

                  <p className="mt-3 max-w-md text-[13px] leading-6 text-[#A7B0BA]">
                    Create a new secure password for your CyberOrbit account.
                    Your credentials will be updated through the protected
                    authentication gateway.
                  </p>
                </div>

                {/* Security visual */}
                <div className="relative hidden h-24 w-24 shrink-0 sm:block">
                  <div className="absolute inset-0 rounded-full border border-[#67E8F9]/15" />

                  <div className="absolute inset-2 rounded-full border border-[#67E8F9]/20" />

                  <div className="absolute inset-4 rounded-full border border-[#D4AF37]/30" />

                  <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[#67E8F9]/45 bg-[#070C12] shadow-[0_0_24px_rgba(103,232,249,0.08)]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-5 w-5 text-[#67E8F9]"
                    >
                      <path
                        d="M7 10V7a5 5 0 0 1 10 0v3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <rect
                        x="4"
                        y="10"
                        width="16"
                        height="10"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M12 14v2"
                        stroke="#D4AF37"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <span className="absolute right-1 top-3 h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_9px_rgba(103,232,249,0.8)]" />

                  <span className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_9px_rgba(212,175,55,0.8)]" />
                </div>
              </div>

              {/* Status pills */}
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#67E8F9]">
                  Secure Reset
                </span>

                <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                  Identity Verified
                </span>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="relative z-10 space-y-5 p-6 sm:p-8"
            >
              {/* New Password */}
              <div>
                <label className="mb-2 block text-[12px] font-mono uppercase tracking-[0.14em] text-[#7F8A96]">
                  New Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-xl border border-white/10 bg-[#070C12] px-4 py-3.5 text-[14px] text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#7F8A96] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
                />

                <p className="mt-2 text-[11px] leading-5 text-[#7F8A96]">
                  Use 12–128 characters.
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="mb-2 block text-[12px] font-mono uppercase tracking-[0.14em] text-[#7F8A96]">
                  Confirm Password
                </label>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-white/10 bg-[#070C12] px-4 py-3.5 text-[14px] text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#7F8A96] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3.5 text-[13px] leading-5 text-red-400 shadow-[0_8px_25px_rgba(239,68,68,0.04)]">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-400/30 text-[10px]">
                      !
                    </span>

                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Success */}
              {message && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 text-[13px] leading-5 text-emerald-400 shadow-[0_8px_25px_rgba(16,185,129,0.04)]">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 text-[10px]">
                      ✓
                    </span>

                    <span>{message}</span>
                  </div>
                </div>
              )}

              {/* Update Password */}
              <button
                type="submit"
                disabled={loading}
                className={`group/submit relative w-full overflow-hidden rounded-xl px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.12em] transition-all duration-300 ${
                  loading
                    ? "cursor-not-allowed bg-[#67E8F9]/50 text-[#03070C]/70"
                    : "bg-[#67E8F9] text-[#03070C] shadow-[0_10px_35px_rgba(103,232,249,0.12)] hover:-translate-y-0.5 hover:bg-[#8AF0FF] hover:shadow-[0_14px_42px_rgba(103,232,249,0.18)]"
                }`}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#03070C]/30 border-t-[#03070C]" />
                  )}

                  {loading ? "Updating Password..." : "Update Password"}
                </span>
              </button>

              {/* Security note */}
              <div className="rounded-xl border border-white/10 bg-[#070C12] p-4 transition-all duration-300 hover:border-[#D4AF37]/25 hover:bg-[#080E15]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4 text-[#D4AF37]"
                    >
                      <path
                        d="M12 3 5 6v5c0 4.5 2.9 8.1 7 10 4.1-1.9 7-5.5 7-10V6l-7-3Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9 12 2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#D4AF37]">
                      Security Protocol
                    </p>

                    <p className="mt-1 text-[12px] leading-5 text-[#7F8A96]">
                      Your new password is transmitted only through the
                      protected authentication endpoint.
                    </p>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="relative z-10 border-t border-white/10 px-6 py-5 sm:px-8">
              <button
                type="button"
                onClick={handleBackToLogin}
                className="group mx-auto flex items-center justify-center gap-2 text-[12px] font-mono uppercase tracking-[0.14em] text-[#67E8F9] transition-all duration-300 hover:text-[#8AF0FF]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1"
                >
                  <path
                    d="M19 12H5M12 19l-7-7 7-7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back to Login
              </button>
            </div>
          </div>

          {/* Bottom system status */}
          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[#56616D]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
            CyberOrbit Authentication Gateway Online
          </div>
        </div>
      </div>
    </div>
  );
}
