import { z } from "zod";
import type { MeterView } from "@/lib/dashboard/load";
import { LENS_KEYS, isLensAvailable, type Lens } from "@/lib/dashboard/surface";
import {
  SOLAR_LENS_KEYS,
  isSolarLensAvailable,
  type SolarLens,
} from "@/lib/solar/lens-solar";
import { resolveMeterQuery } from "@/lib/almond/shape";
import { filterMeters, type MeterFilter } from "@/lib/dashboard/table";

/**
 * The `navigate` skill — the SERVER half of Almond driving the dashboard (Story 7.3).
 *
 * The model calls `navigate` with a structured, registry-validated request; this pure resolver turns
 * it into a typed `NavigateAction` over the dashboard's canonical URL-state keys (the surface
 * registry, src/lib/dashboard/surface.ts) — across the energy and (H-3) the solar surface — or a
 * `clarify` / `none` / `unknown-surface` result. It
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
 * A closed, typed navigation action over ONLY the canonical surface keys. Each present field is
 * applied by the bridge (7.4) through that key's `useQueryState` setter; an absent field leaves the
 * key untouched, and an explicit `null` clears it (e.g. `setMeter(null)` closes the meter drawer).
 * The `string | null` type mirrors what those setters accept — it is the bridge contract. The 7.3
 * resolver only ever SETS values (open a meter, switch a lens, apply a filter); emitting a `null`
 * clear is a later capability the shape already admits, so the bridge needs no shape change for it.
 * Keyed by the registry's keys so a retired surface makes a stale field a type error.
 */
export type NavigateAction = {
  /**
   * Which closed surface the action targets (H-3, ADR-S09). `"energy"` is the default and the only
   * value the shipped Energy-tab call-sites ever emit; `"solar"` tells the bridge to open `/solar`
   * and resolves `lens` against the solar registry instead of the energy one. Absent means energy,
   * so every pre-solar caller stays correct without a change.
   */
  surface?: Surface;
  /**
   * The lens to switch to: a real, AVAILABLE lens per the registry the `surface` owns. On the energy
   * surface this is an energy `Lens` (validated against `surface.ts`); on the solar surface it is a
   * `SolarLens` (validated against `lens-solar.ts`). The union is the bridge contract — the bridge
   * applies whichever the matching surface lists.
   */
  lens?: Lens | SolarLens;
  /** Filter the table by legal billing entity (raw contains-filter value, or null to clear). */
  entity?: string | null;
  /** Filter the table by ranch (raw contains-filter value, or null to clear). */
  ranch?: string | null;
  /** Filter the table by rate schedule (raw contains-filter value, or null to clear). */
  rate?: string | null;
  /**
   * Filter by PG&E account number (raw contains-filter value, or null to clear). A Solar-tab filter
   * dimension (A-7), but the key is surface-agnostic so Almond can apply it wherever it is rendered.
   */
  account?: string | null;
  /**
   * Filter by net-metering program code (raw contains-filter value, or null to clear). A Solar-tab
   * filter dimension (A-7); the resolved program code, not a guessed one.
   */
  program?: string | null;
  /** Open a meter by its ID (the value the `meter` key holds), or null to close the drawer. */
  meter?: string | null;
};

/**
<<<<<<< HEAD
 * The two closed dashboard surfaces Almond can point at. `"energy"` is the shipped Energy tab (the
 * default); `"solar"` is the Solar tab (H-3). Each owns its own closed lens registry, so the same
 * `lens` field is validated against a different registry depending on the surface (ADR-S09). A value
 * outside this union is refused, never coerced, exactly as an unknown lens is.
 */
export type Surface = "energy" | "solar";
=======
 * The post-action state the resolver computes by running the SAME pure `filterMeters` over the farm's
 * meters with the action's target filter keys — the "verify before narrate" contract (T5). The
 * confirmation copy (`describeNavigation`) is generated FROM this, never from the request, so Almond
 * can only claim "back to 183" when `visibleMeterCount === 183`, and only "21 meters" when the filter
 * actually lands on 21. An empty filter (a clear, or no filter at all) yields the full meter count;
 * a filter that matches nothing yields `0`, which drives the honest "no meters match" copy.
 *
 *   - `visibleMeterCount` how many meters the table shows AFTER the action (the filtered count).
 *   - `activeFilter`      the filter keys now in effect (null on each cleared/absent dimension), so
 *                         the copy can name the active dimension or say "showing all".
 *   - `openMeter`         the meter id the drawer now shows, or null (a non-meter move leaves it null).
 */
export type NavState = {
  visibleMeterCount: number;
  activeFilter: { entity: string | null; ranch: string | null; rate: string | null };
  openMeter: string | null;
};
>>>>>>> night/integration

/**
 * The typed result the skill returns to the model (and, on `navigate`, to the 7.4/7.5 bridge):
 *   - `navigate`        a clean resolve carrying the action to emit AND the computed post-action
 *                       `state` (the verify-before-narrate contract). When the action opens a meter it
 *                       also carries the resolved `meterName` — the human name for Story 7.5's action
 *                       chip ("Opened Pump 17"), captured here where the match happened so the
 *                       responder needs no second meter read to label it.
 *   - `clarify`         >= 2 meters matched (or a filter phrase that matches no real value but is
 *                       close to one): name the candidates, emit NO action (the ambiguity rule).
 *   - `none`            nothing matched (or an empty/actionless request); never fabricate a target.
 *   - `unknown-surface` a requested lens/surface the registry does not list: refused, not coerced.
 */
export type NavigateResult =
  | { kind: "navigate"; action: NavigateAction; meterName?: string; state: NavState }
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
  surface: z
    .enum(["energy", "solar"])
    .optional()
    .describe(
      'Which tab to point at: "energy" (the default energy dashboard) or "solar" (the Solar tab). ' +
        'On "solar" the lens is one of arrays, calendar, map, or table.',
    ),
  lens: z
    .string()
    .optional()
<<<<<<< HEAD
    .describe(
      "Switch the lens. Energy: chart, table, map, or calendar. Solar: arrays, calendar, map, or table.",
    ),
  entity: z.string().optional().describe("Filter the table by legal billing entity name."),
  ranch: z.string().optional().describe("Filter the table by ranch name."),
  rate: z.string().optional().describe("Filter the table by rate schedule, e.g. AG-A1."),
  account: z.string().optional().describe("Filter by PG&E account number."),
  program: z
    .string()
    .optional()
    .describe("Filter the Solar tab by net-metering program code, e.g. NEM2."),
=======
    .describe("Switch the dashboard lens: chart, table, map, or calendar."),
  entity: z
    .string()
    .optional()
    .describe(
      "Filter the table by legal billing entity. A case-insensitive contains phrase the resolver maps to the real entity value on the farm.",
    ),
  ranch: z
    .string()
    .optional()
    .describe(
      "Filter the table by ranch. A case-insensitive contains phrase the resolver maps to the real ranch value on the farm.",
    ),
  rate: z
    .string()
    .optional()
    .describe(
      "Filter the table by rate schedule, e.g. AG-A1. A case-insensitive contains phrase the resolver maps to the real rate value on the farm.",
    ),
  clear: z
    .boolean()
    .optional()
    .describe(
      'Set to true to clear ALL table filters and show the whole farm again ("show all meters").',
    ),
>>>>>>> night/integration
});

export type NavigateInput = z.infer<typeof navigateInputSchema>;

/** Resolve a raw string to a real, AVAILABLE energy lens via the registry, or null if it is neither. */
function asAvailableLens(value: string): Lens | null {
  const hit = LENS_KEYS.find((k) => k === value);
  return hit && isLensAvailable(hit) ? hit : null;
}

/**
 * Resolve a raw string to a real, AVAILABLE SOLAR lens via the solar registry, or null otherwise.
 * Unlike `parseSolarLens` (which COERCES an unknown value to the Arrays default so a stale deep link
 * never strands the grower), this REFUSES an unknown value by returning null, so the resolver can
 * narrate an `unknown-surface` rather than silently claim it opened a solar lens that does not exist
 * (the same law the energy `asAvailableLens` enforces, ADR-A03 / ADR-S09).
 */
function asAvailableSolarLens(value: string): SolarLens | null {
  const hit = SOLAR_LENS_KEYS.find((k) => k === value);
  return hit && isSolarLensAvailable(hit) ? hit : null;
}

/** A filter value is actionable only when it is a non-empty, non-whitespace string. */
function filterValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The distinct real values a filter dimension takes on this farm (trimmed, non-empty). The resolver
 *  maps a user phrase ONTO one of these so a filter only ever carries a value that actually exists -
 *  `filterMeters` is an exact (trim) match, so a raw phrase that is not a real value would silently
 *  match nothing. */
function realValues(meters: readonly MeterView[], pick: (m: MeterView) => string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of meters) {
    const v = pick(m)?.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * The outcome of mapping a user filter phrase onto the farm's real values:
 *   - `exact`   the phrase IS a real value (trim-insensitive): use it verbatim.
 *   - `one`     a single real value CONTAINS the phrase (case-insensitive): "AG-A" -> "AG-A1".
 *   - `many`    several real values contain it: ambiguous, so the resolver clarifies, naming them.
 *   - `none`    no real value matches: do not silently filter to nothing.
 * Matching is the documented contract (case-insensitive contains), but the value that lands on the
 * action is ALWAYS a real value the farm has, never the raw phrase, so the table never empties on a
 * value that does not exist.
 */
type FilterMatch =
  | { kind: "exact" | "one"; value: string }
  | { kind: "many"; values: string[] }
  | { kind: "none" };

function matchFilterValue(phrase: string, values: readonly string[]): FilterMatch {
  const want = phrase.trim().toLowerCase();
  if (want === "") return { kind: "none" };
  const exact = values.find((v) => v.toLowerCase() === want);
  if (exact !== undefined) return { kind: "exact", value: exact };
  const contains = values.filter((v) => v.toLowerCase().includes(want));
  if (contains.length === 1 && contains[0] !== undefined) return { kind: "one", value: contains[0] };
  if (contains.length > 1) return { kind: "many", values: contains };
  return { kind: "none" };
}

/** Compute the post-action state by running the SAME pure `filterMeters` the table runs, over the
 *  action's target filter keys. This is the verify-before-narrate seam: the count the copy quotes is
 *  the count the table will actually show, not a number derived from the request. A meter-open action
 *  carries no filter change, so its visible count is the whole farm and its `openMeter` is the id.
 *  Exported so the client bridge (`use-almond-navigation`) can re-derive the same post-state from the
 *  same pure function after it applies an action through the nuqs setters. */
export function stateForAction(meters: readonly MeterView[], action: NavigateAction): NavState {
  const activeFilter: NavState["activeFilter"] = {
    entity: action.entity ?? null,
    ranch: action.ranch ?? null,
    rate: action.rate ?? null,
  };
  const filter: MeterFilter = activeFilter;
  return {
    visibleMeterCount: filterMeters(meters, filter).length,
    activeFilter,
    openMeter: action.meter ?? null,
  };
}

/**
 * Turn a navigation request into a typed `NavigateAction` (or clarify/none/unknown-surface). Pure:
 * `meters` is the resolved farm's meters (loaded by the caller, scoped by `deps`). Meter requests
 * delegate to the shipped `resolveMeterQuery` so the ambiguity rule and exact-match precedence are
 * not re-implemented here.
 */
export function resolveNavigate(meters: MeterView[], input: NavigateInput): NavigateResult {
  // Resolve the target surface once, up front (H-3). Absent means `"energy"` so every pre-solar
  // caller keeps its exact behavior; only an explicit `"solar"` rides onto the action (so the bridge
  // opens `/solar`) and switches lens validation to the solar registry. The enum schema already
  // refuses any value outside the union, so the resolver never sees an unknown surface string.
  const surface: Surface = input.surface ?? "energy";

  // Meter path. Triggered by a usable `query` (the `open: "meter"` field is a model-facing hint, not
  // the branch condition, so a request is never lost to a stray `open` with an empty query). A meter
  // request never combines with a lens/filter move in v1 — opening the named meter is the whole
  // intent, and the drawer opens over any lens. The surface still rides along so a solar meter open
  // points the bridge at `/solar` (the drawer is shared, but the tab around it is not).
  const query = (input.query ?? "").trim();
  if (query !== "") {
    const match = resolveMeterQuery(meters, query);
<<<<<<< HEAD
    if (match.kind === "found")
      return {
        kind: "navigate",
        action: withSurface({ meter: match.meter.id }, surface),
        meterName: match.meter.name,
      };
=======
    if (match.kind === "found") {
      const action: NavigateAction = { meter: match.meter.id };
      return {
        kind: "navigate",
        action,
        meterName: match.meter.name,
        state: stateForAction(meters, action),
      };
    }
>>>>>>> night/integration
    // >= 2 matches: name them and emit NOTHING (FR3 — never auto-navigate an ambiguous request).
    if (match.kind === "ambiguous") return { kind: "clarify", candidates: match.names };
    return { kind: "none" };
  }
  // No usable query: fall through to the lens/filter path so a lens/filter carried alongside an
  // (empty-query) `open: "meter"` is still honored, and a truly empty request lands on `none` below.

  // Lens / filter path. Assemble an action from the present canonical keys, validating `lens` against
<<<<<<< HEAD
  // the registry the requested surface OWNS (refuse an unknown one). entity/ranch/rate/account/program
  // are raw contains-filters (the registry defines them as nullable strings with no parser), so any
  // non-empty value is a valid filter.
=======
  // the registry (refuse an unknown one).
>>>>>>> night/integration
  const action: NavigateAction = {};
  if (input.lens !== undefined) {
    // Validate against the solar registry on the solar surface (Arrays/Calendar/Map/Table), the
    // energy registry otherwise. Either way an unknown lens is REFUSED, never coerced to a default,
    // so Almond never claims it opened a lens the surface does not list (ADR-S09).
    const lens =
      surface === "solar" ? asAvailableSolarLens(input.lens) : asAvailableLens(input.lens);
    if (lens === null) return { kind: "unknown-surface", requested: input.lens };
    action.lens = lens;
  }
<<<<<<< HEAD
  const entity = filterValue(input.entity);
  if (entity !== null) action.entity = entity;
  const ranch = filterValue(input.ranch);
  if (ranch !== null) action.ranch = ranch;
  const rate = filterValue(input.rate);
  if (rate !== null) action.rate = rate;
  const account = filterValue(input.account);
  if (account !== null) action.account = account;
  const program = filterValue(input.program);
  if (program !== null) action.program = program;

  // Nothing actionable in the request (no meter, no valid lens, no filter): found nothing to do. A
  // bare `surface: "solar"` with nothing to apply is NOT actionable on its own (the tab default opens
  // anyway), so it does not fabricate a navigate; this keeps `none` honest.
  if (Object.keys(action).length === 0) return { kind: "none" };
  return { kind: "navigate", action: withSurface(action, surface) };
}

/**
 * Stamp the resolved surface onto an action ONLY when it is `"solar"`. The energy surface is the
 * default the bridge already assumes, so omitting the field for energy keeps every pre-H-3 action
 * (and its test) byte-identical, while a solar action explicitly carries `surface: "solar"` so the
 * bridge opens `/solar`.
 */
function withSurface(action: NavigateAction, surface: Surface): NavigateAction {
  return surface === "solar" ? { ...action, surface } : action;
=======

  // Clear-filters intent ("show me the whole farm again"): null all three filter keys so the bridge's
  // setters actively clear them and the table returns to every meter. This was the bug — there was no
  // clear action, so "show all meters" narrated success while nothing reset. A clear may carry a lens
  // (e.g. "show the table for the whole farm"); it never combines with a NEW filter (a clear that also
  // set a filter would contradict itself), so an explicit clear wins over any filter phrase below.
  if (input.clear === true) {
    action.entity = null;
    action.ranch = null;
    action.rate = null;
    return { kind: "navigate", action, state: stateForAction(meters, action) };
  }

  // Filter phrases. `filterMeters` is an EXACT (trim) match, so a raw phrase that is not a real value
  // on the farm would silently filter to nothing. Map each phrase onto the farm's real values
  // (case-insensitive contains, the documented contract): an exact/single match sets the REAL value;
  // an ambiguous phrase clarifies (naming the candidates) and emits no action; a phrase that matches
  // no real value also clarifies, naming the closest real values, rather than filtering to nothing.
  const dimensions: Array<{
    key: "entity" | "ranch" | "rate";
    phrase: string | null;
    pick: (m: MeterView) => string | null;
  }> = [
    { key: "entity", phrase: filterValue(input.entity), pick: (m) => m.entityName },
    { key: "ranch", phrase: filterValue(input.ranch), pick: (m) => m.ranchName },
    { key: "rate", phrase: filterValue(input.rate), pick: (m) => m.rateSchedule },
  ];
  for (const dim of dimensions) {
    if (dim.phrase === null) continue;
    const match = matchFilterValue(dim.phrase, realValues(meters, dim.pick));
    if (match.kind === "exact" || match.kind === "one") {
      action[dim.key] = match.value;
      continue;
    }
    // No real value matches, or several do: do NOT silently filter to nothing. Name the closest real
    // values so the grower can pick (or, for `none`, learn the phrase is not on the farm). Naming
    // candidates here reuses the same `clarify` channel the meter ambiguity rule uses.
    if (match.kind === "many") return { kind: "clarify", candidates: match.values };
    return { kind: "clarify", candidates: realValues(meters, dim.pick) };
  }

  // Nothing actionable in the request (no meter, no valid lens, no clear, no filter): found nothing.
  if (Object.keys(action).length === 0) return { kind: "none" };
  return { kind: "navigate", action, state: stateForAction(meters, action) };
>>>>>>> night/integration
}
