"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * AnimatedShinyText — Magic UI (magicui.design/docs/components/animated-shiny-text).
 * A light sheen sweeps across the text on a loop. Inherits the base text
 * color from `className`; the sheen rides on top via background-clip.
 */
export function AnimatedShinyText({
  children,
  className = "",
  shimmerWidth = 100,
}: {
  children: ReactNode;
  className?: string;
  shimmerWidth?: number;
}) {
  return (
    <span
      style={{ "--shiny-width": `${shimmerWidth}px` } as CSSProperties}
      className={`animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%] bg-gradient-to-r from-transparent via-black/80 via-50% to-transparent ${className}`}
    >
      {children}
    </span>
  );
}
