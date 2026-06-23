// A meter's representative 15-minute day curve. PURE (no fs/rate-card), so the client detail
// drawer can import it directly. A thin wrapper over the shared energy foundation's synthesizeDay
// so the board never re-implements load shaping. The curve's maximum === the meter's peak-so-far
// by construction (synthesizeDay reconciles to the billed peak), so the detail view's ceiling
// line sits exactly on the curve's highest point.

import { synthesizeDay } from "@/lib/energy/load-shape";
import type { MeterSnapshot } from "./types";

export function meterDayCurve(
  meter: MeterSnapshot,
): { points: { minute: number; kw: number }[]; peakIndex: number } {
  return synthesizeDay({
    peakKw: meter.peakSoFarKw,
    peakAtMinute: meter.peakAtMinute,
    loadFactor: meter.loadFactor,
    seed: meter.seed,
  });
}
