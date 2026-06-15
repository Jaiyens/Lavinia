import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { CanonicalBill } from "@/lib/normalize/types";
import { type ExtractionResult, persistExtraction } from "./import";

// Integration test for Story 1.8 persistence: persistExtraction writes Farm/Account/Pump +
// BillingPeriod/BillingLineItem + coverageState, idempotently. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

function reconciledBill(saId: string): CanonicalBill {
  return {
    saId,
    saIdDescriptor: "P054",
    meterNumber: `M-${saId}`,
    growerPumpId: "P054",
    periods: [
      {
        saId,
        start: "2026-02-01",
        close: "2026-02-28",
        cycleClose: "2026-02-28",
        tariff: "AGC",
        isLegacyTou: false,
        touSplit: [],
        demandKw: 278.88,
        demandAmountCents: 278322,
        lineItems: [
          { kind: "demand", label: "Max Demand", amountCents: 278322, quantity: 278.88, unit: "kW", rate: null },
          { kind: "other", label: "Customer Charge", amountCents: 4300, quantity: null, unit: null, rate: null },
        ],
        printedTotalCents: 282622,
        coverageState: "reconciled",
      },
    ],
  };
}

function result(): ExtractionResult {
  return {
    pages: 1,
    accountNumber: "4699664587-8",
    accountPrintedTotalCents: 2408437,
    bills: [reconciledBill("4696826125")],
    nem: [],
    needsReview: [],
    reconciledCount: 1,
    escalatedCount: 0,
  };
}

describe("persistExtraction (Story 1.8 DB edge)", () => {
  it("persists Farm/Account/Pump + period + line items with coverageState, idempotently", async () => {
    const opts = { farmName: "Batth Farms", accountNumber: "4699664587-8", isDemo: false };

    const first = await persistExtraction(result(), prisma, opts);
    expect(first).toEqual({ pumps: 1, periods: 1, lineItems: 2 });

    const pump = await prisma.pump.findFirstOrThrow({
      where: { serviceId: "4696826125" },
      include: { billingPeriods: { include: { billingLineItems: true } }, account: true },
    });
    expect(pump.coverageState).toBe("reconciled");
    expect(pump.growerPumpId).toBe("P054");
    expect(pump.account?.number).toBe("4699664587-8");
    expect(pump.billingPeriods).toHaveLength(1);
    const period = pump.billingPeriods[0]!;
    expect(period.printedTotalCents).toBe(282622);
    expect(period.source).toBe("scanned_bill");
    expect(period.billingLineItems).toHaveLength(2);
    const sum = period.billingLineItems.reduce((acc, li) => acc + li.amountCents, 0);
    expect(sum).toBe(period.printedTotalCents); // reconciles to the cent

    // Re-running does not duplicate (idempotent upsert + period replace).
    const second = await persistExtraction(result(), prisma, opts);
    expect(second).toEqual({ pumps: 1, periods: 1, lineItems: 2 });
    expect(await prisma.pump.count({ where: { serviceId: "4696826125" } })).toBe(1);
    expect(await prisma.billingPeriod.count({ where: { pumpId: pump.id } })).toBe(1);
    expect(await prisma.billingLineItem.count()).toBe(2);
  });
});

describe("persistExtraction NEM persistence (Story 3.4)", () => {
  it("merges months across entries, skips junk, sets true-up facts and isSolar, idempotently", async () => {
    const saId = "4699111222";
    const nemResult: ExtractionResult = {
      pages: 3,
      accountNumber: "4699664587-8",
      accountPrintedTotalCents: null,
      bills: [
        {
          ...reconciledBill(saId),
          saIdDescriptor: "P099",
          growerPumpId: "P099",
        },
      ],
      nem: [
        // The annual series (the authority), with a salvageable OCR-mangled start
        // and one unparseable row that must be skipped, never guessed.
        {
          generatingSaId: `${saId} P099`,
          arrayId: null,
          arrayName: null,
          trueUpMonth: 12,
          trueUpDate: "2025-12-15",
          trueUpAmountCents: 713031,
          months: [
            { start: "/2025-05-10", close: "2025-06-09", netKwh: 12077, amountCents: 327235 },
            { start: "2025-06-10", close: "2025-07-10", netKwh: -11804, amountCents: -234268 },
            { start: "garbage", close: "also garbage", netKwh: 1, amountCents: 1 },
          ],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
        // A monthly statement repeating an existing month with different numbers:
        // the longer entry already claimed it, so this duplicate must NOT win.
        {
          generatingSaId: saId,
          arrayId: null,
          arrayName: null,
          trueUpMonth: null,
          trueUpDate: null,
          trueUpAmountCents: null,
          months: [{ start: "2025-06-10", close: "2025-07-10", netKwh: 999, amountCents: 999 }],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
        // A chart page that classified as NEM with zero months: ignored.
        {
          generatingSaId: saId,
          arrayId: null,
          arrayName: null,
          trueUpMonth: null,
          trueUpDate: null,
          trueUpAmountCents: null,
          months: [],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
      ],
      needsReview: [],
      reconciledCount: 1,
      escalatedCount: 0,
    };
    const opts = { farmName: "Batth Farms", accountNumber: "4699664587-8", isDemo: false };

    await persistExtraction(nemResult, prisma, opts);
    const pump = await prisma.pump.findFirstOrThrow({
      where: { serviceId: saId },
      include: { nemPeriods: { orderBy: { start: "asc" } } },
    });
    expect(pump.isSolar).toBe(true);
    expect(pump.trueUpAmountCents).toBe(713031);
    expect(pump.trueUpMonth).toBe(12);
    expect(pump.trueUpDate?.toISOString()).toBe("2025-12-15T00:00:00.000Z");
    // 2 salvaged months (the mangled "/2025-05-10" recovered, the garbage row skipped,
    // the duplicate June row lost to the annual series).
    expect(pump.nemPeriods).toHaveLength(2);
    expect(pump.nemPeriods[0]?.start.toISOString()).toBe("2025-05-10T00:00:00.000Z");
    expect(pump.nemPeriods[1]?.netKwh).toBe(-11804);
    expect(pump.nemPeriods[1]?.amountCents).toBe(-234268);

    // Idempotent: a re-run leaves exactly the same rows (replace semantics).
    await persistExtraction(nemResult, prisma, opts);
    expect(await prisma.nemPeriod.count({ where: { pumpId: pump.id } })).toBe(2);
  });

  it("dedupes same-month off-by-a-day starts, salvages US dates, picks the most-months settlement, keeps printed true-up months", async () => {
    const saId = "4699333444";
    const nemResult: ExtractionResult = {
      pages: 3,
      accountNumber: "4699664587-8",
      accountPrintedTotalCents: null,
      bills: [{ ...reconciledBill(saId), saIdDescriptor: "P100", growerPumpId: "P100" }],
      nem: [
        // The annual series: US-format dates (real fixture shape) + a Feb-30
        // OCR misread that must be REJECTED, never rolled into March.
        {
          generatingSaId: saId,
          arrayId: null,
          arrayName: null,
          trueUpMonth: 12,
          trueUpDate: "2026-03-26",
          trueUpAmountCents: 6279565,
          months: [
            { start: "11/11/2025", close: "12/10/2025", netKwh: 100, amountCents: 1000 },
            { start: "12/12/2025", close: "01/10/2026", netKwh: 10, amountCents: 175 },
            { start: "2026-02-30", close: "2026-03-30", netKwh: 7, amountCents: 70 },
          ],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
        // A short partial settlement that must LOSE the true-up pick to the
        // annual series above (page order is not authority), and whose
        // off-by-a-day December must not double-count.
        {
          generatingSaId: saId,
          arrayId: null,
          arrayName: null,
          trueUpMonth: null,
          trueUpDate: null,
          trueUpAmountCents: 232061,
          months: [{ start: "2025-12-11", close: "2026-01-10", netKwh: 205.24, amountCents: 5216 }],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
      ],
      needsReview: [],
      reconciledCount: 1,
      escalatedCount: 0,
    };
    const opts = { farmName: "Batth Farms", accountNumber: "4699664587-8", isDemo: false };

    await persistExtraction(nemResult, prisma, opts);
    const pump = await prisma.pump.findFirstOrThrow({
      where: { serviceId: saId },
      include: { nemPeriods: { orderBy: { start: "asc" } } },
    });
    // Nov + Dec only: the Feb-30 row rejected; the partial entry's 12-11
    // December lost to the annual series' 12-12 (same calendar month).
    expect(pump.nemPeriods).toHaveLength(2);
    expect(pump.nemPeriods[0]?.start.toISOString()).toBe("2025-11-11T00:00:00.000Z");
    expect(pump.nemPeriods[1]?.start.toISOString()).toBe("2025-12-12T00:00:00.000Z");
    expect(pump.nemPeriods[1]?.netKwh).toBe(10); // the annual series' numbers stand
    // The settlement with the most parseable months won, with its date.
    expect(pump.trueUpAmountCents).toBe(6279565);
    expect(pump.trueUpDate?.toISOString()).toBe("2026-03-26T00:00:00.000Z");
    expect(pump.trueUpMonth).toBe(12);
  });

  it("persists a printed trueUpMonth even when no settlement amount exists, and preserves true-up facts on re-import", async () => {
    const saId = "4699555666";
    const monthOnly: ExtractionResult = {
      pages: 1,
      accountNumber: "4699664587-8",
      accountPrintedTotalCents: null,
      bills: [{ ...reconciledBill(saId), saIdDescriptor: "P101", growerPumpId: "P101" }],
      nem: [
        {
          generatingSaId: saId,
          arrayId: null,
          arrayName: null,
          trueUpMonth: 8,
          trueUpDate: null,
          trueUpAmountCents: null,
          months: [{ start: "2026-01-11", close: "2026-02-10", netKwh: 4, amountCents: 60 }],
          benefitingMeterSaIds: [],
          coverageState: "needs_review",
        },
      ],
      needsReview: [],
      reconciledCount: 1,
      escalatedCount: 0,
    };
    const opts = { farmName: "Batth Farms", accountNumber: "4699664587-8", isDemo: false };
    await persistExtraction(monthOnly, prisma, opts);
    const pump = await prisma.pump.findFirstOrThrow({ where: { serviceId: saId } });
    expect(pump.trueUpMonth).toBe(8); // a printed fact, persisted without an amount
    expect(pump.trueUpAmountCents).toBeNull();

    // A later import whose settlement entry omits the date must not clobber
    // previously persisted facts to null.
    await prisma.pump.update({
      where: { id: pump.id },
      data: { trueUpDate: new Date("2025-08-15T00:00:00.000Z") },
    });
    const undated: ExtractionResult = {
      ...monthOnly,
      nem: [{ ...monthOnly.nem[0]!, trueUpMonth: null, trueUpDate: null, trueUpAmountCents: 1234 }],
    };
    await persistExtraction(undated, prisma, opts);
    const after = await prisma.pump.findFirstOrThrow({ where: { serviceId: saId } });
    expect(after.trueUpAmountCents).toBe(1234);
    expect(after.trueUpMonth).toBe(8); // preserved
    expect(after.trueUpDate?.toISOString()).toBe("2025-08-15T00:00:00.000Z"); // preserved
  });
});

describe("parseNemDate", () => {
  it("salvages ISO and US formats, rejects garbage and non-round-tripping days", async () => {
    const { parseNemDate } = await import("./import");
    expect(parseNemDate("/2025-05-10")?.toISOString()).toBe("2025-05-10T00:00:00.000Z");
    expect(parseNemDate("06/09/2025")?.toISOString()).toBe("2025-06-09T00:00:00.000Z");
    expect(parseNemDate("-")).toBeNull();
    expect(parseNemDate("")).toBeNull();
    expect(parseNemDate("/2025")).toBeNull();
    expect(parseNemDate("/15/2024")).toBeNull();
    expect(parseNemDate("2025-02-30")).toBeNull(); // never rolled into March
    expect(parseNemDate("2025-13-10")).toBeNull();
  });
});
