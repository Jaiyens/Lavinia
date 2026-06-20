// Portfolio summary across the whole operation: the numbers for the thin strip over the map
// (total acres, blocks, acres by crop, % leased, leases expiring this year, blocks needing
// attention). Pure + tested. `parcelNeedsAttention` is shared with the map so a flagged block is
// marked the same way everywhere.

import { bucketFor } from "./color";
import type { FarmParcel } from "./types";

/** A block needs a look when its canopy vigor is low or it has an overdue task. */
export function parcelNeedsAttention(parcel: FarmParcel): boolean {
  const lowVigor = parcel.health.ndvi_latest !== null && parcel.health.ndvi_latest < 0.55;
  const overdue = parcel.compliance.upcoming_tasks.some((t) => t.overdue);
  return lowVigor || overdue;
}

export type CropAcres = { crop: string; acres: number; color: string };

export type PortfolioSummary = {
  total_acres: number;
  net_planted_acres: number;
  block_count: number;
  /** Acres by crop, largest first. */
  acres_by_crop: CropAcres[];
  /** Share of gross acres that is leased, 0-100. */
  pct_leased: number;
  /** Leases whose expiry falls in the given calendar year. */
  leases_expiring: { count: number; acres: number };
  needs_attention: number;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function summarize(parcels: FarmParcel[], year: number): PortfolioSummary {
  let total = 0;
  let net = 0;
  let leasedAcres = 0;
  let expiringCount = 0;
  let expiringAcres = 0;
  let attention = 0;
  const cropAcres = new Map<string, { acres: number; color: string }>();

  for (const p of parcels) {
    const acres = p.identity.gross_acres;
    total += acres;
    net += p.identity.net_planted_acres;

    const crop = p.planting.crop;
    const color = bucketFor(p, "crop", year).color;
    const hit = cropAcres.get(crop);
    if (hit) hit.acres += acres;
    else cropAcres.set(crop, { acres, color });

    if (p.identity.tenure === "leased") {
      leasedAcres += acres;
      // Compare on the YYYY prefix of the plain date string; new Date("YYYY-MM-DD").getFullYear()
      // parses as UTC midnight and reads back the LOCAL year, miscounting Jan-1 expiries in PT.
      if (p.identity.lease_expiry && Number(p.identity.lease_expiry.slice(0, 4)) === year) {
        expiringCount += 1;
        expiringAcres += acres;
      }
    }
    if (parcelNeedsAttention(p)) attention += 1;
  }

  const acres_by_crop: CropAcres[] = [...cropAcres.entries()]
    .map(([crop, v]) => ({ crop, acres: round1(v.acres), color: v.color }))
    .sort((a, b) => b.acres - a.acres);

  return {
    total_acres: round1(total),
    net_planted_acres: round1(net),
    block_count: parcels.length,
    acres_by_crop,
    pct_leased: total > 0 ? Math.round((leasedAcres / total) * 100) : 0,
    leases_expiring: { count: expiringCount, acres: round1(expiringAcres) },
    needs_attention: attention,
  };
}
