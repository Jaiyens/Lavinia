import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { summarizeMeters } from "../shape";
import { loadExportData, type ExportLoadDeps } from "./load";

/**
 * Offline unit test for the export loader (Story 8.1). No Postgres: we drive the REAL
 * `loadExportData` -> `loadMetersForFarm` projection through a minimal in-memory fake of the one
 * Prisma call it makes (`pump.findMany`). That keeps the test offline (CI law: zero external calls)
 * while exercising the actual uncapped read path, and lets us seed ABOVE the chat-tool cap to prove
 * the export is not a sample. Cross-farm isolation against a real DB lives in load.db.test.ts.
 */

// The minimal pump row shape loadMetersForFarm's projection reads. We build plausible rows so the
// real projection runs end-to-end; only coverageState / period close vary per row where it matters.
type FakePump = {
  id: string;
  name: string;
  serviceId: string | null;
  rateSchedule: string | null;
  serialCode: string | null;
  isLegacy: boolean;
  status: string | null;
  coverageState: string;
  account: { number: string | null; entity: { name: string } | null } | null;
  ranch: { name: string } | null;
  crop: { name: string } | null;
  latitude: number | null;
  longitude: number | null;
  gpm: number | null;
  isSolar: boolean;
  nemType: string | null;
  trueUpMonth: number | null;
  trueUpAmountCents: number | null;
  trueUpDate: Date | null;
  solarKw: number | null;
  benefitingArrays: never[];
  growerPumpId: string | null;
  nemPeriods: never[];
  billingPeriods: {
    start: Date;
    close: Date;
    printedTotalCents: number | null;
    demandChargeUsd: number | null;
    peakKw: number | null;
    tariff: string | null;
    billingLineItems: never[];
  }[];
};

type PumpOverrides = {
  coverageState?: string;
  /** ISO date string for the single billing period's close; omitted = no period (no bill). */
  close?: string;
  /**
   * The period's printed total in cents. OMITTED defaults to a posted bill (100_00); pass an
   * explicit `null` for the live-connected / Green Button shape (a metered close, no scanned bill).
   * Uses a presence check, NOT `??`, so an explicit null is honored rather than coalesced away.
   */
  printedTotalCents?: number | null;
};

function makePump(i: number, o: PumpOverrides = {}): FakePump {
  const coverageState = o.coverageState ?? "reconciled";
  const printedTotalCents = "printedTotalCents" in o ? o.printedTotalCents ?? null : 100_00;
  const billingPeriods =
    o.close === undefined
      ? []
      : [
          {
            start: new Date(o.close),
            close: new Date(o.close),
            printedTotalCents,
            demandChargeUsd: null,
            peakKw: null,
            tariff: "AG-A1",
            billingLineItems: [] as never[],
          },
        ];
  return {
    // Zero-pad the index so the name sort is stable and human-friendly across 60+ meters.
    id: `pump_${String(i).padStart(3, "0")}`,
    name: `Pump ${String(i).padStart(3, "0")}`,
    serviceId: `SA-${i}`,
    rateSchedule: "AG-A1",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState,
    account: { number: "ACCT-1", entity: { name: "Batth Farms LLC" } },
    ranch: { name: "North Ranch" },
    crop: { name: "Almonds" },
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: false,
    nemType: null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    growerPumpId: null,
    nemPeriods: [],
    billingPeriods,
  };
}

/** A typed fake exposing only `pump.findMany`, the one call loadMetersForFarm makes. It honors
 *  the `where.farmId` filter so the test can prove the loader passes the resolved farmId through. */
function fakePrisma(pumpsByFarm: Record<string, FakePump[]>): PrismaClient {
  return {
    pump: {
      findMany: async ({ where }: { where: { farmId: string } }) =>
        pumpsByFarm[where.farmId] ?? [],
    },
  } as unknown as PrismaClient;
}

describe("loadExportData (uncapped full-data export loader)", () => {
  it("returns EVERY meter for a farm seeded above the chat cap, while the chat tool caps", async () => {
    const COUNT = 60; // deliberately > the chat-tool max of 50
    const pumps = Array.from({ length: COUNT }, (_, i) => makePump(i + 1));
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_big: pumps }),
      farmId: "farm_big",
      farmName: "Batth Farms",
    };

    const data = await loadExportData(deps);

    // The export is the FULL inventory: all 60 meters, no silent truncation.
    expect(data.meters).toHaveLength(COUNT);
    expect(data.state.coverage.total).toBe(COUNT);

    // Contrast: the chat-tool shaper (listMeters) caps the SAME set at 50, even asking for the max.
    const capped = summarizeMeters(data.meters, { limit: 50 });
    expect(capped.total).toBe(COUNT); // it knows the true count
    expect(capped.meters).toHaveLength(50); // but only returns a sample
    expect(capped.shown).toBe(50);
    // And the chat tool's DEFAULT (no limit) caps even harder at 25.
    expect(summarizeMeters(data.meters).meters).toHaveLength(25);

    // So the export carries strictly more than the chat path ever would.
    expect(data.meters.length).toBeGreaterThan(capped.meters.length);
  });

  it("reports coverage counts that sum to the inventory, with genuine zeros as 0", async () => {
    const pumps = [
      makePump(1, { coverageState: "reconciled", close: "2026-03-12" }),
      makePump(2, { coverageState: "reconciled", close: "2026-04-10" }),
      makePump(3, { coverageState: "needs_review", close: "2026-02-05" }),
      makePump(4, { coverageState: "no_bill" }),
      makePump(5, { coverageState: "no_bill" }),
    ];
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_x: pumps }),
      farmId: "farm_x",
      farmName: "X Farms",
    };

    const { state } = await loadExportData(deps);
    expect(state.coverage).toEqual({
      total: 5,
      reconciled: 2,
      needsReview: 1,
      noBill: 2,
    });
    // Counts always sum to the full inventory (the export denominator).
    const { reconciled, needsReview, noBill, total } = state.coverage;
    expect(reconciled + needsReview + noBill).toBe(total);
  });

  it("as-of is the most recent POSTED cycle close across the farm (ISO 8601), never a faked date", async () => {
    const pumps = [
      makePump(1, { close: "2026-01-15", printedTotalCents: 100_00 }),
      makePump(2, { close: "2026-05-20", printedTotalCents: 100_00 }), // the freshest POSTED cycle
      makePump(3, { close: "2026-03-01", printedTotalCents: 100_00 }),
    ];
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_x: pumps }),
      farmId: "farm_x",
      farmName: "X Farms",
    };
    const { state } = await loadExportData(deps);
    expect(state.asOf).toBe(new Date("2026-05-20").toISOString());
  });

  it("as-of ignores a metered close on a meter with NO posted bill, even when it is the freshest", async () => {
    // A live-connected (Green Button / UtilityAPI / Bayou) meter: it HAS a billing period with a
    // `close`, but no scanned bill yet, so printedTotalCents is null (the import upsert never sets
    // it). That close is a metered/scheduled end, NOT a billed cycle, so it must never become asOf.
    const pumps = [
      makePump(1, { coverageState: "reconciled", close: "2026-02-10", printedTotalCents: 100_00 }),
      // Freshest period overall, but NOT a posted bill (the Green Button shape): must be skipped.
      makePump(2, { coverageState: "no_bill", close: "2026-06-30", printedTotalCents: null }),
    ];
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_live: pumps }),
      farmId: "farm_live",
      farmName: "Live Farms",
    };
    const { state } = await loadExportData(deps);
    // The unposted 2026-06-30 close is ignored; asOf is the latest POSTED close, never the metered one.
    expect(state.asOf).toBe(new Date("2026-02-10").toISOString());
  });

  it("as-of is null (absence is explicit) when a meter HAS a period but no posted bill", async () => {
    // The realistic failure case: non-empty periods (a `close` is set) but printedTotalCents is
    // null — exactly the Green Button shape. Absence must stay explicit: asOf null, never the
    // metered close shown as a billed "as-of" date (the honesty law's forbidden case).
    const pumps = [
      makePump(1, { coverageState: "no_bill", close: "2026-04-01", printedTotalCents: null }),
      makePump(2, { coverageState: "no_bill", close: "2026-04-15", printedTotalCents: null }),
    ];
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_unposted: pumps }),
      farmId: "farm_unposted",
      farmName: "Unposted Farms",
    };
    const { state, meters } = await loadExportData(deps);
    expect(meters).toHaveLength(2); // the meters still export
    // Each meter HAS a period (proving the gate, not an empty-periods accident), yet asOf is null.
    expect(meters.every((m) => m.periods.length === 1)).toBe(true);
    expect(state.asOf).toBeNull(); // no posted bill => no cycle to be "as of" — never a fabricated date
    expect(state.coverage.reconciled).toBe(0);
  });

  it("as-of is null (absence is explicit) when no meter has any billing period at all", async () => {
    const pumps = [
      makePump(1, { coverageState: "no_bill" }), // close omitted => zero periods
      makePump(2, { coverageState: "no_bill" }),
    ];
    const deps: ExportLoadDeps = {
      prisma: fakePrisma({ farm_empty: pumps }),
      farmId: "farm_empty",
      farmName: "Empty Farms",
    };
    const { state, meters } = await loadExportData(deps);
    expect(meters).toHaveLength(2); // the meters still export
    expect(state.asOf).toBeNull(); // but there is no cycle to be "as of" — never a fabricated date
    expect(state.coverage.reconciled).toBe(0);
  });

  it("scopes to the resolved farmId from deps; a different farm's rows never appear", async () => {
    const farmA = [makePump(1), makePump(2)];
    const farmB = [makePump(99)];
    const prisma = fakePrisma({ farm_a: farmA, farm_b: farmB });

    const a = await loadExportData({ prisma, farmId: "farm_a", farmName: "A" });
    expect(a.meters.map((m) => m.name)).toEqual(["Pump 001", "Pump 002"]);
    expect(a.farm.id).toBe("farm_a");

    const b = await loadExportData({ prisma, farmId: "farm_b", farmName: "B" });
    expect(b.meters.map((m) => m.name)).toEqual(["Pump 099"]);
    // Farm A's meters never leak into farm B's export.
    expect(b.meters.map((m) => m.name)).not.toContain("Pump 001");
  });
});
