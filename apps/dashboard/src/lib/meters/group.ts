// DYNAMIC grouping: derive a meter's group from the DATA, not a hand-config, so a farmer
// thinks in blocks/ranches ("Avenue 7", "Westside") while demand stays billed per meter.
//
// A GROUP IS ORGANIZATIONAL, NEVER A BILLING UNIT. group.ts may sum DOLLARS (total locked
// demand, total spend) and COUNT at-risk meters, and its risk indicator is its WORST meter -
// but it never exposes a group kW or a group "distance to peak" (that would imply a shared
// peak; demand is per meter, full stop). See MeterGroup below: there is no kW field.
//
// Grouping precedence (most trusted first):
//   1. A MANUAL correction the farmer made (persisted in localStorage; survives re-uploads).
//   2. The source's explicit `group` field, when present.
//   3. Inferred from the meter NAME ("Avenue 7 Pump 3" -> "Avenue 7").
//   4. Physical proximity from lat/lng (a coarse geo-cell), when names don't encode structure.
//   5. "Ungrouped" as the honest last resort.
//
// Pure: no UI, no DB, no clock, no localStorage (the component owns persistence; this takes
// the correction map as an argument). Colocated tests in group.test.ts.

import { assessMeter, worstLevel, type MeterRisk } from "./risk";
import type { RiskLevel } from "./config";
import type { MeterSnapshot } from "./types";

/** A farmer's manual grouping fixes: meter id -> the group name they assigned. Persisted by
 *  the component (localStorage) and passed in here so this stays pure + testable. */
export type GroupOverrides = Record<string, string>;

/** One group container the board renders. NOTE the deliberate absence of any kW field. */
export type MeterGroup = {
  /** The group's display name ("Avenue 7"). Also its stable key. */
  name: string;
  risks: MeterRisk[];
  /** Count of meters in watch or danger (the at-risk count the container shows). */
  atRiskCount: number;
  /** The group's risk indicator = its WORST meter's level, never an average. */
  worst: RiskLevel;
  /** Summed demand dollars ALREADY locked in across the group's meters (a roll-up, not a peak). */
  totalLockedDemandUsd: number;
  /** Summed cross-peak exposure across the group (a dollar roll-up, never a pooled kW). */
  totalCrossPeakCostUsd: number;
};

const UNGROUPED = "Ungrouped";

/**
 * Infer a group name from a meter name that encodes structure. Strips a trailing unit token
 * ("Pump 3", "Well 2", "#4") so "Avenue 7 Pump 3" -> "Avenue 7" and "Westside Well 1" ->
 * "Westside". Returns null when the name has no inferable block prefix (e.g. "Shop").
 */
export function inferGroupFromName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  // Drop a trailing unit designator: pump/well/booster/motor/meter + optional number, or a
  // bare "#3" / trailing number. Case-insensitive; collapse leftover whitespace.
  const stripped = trimmed
    .replace(/\s*[#-]?\s*\d+\s*$/i, "")
    .replace(/\s+(pump|well|booster|motor|meter|sta(?:tion)?|set)\s*\d*\s*$/i, "")
    .trim();
  // If stripping removed everything, or left only a unit word, there's no block prefix.
  if (stripped.length === 0) return null;
  if (/^(pump|well|booster|motor|meter|shop|station|set)$/i.test(stripped)) return null;
  // Require that stripping actually shortened the name (so a bare "Shop" stays ungrouped).
  if (stripped === trimmed) return null;
  return stripped;
}

/** A coarse proximity cell label from coordinates, the last structural fallback. Rounds to a
 *  ~0.01deg cell (~1km) so nearby meters share a cell. Returns null when coords are absent. */
export function inferGroupFromCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cellLat = (Math.round(lat * 100) / 100).toFixed(2);
  const cellLng = (Math.round(lng * 100) / 100).toFixed(2);
  return `Block ${cellLat}, ${cellLng}`;
}

/** Resolve ONE meter's group name through the full precedence chain. */
export function resolveGroupName(meter: MeterSnapshot, overrides: GroupOverrides): string {
  const manual = overrides[meter.id];
  if (manual !== undefined && manual.trim().length > 0) return manual.trim();
  if (meter.group !== null && meter.group.trim().length > 0) return meter.group.trim();
  const fromName = inferGroupFromName(meter.name);
  if (fromName !== null) return fromName;
  const fromCoords = inferGroupFromCoords(meter.lat, meter.lng);
  if (fromCoords !== null) return fromCoords;
  return UNGROUPED;
}

/**
 * Group + assess a set of meters into board-ready containers. Applies the manual-correction
 * map, assesses each meter's per-meter risk, rolls up DOLLAR totals + the at-risk count + the
 * worst level per group, and orders groups worst-first (then by exposure) so the dangerous
 * blocks float to the top. Pure: the same meters + overrides always give the same board.
 */
export function buildGroups(
  meters: MeterSnapshot[],
  overrides: GroupOverrides,
): MeterGroup[] {
  const byGroup = new Map<string, MeterRisk[]>();
  for (const meter of meters) {
    const name = resolveGroupName(meter, overrides);
    const list = byGroup.get(name) ?? [];
    list.push(assessMeter(meter));
    byGroup.set(name, list);
  }

  const groups: MeterGroup[] = [];
  for (const [name, risks] of byGroup) {
    groups.push({
      name,
      risks,
      atRiskCount: risks.filter((r) => r.level !== "safe").length,
      worst: worstLevel(risks),
      totalLockedDemandUsd: risks.reduce((s, r) => s + r.lockedDemandUsd, 0),
      totalCrossPeakCostUsd: risks.reduce((s, r) => s + r.crossPeakCostUsd, 0),
    });
  }

  const levelRank: Record<RiskLevel, number> = { danger: 0, watch: 1, safe: 2 };
  return groups.sort((a, b) => {
    if (levelRank[a.worst] !== levelRank[b.worst]) {
      return levelRank[a.worst] - levelRank[b.worst];
    }
    if (b.totalCrossPeakCostUsd !== a.totalCrossPeakCostUsd) {
      return b.totalCrossPeakCostUsd - a.totalCrossPeakCostUsd;
    }
    // Ungrouped always sinks to the bottom among equals.
    if (a.name === UNGROUPED) return 1;
    if (b.name === UNGROUPED) return -1;
    return a.name.localeCompare(b.name);
  });
}

/** Every distinct group name currently on the board (for the "move to group" picker). */
export function groupNames(groups: MeterGroup[]): string[] {
  return groups.map((g) => g.name);
}
