"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { GlassButton } from "./ui/GlassButton";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export function DataConstellation() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* sentinel: header runs white while it overlaps the blue sky */}
      <div id="hero-sky" className="pointer-events-none absolute inset-x-0 top-0 h-[68vh]" />

      {/* full-bleed landscape background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 bg-top bg-cover bg-no-repeat max-sm:bg-[length:auto_155%]"
          style={{ backgroundImage: "url(/hero-landscape.png)" }}
        />
        {/* fade the lower portion to white so it blends into the page + frames the OS */}
        <div className="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-b from-transparent via-white/80 to-white" />
        {/* solid white floor guarantees a seamless hand-off into the next section */}
        <div className="absolute inset-x-0 bottom-0 h-[18%] bg-white" />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="container-x flex flex-col items-center px-6 pb-0 pt-36 text-center sm:pt-44"
      >
        <motion.h1
          variants={item}
          className="max-w-4xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-white [text-shadow:0_2px_24px_rgba(20,60,90,0.35)] sm:text-6xl lg:text-7xl"
        >
          The Operating System for the Farm
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-7 max-w-2xl text-pretty text-base leading-relaxed text-white/90 [text-shadow:0_1px_14px_rgba(20,60,90,0.35)] sm:text-lg"
        >
          Terra connects the data from power, water, irrigation, labor, weather,
          crop health into a single operating system you can act on in real time.
        </motion.p>

        <motion.div variants={item} className="mt-10">
          <GlassButton href="#inquire" tone="light" className="px-9 py-4 text-base">
            Inquire
            <ArrowRight size={17} />
          </GlassButton>
        </motion.div>

        {/* Terra OS dashboard, floating up from the bottom like a real app window */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.4 }}
          className="relative z-20 mt-12 w-full max-w-6xl sm:mt-16"
        >
          <div className="relative overflow-hidden rounded-t-2xl bg-white shadow-[0_40px_120px_-30px_rgba(15,40,60,0.45)] sm:border sm:border-black/10 sm:ring-1 sm:ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/terra-os.png"
              alt="The Terra OS dashboard, showing fields, vegetation health, a farm map, alerts, weather, and live camera feeds"
              className="block h-auto w-full"
              draggable={false}
            />
            {/* phone: dissolve the bottom into the page so there's no hard cut */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent sm:hidden" />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
