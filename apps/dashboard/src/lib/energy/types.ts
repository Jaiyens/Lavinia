// Domain value types for the energy math. Types only, no logic, no UI, no DB.
// The pure functions in Phase 1+ operate on these. Expand as phases land.

/** One 15-minute interval meter reading, as parsed from ESPI usage data. */
export type IntervalReading = {
  /** Interval start, ISO 8601. */
  start: string;
  /** Interval length in seconds. PG&E intervals are 900 (15 min). */
  durationSec: number;
  /** Energy consumed in the interval, kWh. */
  kWh: number;
};

/** A billing cycle window for a pump, derived from its meter-read schedule. */
export type BillingCycle = {
  /** Cycle start, ISO date (YYYY-MM-DD). */
  start: string;
  /** Cycle close, ISO date (YYYY-MM-DD). */
  close: string;
};

/**
 * The four demand-charge levers, in CLAUDE.md priority order. Used to tag which
 * lever a recommendation pulls. Logic for each arrives in later phases.
 */
export type LeverKind =
  | "stagger" // coincident-peak staggering across pumps (the big recurring money)
  | "shift_peak" // move load off the 4-9pm peak
  | "demand_response" // flag PDP/CBP/BIP enrollment
  | "cycle_edge"; // do not set a fresh peak on a nearly-closed cycle

/**
 * A planned or typical pump run: a load held over a time range. The unit the
 * coincident-peak and off-peak levers reason about. Times are ISO 8601 UTC; the
 * 4-9pm peak window is resolved in the farm's local timezone (see peak.ts).
 */
export type PumpRun = {
  pumpId: string;
  pumpName: string;
  /** Run start, ISO 8601 UTC. */
  start: string;
  /** Run end, ISO 8601 UTC (half-open). */
  end: string;
  /** Average load while running, kW. */
  kw: number;
  /**
   * False for an agronomically fixed run (frost, heat, a stressed block) that
   * must not be moved. Undefined or true means the run can be staggered/shifted.
   * Agronomy beats energy: the levers never touch a non-deferrable run.
   */
  deferrable?: boolean;
};

/**
 * One posted billing cycle's demand facts, as a plain value (no DB). Mirrors the
 * BillingPeriod fields the retrospective and reconcile levers read. The $/kW rate
 * is derived from demandChargeUsd and peakKw, never hardcoded.
 */
export type CycleBill = {
  /** Cycle window start, ISO 8601. */
  start: string;
  /** Cycle window close, ISO 8601. */
  close: string;
  tariff?: string | null;
  /** Total demand charge dollars on the bill. */
  demandChargeUsd: number | null;
  /** The cycle's max-demand peak kW that set the charge. */
  peakKw: number | null;
  peakAt?: string | null;
  totalBillUsd?: number | null;
};

/** A single local day's peak demand within a cycle (retrospective detail). */
export type DailyPeak = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Highest 15-minute kW that day. */
  kw: number;
  /** ISO 8601 timestamp of that peak interval. */
  at: string;
};
