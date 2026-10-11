import React, { useState } from "react";
import { KeyRound, CheckCircle2, X } from "lucide-react";

export const AccessRequestModal = ({
  isOpen,
  onClose,
  currentUser,
  resources = [],
  onSubmitted,
}) => {
  const [selectedResourceId, setSelectedResourceId] = useState(
    resources[0]?.id || "",
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const selectedResource = resources.find((r) => r.id === selectedResourceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please provide a business justification.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          resourceId: selectedResourceId,
          reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSubmitted?.();
          onClose();
        }, 1200);
      } else {
        setError(data.error?.message || "Failed to submit access request.");
      }
    } catch (err) {
      setError("Network connection error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03070C]/80 p-4 backdrop-blur-md">
      <div className="group relative w-full max-w-xl overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] text-[#F4F7FA] shadow-[0_24px_90px_rgba(0,0,0,0.45)] transition-all duration-300 hover:border-[#67E8F9]/75 hover:shadow-[0_28px_100px_rgba(103,232,249,0.10)]">
        {/* Technical grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.7) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Master theme corner accents */}
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />
        <div className="pointer-events-none absolute left-10 right-10 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/70 to-transparent" />
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Close access request modal"
          className="absolute right-5 top-5 z-20 rounded-xl border border-white/10 bg-[#070C12] p-2 text-[#7F8A96] transition-all duration-300 hover:border-[#67E8F9]/40 hover:bg-[#67E8F9]/5 hover:text-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative z-10 border-b border-white/10 px-6 pb-5 pt-6 pr-16 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/30 bg-[#070C12] shadow-[0_0_24px_rgba(103,232,249,0.06)]">
              <KeyRound className="h-5 w-5 text-[#67E8F9]" />
            </div>

            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#D4AF37]">
                Zero Trust Access Control
              </p>

              <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA] sm:text-[28px]">
                Request Resource <span className="text-[#67E8F9]">Access</span>
              </h3>

              <p className="mt-1.5 text-[13px] leading-5 text-[#A7B0BA]">
                Zero Trust Least-Privilege Access Authorization
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#67E8F9]/20 bg-[#67E8F9]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-[#67E8F9]">
              PEP ACTIVE
            </span>
            <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-[#D4AF37]">
              JIT EVALUATION
            </span>
          </div>
        </div>

        {success ? (
          <div className="relative z-10 m-6 rounded-xl border border-emerald-400/25 bg-[#070C12] p-8 text-center shadow-[0_14px_45px_rgba(0,0,0,0.16)] sm:m-7">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/5 shadow-[0_0_30px_rgba(52,211,153,0.08)]">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>

            <p className="mt-5 text-xl font-medium tracking-tight text-[#F4F7FA]">
              Access Request Queued
            </p>

            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-[#A7B0BA]">
              Queued for administrative evaluation. Policy engine evaluated
              initial risk.
            </p>

            <div className="mx-auto mt-5 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-emerald-400">
              Evaluation Submitted
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="relative z-10 space-y-5 p-6 sm:p-7"
          >
            <div className="rounded-xl border border-white/10 bg-[#070C12] p-4 text-sm transition-all duration-300 hover:border-[#67E8F9]/20 hover:bg-[#080E15]">
              <div className="flex items-start sm:items-center justify-between gap-4 py-1.5 border-b border-white/10">
                <span className="text-[#7F8A96] text-xs tracking-wide">
                  REQUESTER:
                </span>
                <span className="font-semibold text-[#F4F7FA] text-right">
                  {currentUser?.name} ({currentUser?.employeeId})
                </span>
              </div>

              <div className="flex items-start sm:items-center justify-between gap-4 py-1.5">
                <span className="text-[#7F8A96] text-xs tracking-wide">
                  DEPARTMENT:
                </span>
                <span className="text-[#67E8F9] text-right">
                  {currentUser?.department}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[12px] font-mono uppercase tracking-[0.14em] text-[#7F8A96]">
                Target Enterprise Resource
              </label>

              <select
                value={selectedResourceId}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#070C12] px-3.5 py-3 text-[13px] text-[#F4F7FA] outline-none transition-all duration-300 hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
              >
                {resources.map((r) => (
                  <option
                    key={r.id}
                    value={r.id}
                    className="bg-[#070C12] text-[#F4F7FA]"
                  >
                    [{r.department}] {r.name} ({r.sensitivity})
                  </option>
                ))}
              </select>
            </div>

            {selectedResource && (
              <div className="rounded-xl border border-white/10 bg-[#070C12] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all duration-300 hover:border-[#67E8F9]/20 hover:bg-[#080E15]">
                <p className="text-sm text-[#A7B0BA] leading-relaxed">
                  {selectedResource.description}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs px-2.5 py-1 border border-[#67E8F9]/30 rounded-full text-[#67E8F9]">
                    Sensitivity: {selectedResource.sensitivity}
                  </span>

                  {selectedResource.department !== currentUser?.department && (
                    <span className="text-xs px-2.5 py-1 border border-amber-400/30 rounded-full text-amber-300 bg-amber-400/5">
                      Cross-Department Request
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-[12px] font-mono uppercase tracking-[0.14em] text-[#7F8A96]">
                Business Justification
              </label>

              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Detail operational justification, ticket ID, or access timeframe..."
                className="w-full resize-none rounded-xl border border-white/10 bg-[#070C12] p-3.5 text-[13px] leading-5 text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#7F8A96] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-1 focus:ring-[#67E8F9]/20"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-[13px] leading-5 text-red-400">
                {error}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-white/10 bg-[#070C12] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#A7B0BA] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/40 hover:bg-[#080E15] hover:text-[#F4F7FA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-4 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#03070C] shadow-[0_10px_30px_rgba(103,232,249,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#8AF0FF] hover:shadow-[0_14px_38px_rgba(103,232,249,0.16)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "EVALUATING..." : "SUBMIT REQUEST"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
