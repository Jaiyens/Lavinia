import { PDFDocument } from "pdf-lib";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { PageReader } from "@/lib/extract/reader";
import type { PageType } from "@/lib/extract/schema";
import { createFarmFromConnection } from "./farm";
import {
  addBillPdf,
  addPgeFeed,
  addSpreadsheet,
  hasRealSource,
  summarizeFarmSources,
} from "./sources";

// Story 5.2: prove the source-add edges + the >=1-real-source gate over a real DB. The
// PG&E sample feed lands usage (a real source); a meter list alone is inventory (not).
// Throwaway Postgres on the local test cluster; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

describe("connect-a-source edges", () => {
  it("PG&E feed lands usage and unlocks the gate", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "PGE Farm" });
    let summary = await summarizeFarmSources(prisma, farmId);
    expect(hasRealSource(summary)).toBe(false); // nothing connected yet

    await addPgeFeed(prisma, farmId);
    summary = await summarizeFarmSources(prisma, farmId);
    expect(summary.metersWithUsage).toBeGreaterThan(0);
    expect(hasRealSource(summary)).toBe(true);
  });

  it("a meter list alone is inventory and does NOT unlock the gate", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "Sheet Farm" });
    const csv = "account,service id,rate\nA-1,SA-100,AG-C\nA-1,SA-101,AG-B\n";
    const added = await addSpreadsheet(prisma, farmId, csv);
    expect(added).toBeGreaterThan(0);

    const summary = await summarizeFarmSources(prisma, farmId);
    expect(summary.metersWithUsage).toBe(0);
    expect(summary.metersWithBilling).toBe(0);
    expect(summary.inventoryOnlyMeters).toBeGreaterThan(0);
    expect(hasRealSource(summary)).toBe(false);
  });

  it("records SMD provenance on the Connect-PG&E path (C4)", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "SMD Farm" });
    let conn = await prisma.connection.findFirstOrThrow({ where: { farmId, type: "pge_smd" } });
    expect(conn.source).toBeNull(); // unknown until a source is added

    await addPgeFeed(prisma, farmId);
    conn = await prisma.connection.findFirstOrThrow({ where: { farmId, type: "pge_smd" } });
    expect(conn.source).toBe("smd");
  });
});

// C3 / FR-2: a real bill upload runs the full extraction pipeline and lands reconciled
// figures on the EXISTING onboarding farm (not a second farm), unlocking the gate. The AI
// reader is injected (a fake fed reconciling pages), so this proves the wiring with zero
// external calls. The cent gate (Story 1.7) still governs what persists.
async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

// A charge detail whose line items compose the printed total exactly (reconciles to the cent).
function chargeDetail(saId: string) {
  return {
    pageType: "per_sa_charge_detail",
    saId,
    meterNumber: `M-${saId}`,
    growerPumpId: `P-${saId}`,
    rateName: "AG-C",
    serviceStart: "2026-02-01",
    serviceEnd: "2026-02-28",
    cycleClose: "2026-02-28",
    touEnergy: [
      { period: "Peak", kWh: 1234.567891, rate: 0.41327, amountCents: 51012 },
      { period: "Part-Peak", kWh: 800, rate: 0.29011, amountCents: 23209 },
      { period: "Off-Peak", kWh: 4200.5, rate: 0.18004, amountCents: 75626 },
    ],
    demandKw: 47.2,
    demandAmountCents: 88100,
    nbcLineItems: [{ label: "PCIA", amountCents: 4210 }],
    otherLineItems: [{ label: "Customer Charge", amountCents: 3500 }],
    printedTotalCents: 245657,
  };
}

const BILL_PAGES: { type: PageType; raw: unknown }[] = [
  { type: "per_sa_charge_detail", raw: chargeDetail("4699664587001") },
  { type: "account_summary", raw: { pageType: "account_summary", accountNumber: "4699664587-8", printedTotalCents: 245657 } },
];

// concurrency is left at the pipeline default, but the fake reader keys off the page index
// passed to classify(), so it is order-independent.
const fakeBillReader: PageReader = {
  async classify(_page, index) {
    return BILL_PAGES[index]!.type;
  },
  async extract(_page, type) {
    const page = BILL_PAGES.find((p) => p.type === type)!;
    return page.raw;
  },
};

describe("addBillPdf (C3 real bill extraction)", () => {
  it("lands reconciled billing on the existing farm and unlocks the gate", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "Bill Farm" });
    expect(hasRealSource(await summarizeFarmSources(prisma, farmId))).toBe(false);

    const result = await addBillPdf(prisma, farmId, await makePdf(2), { reader: fakeBillReader });
    expect(result.billedMeters).toBe(1);

    // The bill attached to THIS farm (no second farm spawned), as a real source.
    const summary = await summarizeFarmSources(prisma, farmId);
    expect(summary.metersWithBilling).toBe(1);
    expect(hasRealSource(summary)).toBe(true);

    const pump = await prisma.pump.findFirstOrThrow({
      where: { farmId, serviceId: "4699664587001" },
      include: { billingPeriods: true },
    });
    expect(pump.coverageState).toBe("reconciled");
    expect(pump.billingPeriods).toHaveLength(1);
    expect(pump.billingPeriods[0]!.printedTotalCents).toBe(245657);

    // C4: a bill is a real source but not an SMD authorization.
    const conn = await prisma.connection.findFirstOrThrow({ where: { farmId, type: "pge_smd" } });
    expect(conn.source).toBe("bill_upload");
  });

  it("never downgrades a true SMD authorization to bill-only (C4 provenance rank)", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "SMD then Bill" });
    await addPgeFeed(prisma, farmId); // -> smd
    await addBillPdf(prisma, farmId, await makePdf(2), { reader: fakeBillReader }); // bill on top

    const conn = await prisma.connection.findFirstOrThrow({ where: { farmId, type: "pge_smd" } });
    expect(conn.source).toBe("smd"); // stronger provenance wins
  });
});
