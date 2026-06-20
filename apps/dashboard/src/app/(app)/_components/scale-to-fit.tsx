"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales the no-scroll dashboard to fit the available area as a single unit - like zooming the whole
 * board - so the one-screen bento shrinks PROPORTIONALLY on a smaller laptop instead of crunching its
 * tiles and text. The board is authored at a fixed "design" size (where it looks right on a big
 * monitor) and uniformly transform-scaled to whatever space the window gives it.
 *
 * DOWNSCALE ONLY (capped at 1x) so text/the WebGL map never upscale into blur; on a big monitor it
 * sits at 1x (native, exactly the look that already worked). Below `lg` the scaler is OFF: the bento
 * falls back to its normal stacked, scrollable column (phones/tablets were never the crunch case).
 */
export function ScaleToFit({
  designWidth = 1440,
  designHeight = 820,
  children,
}: {
  designWidth?: number;
  designHeight?: number;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [enabled, setEnabled] = useState(false);

  // Only scale on real desktop widths; below lg the board stacks + scrolls normally.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setEnabled(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Fit the design box into the available area (min of width/height ratio), never above 1x.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || !enabled) return;
    const compute = () => {
      const w = outer.clientWidth;
      const h = outer.clientHeight;
      if (w === 0 || h === 0) return;
      setScale(Math.min(w / designWidth, h / designHeight, 1));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    compute();
    return () => ro.disconnect();
  }, [enabled, designWidth, designHeight]);

  if (!enabled) {
    return <div className="w-full">{children}</div>;
  }

  // Anchor top-left so the scaled visual occupies exactly [0..designW*scale] x [0..designH*scale]
  // (a centered origin would overflow the oversized 1440px layout box and clip an edge).
  return (
    <div ref={outerRef} className="h-full w-full overflow-hidden">
      <div
        style={{
          width: designWidth,
          height: designHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
