"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

/**
 * Highlighter — Magic UI (magicui.design/docs/components/highlighter),
 * adapted from rough-notation to a clean swipe: a marker stroke sweeps in
 * behind the text when it scrolls into view.
 */
export function Highlighter({
  children,
  color = "rgba(92, 191, 106, 0.38)",
  className = "",
}: {
  children: string;
  color?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduce = useReducedMotion();

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      <motion.span
        aria-hidden
        className="absolute inset-x-[-0.12em] bottom-[0.02em] top-[0.18em] -z-10 origin-left rounded-[0.18em]"
        style={{ background: color }}
        initial={{ scaleX: reduce ? 1 : 0 }}
        animate={inView ? { scaleX: 1 } : undefined}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
      {children}
    </span>
  );
}
