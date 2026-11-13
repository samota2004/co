
import React, { useEffect, useState } from 'react';
import { requestApi } from '../services/api.js';

export function MfaChallengeModal({ isOpen, onClose, onSuccess, reason }) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setChallenge(null);
      setCode('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function send() {
    setBusy(true);
    setError('');

    try {
      setChallenge(
        await requestApi('/api/auth/mfa/challenge', {
          method: 'POST',
          body: {}
        })
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await requestApi('/api/auth/mfa/verify', {
        method: 'POST',
        body: {
          challengeId: challenge.challengeId,
          otp: code
        }
      });

      localStorage.setItem('zero_trust_token', data.token);
      onSuccess?.();
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Email verification"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#67E8F9]/25 bg-[#050A10] shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
      >
        {/* Decorative accents */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/80 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-[#67E8F9]/[0.06] blur-3xl" />

        <div className="relative space-y-6 p-6 sm:p-7">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/[0.08] text-[#67E8F9]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                  <path d="M8 3h8" />
                </svg>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#67E8F9]">
                  CyberOrbit Security
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F7FA]">
                  Verify Resource Access
                </h2>
              </div>
            </div>

            <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              MFA
            </span>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A7B0BA]">
                Additional verification required
              </span>
            </div>

            <p className="text-sm leading-relaxed text-[#C5CDD5]">
              {reason || 'Policy requires recent email MFA.'}
            </p>
          </div>

          {/* Security information */}
          <div className="flex items-start gap-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>

            <p className="text-xs leading-relaxed text-[#87939F]">
              Verify your identity using the six-digit code sent to your
              registered email address.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] p-3.5"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>

              <p className="text-sm leading-relaxed text-red-300">
                {error}
              </p>
            </div>
          )}

          {/* OTP request / verification */}
          {!challenge ? (
            <div className="space-y-4">
              <button
                type="button"
                disabled={busy}
                onClick={send}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/40 bg-[#67E8F9] px-5 py-3.5 text-sm font-semibold text-[#03070C] shadow-[0_8px_25px_rgba(103,232,249,0.12)] transition-all duration-200 hover:bg-[#A5F3FC] hover:shadow-[0_10px_30px_rgba(103,232,249,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#03070C]/30 border-t-[#03070C]" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 2 11 13" />
                      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
                    </svg>
                    Send Email Verification Code
                  </>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={verify} className="space-y-5">
              {challenge.developmentOtp && (
                <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#D4AF37]">
                    Local Development Code
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tracking-[0.2em] text-[#F4F7FA]">
                    {challenge.developmentOtp}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="mfa-otp-code"
                  className="block text-xs font-semibold uppercase tracking-[0.13em] text-[#A7B0BA]"
                >
                  Six-digit verification code
                </label>

                <input
                  id="mfa-otp-code"
                  name="otp"
                  type="text"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#080F17] px-4 py-4 text-center font-mono text-xl font-semibold tracking-[0.45em] text-[#67E8F9] outline-none transition-all placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#596572] focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10"
                />

                <p className="text-[11px] text-[#77838F]">
                  Enter the verification code received in your email.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#67E8F9]/40 bg-[#67E8F9] px-5 py-3.5 text-sm font-semibold text-[#03070C] transition-all duration-200 hover:bg-[#A5F3FC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#03070C]/30 border-t-[#03070C]" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Continue
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.07] pt-4">
            <p className="text-[10px] text-[#697581]">
              Protected by Zero Trust Security
            </p>

            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs font-medium text-[#A7B0BA] transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
