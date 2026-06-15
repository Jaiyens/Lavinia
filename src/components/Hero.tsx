"use client";

import { motion, useReducedMotion } from "motion/react";
import { TerraMark } from "./TerraMark";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section id="top" className="relative h-screen overflow-hidden bg-[#1d2417]">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        poster="/hero-poster.jpg"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      {/* legibility wash (hard cut at the bottom, no melt) */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-black/35" />

      <div className="container-x relative flex h-full items-center justify-between gap-8">
        {/* Terra, left */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
          className="flex shrink-0 items-center gap-3"
        >
          <TerraMark className="h-10 w-10 text-white sm:h-12 sm:w-12" />
          <span className="text-5xl font-semibold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)] sm:text-7xl">
            Terra
          </span>
        </motion.div>

        {/* heading, right, right-aligned */}
        <motion.h1
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
          className="max-w-md text-right text-4xl font-semibold leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.6)] sm:max-w-xl sm:text-6xl"
        >
          The operating system for the farm
        </motion.h1>
      </div>
    </section>
  );
}
