
import React from "react";

export const TrustGauge = ({
  score,
  size = "md",
  showLabel = true,
}) => {
  // Normalize and clamp score between 0 and 100.
  const numericScore = Number(score);
  const clamped = Number.isFinite(numericScore)
    ? Math.max(0, Math.min(100, numericScore))
    : 0;

  // CyberOrbit trust hierarchy:
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

  // Gauge dimensions
  const radius = size === "sm" ? 24 : size === "lg" ? 52 : 36;
  const stroke = size === "sm" ? 3 : size === "lg" ? 6 : 5;

  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (clamped / 100) * circumference;

  const dimension = radius * 2;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center">
        <svg
          height={dimension}
          width={dimension}
          viewBox={`0 0 ${dimension} ${dimension}`}
          className="-rotate-90 transform"
          role="img"
          aria-label={`Trust score ${clamped} out of 100`}
        >
          {/* Background Track */}
          <circle
            stroke="rgba(255, 255, 255, 0.10)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />

          {/* Animated Trust Value */}
          <circle
            stroke={strokeColor}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            style={{
              transition:
                "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
            }}
          />
        </svg>

        {/* Score */}
        <div className="absolute flex flex-col items-center">
          <span
            className={`
              font-semibold
              tracking-tight
              ${textColor}
              ${
                size === "sm"
                  ? "text-sm"
                  : size === "lg"
                    ? "text-3xl"
                    : "text-lg"
              }
            `}
          >
            {clamped}
          </span>

          {size === "lg" && (
            <span className="text-xs tracking-wide text-[#7F8A96]">
              / 100
            </span>
          )}
        </div>
      </div>

      {/* Trust Rating */}
      {showLabel && (
        <span
          className={`
            mt-2
            text-xs
            font-medium
            uppercase
            tracking-wide
            ${textColor}
          `}
        >
          {rating}
        </span>
      )}
    </div>
  );
};
