"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import type { ReactNode } from "react";

/**
 * Lenis smooth scroll (darkroomengineering/lenis), wired as the page root.
 * `root` drives the <html> scroll so every section, sticky pin, and
 * scroll-linked animation rides the same smoothed scroll position.
 * `anchors` keeps in-page nav links (#inquire, #about, ...) smooth.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        smoothWheel: true,
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
