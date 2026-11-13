
import React from "react";
import { BrainCircuit, ShieldCheck } from "lucide-react";

export function ConsoleHeader({
  title,
  description,
  kind = "security",
}) {
  const isAI = kind === "ai";
  const Icon = isAI ? BrainCircuit : ShieldCheck;

  const accent = "#67E8F9";

  return (
    <header
      className={`relative mb-7 overflow-hidden rounded-2xl border bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 sm:p-6 lg:p-7 ${
        isAI
          ? "border-[#67E8F9]/25 hover:border-[#67E8F9]/45"
          : "border-[#67E8F9]/25 hover:border-[#67E8F9]/40"
      }`}
    >
      {/* Subtle background accent */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full opacity-[0.07] blur-3xl"
        style={{ backgroundColor: accent }}
      />

      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67E8F9]/60 to-transparent" />

      <div className="relative flex items-start gap-4 sm:gap-5">
        {/* Section icon */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border sm:h-14 sm:w-14 ${
            isAI
              ? "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]"
              : "border-[#67E8F9]/25 bg-[#67E8F9]/[0.07] text-[#67E8F9]"
          }`}
        >
          <Icon size={25} strokeWidth={1.6} />
        </div>

        {/* Heading content */}
        <div className="min-w-0 flex-1">
          <div
            className={`mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-[11px] ${
              isAI ? "text-[#67E8F9]" : "text-[#67E8F9]"
            }`}
          >
            <span>
              {isAI
                ? "Machine Learning Intelligence"
                : "Zero Trust Operations"}
            </span>

            <span className="h-1 w-1 rounded-full bg-[#D4AF37]" />

            <span className="text-[#687581]">
              CyberOrbit Console
            </span>
          </div>

          <h1 className="break-words text-2xl font-semibold tracking-tight text-[#F4F7FA] sm:text-3xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#A7B0BA] sm:text-[13px]">
              {description}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

export default ConsoleHeader;
