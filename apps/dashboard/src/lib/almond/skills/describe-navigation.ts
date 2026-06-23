import { en } from "@/copy/en";
import type { NavigateAction, NavState } from "./navigate";

/**
 * Verify-before-narrate copy (T5), composed from the POST-action state, never the request, so Almond
 * can only claim a count the table actually shows. Defined here (the composer that owns this voice)
 * rather than imported, kept in the same plain-operator register as the rest of the navigated copy in
 * /copy/en.ts: no kW/tariff jargon, no exclamation marks, no em dashes.
 */
const verified = {
  /** A clear that returns the table to every meter ("Showing all 183 meters"). */
  showingAll: (count: number): string => `Showing all ${count} meters`,
  /** A filter that landed on a real subset, stating BOTH the dimension and the real count. */
  filteredCount: (what: string, count: number): string => `Filtered to ${what}, ${count} meters`,
  /** A filter that matched nothing: honest, never phrased as a success. */
  noMatch: "No meters match that filter",
} as const;

/**
 * Compose the plain-operator-English label for an action chip (Story 7.5, FR2/FR20).
 *
 * Every navigation Almond performs leaves an action chip in the conversation that the grower can
 * read ("Opened Pump 17", "Showed the map", "Filtered the table to AG-4 meters") and tap to return
 * to that view. This is the single source of that copy: pure, so it is unit-testable offline, and
 * sourced from `/copy/en.ts` so the voice (no kW/tariff jargon, no exclamation marks, no em dashes)
 * is pinned in one place and stays consistent with the rest of Almond.
 *
 * Composed SERVER-side (see responder.ts `writeNavigatePart`) because the chip needs the meter
 * NAME, while the `NavigateAction` carries only the meter id — the name is resolved against the
 * farm-scoped meter list at the call site and passed in here. The lens value is already a plain
 * word (map/table/chart/calendar) so no lookup is needed for it.
 *
 * VERIFY BEFORE NARRATE (T5): when the resolver's post-action `state` is passed, a filter/clear is
 * labeled from the REAL resulting count, never the request — so the chip can only say "Showing all
 * 183 meters" when the table actually shows 183, "Filtered to AG-A1, 21 meters" when it lands on 21,
 * and "No meters match that filter" when the filter empties the table (never phrased as a success).
 * A meter-open or lens-only move ignores the count (it carries no filter change). With no state
 * (the legacy/chip-replay path), it falls back to the request-derived copy below.
 */
export function describeNavigation(
  action: NavigateAction,
  meterName?: string | null,
  state?: NavState,
): string {
  const c = en.shell.almond.navigated;

  // A meter open is the whole intent (the skill never combines it with a lens/filter). Use the
  // resolved name; fall back to a neutral noun only if a clean resolve somehow lacked one.
  if (typeof action.meter === "string" && action.meter !== "") {
    const name = meterName && meterName.trim() !== "" ? meterName : c.meterFallback;
    return c.meter(name);
  }
  // An explicit null clears the meter key (closes the drawer). The v1 skill does not emit this, but
  // the action shape admits it, so describe it honestly rather than as "Moved the screen".
  if (action.meter === null) return c.closed;

  // Whether this action touches the filter (any of the three filter keys is present, even a null
  // clear). The lens key alone is not a filter change.
  const touchesFilter =
    action.entity !== undefined || action.ranch !== undefined || action.rate !== undefined;

  // VERIFY-BEFORE-NARRATE: with the post-action state and a filter change, the copy is generated
  // FROM the real resulting count, so it can never overstate the result.
  if (state && touchesFilter) {
    // A clear (all three filter keys nulled): the table is back to the whole farm. Quote the real
    // total the state computed, never an assumed "183".
    const cleared =
      action.entity === null && action.ranch === null && action.rate === null;
    if (cleared) {
      const lensText = action.lens ? `${c.lens(action.lens)}. ` : "";
      return `${lensText}${verified.showingAll(state.visibleMeterCount)}`;
    }
    // A filter that emptied the table: honest, never a success phrasing.
    if (state.visibleMeterCount === 0) return verified.noMatch;
    // A filter that landed on a real subset: name the dimension AND the real count.
    const what = filterDescriptor(action, c);
    const filterText = verified.filteredCount(what, state.visibleMeterCount);
    return action.lens ? `${c.lens(action.lens)}. ${filterText}` : filterText;
  }

  // Lens / filter path WITHOUT state (chip replay, or a legacy caller). Assemble the filter clauses
  // in a stable order so the sentence is deterministic, then combine with the lens into one sentence.
  const filters: string[] = [];
  if (action.entity) filters.push(action.entity);
  if (action.ranch) filters.push(c.ranchSuffix(action.ranch));
  if (action.rate) filters.push(c.rateSuffix(action.rate));
  const filterText = filters.join(", ");

  if (action.lens && filterText !== "") return c.lensAndFilter(action.lens, filterText);
  if (filterText !== "") return c.filtered(filterText);
  if (action.lens) return c.lens(action.lens);

  // Nothing recognizable (never reached for a clean `navigate` resolve).
  return c.fallback;
}

/** The plain-English noun for whichever filter dimension(s) the action set, in a stable order, so the
 *  verify-before-narrate copy reads naturally ("AG-A1 meters", "Westside ranch", "Batth LLC"). A null
 *  clear has no descriptor (handled by the clear branch); only set, non-null values are described. */
function filterDescriptor(
  action: NavigateAction,
  c: (typeof en)["shell"]["almond"]["navigated"],
): string {
  const parts: string[] = [];
  if (action.entity) parts.push(action.entity);
  if (action.ranch) parts.push(c.ranchSuffix(action.ranch));
  if (action.rate) parts.push(c.rateSuffix(action.rate));
  return parts.join(", ");
}
