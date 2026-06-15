"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { TiltGlass } from "./ui/TiltGlass";
import { AuroraText, TERRA_AURORA } from "./ui/aurora-text";
import { tractionStats, signedFarms } from "@/lib/site";

export function Traction() {
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, margin: "-15% 0px" });

  return (
    <section className="relative overflow-hidden pt-12 pb-24 sm:pt-16 sm:pb-32">
      <div className="container-x">
        <h2 className="max-w-3xl text-balance text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
          <span className="text-ink">Trusted by </span>
          <AuroraText colors={TERRA_AURORA}>185,000 acres.</AuroraText>
        </h2>

        <div ref={gridRef} className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4">
          {tractionStats.map((s, i) => (
            <TiltGlass key={s.label} className="h-full p-5 sm:p-6" max={5}>
              <div className="flex flex-col gap-1.5">
                <span className="text-2xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
                  <CountUp value={s.value} play={inView} delay={i * 0.06} />
                </span>
                <span className="text-xs leading-snug text-ink-mute sm:text-sm">{s.label}</span>
              </div>
            </TiltGlass>
          ))}
        </div>

        {/* desktop: static row */}
        <div className="mt-10 hidden flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-mute sm:flex">
          <span className="eyebrow">Including</span>
          {signedFarms.map((f) => (
            <span
              key={f}
              className="rounded-full border border-line bg-white px-3 py-1 font-medium text-ink"
            >
              {f}
            </span>
          ))}
        </div>

        {/* phone: moving banner so they all fit */}
        <div className="mt-8 sm:hidden">
          <span className="eyebrow">Including</span>
          <div className="mt-2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="flex w-max animate-marquee items-center gap-2">
              {[...signedFarms, ...signedFarms].map((f, i) => (
                <span
                  key={i}
                  className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function parseValue(value: string) {
  const m = value.match(/^([^\d]*)([\d,]+)(.*)$/);
  if (!m) return { prefix: "", target: 0, suffix: value, comma: false };
  const target = parseInt(m[2].replace(/,/g, ""), 10);
  return {
    prefix: m[1],
    target,
    suffix: m[3],
    comma: m[2].includes(",") || target >= 1000,
  };
}

function fmt(v: number, comma: boolean) {
  const n = Math.round(v);
  return comma ? n.toLocaleString("en-US") : String(n);
}

/** Quickly counts up to the value when it scrolls into view. */
function CountUp({ value, play, delay }: { value: string; play: boolean; delay: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const { prefix, target, suffix, comma } = parseValue(value);
  const mv = useMotionValue(0);

  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = fmt(v, comma);
  });

  useEffect(() => {
    if (reduce) {
      if (ref.current) ref.current.textContent = fmt(target, comma);
      return;
    }
    if (play) {
      const controls = animate(mv, target, { duration: 0.9, ease: [0.22, 1, 0.36, 1], delay });
      return () => controls.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, reduce]);

  return (
    <>
      {prefix}
      <span ref={ref}>{fmt(0, comma)}</span>
      {suffix}
    </>
  );
}
