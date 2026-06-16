"use client";

import { useId } from "react";

/**
 * DotPattern — Magic UI (magicui.design/docs/components/dot-pattern).
 * A dotted SVG background that fills the parent. Style the dots with a
 * fill-* class and fade the edges with a mask-image utility.
 */
export function DotPattern({
  width = 18,
  height = 18,
  cx = 1,
  cy = 1,
  cr = 1,
  className = "",
}: {
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
}) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
