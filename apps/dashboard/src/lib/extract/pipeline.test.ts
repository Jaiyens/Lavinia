import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractBill } from "./pipeline";
import type { PageReader } from "./reader";
import type { PageType } from "./schema";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

// Canned raw page objects the fake reader returns, one per page index.
const twoTierSa = {
  pageType: "per_sa_charge_detail",
  saId: "SA-1",
  meterNumber: "M-1",
  growerPumpId: "P001",
  rateName: "AG-C",
  serviceStart: "2026-03-01",
  serviceEnd: "2026-03-31",
  cycleClose: "2026-03-31",
  touEnergy: [
    { period: "Peak", kWh: 100, rate: 0.4, amountCents: 4000 },
    { period: "Off-Peak", kWh: 200, rate: 0.18, amountCents: 3600 },
  ],
  demandKw: 30,
  demandAmountCents: 50000,
  nbcLineItems: [],
  otherLineItems: [],
  printedTotalCents: 57600,
};
const threeTierSa = {
  ...twoTierSa,
  saId: "SA-2",
  meterNumber: "M-2",
  rateName: "AG-5B",
  touEnergy: [
    { period: "Peak", kWh: 100, rate: 0.4, amountCents: 4000 },
    { period: "Part-Peak", kWh: 50, rate: 0.3, amountCents: 1500 },
    { period: "Off-Peak", kWh: 200, rate: 0.18, amountCents: 3600 },
  ],
  printedTotalCents: 9100,
};
const nemPage = {
  pageType: "nem_reconciliation",
  saId: "SA-3",
  monthlyRows: [{ periodStart: "2026-04-01", periodEnd: "2026-04-30", kWh: -1800, amountCents: null }],
  trueUpMonth: 4,
  trueUpDate: null,
  trueUpAmountCents: -12000,
};
// A non-integer printedTotalCents fails the Zod schema -> needs_review (AC5).
const badSa = { ...twoTierSa, saId: "SA-4", printedTotalCents: 100.5 };

const PAGES: { type: PageType; raw: unknown }[] = [
  { type: "per_sa_charge_detail", raw: twoTierSa },
  { type: "per_sa_charge_detail", raw: threeTierSa },
  { type: "nem_reconciliation", raw: nemPage },
  { type: "per_sa_charge_detail", raw: badSa },
];

describe("extractBill, the split -> classify -> extract -> validate pipeline", () => {
  it("classifies before extracting, fans out to many SAs, and flags invalid pages needs_review", async () => {
    const calls: string[] = [];
    let cursor = -1;
    const fakeReader: PageReader = {
      async classify(_page, index) {
        cursor = index;
        calls.push(`classify:${index}`);
        return PAGES[index]!.type;
      },
      async extract(_page, type) {
        calls.push(`extract:${type}`);
        return PAGES[cursor]!.raw;
      },
    };

    const res = await extractBill(await makePdf(4), fakeReader);
    expect(res).toHaveLength(4);

    // AC1: classification precedes extraction for the first page.
    expect(calls.slice(0, 2)).toEqual(["classify:0", "extract:per_sa_charge_detail"]);

    // AC4: the two charge-detail pages fan out to two distinct SAs. `if (!ok) throw`
    // narrows the union AND fails loudly, so the assertions below are never vacuous.
    const r0 = res[0]!;
    if (!r0.ok) throw new Error(`expected page 0 ok, got needs_review: ${r0.reason}`);
    expect(r0.page.pageType).toBe("per_sa_charge_detail");
    if (r0.page.pageType === "per_sa_charge_detail") expect(r0.page.saId).toBe("SA-1");

    // AC3: the legacy three-tier (Part-Peak) split is preserved on the second SA.
    const r1 = res[1]!;
    if (!r1.ok) throw new Error(`expected page 1 ok, got needs_review: ${r1.reason}`);
    expect(r1.page.pageType).toBe("per_sa_charge_detail");
    if (r1.page.pageType === "per_sa_charge_detail") {
      expect(r1.page.saId).toBe("SA-2");
      expect(r1.page.touEnergy).toHaveLength(3);
    }

    // FR-3: negative NEM usage survives the pipeline.
    const r2 = res[2]!;
    if (!r2.ok) throw new Error(`expected page 2 ok, got needs_review: ${r2.reason}`);
    expect(r2.page.pageType).toBe("nem_reconciliation");
    if (r2.page.pageType === "nem_reconciliation") {
      expect(r2.page.monthlyRows[0]!.kWh).toBeLessThan(0);
    }

    // AC5: the float-cents page is needs_review, carrying its SA, never a wrong number.
    const r3 = res[3]!;
    expect(r3.ok).toBe(false);
    if (!r3.ok) {
      expect(r3.status).toBe("needs_review");
      expect(r3.saId).toBe("SA-4");
    }
  });

  it("captures a full-year NEM page as distinct monthly periods incl. negatives + true-up (AC1/AC2)", async () => {
    // The realistic 12-month statement fixture, read at test time (no runtime read here).
    const nemFixture: unknown = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures/extract/sample-nem-page.json"), "utf8"),
    );
    const reader: PageReader = {
      async classify() {
        return "nem_reconciliation";
      },
      async extract() {
        return nemFixture;
      },
    };

    const res = await extractBill(await makePdf(1), reader);
    const r0 = res[0]!;
    if (!r0.ok) throw new Error(`expected NEM page ok, got needs_review: ${r0.reason}`);
    if (r0.page.pageType !== "nem_reconciliation") throw new Error("expected nem_reconciliation");

    // AC1: every bundled monthly row survives as a distinct period - not collapsed/deduped.
    expect(r0.page.monthlyRows).toHaveLength(12);
    const distinctStarts = new Set(r0.page.monthlyRows.map((row) => row.periodStart));
    expect(distinctStarts.size).toBe(12);

    // AC2: over-production months keep their negative net kWh, never floored at zero.
    expect(r0.page.monthlyRows.some((row) => row.kWh < 0)).toBe(true);

    // AC1: the annual true-up value AND date are captured.
    expect(r0.page.trueUpMonth).toBe(4);
    expect(r0.page.trueUpDate).toBe("2026-04-15");
    expect(r0.page.trueUpAmountCents).toBe(1842300);
  });

  it("surfaces an unreadable PDF as needs_review instead of throwing (NFR-4)", async () => {
    const reader: PageReader = {
      async classify() {
        return "per_sa_charge_detail";
      },
      async extract() {
        return {};
      },
    };
    const res = await extractBill(new Uint8Array([1, 2, 3, 4, 5]), reader);
    expect(res).toHaveLength(1);
    expect(res[0]!.ok).toBe(false);
    if (!res[0]!.ok) {
      expect(res[0]!.status).toBe("needs_review");
      expect(res[0]!.reason).toMatch(/could not read PDF/);
    }
  });

  it("flags a classify/extract pageType mismatch as needs_review", async () => {
    const reader: PageReader = {
      async classify() {
        return "per_sa_charge_detail";
      },
      async extract() {
        // valid object, but for a DIFFERENT page type than classify returned
        return { pageType: "account_summary", accountNumber: "AC-1", printedTotalCents: 1000 };
      },
    };
    const res = await extractBill(await makePdf(1), reader);
    expect(res[0]!.ok).toBe(false);
    if (!res[0]!.ok) {
      expect(res[0]!.reason).toContain(
        "classified per_sa_charge_detail but extracted account_summary",
      );
    }
  });

  it("marks a page needs_review when the reader throws (retries exhausted)", async () => {
    const throwingReader: PageReader = {
      async classify() {
        return "per_sa_charge_detail";
      },
      async extract() {
        throw new Error("model returned unparseable output");
      },
    };
    const res = await extractBill(await makePdf(1), throwingReader);
    expect(res[0]!.ok).toBe(false);
    if (!res[0]!.ok) expect(res[0]!.reason).toContain("unparseable");
  });
});
