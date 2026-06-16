"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import type { ReactNode } from "react";

type Tone = "brand" | "light" | "dark";

/**
 * GlassButton — Apple-style Liquid Glass. A translucent capsule that refracts
 * the content behind it, with a bright specular rim, a top highlight, a
 * cursor-tracked specular sweep, a subtle tilt, and a fluid press. Brand color
 * infuses the glass so the label stays legible. Renders an <a> when `href` is
 * set, otherwise a <button>.
 */
export function GlassButton({
  children,
  href,
  type = "button",
  onClick,
  disabled,
  tone = "brand",
  className = "",
  textClass,
  scrim = false,
}: {
  children: ReactNode;
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  tone?: Tone;
  className?: string;
  textClass?: string;
  scrim?: boolean;
}) {
  const reduce = useReducedMotion();
  const px = useMotionValue(50);
  const py = useMotionValue(50);
  const rx = useSpring(0, { stiffness: 240, damping: 16 });
  const ry = useSpring(0, { stiffness: 240, damping: 16 });

  const sheen = useMotionTemplate`radial-gradient(140px circle at ${px}% ${py}%, rgba(255,255,255,0.85), transparent 60%)`;
  const transform = useMotionTemplate`perspective(560px) rotateX(${rx}deg) rotateY(${ry}deg)`;

  function onMove(e: React.PointerEvent) {
    if (reduce) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x * 100);
    py.set(y * 100);
    ry.set((x - 0.5) * 14);
    rx.set((0.5 - y) * 14);
  }
  function onLeave() {
    px.set(50);
    py.set(50);
    rx.set(0);
    ry.set(0);
  }

  // white label only on the dark tone; light tone reads as deep navy on the
  // bluish-white glass so it stays legible without a dark scrim
  const lightText = tone === "dark";
  const text = textClass ?? (tone === "dark" ? "text-white" : tone === "light" ? "text-[#0b2545]" : "text-ink");
  const tint =
    tone === "dark"
      ? "from-ink/85 to-ink/70"
      : tone === "light"
        ? "from-[#cfe4ff]/85 to-white/45"
        : "from-accent-400/45 to-accent-700/35";

  const cls = `glass-liquid glass-rim press group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium ${text} disabled:opacity-60 ${className}`;

  const inner = (
    <>
      {/* brand color infusing the glass */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br ${tint}`}
      />
      {/* legibility scrim — dark backing so a light label reads over any background */}
      {scrim && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_130%_at_50%_50%,rgba(0,0,0,0.5),rgba(0,0,0,0.16)_85%)]"
        />
      )}
      {/* top specular highlight (glass thickness) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/35 to-transparent"
      />
      {/* cursor-tracked specular sweep — only on hover, so it never washes out the label */}
      {!reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: sheen }}
        />
      )}
      <span
        className={`relative z-10 inline-flex items-center gap-2 ${
          lightText ? "[text-shadow:0_1px_3px_rgba(9,9,11,0.5)]" : ""
        }`}
      >
        {children}
      </span>
    </>
  );

  const style = reduce ? undefined : { transform };

  if (href) {
    return (
      <motion.a
        href={href}
        onClick={onClick}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={style}
        className={cls}
      >
        {inner}
      </motion.a>
    );
  }
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={style}
      className={cls}
    >
      {inner}
    </motion.button>
  );
}
