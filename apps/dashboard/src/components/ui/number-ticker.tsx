"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";

// A count-up number (Magic UI vocabulary). Springs from 0 to `value` once it scrolls into
// view, then formats each frame via `format` (so money/units stay branded + tabular).
// Honors prefers-reduced-motion: it renders the final value directly, with no animation.

export interface NumberTickerProps {
  value: number;
  /** Format the in-flight number for display (e.g. whole dollars, "183"). Default: rounded. */
  format?: (n: number) => string;
  /** Spring settle time feel. */
  duration?: number;
  className?: string;
}

export function NumberTicker({
  value,
  format = (n) => String(Math.round(n)),
  duration = 1.2,
  className,
}: NumberTickerProps) {
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
