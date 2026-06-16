"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { AuroraText, TERRA_GREEN } from "./ui/aurora-text";

const S1 = "So, we put every piece of farm data into a dashboard".split(" ");
const S2 = "But what about physical data?".split(" ");

// gray + black aurora on the light-gray background
const DARK_AURORA = ["#1f2937", "#0a0a0a", "#4b5563", "#111827"];
// light-gray aurora on the black background
const GRAY_AURORA = ["#9ca3af", "#e5e7eb", "#6b7280", "#d1d5db"];

// phase windows as fractions of the section's scroll progress
const S1_IN: [number, number] = [0.0, 0.13];
const S1_OUT: [number, number] = [0.28, 0.42];
// line 2 never fades out (see `noOut` below) — it holds full opacity and
// physically scrolls up and off as the camera section rises in behind it,
// so there's no black gap before "the eyes". S2_OUT is unused for line 2.
const S2_IN: [number, number] = [0.52, 0.7];
const S2_OUT: [number, number] = [0.9, 1.0];

type Win = [number, number, number, number];

// per-word [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd], staggered left→right
function windows([p0, p1]: [number, number], [q0, q1]: [number, number], n: number): Win[] {
  return Array.from({ length: n }, (_, i) => {
    const a = p0 + (p1 - p0) * (i / n);
    const b = p0 + (p1 - p0) * Math.min(1, (i + 1.3) / n);
    const c = q0 + (q1 - q0) * (i / n);
    const d = q0 + (q1 - q0) * Math.min(1, (i + 1.3) / n);
    return [a, b, c, d];
  });
}

export function EyesIntro() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // background flips gray → black on its own once the first line has cleared,
  // instead of being scrubbed through with the scroll position
  const [dark, setDark] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setDark(v >= 0.42));

  const w1 = windows(S1_IN, S1_OUT, S1.length);
  const w2 = windows(S2_IN, S2_OUT, S2.length);

  const lineClass =
    "flex max-w-4xl flex-wrap justify-center text-center text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl";

  return (
    <section ref={ref} className="relative h-[250vh] sm:h-[320vh]">
      {/* sentinel: header runs white while the background is black */}
      <div id="eyes-dark" className="pointer-events-none absolute inset-x-0 bottom-0 top-[46%]" />

      <motion.div
        animate={{ backgroundColor: dark ? "#0a0a0a" : "#e5e7eb" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden"
      >
        {/* line 1 */}
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className={lineClass}>
            {S1.map((word, i) => (
              <StoryWord key={i} progress={scrollYProgress} win={w1[i]} colors={DARK_AURORA} reduce={!!reduce}>
                {word}
              </StoryWord>
            ))}
          </p>
        </div>

        {/* line 2 */}
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className={lineClass}>
            {S2.map((word, i) => (
              <StoryWord
                key={i}
                progress={scrollYProgress}
                win={w2[i]}
                colors={i >= 3 ? TERRA_GREEN : GRAY_AURORA}
                reduce={!!reduce}
                noOut
              >
                {word}
              </StoryWord>
            ))}
          </p>
        </div>
      </motion.div>
    </section>
  );
}

function StoryWord({
  progress,
  win,
  colors,
  reduce,
  noOut = false,
  children,
}: {
  progress: MotionValue<number>;
  win: Win;
  colors: string[];
  reduce: boolean;
  noOut?: boolean;
  children: string;
}) {
  const [a, b, c, d] = win;
  // noOut words only fade in and hold (no fade-out keyframes), so they stay
  // visible past the end of the section as it scrolls away
  const opacity = useTransform(
    progress,
    noOut ? [a, b] : [a, b, c, d],
    noOut ? [0, 1] : [0, 1, 1, 0],
  );
  const blurPx = useTransform(
    progress,
    noOut ? [a, b] : [a, b, c, d],
    noOut ? [14, 0] : [14, 0, 0, 14],
  );
  const filter = useMotionTemplate`blur(${blurPx}px)`;
  return (
    <motion.span
      style={reduce ? { opacity } : { opacity, filter }}
      className="mx-[0.18em] inline-block"
    >
      <AuroraText colors={colors}>{children}</AuroraText>
    </motion.span>
  );
}
