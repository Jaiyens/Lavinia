import { en } from "@/copy/en";
import type { NavigateAction } from "./navigate";

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
 */
export function describeNavigation(action: NavigateAction, meterName?: string | null): string {
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

  // Lens / filter path. Assemble the filter clauses in a stable order so the sentence is
  // deterministic, then combine with the lens into one clear sentence.
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
