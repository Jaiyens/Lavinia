"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

/**
 * TextReveal — Magic UI (magicui.design/docs/components/text-reveal),
 * adapted to reveal in place: each word brightens from dim to full as the
 * heading scrolls up through the viewport. Scroll-linked, so it reverses.
 * Color is inherited (currentColor), so it works on any heading.
 */
export function TextReveal({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "start 0.4"],
  });
  const words = children.split(" ");

  return (
    <span ref={ref} className={`inline ${className}`}>
      {words.map((word, i) => {
        const start = i / words.length;
        const end = start + 1 / words.length;
        return (
          <RevealWord key={`${word}-${i}`} progress={scrollYProgress} range={[start, end]}>
            {word}
          </RevealWord>
        );
      })}
    </span>
  );
}

function RevealWord({
  children,
  progress,
  range,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <span className="relative mr-[0.25em] inline-block">
      <motion.span style={{ opacity }}>{children}</motion.span>
    </span>
  );
}
