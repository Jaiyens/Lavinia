// The Meters board domain types + the data-source SEAM. The board is built entirely against
// the MeterSnapshot / MetersFeed interface below, NOT against any concrete data source. Today
// the representative generator (generate.ts) implements MetersFeed; tomorrow a live Share My
// Data interval feed implements the SAME interface and the board renders unchanged. See the
// "LIVE DATA GOES HERE" marker in generate.ts.
//
// THE ONE RULE these types encode: PG&E bills demand PER METER on each meter's own highest
// 15-min kW of the cycle. So every kW figure here is per-meter; there is no pooled/group kW
// field anywhere in the shape, by design (a group can sum DOLLARS and count at-risk meters,
// never a kW). See group.ts.
//
// Pure types: no UI, no DB, no clock.

/** A meter's read snapshot. Current draw ALWAYS carries the timestamp it is actually from,
 *  because interval data lags ~1 day and we must never render day-old data as "live". */
export type MeterSnapshot = {
  /** Stable id (PG&E SA id in production; a synthetic id in the representative feed). */
  id: string;
  /** The farmer's own name for the meter, e.g. "Avenue 7 Pump 3", "Shop". Encodes structure. */
  name: string;
  /** Kind, for the icon + plain-language read. A "shop"/non-pump never gets stagger advice. */
  kind: "pump" | "well" | "shop";
  /** Explicit grouping field when the source carries one (production may). Null = infer it. */
  group: string | null;
  /** Optional coordinates, the proximity fallback for grouping when names don't encode it. */
  lat: number | null;
  lng: number | null;
  /** The meter's PG&E rate schedule (e.g. "AG-A1"), so demand $/kW reads the right plan. */
  rateSchedule: string;
  /** The demand $/kW for this meter, RESOLVED BY THE FEED from the shared rate card. The feed
   *  owns this lookup because the card is read server-side (node:fs); the risk math then stays
   *  pure + client-safe, reading this number instead of touching the card. A live feed resolves
   *  it the same way. */
  dollarsPerKw: number;
  /** Highest single 15-min kW SO FAR this billing cycle. THIS is the billed-demand ceiling. */
  peakSoFarKw: number;
  /** Most recent 15-min average kW (the "current draw"). Compared to peakSoFarKw for headroom. */
  currentKw: number;
  /** The ISO instant currentKw is actually FROM (a real read, ~1 day behind now). Never "now". */
  currentAsOf: string;
  /** Minute-of-day (0..1425) the peak-so-far occurred at, to anchor the day curve's shape. */
  peakAtMinute: number;
  /** Average/peak duty cycle for this meter's day shape (feeds synthesizeDay's loadFactor). */
  loadFactor: number;
  /** Deterministic seed so the same meter always draws the same representative day curve. */
  seed: string;
  /** ISO date the current billing cycle started (for "this cycle" framing). */
  cycleStartIso: string;
  /** ISO date the current billing cycle closes (drives season + the demand-charge framing). */
  cycleCloseIso: string;
};

/** One pull from a data source: the meters + ONE freshness stamp for the whole pull. The
 *  board shows asOf prominently so the ~1-day lag is always visible, never hidden. */
export type MetersFeedResult = {
  meters: MeterSnapshot[];
  /** When this pull's interval data is current TO (the newest read across meters). */
  asOf: string;
  /** True for the representative generator so the UI marks the data as representative. */
  representative: boolean;
};

/** The data-source seam. The board depends ONLY on this. Representative now, live later. */
export interface MetersFeed {
  load(): MetersFeedResult;
}
