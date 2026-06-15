"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, useMotionTemplate, type MotionValue } from "motion/react";
import { AuroraText, TERRA_AURORA, CASE_AURORA } from "./ui/aurora-text";
import { caseStudy } from "@/lib/site";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CaseStudy() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // tall section + sticky inner = the page pins while the bars fill, then releases
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  return (
    <section id="casestudy" ref={ref} className="relative scroll-mt-24" style={{ height: "150vh" }}>
      <div className="sticky top-0 flex min-h-screen items-center">
        <div className="container-x w-full py-16">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* left: narrative */}
            <div>
              <motion.p
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.6, ease: EASE }}
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                <AuroraText colors={CASE_AURORA}>{caseStudy.kicker}</AuroraText>
              </motion.p>
              <motion.h2
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
                className="mt-4 max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl"
              >
                Farmers already have the data.
                <span aria-hidden className="block h-4 sm:hidden" />
                Terra turns it into decisions before they cost money.
              </motion.h2>

              <ol className="mt-8 space-y-5">
                {caseStudy.steps.map((s, i) => (
                  <motion.li
                    key={s.title}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-8% 0px" }}
                    transition={{ duration: 0.55, ease: EASE, delay: 0.1 + i * 0.08 }}
                    className="flex gap-4"
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-ink">{s.title}</h3>
                      <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{s.body}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* right: comparison chart, bars climb/fall with scroll while pinned */}
            <div className="glass rounded-3xl p-7 sm:p-9">
              <p className="text-sm font-medium text-ink-mute">Monthly demand charge</p>
              <div className="mt-8 grid grid-cols-2 items-end gap-8" style={{ height: 240 }}>
                <Bar
                  progress={scrollYProgress}
                  reduce={!!reduce}
                  heightPct={100}
                  index={0}
                  tone="danger"
                  value={caseStudy.mistimed.value}
                  caption={caseStudy.mistimed.label}
                  axis="Mistimed"
                />
                <Bar
                  progress={scrollYProgress}
                  reduce={!!reduce}
                  heightPct={14}
                  index={1}
                  tone="grass"
                  value={caseStudy.withTerra.value}
                  caption={caseStudy.withTerra.label}
                  axis="With Terra"
                />
              </div>
              <p className="mt-7 border-t border-line pt-5 text-sm leading-relaxed text-ink-soft">
                {caseStudy.footnote}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({
  progress,
  heightPct,
  index,
  tone,
  value,
  caption,
  axis,
  reduce,
}: {
  progress: MotionValue<number>;
  heightPct: number;
  index: number;
  tone: "danger" | "grass";
  value: string;
  caption: string;
  axis: string;
  reduce: boolean;
}) {
  const isAurora = tone === "grass";
  const barClass = tone === "danger" ? "bg-ink" : "animate-aurora";
  const auroraBg = isAurora
    ? {
        backgroundImage: `linear-gradient(135deg, ${TERRA_AURORA.join(", ")}, ${TERRA_AURORA[0]})`,
        backgroundSize: "200% auto",
        animationDuration: "10s",
      }
    : {};
  const start = 0.08 + index * 0.06;
  const pct = useTransform(progress, [start, start + 0.3], [0, heightPct]);
  const height = useMotionTemplate`${pct}%`;
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <span className="text-2xl font-semibold text-ink">{value}</span>
      <span className="mb-3 mt-1 max-w-[12rem] text-center text-[0.7rem] leading-snug text-ink-mute">
        {caption}
      </span>
      <motion.div
        className={`w-full max-w-[7rem] rounded-t-xl ${barClass}`}
        style={{ height: reduce ? `${heightPct}%` : height, minHeight: 8, ...auroraBg }}
      />
      <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {axis}
      </span>
    </div>
  );
}
