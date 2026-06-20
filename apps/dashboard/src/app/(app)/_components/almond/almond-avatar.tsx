"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export type AlmondState = "idle" | "thinking" | "done";

// How far the pupils may drift from rest (in the SVG's user units), and the distance over which the
// gaze ramps to full deflection. Tuned so the eyes clearly "look" without leaving the nut.
const GAZE_MAX_X = 3.4;
const GAZE_MAX_Y = 2.6;
const GAZE_RAMP_PX = 120;

/**
 * Almond, the farm agent's face: the warm almond nut with a green sprout, drawn inline so it
 * scales crisply and tints to the brand. `state` switches the expression (idle / thinking /
 * done); `onDark` lightens the sprout for the dark-green launcher button ("On the button").
 *
 * Signs of life (the CSS ones live in `globals.css`, all frozen by the reduced-motion block):
 *   - The idle face blinks occasionally (`.almond-eyes`), everywhere the mascot appears.
 *   - `animated` adds a gentle breathing bob to the idle glyph — used on the big surfaces (the
 *     /almond page hero and the panel header) where the motion reads; left off on tiny nav glyphs.
 *   - `trackCursor` makes the idle eyes FOLLOW the pointer (the pupils drift toward it). Opt-in, so
 *     only the hero / launcher / panel mascots watch the cursor, not every tiny nav glyph. It is
 *     JS-driven, so it is gated on prefers-reduced-motion here (the CSS block cannot freeze it).
 *   - The thinking face's thought bubbles drift up and the done face's sparkle twinkles.
 *
 * Art of record: DESIGN.md `almond-mascot` and the state board at `public/almond.svg`.
 */
export function AlmondAvatar({
  size = 28,
  state = "idle",
  onDark = false,
  animated = false,
  trackCursor = false,
  className,
}: {
  size?: number;
  state?: AlmondState;
  onDark?: boolean;
  /** Add the breathing bob to the idle glyph (for the larger hero/header surfaces). */
  animated?: boolean;
  /** Make the idle eyes follow the pointer (hero / launcher / panel surfaces only). */
  trackCursor?: boolean;
  className?: string;
}) {
  const stem = onDark ? "#4E9A63" : "#1F3D2B";
  const leafBack = onDark ? "#3E7A52" : "#274E37";
  const leafFront = onDark ? "#4E9A63" : "#1F3D2B";
  const label =
    state === "thinking" ? "Almond, thinking" : state === "done" ? "Almond, done" : "Almond";

  const svgRef = useRef<SVGSVGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const reduce = useReducedMotion();
  // Only the idle face has pupils to move, and only when asked and motion is allowed.
  const gazing = trackCursor && state === "idle" && !reduce;

  useEffect(() => {
    const pupils = pupilsRef.current;
    if (!gazing || !pupils) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    const apply = () => {
      raf = 0;
      pupilsRef.current?.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
    };
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      // Unit vector toward the cursor, scaled by a 0..1 ramp so the gaze is gentle up close and
      // reaches full deflection once the pointer is a little away. Coalesced into one rAF per frame.
      const mag = Math.min(1, dist / GAZE_RAMP_PX);
      tx = (dx / dist) * GAZE_MAX_X * mag;
      ty = (dy / dist) * GAZE_MAX_Y * mag;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      // Return the eyes to rest when tracking stops (state change, unmount, reduced-motion).
      pupils.removeAttribute("transform");
    };
  }, [gazing]);

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="-10 -1 150 150"
      fill="none"
      role="img"
      aria-label={label}
      className={cn("shrink-0", animated && state === "idle" && "almond-bob", className)}
    >
      {/* Sprout */}
      <path d="M60 33 L60 18" stroke={stem} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 22 C52 16 43 18 41 24 C48 29 56 28 60 22 Z" fill={leafBack} />
      <path d="M60 19 C68 11 79 11 83 17 C77 25 66 26 60 19 Z" fill={leafFront} />

      {/* Nut body */}
      <path
        d="M60 34 C80 38 98 56 96 90 C94 118 78 138 60 138 C42 138 26 118 24 90 C22 56 40 38 60 34 Z"
        fill="#D9A36A"
      />
      <ellipse cx="48" cy="70" rx="22" ry="30" fill="#EFCB97" opacity="0.5" />
      <ellipse cx="78" cy="106" rx="18" ry="26" fill="#BE8049" opacity="0.45" />
      <path
        d="M60 34 C80 38 98 56 96 90 C94 118 78 138 60 138 C42 138 26 118 24 90 C22 56 40 38 60 34 Z"
        fill="none"
        stroke="#B5793F"
        strokeWidth="1"
        opacity="0.35"
      />
      <path
        d="M60 46 C66 70 66 108 60 126"
        stroke="#A8703A"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* Face — switches by state */}
      {state === "done" ? (
        <>
          <path d="M44 89 Q50 83 56 89" stroke="#3A2A1C" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M64 89 Q70 83 76 89" stroke="#3A2A1C" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M49 99 Q60 110 71 99" stroke="#3A2A1C" strokeWidth="2.8" strokeLinecap="round" />
          <path
            className="almond-sparkle"
            d="M96 40 L98.5 46 L104.5 48.5 L98.5 51 L96 57 L93.5 51 L87.5 48.5 L93.5 46 Z"
            fill="#C98A2B"
          />
        </>
      ) : state === "thinking" ? (
        <>
          <circle cx="51" cy="84" r="4.6" fill="#3A2A1C" />
          <circle cx="69" cy="84" r="4.6" fill="#3A2A1C" />
          <path d="M55 101 Q60 103 65 101" stroke="#3A2A1C" strokeWidth="2.2" strokeLinecap="round" />
          {/* Thought bubbles drift up and fade in turn while Almond is thinking. */}
          <g className="almond-thoughts">
            <circle cx="88" cy="48" r="3.4" fill="#C98A2B" />
            <circle cx="98" cy="39" r="3.4" fill="#C98A2B" />
            <circle cx="108" cy="30" r="3.4" fill="#C98A2B" />
          </g>
        </>
      ) : (
        <>
          <ellipse cx="40" cy="99" rx="6.5" ry="4" fill="#E0875A" opacity="0.32" />
          <ellipse cx="80" cy="99" rx="6.5" ry="4" fill="#E0875A" opacity="0.32" />
          {/* Eyes (with their catch-light dots) grouped so both lids drop together on the blink
              keyframe; the cheeks and smile stay still. Frozen under reduced-motion. The inner
              group is what `trackCursor` translates so the pupils follow the pointer — nested so the
              blink (which scales the outer group) and the gaze stay independent. */}
          <g className="almond-eyes">
            <g ref={pupilsRef}>
              <circle cx="50" cy="88" r="5.5" fill="#3A2A1C" />
              <circle cx="48.3" cy="86.4" r="1.7" fill="#fff" opacity="0.85" />
              <circle cx="70" cy="88" r="5.5" fill="#3A2A1C" />
              <circle cx="68.3" cy="86.4" r="1.7" fill="#fff" opacity="0.85" />
            </g>
          </g>
          <path d="M51 101 Q60 109 69 101" stroke="#3A2A1C" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
