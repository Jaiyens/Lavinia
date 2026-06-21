// The REPRESENTATIVE Meters feed: a believable multi-group dataset so the board renders fully
// on first load, with no backend and zero external calls. It implements the MetersFeed seam
// (types.ts) - the SAME interface a live Share My Data interval feed will implement later.
//
// ============================== LIVE DATA GOES HERE ==============================
// To wire real interval data: implement MetersFeed.load() against Share My Data (per-meter
// 15-min series + each meter's peak-so-far this cycle + the newest read instant as `asOf`),
// set `representative: false`, and swap which feed the page constructs. NOTHING ELSE in the
// board changes - group.ts, risk.ts and every component depend only on the MeterSnapshot shape
// and the asOf stamp, never on this generator. The ~1-day lag is already modeled: currentAsOf
// is a real past read instant, not "now", and the board surfaces it everywhere a draw shows.
// =================================================================================
//
// Pure given its clock input: load() takes the reference "now" so it is deterministic + testable
// (no hidden Date.now()). The page passes the real now; tests pass a fixed instant.

import { demandDollarsPerKw } from "./rate";
import type { MeterSnapshot, MetersFeed, MetersFeedResult } from "./types";

/** Interval data lags about one day; the newest read we can show is this far behind "now". */
const LAG_MS = 26 * 60 * 60 * 1000; // ~1 day (26h: a believable "yesterday evening" read).

/** The fixed shape of one representative meter before we resolve its time-relative fields. */
type Spec = {
  id: string;
  name: string;
  kind: MeterSnapshot["kind"];
  group: string | null;
  lat: number | null;
  lng: number | null;
  rateSchedule: string;
  peakSoFarKw: number;
  /** currentKw as a fraction of peakSoFar, so we can place a meter near (or over) its ceiling. */
  currentFracOfPeak: number;
  peakAtMinute: number;
  loadFactor: number;
};

// A believable Central Valley almond operation: three named blocks + a shop, a mix of pumps
// and wells, distinct load shapes (different peakKw / loadFactor / peak hour), and AT LEAST ONE
// meter deliberately right under its ceiling (Avenue 7 Pump 3) plus one already setting a new
// peak (Lateral 3 Booster) so the danger/red state shows on first load. Names encode structure
// so grouping is inferred, not hand-fed (group is left null except where we exercise the
// explicit-field path on the Shop).
const SPECS: readonly Spec[] = [
  // Avenue 7: the at-risk block. Pump 3 is hugging its ceiling (the headline danger).
  { id: "m-av7-p1", name: "Avenue 7 Pump 1", kind: "pump", group: null, lat: 36.74, lng: -119.79, rateSchedule: "AG-A1", peakSoFarKw: 168, currentFracOfPeak: 0.52, peakAtMinute: 15 * 60, loadFactor: 0.34 },
  // WATCH: 4-8% under its ceiling - climbing, no new peak yet.
  { id: "m-av7-p2", name: "Avenue 7 Pump 2", kind: "pump", group: null, lat: 36.74, lng: -119.79, rateSchedule: "AG-A1", peakSoFarKw: 152, currentFracOfPeak: 0.94, peakAtMinute: 16 * 60, loadFactor: 0.41 },
  // DANGER: drawing 145 with a 150 ceiling, climbing. The 145-vs-150 case from the brief.
  { id: "m-av7-p3", name: "Avenue 7 Pump 3", kind: "pump", group: null, lat: 36.741, lng: -119.788, rateSchedule: "AG-B", peakSoFarKw: 150, currentFracOfPeak: 0.967, peakAtMinute: 15 * 60 + 30, loadFactor: 0.46 },

  // Westside: a calmer block of wells. One "watch", the rest safe (a deep well peaked early).
  { id: "m-ws-w1", name: "Westside Well 1", kind: "well", group: null, lat: 36.71, lng: -119.86, rateSchedule: "AG-C", peakSoFarKw: 210, currentFracOfPeak: 0.55, peakAtMinute: 11 * 60, loadFactor: 0.30 },
  { id: "m-ws-w2", name: "Westside Well 2", kind: "well", group: null, lat: 36.71, lng: -119.86, rateSchedule: "AG-C", peakSoFarKw: 188, currentFracOfPeak: 0.83, peakAtMinute: 14 * 60, loadFactor: 0.38 },
  { id: "m-ws-p1", name: "Westside Pump 1", kind: "pump", group: null, lat: 36.709, lng: -119.861, rateSchedule: "AG-A2", peakSoFarKw: 96, currentFracOfPeak: 0.4, peakAtMinute: 9 * 60, loadFactor: 0.28 },

  // Lateral 3: a small block whose booster is ALREADY setting a new peak (over its ceiling).
  { id: "m-l3-b1", name: "Lateral 3 Booster", kind: "pump", group: null, lat: 36.69, lng: -119.74, rateSchedule: "AG-A1", peakSoFarKw: 64, currentFracOfPeak: 1.06, peakAtMinute: 17 * 60, loadFactor: 0.52 },
  { id: "m-l3-w1", name: "Lateral 3 Well 1", kind: "well", group: null, lat: 36.69, lng: -119.74, rateSchedule: "AG-A2", peakSoFarKw: 142, currentFracOfPeak: 0.6, peakAtMinute: 13 * 60, loadFactor: 0.33 },

  // The shop: an explicit-group meter (exercises the source `group` field) that never gets
  // stagger advice (kind !== pump). Far from a ceiling.
  { id: "m-shop", name: "Shop", kind: "shop", group: "Home Ranch", lat: 36.75, lng: -119.8, rateSchedule: "AG-A1", peakSoFarKw: 38, currentFracOfPeak: 0.45, peakAtMinute: 10 * 60, loadFactor: 0.5 },
];

/** Build one snapshot from a spec, anchored to the reference now (cycle dates + read instant). */
function toSnapshot(spec: Spec, now: Date): MeterSnapshot {
  const currentAsOf = new Date(now.getTime() - LAG_MS);
  // Current billing cycle: the calendar month containing `now` (a reasonable demo cycle; a
  // real feed carries the meter's actual serial-code cycle). UTC to stay deterministic.
  const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cycleClose = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const currentKw = Math.round(spec.peakSoFarKw * spec.currentFracOfPeak * 10) / 10;
  // Resolve the demand $/kW from the SHARED rate card here in the feed (server-side). A live
  // feed resolves it the same way; the client board never reads the card.
  const dollarsPerKw = demandDollarsPerKw({
    rateSchedule: spec.rateSchedule,
    observedPeakKw: spec.peakSoFarKw,
    cycleCloseIso: cycleClose.toISOString().slice(0, 10),
  });
  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    group: spec.group,
    lat: spec.lat,
    lng: spec.lng,
    rateSchedule: spec.rateSchedule,
    dollarsPerKw,
    peakSoFarKw: spec.peakSoFarKw,
    currentKw,
    currentAsOf: currentAsOf.toISOString(),
    peakAtMinute: spec.peakAtMinute,
    loadFactor: spec.loadFactor,
    seed: spec.id,
    cycleStartIso: cycleStart.toISOString().slice(0, 10),
    cycleCloseIso: cycleClose.toISOString().slice(0, 10),
  };
}

/** The representative feed. Deterministic for a given `now`. */
export function representativeFeed(now: Date): MetersFeed {
  return {
    load(): MetersFeedResult {
      const meters = SPECS.map((spec) => toSnapshot(spec, now));
      const asOf = new Date(now.getTime() - LAG_MS).toISOString();
      return { meters, asOf, representative: true };
    },
  };
}
