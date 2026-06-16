"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import { formatUsdWhole } from "@/lib/format/money";

// A count-up number (Magic UI vocabulary). Springs from 0 to `value` once it scrolls into
// view, then formats each frame for display (so money/units stay branded + tabular).
// Honors prefers-reduced-motion: it renders the final value directly, with no animation.

// `format` is a SERIALIZABLE token, not a function: this is a Client Component, and a
// Server Component (e.g. HomeOverview) renders it, so a function prop would throw
// "Functions cannot be passed directly to Client Components". The formatter is resolved
// here on the client from the token instead.
export type NumberFormat = "number" | "usdWhole";

const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
  number: (n) => String(Math.round(n)),
  // value is integer US cents (AR-6); formatUsdWhole renders whole dollars.
  usdWhole: (n) => formatUsdWhole(Math.round(n)),
};

export interface NumberTickerProps {
  value: number;
  /** How to format the in-flight number for display. Default: rounded integer. */
  format?: NumberFormat;
  /** Spring settle time feel. */
  duration?: number;
  className?: string;
}

export function NumberTicker({
  value,
  format: formatKey = "number",
  duration = 1.2,
  className,
}: NumberTickerProps) {
  const format = FORMATTERS[formatKey];
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 24, duration });
  const [display, setDisplay] = useState(() => format(0));

  // Trigger the count-up when the number scrolls into view (never under reduced motion).
  useEffect(() => {
    if (inView && !reduce) motionValue.set(value);
  }, [inView, value, motionValue, reduce]);

  // Subscribe to the spring; setState lives in the subscription callback (the recommended
  // pattern), not synchronously in the effect body.
  useEffect(() => spring.on("change", (latest) => setDisplay(format(latest))), [spring, format]);

  // Reduced motion (or no JS animation wanted): render the final value, no machinery.
  if (reduce) {
    return (
      <span ref={ref} className={className}>
        {format(value)}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
