"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// The Almond mascot as inline SVG, reusing the art from public/almond.svg (the #nut body, the
// #sproutG sprout, and the happy face). The eyes follow the cursor: the pupils (and their
// highlights) shift a few units toward the mouse and the whole glyph tilts a touch, so Almond
// feels alive and "watches" you. Honors prefers-reduced-motion (eyes rest centered, no listener).
//
// Local coordinates come straight from almond.svg's `#nut` group: the body spans roughly x[24,96]
// y[34,138], the sprout reaches up to y~11, and the eyes sit at (50,88) and (70,88).

export function AlmondMascot({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  // Pupil offset in SVG units, and a small head tilt in degrees, both driven by the cursor.
  const [look, setLook] = useState({ x: 0, y: 0, tilt: 0 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (el === null) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = 3.4; // max pupil travel, in SVG units
      setLook({
        x: (dx / dist) * reach,
        y: (dy / dist) * reach,
        // Lean a few degrees toward the cursor's horizontal side for extra life.
        tilt: Math.max(-6, Math.min(6, dx / 40)),
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="18 6 84 140"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label="Almond, the farm agent"
      style={{
        transform: `rotate(${look.tilt}deg)`,
        transformOrigin: "60px 138px",
        transition: "transform 200ms ease-out",
      }}
    >
      {/* Sprout. */}
      <path d="M60 33 L60 18" stroke="#1F3D2B" strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M60 22 C52 16 43 18 41 24 C48 29 56 28 60 22 Z" fill="#274E37" />
      <path d="M60 19 C68 11 79 11 83 17 C77 25 66 26 60 19 Z" fill="#1F3D2B" />

      {/* Body. */}
      <path
        d="M60 34 C80 38 98 56 96 90 C94 118 78 138 60 138 C42 138 26 118 24 90 C22 56 40 38 60 34 Z"
        fill="#D9A36A"
      />
      <ellipse cx="48" cy="70" rx="22" ry="30" fill="#EFCB97" opacity={0.5} />
      <ellipse cx="78" cy="106" rx="18" ry="26" fill="#BE8049" opacity={0.45} />
      <path
        d="M60 34 C80 38 98 56 96 90 C94 118 78 138 60 138 C42 138 26 118 24 90 C22 56 40 38 60 34 Z"
        fill="none"
        stroke="#B5793F"
        strokeWidth={1}
        opacity={0.35}
      />
      <path
        d="M60 46 C66 70 66 108 60 126"
        stroke="#A8703A"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.4}
      />

      {/* Cheeks. */}
      <ellipse cx="40" cy="99" rx="6.5" ry="4" fill="#E0875A" opacity={0.32} />
      <ellipse cx="80" cy="99" rx="6.5" ry="4" fill="#E0875A" opacity={0.32} />

      {/* Eyes: the pupils + their highlights track the cursor. */}
      <g
        style={{
          transform: `translate(${look.x}px, ${look.y}px)`,
          transition: "transform 120ms ease-out",
        }}
      >
        <circle cx="50" cy="88" r="5.5" fill="#3A2A1C" />
        <circle cx="48.3" cy="86.4" r="1.7" fill="#fff" opacity={0.85} />
        <circle cx="70" cy="88" r="5.5" fill="#3A2A1C" />
        <circle cx="68.3" cy="86.4" r="1.7" fill="#fff" opacity={0.85} />
      </g>

      {/* Smile. */}
      <path
        d="M51 101 Q60 109 69 101"
        stroke="#3A2A1C"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
