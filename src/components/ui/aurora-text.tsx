"use client";

import React, { memo } from "react";

/** Terra's green aurora palette. */
export const TERRA_AURORA = ["#1c6e33", "#2fa84f", "#5cbf6a", "#34d399"];

/** A slightly deeper green aurora (used on "The problem"). */
export const TERRA_AURORA_DEEP = ["#14532d", "#1c6e33", "#2fa84f", "#5cbf6a"];

/** Green-only aurora, for text sitting on dark / black backgrounds. */
export const TERRA_GREEN = ["#1c6e33", "#228a3e", "#2fa84f", "#15803d"];

/** Fresh, vibrant green gradient (the Case Study kicker). */
export const CASE_AURORA = ["#15803d", "#16a34a", "#22c55e", "#15803d"];

/**
 * AuroraText — Magic UI (magicui.design/docs/components/aurora-text).
 * Animated aurora gradient clipped to the text.
 */
interface AuroraTextProps {
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  speed?: number;
}

export const AuroraText = memo(
  ({
    children,
    className = "",
    colors = ["#FF0080", "#7928CA", "#0070F3", "#38bdf8"],
    speed = 1,
  }: AuroraTextProps) => {
    const gradientStyle: React.CSSProperties = {
      backgroundImage: `linear-gradient(135deg, ${colors.join(", ")}, ${colors[0]})`,
      backgroundSize: "200% auto",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animationDuration: `${10 / speed}s`,
    };

    return (
      <span className={`relative inline-block ${className}`}>
        <span className="sr-only">{children}</span>
        <span
          className="animate-aurora relative bg-clip-text text-transparent"
          style={gradientStyle}
          aria-hidden="true"
        >
          {children}
        </span>
      </span>
    );
  },
);

AuroraText.displayName = "AuroraText";
