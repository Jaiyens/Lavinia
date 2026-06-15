"use client";

// The reveal flow's engine: a three-phase state machine (reveal -> finding -> save)
// under one AnimatePresence, so the screens cross-fade in place without a remount or a
// server round-trip. It polls connectionRevealAction for the live counts that drive the
// reveal; once the data is ready it calls finishRevealAction (import + engines + top
// finding) and cross-fades to the finding, then the finding's CTA advances to save.
// Leaving the page is safe: the provider keeps pulling, and returning re-enters at reveal
// (or jumps straight to finding if the import already happened).

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { en } from "@/copy/en";
import type { RevealCounts } from "@/lib/onboarding/farm";
import { connectionRevealAction, finishRevealAction, type RevealFinish } from "../actions";
import { RevealStage } from "./reveal-stage";
import { FindingStage } from "./finding-stage";
import { SaveStage } from "./save-stage";

const POLL_MS = 5000;
const SLOW_AFTER_MS = 90000;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Phase = "reveal" | "finding" | "save";

export function RevealMachine({ farmId }: { farmId: string }) {
  const r = en.onboarding.reveal;
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("reveal");
  const [counts, setCounts] = useState<RevealCounts | null>(null);
  const [finish, setFinish] = useState<RevealFinish | null>(null);
  const [slow, setSlow] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the effect runs (calling Date.now() during render is impure).
  const startedAt = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Guards against a second finish call while the first import is still in flight.
    let finishing = false;
    startedAt.current = Date.now();

    async function tick() {
      if (!active) return;
      try {
        const c = await connectionRevealAction(farmId);
        if (!active) return;
        setCounts(c);
        setSlow(Date.now() - startedAt.current > SLOW_AFTER_MS);
        if (c.ready && !finishing) {
          finishing = true;
          const f = await finishRevealAction(farmId);
          if (!active) return;
          if (f) {
            setFinish(f);
            setPhase("finding");
            return; // stop polling: we are done
          }
          finishing = false; // transient not-ready; keep polling
        }
      } catch {
        if (!active) return;
        setError(r.error);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [farmId, r.error]);

  async function onContinue() {
    setContinuing(true);
    try {
      const f = await finishRevealAction(farmId, { force: true });
      if (f) {
        setFinish(f);
        setPhase("finding");
      } else {
        setContinuing(false);
      }
    } catch {
      setContinuing(false);
      setError(r.error);
    }
  }

  const variants = {
    initial: { opacity: 0, y: reduce ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduce ? 0 : -12 },
  };
  const transition = { duration: reduce ? 0 : 0.5, ease: EASE };

  return (
    <AnimatePresence mode="wait">
      {phase === "reveal" ? (
        <motion.div
          key="reveal"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <RevealStage
            counts={counts}
            slow={slow}
            continuing={continuing}
            error={error}
            onContinue={onContinue}
          />
        </motion.div>
      ) : phase === "finding" && finish ? (
        <motion.div
          key="finding"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <FindingStage finish={finish} onNext={() => setPhase("save")} />
        </motion.div>
      ) : phase === "save" ? (
        <motion.div
          key="save"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <SaveStage farmId={farmId} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
