import React from "react";

export const TrustGauge = ({ score, size = "md", showLabel = true }) => {
  const clamped = Math.max(0, Math.min(100, score));

  // CyberOrbit single-theme trust hierarchy:
  // Cyan = healthy/primary, Gold = conditional/elevated, Red = untrusted.
  let strokeColor = "#67E8F9";
  let textColor = "text-[#67E8F9]";
  let rating = "EXEMPLARY TRUST";

  if (clamped < 40) {
    strokeColor = "#ef4444";
    textColor = "text-red-400";
    rating = "UNTRUSTED";
  } else if (clamped < 65) {
    strokeColor = "#f59e0b";
    textColor = "text-amber-400";
    rating = "DEGRADED";
  } else if (clamped < 80) {
    strokeColor = "#D4AF37";
    textColor = "text-[#D4AF37]";
    rating = "CONDITIONAL";
  }

  const radius = size === "sm" ? 24 : size === "lg" ? 52 : 36;
  const stroke = size === "sm" ? 3 : size === "lg" ? 6 : 5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const dimension = radius * 2;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center">
        <svg
          height={dimension}
          width={dimension}
          className="transform -rotate-90"
          aria-label={`Trust score ${clamped} out of 100`}
        >
          {/* Subtle dark-theme track */}
          <circle
            stroke="rgba(255, 255, 255, 0.10)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />

          {/* Animated trust value */}
          <circle
            stroke={strokeColor}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
            }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span
            className={`font-semibold tracking-tight ${textColor} ${
              size === "sm" ? "text-sm" : size === "lg" ? "text-3xl" : "text-lg"
            }`}
          >
            {clamped}
          </span>

          {size === "lg" && (
            <span className="text-xs tracking-wide text-[#7F8A96]">/ 100</span>
          )}
        </div>
      </div>

      {showLabel && (
        <span
          className={`mt-2 text-xs font-medium uppercase tracking-wide ${textColor}`}
        >
          {rating}
        </span>
      )}
    </div>
  );
};
