import { z } from "zod";
import type { MeterView } from "@/lib/dashboard/load";
import { LENS_KEYS, isLensAvailable, type Lens } from "@/lib/dashboard/surface";
import { resolveMeterQuery } from "@/lib/almond/shape";

/**
 * The `navigate` skill — the SERVER half of Almond driving the dashboard (Story 7.3).
 *
 * The model calls `navigate` with a structured, registry-validated request; this pure resolver turns
 * it into a typed `NavigateAction` over the dashboard's five canonical URL-state keys (the surface
 * registry, src/lib/dashboard/surface.ts) — or a `clarify` / `none` / `unknown-surface` result. It
 * RESOLVES and EMITS the action; it does not write it to the stream or move the screen. The bridge
 * that writes the transient `data-navigate` part and applies it through `useQueryState` setters is
 * Story 7.4 (a backward-only dependency: 7.4 consumes what this returns). See ADR-A02 / ADR-A03.
 *
 * Two laws this file exists to enforce:
 *   - Stays native to a changing dashboard (ADR-A03): keys and lenses come from the registry, never a
 *     hardcoded list. An unknown surface is REFUSED, never coerced to a default (the dashboard's
 *     `parseLens` coerces a stale deep link; `navigate` must not, so Almond never claims it opened a
 *     surface that does not exist).
 *   - The ambiguity rule (FR3): a request matching >= 2 meters returns `clarify` and emits NO action,
 *     so a grower with 183 meters and repeated names is never silently dropped on the wrong pump.
 *
 * Pure (no Prisma, no I/O), mirroring `resolveMeterQuery` in ../shape.ts, so the whole skill is
 * exercisable offline with zero external calls (NFR3). Farm scope lives in `deps` at the call site
 * (tools.ts `navigateSkill`), never on the input schema (FR7).
 */

/**
 * A closed, typed navigation action over ONLY the five canonical surface keys. Each present field is
 * applied by the bridge (7.4) through that key's `useQueryState` setter; an absent field leaves the
 * key untouched, and an explicit `null` clears it (e.g. `setMeter(null)` closes the meter drawer).
 * The `string | null` type mirrors what those setters accept — it is the bridge contract. The 7.3
 * resolver only ever SETS values (open a meter, switch a lens, apply a filter); emitting a `null`
 * clear is a later capability the shape already admits, so the bridge needs no shape change for it.
 * Keyed by the registry's keys so a retired surface makes a stale field a type error.
 */
export type NavigateAction = {
  /** The dashboard lens to switch to (a real, AVAILABLE lens per the registry). */
  lens?: Lens;
  /** Filter the table by legal billing entity (raw contains-filter value, or null to clear). */
  entity?: string | null;
  /** Filter the table by ranch (raw contains-filter value, or null to clear). */
  ranch?: string | null;
  /** Filter the table by rate schedule (raw contains-filter value, or null to clear). */
  rate?: string | null;
  /** Open a meter by its ID (the value the `meter` key holds), or null to close the drawer. */
  meter?: string | null;
};

/**
 * The typed result the skill returns to the model (and, on `navigate`, to the 7.4/7.5 bridge):
 *   - `navigate`        a clean resolve carrying the action to emit. When the action opens a meter it
 *                       also carries the resolved `meterName` — the human name for Story 7.5's action
 *                       chip ("Opened Pump 17"), captured here where the match happened so the
 *                       responder needs no second meter read to label it.
 *   - `clarify`         >= 2 meters matched: name the candidates, emit NO action (the ambiguity rule).
 *   - `none`            nothing matched (or an empty/actionless request); never fabricate a target.
 *   - `unknown-surface` a requested lens/surface the registry does not list: refused, not coerced.
 */
export type NavigateResult =
  | { kind: "navigate"; action: NavigateAction; meterName?: string }
  | { kind: "clarify"; candidates: string[] }
  | { kind: "none" }
  | { kind: "unknown-surface"; requested: string };

/**
 * The skill's input: a shape-only request over the canonical keys. The meter path is
 * `{ open: "meter", query }`; the lens/filter path is `{ lens?, entity?, ranch?, rate? }`. `lens` is
 * a plain string here and validated against the registry in the resolver (so an unknown lens becomes
 * a narratable `unknown-surface` result, not an un-narratable schema rejection). There is NO `farmId`
 * or scope field — scope is inherited from `deps`, never the model (FR7).
 */
export const navigateInputSchema = z.object({
  open: z
    .literal("meter")
    .optional()
    .describe('Set to "meter" to open a specific meter named by `query`.'),
  query: z
    .string()
    .optional()
    .describe("The meter name, SA id, or id to open (use with open: \"meter\")."),
  lens: z
    .string()
    .optional()
    .describe("Switch the dashboard lens: chart, table, map, or calendar."),
  entity: z.string().optional().describe("Filter the table by legal billing entity name."),
  ranch: z.string().optional().describe("Filter the table by ranch name."),
  rate: z.string().optional().describe("Filter the table by rate schedule, e.g. AG-A1."),
});

export type NavigateInput = z.infer<typeof navigateInputSchema>;

/** Resolve a raw string to a real, AVAILABLE lens via the registry, or null if it is neither. */
function asAvailableLens(value: string): Lens | null {
  const hit = LENS_KEYS.find((k) => k === value);
  return hit && isLensAvailable(hit) ? hit : null;
}

/** A filter value is actionable only when it is a non-empty, non-whitespace string. */
function filterValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Turn a navigation request into a typed `NavigateAction` (or clarify/none/unknown-surface). Pure:
 * `meters` is the resolved farm's meters (loaded by the caller, scoped by `deps`). Meter requests
 * delegate to the shipped `resolveMeterQuery` so the ambiguity rule and exact-match precedence are
 * not re-implemented here.
 */
export function resolveNavigate(meters: MeterView[], input: NavigateInput): NavigateResult {
  // Meter path. Triggered by a usable `query` (the `open: "meter"` field is a model-facing hint, not
  // the branch condition, so a request is never lost to a stray `open` with an empty query). A meter
  // request never combines with a lens/filter move in v1 — opening the named meter is the whole
  // intent, and the drawer opens over any lens.
  const query = (input.query ?? "").trim();
  if (query !== "") {
    const match = resolveMeterQuery(meters, query);
    if (match.kind === "found")
      return { kind: "navigate", action: { meter: match.meter.id }, meterName: match.meter.name };
    // >= 2 matches: name them and emit NOTHING (FR3 — never auto-navigate an ambiguous request).
    if (match.kind === "ambiguous") return { kind: "clarify", candidates: match.names };
    return { kind: "none" };
  }
  // No usable query: fall through to the lens/filter path so a lens/filter carried alongside an
  // (empty-query) `open: "meter"` is still honored, and a truly empty request lands on `none` below.

  // Lens / filter path. Assemble an action from the present canonical keys, validating `lens` against
  // the registry (refuse an unknown one). entity/ranch/rate are raw contains-filters (the registry
  // defines them as nullable strings with no parser), so any non-empty value is a valid filter.
  const action: NavigateAction = {};
  if (input.lens !== undefined) {
    const lens = asAvailableLens(input.lens);
    if (lens === null) return { kind: "unknown-surface", requested: input.lens };
    action.lens = lens;
  }
  const entity = filterValue(input.entity);
  if (entity !== null) action.entity = entity;
  const ranch = filterValue(input.ranch);
  if (ranch !== null) action.ranch = ranch;
  const rate = filterValue(input.rate);
  if (rate !== null) action.rate = rate;

  // Nothing actionable in the request (no meter, no valid lens, no filter): found nothing to do.
  if (Object.keys(action).length === 0) return { kind: "none" };
  return { kind: "navigate", action };
}
