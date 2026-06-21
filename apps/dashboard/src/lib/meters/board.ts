// Assemble the board's TOP-TILE summary from a feed result: the at-risk count, the single most
// urgent meter, the running cycle demand-charge total + where it is headed, and the inputs the
// daily risk read needs. This is the one place that answers "do I need to pay attention right
// now?" - and it deliberately produces NO single farm-wide distance-to-next-peak number (that
// would imply a shared peak; demand is per meter). The only farm-wide figures are DOLLAR
// roll-ups (sums of independent per-meter charges) and COUNTS.
//
// Pure: takes the feed result + the reference now; deterministic. Colocated tests in board.test.ts.

import { assessMeter, mostUrgent, worstLevel, type MeterRisk } from "./risk";
import { dailyRiskRead, freshnessPhrase, type WeatherHint } from "./read";
import type { RiskLevel } from "./config";
import type { MetersFeedResult } from "./types";

export type BoardSummary = {
  /** Every meter, assessed (the board + groups consume this). */
  risks: MeterRisk[];
  meterCount: number;
  /** Count of meters in watch or danger. */
  atRiskCount: number;
  /** Count of meters already setting a NEW peak right now (the most urgent state). */
  settingNewPeakCount: number;
  /** The single most urgent meter, or null. */
  urgent: MeterRisk | null;
  /** The worst level on the whole farm (drives the tile's accent). */
  worst: RiskLevel;
  /** Demand dollars ALREADY locked in this cycle across all meters (a sum of per-meter charges). */
  cycleDemandLockedUsd: number;
  /** Added demand dollars if every at-risk meter crosses its peak (where the total is headed). */
  cycleDemandHeadedUsd: number;
  /** The daily risk read (level word + plain-English line). */
  read: { level: "high" | "moderate" | "low"; line: string };
  /** Freshness phrase for the whole pull ("about 1 day ago"); the lag, made visible. */
  asOfPhrase: string;
  /** Raw asOf ISO, for a precise timestamp tooltip/datetime attr. */
  asOfIso: string;
  /** True when the data is representative (drives the demo marking). */
  representative: boolean;
};

/** Build the top-tile summary. `weather` defaults to a hot afternoon (the demo's high-risk
 *  read); a live build feeds a real forecast hint. */
export function buildBoardSummary(
  feed: MetersFeedResult,
  now: Date,
  weather: WeatherHint = "hot",
): BoardSummary {
  const risks = feed.meters.map(assessMeter);
  const atRiskCount = risks.filter((r) => r.level !== "safe").length;
  const settingNewPeakCount = risks.filter((r) => r.settingNewPeak).length;
  const cycleDemandLockedUsd = risks.reduce((s, r) => s + r.lockedDemandUsd, 0);
  const headedDelta = risks
    .filter((r) => r.level !== "safe")
    .reduce((s, r) => s + r.crossPeakCostUsd, 0);

  return {
    risks,
    meterCount: risks.length,
    atRiskCount,
    settingNewPeakCount,
    urgent: mostUrgent(risks),
    worst: worstLevel(risks),
    cycleDemandLockedUsd,
    cycleDemandHeadedUsd: cycleDemandLockedUsd + headedDelta,
    read: dailyRiskRead(risks, weather),
    asOfPhrase: freshnessPhrase(feed.asOf, now),
    asOfIso: feed.asOf,
    representative: feed.representative,
  };
}
