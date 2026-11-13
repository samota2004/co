
import React from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';

// Contain page failures so navigation and account controls remain available.
export class PageErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Console page failed:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section
        className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] px-5 py-12 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:px-8"
        role="alert"
      >
        {/* Background accents */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#67E8F9]/[0.05] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[#D4AF37]/[0.04] blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/50 to-transparent" />

        <div className="relative mx-auto flex w-full max-w-lg flex-col items-center text-center">

          {/* Error icon */}
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] shadow-[0_0_35px_rgba(212,175,55,0.06)]">
            <AlertTriangle
              size={30}
              strokeWidth={1.6}
              className="text-[#D4AF37]"
            />
          </div>

          {/* Error heading */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D4AF37]">
            Page Recovery
          </p>

          <h1 className="text-2xl font-semibold tracking-tight text-[#F4F7FA] sm:text-3xl">
            This page could not be displayed
          </h1>

          <p className="mt-4 max-w-md text-sm leading-7 text-[#A7B0BA]">
            An unexpected error prevented this section from loading. Your
            session is still active. You can retry this page or choose another
            section from the navigation.
          </p>

          {/* Session status */}
          <div className="mt-7 flex items-center gap-2 rounded-full border border-[#67E8F9]/20 bg-[#67E8F9]/[0.06] px-4 py-2">
            <ShieldCheck size={14} className="text-[#67E8F9]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-[#67E8F9]">
              Session protection active
            </span>
          </div>

          {/* Retry */}
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-7 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#67E8F9]/40 bg-[#67E8F9] px-6 py-3 text-sm font-semibold text-[#03070C] shadow-[0_8px_25px_rgba(103,232,249,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#A5F3FC] hover:shadow-[0_12px_30px_rgba(103,232,249,0.18)]"
          >
            <RefreshCw size={16} />
            Retry Page
          </button>

          <p className="mt-5 text-[10px] text-[#66727E]">
            CyberOrbit · Zero Trust Security Framework
          </p>
        </div>
      </section>
    );
  }
}
