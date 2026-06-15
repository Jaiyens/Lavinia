import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { coverageTally, runExtraction, toFixture } from "./import";
import type { PageReader } from "./reader";
import type { PageType } from "./schema";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

// A charge detail whose line items either fully compose the printed total (complete -> reconciles)
// or fall short by the $35.00 customer charge (incomplete -> fails the cent gate).
function chargeDetail(saId: string, complete: boolean) {
  return {
    pageType: "per_sa_charge_detail",
    saId,
    meterNumber: `M-${saId}`,
    growerPumpId: `P-${saId}`,
    rateName: "AG-5B",
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
    otherLineItems: complete ? [{ label: "Customer Charge", amountCents: 3500 }] : [],
    printedTotalCents: 245657,
  };
}

const nemPage = {
  pageType: "nem_reconciliation",
  saId: "4692494679",
  monthlyRows: [{ periodStart: "2025-06-01", periodEnd: "2025-06-09", kWh: -1671, amountCents: null }],
  trueUpMonth: 5,
  trueUpDate: "2026-05-01",
  trueUpAmountCents: 713031,
};

const accountSummary = {
  pageType: "account_summary",
  accountNumber: "4699664587-8",
  printedTotalCents: 2408437,
};

type Page = { type: PageType; raw: unknown; escalated?: unknown };

const PAGES: Page[] = [
  { type: "per_sa_charge_detail", raw: chargeDetail("1007066742", true) },
  // Page 1: primary extraction is short (needs_review); the Opus escalation reads it fully.
  {
    type: "per_sa_charge_detail",
    raw: chargeDetail("1009919243", false),
    escalated: chargeDetail("1009919243", true),
  },
  { type: "nem_reconciliation", raw: nemPage },
  { type: "account_summary", raw: accountSummary },
  // Page 4: garbage extraction -> fails Zod -> needs_review.
  { type: "per_sa_summary_list", raw: {} },
];

// concurrency:1 keeps the classify->extract cursor deterministic in the fake reader.
function fakeReader(useEscalated: boolean): PageReader {
  let cursor = 0;
  return {
    async classify(_page, index) {
      cursor = index;
      return PAGES[index]!.type;
    },
    async extract() {
      const page = PAGES[cursor]!;
      return useEscalated ? (page.escalated ?? page.raw) : page.raw;
    },
  };
}

describe("runExtraction, the end-to-end import orchestration (Story 1.8)", () => {
  it("classifies+extracts, reconciles to the cent, escalates a gate failure to Opus", async () => {
    const result = await runExtraction(await makePdf(5), {
      reader: fakeReader(false),
      escalateReader: fakeReader(true),
      concurrency: 1,
    });

    expect(result.pages).toBe(5);
    expect(result.bills).toHaveLength(2);
    // Both SAs reconcile: SA-1 directly, SA-2 only after the Opus escalation (AC2/AC3).
    expect(result.reconciledCount).toBe(2);
    expect(result.escalatedCount).toBe(1);
    expect(result.bills.every((b) => b.periods[0]!.coverageState === "reconciled")).toBe(true);

    // NEM page normalized + linked to its own generating array.
    expect(result.nem).toHaveLength(1);
    expect(result.nem[0]!.months[0]!.netKwh).toBeLessThan(0); // negative export survives
    expect(result.nem[0]!.arrayId).toBe("4692494679");

    // Account-level printed total captured.
    expect(result.accountNumber).toBe("4699664587-8");
    expect(result.accountPrintedTotalCents).toBe(2408437);

    // The garbage page is needs_review, never a fabricated number (NFR-4).
    expect(result.needsReview.some((n) => n.pageIndex === 4)).toBe(true);
  });

  it("leaves a gate-failing page needs_review when no escalation reader is given", async () => {
    const result = await runExtraction(await makePdf(5), {
      reader: fakeReader(false),
      concurrency: 1,
    });
    expect(result.escalatedCount).toBe(0);
    expect(result.reconciledCount).toBe(1); // only SA-1 reconciles
    const tally = coverageTally(result);
    expect(tally.reconciled).toBe(1);
    expect(tally.needs_review).toBe(1);
  });

  it("surfaces an unreadable PDF as a whole-bill needs_review, never throwing (NFR-4)", async () => {
    const result = await runExtraction(new Uint8Array([1, 2, 3, 4, 5]), {
      reader: fakeReader(false),
      concurrency: 1,
    });
    expect(result.pages).toBe(0);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0]!.reason).toMatch(/could not read PDF/);
  });

  it("produces a JSON-safe fixture with no raw bytes", async () => {
    const result = await runExtraction(await makePdf(5), {
      reader: fakeReader(false),
      escalateReader: fakeReader(true),
      concurrency: 1,
    });
    const fixture = toFixture(result);
    expect(fixture.account.printedTotalCents).toBe(2408437);
    expect(fixture.reconciledCount).toBe(2);
    // round-trips through JSON (no Uint8Array / class instances leaked into the fixture)
    expect(() => JSON.parse(JSON.stringify(fixture))).not.toThrow();
  });
});
