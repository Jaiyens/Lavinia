"use client";

import { motion, type Transition } from "motion/react";

/**
 * BorderBeam — Magic UI (magicui.design/docs/components/border-beam).
 * A bright beam that travels around the border of the parent element.
 * Parent needs `relative` and a border radius; the beam clips to it.
 */
export function BorderBeam({
  size = 56,
  duration = 6,
  delay = 0,
  colorFrom = "#2fa84f",
  colorTo = "#5cbf6a",
  reverse = false,
  className = "",
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  reverse?: boolean;
  className?: string;
}) {
  const transition: Transition = {
    repeat: Infinity,
    ease: "linear",
    duration,
    delay: -delay,
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
    >
      <motion.div
        className={`absolute aspect-square bg-gradient-to-l from-[var(--beam-from)] via-[var(--beam-to)] to-transparent ${className}`}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--beam-from": colorFrom,
            "--beam-to": colorTo,
          } as React.CSSProperties
        }
        initial={{ offsetDistance: reverse ? "100%" : "0%" }}
        animate={{ offsetDistance: reverse ? "0%" : "100%" }}
        transition={transition}
      />
    </div>
  );
}
