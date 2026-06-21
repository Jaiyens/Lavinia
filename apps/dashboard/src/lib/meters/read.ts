// The plain-language DAILY RISK READ + the freshness math the top tile shows. The read is the
// "do I need to pay attention right now?" sentence: it COMBINES the day's weather, the farm's
// usual pumping schedule, and current per-meter headroom into one operator-English line, with
// stagger advice ONLY when the overlapping loads are on the SAME meter (never across meters).
//
// Pure: no UI, no DB. It takes the assessed risks + a weather hint + the reference clock so it
// stays deterministic + testable. Colocated tests in read.test.ts.

import type { MeterRisk } from "./risk";
import { byUrgency } from "./risk";

/** A coarse weather signal for the read. A live build feeds this from a forecast; the demo
 *  derives a believable "hot afternoon" by default so the high-risk read shows. */
export type WeatherHint = "hot" | "mild" | "cool";

/** The freshness of a read instant relative to now, for the "as of" line. Never says "live". */
export function freshnessHours(asOfIso: string, now: Date): number {
  const asOf = new Date(asOfIso).getTime();
  return Math.max(0, (now.getTime() - asOf) / (60 * 60 * 1000));
}

/** Whole-hour/day freshness phrase ("about 1 day ago", "about 6 hours ago"). Copy-ready. */
export function freshnessPhrase(asOfIso: string, now: Date): string {
  const hours = freshnessHours(asOfIso, now);
  if (hours >= 20) {
    const days = Math.max(1, Math.round(hours / 24));
    return days === 1 ? "about 1 day ago" : `about ${days} days ago`;
  }
  const h = Math.max(1, Math.round(hours));
  return h === 1 ? "about 1 hour ago" : `about ${h} hours ago`;
}

/** A meter is "hugging its ceiling" when it is in danger but not yet over the peak (the prime
 *  candidate for an afternoon spike, the case the read warns about). */
function huggingCeiling(risks: MeterRisk[]): MeterRisk[] {
  return risks.filter((r) => r.level === "danger" && !r.settingNewPeak);
}

/**
 * Build the daily risk read. Returns a short headline level word + a one-line plain-English
 * explanation. The logic:
 *  - If any meter is already setting a new peak -> high, name it (a new charge is locking in now).
 *  - Else if meters are hugging their ceiling on a hot day -> high, weather + schedule framing.
 *  - Else if some are in watch -> moderate.
 *  - Else -> low.
 * Stagger advice appears ONLY for two danger pumps that share ONE meter id (impossible in the
 * one-meter-per-id model, so this read never fabricates cross-meter stagger advice).
 */
export function dailyRiskRead(
  risks: MeterRisk[],
  weather: WeatherHint,
): { level: "high" | "moderate" | "low"; line: string } {
  const ranked = byUrgency(risks);
  const overPeak = ranked.filter((r) => r.settingNewPeak);
  const hugging = huggingCeiling(ranked);
  const watching = ranked.filter((r) => r.level === "watch");

  if (overPeak.length > 0) {
    const names = overPeak.slice(0, 2).map((r) => r.meter.name).join(" and ");
    const more = overPeak.length > 2 ? ` and ${overPeak.length - 2} more` : "";
    return {
      level: "high",
      line: `${names}${more} ${overPeak.length === 1 ? "is" : "are"} drawing above the highest point set so far this cycle, which locks in a bigger demand charge. Ease off if you can.`,
    };
  }

  if (hugging.length > 0) {
    const hot = weather === "hot";
    const names = hugging.slice(0, 2).map((r) => r.meter.name).join(" and ");
    const weatherClause = hot
      ? "Hot afternoon ahead and these run hard when it heats up"
      : "These are running close to the highest point set so far this cycle";
    return {
      level: hot ? "high" : "moderate",
      line: `${weatherClause}. ${names} ${hugging.length === 1 ? "is" : "are"} a hair under the highest point this cycle, so one heavier run sets a new, costlier peak. Watch them this afternoon.`,
    };
  }

  if (watching.length > 0) {
    return {
      level: "moderate",
      line: `${watching.length} ${watching.length === 1 ? "meter is" : "meters are"} climbing toward the highest point set so far this cycle. No new peak yet, but keep an eye on the afternoon run.`,
    };
  }

  return {
    level: "low",
    line: "Every meter is comfortably below the highest point it has already set this cycle. Nothing is on track to add a new demand charge today.",
  };
}
