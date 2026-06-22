// The agent registry: a module-level table of every agent the cron dispatcher can run.
// FROZEN after the foundation commit. A feature agent does NOT edit this file — it calls
// register() from its OWN file under ./agents (imported for its side effect by the
// append-only barrel ./agents/index.ts), so the four feature worktrees only ADD files and
// append ONE import line, never touch a shared definition.
//
// FUTURE EXTENSION POINT: there is deliberately no multi-step tool-calling loop helper here
// (YAGNI — no v1 agent runs a tool-loop, and the foundation has NO LLM at all). When an
// agent first needs to call tools in a loop, add a `loop.ts` helper and let an
// AgentDefinition.run delegate to it; the registry shape does not change.

import type { PrismaClient } from "@prisma/client";
import type { AgentRunKind } from "./types";

/**
 * One agent the dispatcher knows about. `run(prisma, farmId)` does the agent's full work
 * for ONE farm (it opens/records/closes its own AgentRun via run.ts and never throws past
 * the dispatcher's per-farm try/catch). Today every agent is cron-triggered; `trigger` is
 * fixed to "cron" so the shape can widen later (e.g. an event trigger) without a rename.
 */
export type AgentDefinition = {
  kind: AgentRunKind;
  /** Plain-English label for the audit UI / logs (sourced from en.ts where surfaced). */
  label: string;
  trigger: "cron";
  /** How often the dispatcher should run it; drives the cadence-window skip. */
  cadence: "daily" | "monthly";
  run: (prisma: PrismaClient, farmId: string) => Promise<void>;
};

// The single source of truth, keyed by kind so a re-register (e.g. HMR in dev, or a
// double import) replaces rather than duplicates.
const REGISTRY = new Map<AgentRunKind, AgentDefinition>();

/** Register an agent. Called once per agent from its own file (side-effect import). A
 *  second register of the same kind overwrites — never two rows for one kind. */
export function register(def: AgentDefinition): void {
  REGISTRY.set(def.kind, def);
}

/** Every registered agent, in a stable order (insertion order of the Map). The dispatcher
 *  iterates this, filtering by trigger. */
export function listAgents(): AgentDefinition[] {
  return [...REGISTRY.values()];
}

/** Look up one agent by kind, or undefined when none is registered for it. */
export function getAgent(kind: AgentRunKind): AgentDefinition | undefined {
  return REGISTRY.get(kind);
}
