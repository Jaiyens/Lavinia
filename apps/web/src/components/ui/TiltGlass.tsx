"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * TiltGlass, a frosted-glass surface that tilts toward the cursor and
 * carries a soft highlight that follows the pointer. Uses native pointer
 * listeners for reliability. Honors reduced motion.
 */
export function TiltGlass({
  children,
  className = "",
  max = 7,
  glow = true,
  surface = true,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  glow?: boolean;
  surface?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rx = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const ry = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const px = useMotionValue(50);
  const py = useMotionValue(50);

  const transform = useMotionTemplate`perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${px}% ${py}%, rgba(255,255,255,0.55), transparent 45%)`;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width;
      const cy = (e.clientY - r.top) / r.height;
      ry.set((cx - 0.5) * max * 2);
      rx.set((0.5 - cy) * max * 2);
      px.set(cx * 100);
      py.set(cy * 100);
    };
    const onLeave = () => {
      rx.set(0);
      ry.set(0);
      px.set(50);
      py.set(50);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduce, max, rx, ry, px, py]);

  return (
    <motion.div
      ref={ref}
      style={reduce ? undefined : { transform, transformStyle: "preserve-3d" }}
      className={`group relative isolate rounded-3xl ${surface ? "glass glass-rim overflow-hidden" : ""} ${className}`}
    >
      {surface && glow && !reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: sheen }}
        />
      )}
      <div className="relative z-10" style={reduce ? undefined : { transform: "translateZ(40px)" }}>
        {children}
      </div>
    </motion.div>
  );
}
