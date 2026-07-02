// Sales — the pure layer. A sale is a COMMITMENT to a named buyer (append-only CommitmentRecord). The
// available-to-sell pounds for a (cropYear, variety) are the good meats on hand (live TGM = NGM) minus
// what is already committed. A new sale may exceed that (a legitimate forward sale), so the engine
// never clamps: it reports how much a sale OVERSELLS by, and the UI flags it rather than hiding a
// negative. This module owns the arithmetic; no model and no component computes a pound.

import { normalizeVariety } from "./variety";

/** Live TGM aggregated to the sale grain (one figure per cropYear+variety, summed across blocks). */
export type SaleTgm = { cropYear: number; variety: string; tgmLbs: number };
/** Live commitment pounds at the sale grain. */
export type SaleCommitment = { cropYear: number; variety: string; pounds: number };

export type SalePosition = {
  cropYear: number;
  variety: string;
  /** net good meats on hand (from TGM). */
  ngmLbs: number;
  /** pounds already committed/sold. */
  committedLbs: number;
  /** ngm - committed; NEGATIVE when oversold (never clamped). */
  availableLbs: number;
};

const key = (cropYear: number, variety: string): string => `${cropYear} ${variety}`;

/**
 * Roll TGM + commitments up to available-to-sell per (cropYear, variety). available = ngm - committed,
 * left signed so an oversold cell reads negative honestly. Rows appear for any cell that has TGM or a
 * commitment. Sorted by cropYear desc, then variety. Pure.
 */
export function salePositions(
  tgm: readonly SaleTgm[],
  commitments: readonly SaleCommitment[],
): SalePosition[] {
  const ngm = new Map<string, number>();
  const committed = new Map<string, number>();
  const meta = new Map<string, { cropYear: number; variety: string }>();

  for (const t of tgm) {
    const v = normalizeVariety(t.variety);
    const k = key(t.cropYear, v);
    ngm.set(k, (ngm.get(k) ?? 0) + t.tgmLbs);
    if (!meta.has(k)) meta.set(k, { cropYear: t.cropYear, variety: v });
  }
  for (const c of commitments) {
    const v = normalizeVariety(c.variety);
    const k = key(c.cropYear, v);
    committed.set(k, (committed.get(k) ?? 0) + c.pounds);
    if (!meta.has(k)) meta.set(k, { cropYear: c.cropYear, variety: v });
  }

  const rows: SalePosition[] = [];
  for (const [k, m] of meta) {
    const ngmLbs = ngm.get(k) ?? 0;
    const committedLbs = committed.get(k) ?? 0;
    rows.push({ cropYear: m.cropYear, variety: m.variety, ngmLbs, committedLbs, availableLbs: ngmLbs - committedLbs });
  }
  rows.sort((a, b) => b.cropYear - a.cropYear || a.variety.localeCompare(b.variety));
  return rows;
}

/** Available to sell for one cell = ngm - committed (signed; negative means already oversold). */
export function availableToSell(ngmLbs: number, committedLbs: number): number {
  return ngmLbs - committedLbs;
}

/** How much a new sale of `pounds` oversells beyond `available` (0 when it fits). Never negative. */
export function oversoldBy(pounds: number, available: number): number {
  return Math.max(0, pounds - available);
}

/** A validated sale, ready for the DB writer. */
export type SaleWriteInput = {
  cropYear: number;
  variety: string; // canonical
  buyer: string;
  pounds: number; // whole, positive
  priceCentsPerPound: number | null;
  blockId: string | null;
};

export type SaleRaw = {
  cropYear: number;
  variety: string;
  buyer: string;
  pounds: number;
  priceCentsPerPound?: number | null;
  blockId?: string | null;
};

/**
 * Validate + normalize an add-a-sale entry. Returns null on any invalid field (implausible year,
 * unknown variety, blank buyer, non-positive pounds, negative or non-integer price) so the caller
 * surfaces the calm error rather than writing a malformed commitment. Price is INTEGER CENTS PER
 * POUND (money law) or null for a pounds-only sale (price TBD at pool true-up).
 */
export function saleInput(raw: SaleRaw): SaleWriteInput | null {
  if (!Number.isInteger(raw.cropYear) || raw.cropYear < 2000 || raw.cropYear > 2100) return null;
  if (!Number.isInteger(raw.pounds) || raw.pounds <= 0) return null;
  const buyer = raw.buyer.trim();
  if (buyer === "") return null;
  const variety = normalizeVariety(raw.variety);
  if (variety === "UNKNOWN") return null;
  const price = raw.priceCentsPerPound ?? null;
  if (price !== null && (!Number.isInteger(price) || price < 0)) return null;
  const blockId = raw.blockId && raw.blockId !== "" ? raw.blockId : null;
  return { cropYear: raw.cropYear, variety, buyer, pounds: raw.pounds, priceCentsPerPound: price, blockId };
}
