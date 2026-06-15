"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { TerraMark } from "./TerraMark";
import { GlassButton } from "./ui/GlassButton";
import { AuroraText, TERRA_AURORA } from "./ui/aurora-text";

const EASE = [0.22, 1, 0.36, 1] as const;

export function FinalCTA() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden py-28 sm:py-32">
      <div className="container-x relative">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-12% 0px" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="max-w-lg text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              <span className="text-ink">Farm AI that helps in the field, </span>
              <AuroraText colors={TERRA_AURORA}>not after.</AuroraText>{" "}
              <span className="text-ink-mute">Bring Terra to your next season.</span>
            </h2>
            <GlassButton href="#inquire" tone="brand" className="mt-8 px-6 py-3.5">
              Inquire
              <ArrowRight size={15} />
            </GlassButton>
          </motion.div>

          {/* floating glass keycaps */}
          <div className="relative hidden h-72 lg:block" aria-hidden="true">
            <Keycap className="left-[8%] top-[42%] h-28 w-28" rot="-12deg" delay={0} reduce={!!reduce}>
              <TerraMark className="h-12 w-12 text-accent-500" />
            </Keycap>
            <Keycap className="right-[14%] top-[10%] h-28 w-28" rot="10deg" delay={1.2} reduce={!!reduce}>
              <ArrowRight size={40} className="-rotate-45 text-ink/70" />
            </Keycap>
          </div>
        </div>
      </div>
    </section>
  );
}

function Keycap({
  children,
  className,
  rot,
  delay,
  reduce,
}: {
  children: React.ReactNode;
  className: string;
  rot: string;
  delay: number;
  reduce: boolean;
}) {
  return (
    <div
      className={`glass absolute flex items-center justify-center rounded-3xl ${className}`}
      style={{
        ["--rot" as string]: rot,
        transform: `rotate(${rot})`,
        animation: reduce ? undefined : `float-key 6s ${delay}s ease-in-out infinite`,
      }}
    >
      {children}
    </div>
  );
}
