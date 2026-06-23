// Pure visual encodings for the Energy map lens pins (no React, no DOM, no DB). Maps a meter's
// rate schedule to a categorical pin color and its annual spend to a pin diameter, so the heavy
// map component (meter-map.tsx) only renders. Color is NEVER the only signal: every pin also
// carries its rate + spend in the hover popup and its aria label. Pure + unit-tested.

export type RateFamily =
  | "ag_a"
  | "ag_b"
  | "ag_c"
  | "ag_other"
  | "commercial"
  | "legacy"
  | "unknown";

/** Normalize a rate code for prefix tests: upper-cased, whitespace stripped (so "AG 5" == "AG-5"). */
function norm(rateSchedule: string): string {
  return rateSchedule.trim().toUpperCase().replace(/\s+/g, "");
}

/** AG-4 / AG-5 are PG&E's CLOSED legacy agricultural schedules (the rate-optimization targets).
 *  Derived from the rate STRING, not the meter's isLegacy flag, because the flag is not always set
 *  in the imported data even though the schedule plainly says AG-4/AG-5. */
export function isLegacyRate(rateSchedule: string | null): boolean {
  if (!rateSchedule) return false;
  const s = norm(rateSchedule);
  return s.startsWith("AG-4") || s.startsWith("AG-5") || s.startsWith("AG4") || s.startsWith("AG5");
}

/** Bucket a rate schedule into a display family for the pin color. Legacy (AG-4/AG-5) wins so the
 *  closed schedules read as their own category; non-ag rates (B-1, etc.) fall to "commercial". */
export function rateFamily(rateSchedule: string | null): RateFamily {
  if (!rateSchedule) return "unknown";
  if (isLegacyRate(rateSchedule)) return "legacy";
  const s = norm(rateSchedule);
  if (s.startsWith("AG-A") || s.startsWith("AGA")) return "ag_a";
  if (s.startsWith("AG-B") || s.startsWith("AGB")) return "ag_b";
  if (s.startsWith("AG-C") || s.startsWith("AGC")) return "ag_c";
  if (s.startsWith("AG")) return "ag_other";
  return "commercial";
}

/** Categorical pin colors, tuned into the cool-grey + green house palette. Deliberately avoids the
 *  reserved clay (--alert, the attention border) and charcoal (--on-surface, the legacy ring) so
 *  those two emphasis channels never collide with a fill hue. */
export const RATE_FAMILY_COLOR: Record<RateFamily, string> = {
  ag_a: "#2fa84f", // brand green
  ag_b: "#f2c14e", // gold
  ag_c: "#3b82c4", // sky blue
  ag_other: "#7a5cc0", // violet (other ag, e.g. AG-VS)
  commercial: "#5b6470", // neutral grey (B-1 / non-ag)
  legacy: "#d98a3d", // amber (the closed AG-4/AG-5 rate-opt targets)
  unknown: "#c3c9d3", // pale grey
};

/** The order families appear in the legend (most common ag rates first, then commercial/unknown). */
export const RATE_FAMILY_ORDER: RateFamily[] = [
  "ag_a",
  "ag_b",
  "ag_c",
  "ag_other",
  "legacy",
  "commercial",
  "unknown",
];

export function colorForRate(rateSchedule: string | null): string {
  return RATE_FAMILY_COLOR[rateFamily(rateSchedule)];
}

// Pin diameter bounds in px (the touch target around the dot stays 44px regardless).
export const PIN_MIN_PX = 12;
export const PIN_MAX_PX = 30;

/** Pin diameter in px for an annual spend, area-proportional (sqrt) between MIN and MAX against the
 *  farm's current max spend. Null/zero spend -> MIN (honest: a meter with no proven spend is never
 *  drawn large). maxSpendCents <= 0 (no priced meters yet) -> every pin at MIN. */
export function sizeForSpend(annualSpendCents: number | null, maxSpendCents: number): number {
  if (annualSpendCents == null || annualSpendCents <= 0 || maxSpendCents <= 0) return PIN_MIN_PX;
  const frac = Math.min(1, Math.sqrt(annualSpendCents / maxSpendCents));
  return Math.round(PIN_MIN_PX + (PIN_MAX_PX - PIN_MIN_PX) * frac);
}
