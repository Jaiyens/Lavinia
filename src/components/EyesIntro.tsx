"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionTemplate,
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
const S2_IN: [number, number] = [0.52, 0.7];
const S2_OUT: [number, number] = [0.8, 0.93];

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

  // background fades gray → black as the first line clears
  const bg = useTransform(
    scrollYProgress,
    [0, 0.34, 0.5, 1],
    ["#e5e7eb", "#e5e7eb", "#0a0a0a", "#0a0a0a"],
  );

  const w1 = windows(S1_IN, S1_OUT, S1.length);
  const w2 = windows(S2_IN, S2_OUT, S2.length);

  const lineClass =
    "flex max-w-4xl flex-wrap justify-center text-center text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl";

  return (
    <section ref={ref} className="relative h-[400vh] sm:h-[900vh]">
      {/* sentinel: header runs white while the background is black */}
      <div id="eyes-dark" className="pointer-events-none absolute inset-x-0 bottom-0 top-[46%]" />

      <motion.div
        style={{ backgroundColor: bg }}
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
  children,
}: {
  progress: MotionValue<number>;
  win: Win;
  colors: string[];
  reduce: boolean;
  children: string;
}) {
  const [a, b, c, d] = win;
  const opacity = useTransform(progress, [a, b, c, d], [0, 1, 1, 0]);
  const blurPx = useTransform(progress, [a, b, c, d], [14, 0, 0, 14]);
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
