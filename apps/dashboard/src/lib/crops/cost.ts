// Cost-per-pound engine — the number only Terra can produce (PG&E energy $ ÷ almond yield lb).
// Pure, integer-cent, deterministic; no DB, no components compute a number. Operates on generic
// DTOs (the DB edge adapts MeterView/CropDelivery/Block to these), so it is testable to the cent.
// Honesty law: cost that can't be attributed to a block and yield with no field mapping are
// surfaced as explicit residual lines, never silently dropped or split behind the grower's back.

export type MeterYearCost = { meterId: string; cents: number };
export type MeterBlockLink = { meterId: string; blockId: string; acreage: number | null };
export type BlockInfo = { id: string; name: string; acreage: number | null };

/**
 * Split `cents` across blocks proportional to acreage, integer-exact (largest-remainder), so the
 * parts sum EXACTLY back to cents (no float drift, no lost cent). One block -> all cents. If the
 * total acreage is 0 (or no blocks), the dollars cannot be split honestly -> the whole amount is
 * returned as `unallocatableCents`, never spread evenly.
 */
export function allocateByAcreage(
  cents: number,
  blocks: readonly { blockId: string; acreage: number | null }[],
): { allocated: { blockId: string; cents: number }[]; unallocatableCents: number } {
  const usable = blocks.map((b) => ({ blockId: b.blockId, acreage: Math.max(0, b.acreage ?? 0) }));
  const total = usable.reduce((s, b) => s + b.acreage, 0);
  if (usable.length === 0 || total <= 0) return { allocated: [], unallocatableCents: cents };
  if (usable.length === 1) {
    return { allocated: [{ blockId: usable[0]!.blockId, cents }], unallocatableCents: 0 };
  }
  const parts = usable.map((b) => {
    const exact = (cents * b.acreage) / total;
    const floorCents = Math.floor(exact);
    return { blockId: b.blockId, cents: floorCents, remainder: exact - floorCents };
  });
  let leftover = cents - parts.reduce((s, p) => s + p.cents, 0);
  // Distribute the leftover cents to the largest remainders (ties broken by blockId for determinism).
  const order = [...parts].sort((a, b) =>
    b.remainder - a.remainder || (a.blockId < b.blockId ? -1 : 1),
  );
  for (const o of order) {
    if (leftover <= 0) break;
    const part = parts.find((p) => p.blockId === o.blockId)!;
    part.cents += 1;
    leftover -= 1;
  }
  return { allocated: parts.map((p) => ({ blockId: p.blockId, cents: p.cents })), unallocatableCents: 0 };
}

export type DeliveryYield = { field: string | null; netLb: number; cropYear: number };
export type BlockYield = { blockId: string; netLb: number };

/**
 * Yield per block for a crop year. Primary source: CropDelivery.netLb routed through the field->block
 * map. Override: ProductionRecord pounds attributed to a blockId (a settled/hand-entered figure
 * trumps the scraped deliveries for that block). Deliveries whose field has no mapping (or no field)
 * accumulate into `unmappedLb` — never assigned, never dropped.
 */
export function blockYields(input: {
  deliveries: readonly DeliveryYield[];
  fieldBlockMap: ReadonlyMap<string, string>;
  productionByBlock: readonly { blockId: string; pounds: number }[];
  cropYear: number;
}): { byBlock: BlockYield[]; unmappedLb: number } {
  const byBlock = new Map<string, number>();
  let unmappedLb = 0;
  for (const d of input.deliveries) {
    if (d.cropYear !== input.cropYear) continue;
    const blockId = d.field === null ? undefined : input.fieldBlockMap.get(d.field);
    if (blockId === undefined) {
      unmappedLb += d.netLb;
    } else {
      byBlock.set(blockId, (byBlock.get(blockId) ?? 0) + d.netLb);
    }
  }
  // ProductionRecord.blockId overrides deliveries for that block (settled wins over scraped).
  for (const p of input.productionByBlock) {
    byBlock.set(p.blockId, p.pounds);
  }
  return {
    byBlock: [...byBlock.entries()].map(([blockId, netLb]) => ({ blockId, netLb })),
    unmappedLb,
  };
}

export type BlockCostPerPound = {
  blockId: string;
  blockName: string;
  acreage: number | null;
  energyCents: number;
  netLb: number;
  /** Integer cents per pound (rounded), or null when netLb <= 0 (no honest ratio). */
  centsPerLb: number | null;
};

export type CostPerPound = {
  cropYear: number;
  blocks: BlockCostPerPound[];
  farm: { energyCents: number; netLb: number; centsPerLb: number | null };
  residual: {
    unmappedYieldLb: number;
    unallocatableEnergyCents: number;
    metersTotal: number;
    metersReconciled: number;
  };
};

function perPound(cents: number, lb: number): number | null {
  return lb > 0 ? Math.round(cents / lb) : null;
}

/**
 * The headline: farm-wide and per-block cents/lb. Per block: allocate each meter's reconciled cents
 * across the blocks it serves (by acreage), divide by that block's mapped yield. Farm: total
 * reconciled cents / (mapped + unmapped yield) — correct from day one, before any mapping exists.
 */
export function costPerPound(input: {
  cropYear: number;
  meterCosts: readonly MeterYearCost[];
  meterBlockLinks: readonly MeterBlockLink[];
  blocks: readonly BlockInfo[];
  yields: { byBlock: readonly BlockYield[]; unmappedLb: number };
  coverage: { metersTotal: number; metersReconciled: number };
}): CostPerPound {
  const linksByMeter = new Map<string, MeterBlockLink[]>();
  for (const link of input.meterBlockLinks) {
    const list = linksByMeter.get(link.meterId) ?? [];
    list.push(link);
    linksByMeter.set(link.meterId, list);
  }

  const energyByBlock = new Map<string, number>();
  let unallocatableEnergyCents = 0;
  let farmEnergyCents = 0;
  for (const mc of input.meterCosts) {
    farmEnergyCents += mc.cents;
    const links = linksByMeter.get(mc.meterId) ?? [];
    const { allocated, unallocatableCents } = allocateByAcreage(
      mc.cents,
      links.map((l) => ({ blockId: l.blockId, acreage: l.acreage })),
    );
    unallocatableEnergyCents += unallocatableCents;
    for (const a of allocated) energyByBlock.set(a.blockId, (energyByBlock.get(a.blockId) ?? 0) + a.cents);
  }

  const yieldByBlock = new Map(input.yields.byBlock.map((y) => [y.blockId, y.netLb]));
  const blockIds = new Set<string>([...energyByBlock.keys(), ...yieldByBlock.keys()]);
  const nameById = new Map(input.blocks.map((b) => [b.id, b]));

  const blocks: BlockCostPerPound[] = [...blockIds]
    .map((blockId) => {
      const info = nameById.get(blockId);
      const energyCents = energyByBlock.get(blockId) ?? 0;
      const netLb = yieldByBlock.get(blockId) ?? 0;
      return {
        blockId,
        blockName: info?.name ?? blockId,
        acreage: info?.acreage ?? null,
        energyCents,
        netLb,
        centsPerLb: perPound(energyCents, netLb),
      };
    })
    .sort((a, b) => (a.blockName < b.blockName ? -1 : a.blockName > b.blockName ? 1 : 0));

  const farmNetLb = input.yields.byBlock.reduce((s, y) => s + y.netLb, 0) + input.yields.unmappedLb;
  return {
    cropYear: input.cropYear,
    blocks,
    farm: { energyCents: farmEnergyCents, netLb: farmNetLb, centsPerLb: perPound(farmEnergyCents, farmNetLb) },
    residual: {
      unmappedYieldLb: input.yields.unmappedLb,
      unallocatableEnergyCents,
      metersTotal: input.coverage.metersTotal,
      metersReconciled: input.coverage.metersReconciled,
    },
  };
}
