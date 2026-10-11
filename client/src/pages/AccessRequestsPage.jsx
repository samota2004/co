import React, { useState } from "react";
import {requestApi} from '../services/api.js';

import { StatusBadge } from "../components/Badges";

import {
  Plus,
  Check,
  X,
  ShieldCheck,
  KeyRound,
  Activity,
  LockKeyhole,
} from "lucide-react";

import { AccessRequestModal } from "../components/AccessRequestModal";

export const AccessRequestsPage = ({
  requests,
  currentUser,
  resources,
  onRefreshData,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [error,setError]=useState('');

  const handleApprove = async (requestId) => {
    try {
      setProcessingId(requestId);

      const response=await fetch(`/api/access-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes:
            reviewNotes[requestId] || "Approved after context verification.",
        }),
      });
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error?.message||'Review failed.');
      onRefreshData();
    } catch (err) {
      console.error("Failed to approve request", err);
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId) => {
    try {
      setProcessingId(requestId);

      const response=await fetch(`/api/access-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes:
            reviewNotes[requestId] ||
            "Rejected due to least-privilege boundary.",
        }),
      });
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error?.message||'Review failed.');
      onRefreshData();
    } catch (err) {
      console.error("Failed to reject request", err);
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">
      {error&&<p role="alert" className="text-red-400">{error}</p>}
      {/* Master Settings-style hero */}
      <section className="console-hero group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div className="pointer-events-none absolute left-0 top-0 h-16 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.45)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_18px_rgba(103,232,249,0.45)]" />

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.8) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />

        {/* Access governance visual */}
        <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-[48%] overflow-hidden lg:block">
          <div className="absolute right-[-40px] top-1/2 h-[290px] w-[290px] -translate-y-1/2 rounded-full border border-[#67E8F9]/10" />
          <div className="absolute right-[20px] top-1/2 h-[220px] w-[220px] -translate-y-1/2 rounded-full border border-[#D4AF37]/15" />
          <div className="absolute right-[72px] top-1/2 h-[145px] w-[145px] -translate-y-1/2 rounded-full border border-[#67E8F9]/20" />

          <div className="absolute right-[125px] top-1/2 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/35 bg-[#070C12]/90 shadow-[0_0_45px_rgba(103,232,249,0.10)]">
            <KeyRound className="h-9 w-9 text-[#67E8F9]" />
          </div>

          <div className="absolute right-[94px] top-[24%] flex items-center gap-2 rounded-full border border-[#67E8F9]/20 bg-[#070C12]/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#67E8F9]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
            JIT ACCESS
          </div>

          <div className="absolute right-[35px] bottom-[23%] flex items-center gap-2 rounded-full border border-[#D4AF37]/20 bg-[#070C12]/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#D4AF37]">
            <ShieldCheck className="h-3 w-3" />
            LEAST PRIVILEGE
          </div>
        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[72%]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.7)]" />
                Governance & Approval Workflow
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                Just-In-Time (JIT) Least Privilege
              </span>
            </div>

            <h1 className="mt-3 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Resource Access <span className="text-[#67E8F9]">Petitions</span>
            </h1>

            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Review cross-department access petitions with AI-assisted risk
              evaluations. High-risk actions hold access until explicit manager
              or SOC lead approval.
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="absolute bottom-7 right-7 z-20 inline-flex items-center gap-2 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#03070C] shadow-[0_8px_30px_rgba(103,232,249,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-transparent hover:text-[#67E8F9] hover:shadow-[0_12px_35px_rgba(103,232,249,0.16)] sm:right-9 sm:bottom-9"
          >
            <Plus className="h-4 w-4" />
            <span>New Petition</span>
          </button>
        </div>
      </section>

      {/* Queue status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050A10] px-5 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#67E8F9]/20 bg-[#070C12]">
            <Activity className="h-4 w-4 text-[#67E8F9]" />
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#67E8F9]">
              Access Governance Queue
            </p>
            <p className="mt-0.5 text-[12px] text-[#7F8A96]">
              Review requests against current policy and risk context.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#D4AF37]">
          {requests.length} Petition{requests.length === 1 ? "" : "s"} in Queue
        </div>
      </div>

      {/* Requests Stream */}
      <div className="space-y-4">
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#050A10] p-16 text-center text-[13px] uppercase tracking-[0.14em] text-[#7F8A96] shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
            <ShieldCheck className="mx-auto mb-4 h-8 w-8 text-[#67E8F9]/60" />
            No Pending Access Petitions in Queue
          </div>
        ) : (
          requests.map((req) => {
            const isPending = req.status === "PENDING";

            return (
              <div
                key={req.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/30 hover:bg-[#070C12] hover:shadow-[0_22px_65px_rgba(103,232,249,0.07)] sm:p-6 lg:p-7"
              >
                <div className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#67E8F9] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="text-[13px] font-semibold tracking-wide text-[#67E8F9]">
                      {req.id}
                    </span>

                    <span className="text-[#7F8A96]">•</span>

                    <span className="text-[15px] font-medium text-[#F4F7FA]">
                      {req.userName}
                    </span>

                    <span className="text-[12px] text-[#7F8A96]">
                      [{req.userDepartment}]
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12px] text-[#7F8A96]">
                      Risk at Request:
                    </span>

                    <span
                      className={`font-semibold ${
                        req.riskScoreAtRequest >= 60
                          ? "text-amber-400"
                          : "text-[#67E8F9]"
                      }`}
                    >
                      {req.riskScoreAtRequest}/100
                    </span>

                    <StatusBadge status={req.status} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="group/asset rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#050A10]">
                    <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[#67E8F9]">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      Requested Target Asset
                    </span>

                    <p className="mt-3 text-[17px] font-medium text-[#F4F7FA]">
                      {req.resourceName}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-2 text-[12px] text-[#7F8A96]">
                      <span>Owner Dept: {req.resourceDepartment}</span>
                      <span>•</span>
                      <span className="font-semibold text-amber-400">
                        {req.resourceSensitivity}
                      </span>
                    </div>
                  </div>

                  <div className="group/justification rounded-xl border border-white/10 bg-[#070C12] p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#050A10]">
                    <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[#67E8F9]">
                      <Activity className="h-3.5 w-3.5" />
                      Business Justification
                    </span>

                    <p className="mt-3 text-[13px] leading-6 italic text-[#A7B0BA]">
                      "{req.reason}"
                    </p>

                    <span className="block pt-2 text-[12px] text-[#7F8A96]">
                      Submitted at {new Date(req.requestedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {req.aiRiskAssessment && (
                  <div className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-[#070C12] p-5 text-[13px] text-[#A7B0BA] transition-all duration-300 hover:border-[#D4AF37]/35 hover:bg-[#050A10]">
                    <strong className="mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[#D4AF37]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Policy Engine Context Analysis
                    </strong>

                    <p className="leading-6 text-[#A7B0BA]">
                      {req.aiRiskAssessment}
                    </p>
                  </div>
                )}

                {isPending && ['MANAGER','SECURITY_ADMIN','SYSTEM_ADMIN'].includes(currentUser?.roleCode||currentUser?.role) && req.userId!==currentUser?.id && (
                  <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 lg:flex-row lg:items-center">
                    <input
                      type="text"
                      placeholder="Optional approval/rejection notes..."
                      value={reviewNotes[req.id] || ""}
                      onChange={(e) =>
                        setReviewNotes({
                          ...reviewNotes,
                          [req.id]: e.target.value,
                        })
                      }
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070C12] px-4 py-3 text-[13px] text-[#F4F7FA] outline-none transition-all duration-300 placeholder:text-[#7F8A96] hover:border-[#67E8F9]/20 focus:border-[#67E8F9]/50 focus:bg-[#050A10] focus:ring-1 focus:ring-[#67E8F9]/20"
                    />

                    <div className="flex w-full items-center gap-2 lg:w-auto">
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={processingId === req.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-[#070C12] px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-red-400 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-500/55 hover:bg-red-950/30 hover:shadow-[0_10px_28px_rgba(239,68,68,0.07)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 lg:flex-initial"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </button>

                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={processingId === req.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-[#03070C] shadow-[0_8px_25px_rgba(103,232,249,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-transparent hover:text-[#67E8F9] hover:shadow-[0_12px_32px_rgba(103,232,249,0.12)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 lg:flex-initial"
                      >
                        <Check className="h-4 w-4" />
                        Approve Access
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Access Request Submission Modal */}
      <AccessRequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        currentUser={currentUser}
        resources={resources}
        onSubmitted={onRefreshData}
      />
    </div>
  );
};
