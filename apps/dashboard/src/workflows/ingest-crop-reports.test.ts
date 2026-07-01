import { describe, expect, it } from "vitest";
import { ingestCropReports, type IngestReportsDeps } from "./ingest-crop-reports";
import type {
  ExistingProductionRow,
  RunInSettlementTenant,
  SettlementTx,
} from "./steps/write-settlement-records";
import type { CommitmentTx, RunInCommitmentTenant } from "./steps/write-commitment-records";
import type { PoundReader } from "@/lib/crops/extract/reader";
import type { CommitmentReader } from "@/lib/crops/extract/commitment-reader";
import type { PoundExtraction } from "@/lib/crops/extract/schema";
import type { CommitmentExtraction } from "@/lib/crops/extract/commitment-schema";
import type { RawPage, ScrapeResult } from "@/lib/crops/scrape/types";
import type { CropLedger, CommitmentEntry, ProductionEntry } from "@/lib/crops/types";

// End-to-end report-ingest through the REAL ingestCropReports, WITHOUT a DB, network, or model call:
// a scrapeOverride yields two PDF pages (one settlement, one commitment); injected readers + pdfToText
// drive extraction; an in-memory ledger captures writes. The load-bearing proof: the settlement row is
// written with supersedesId -> the live estimate, so recomputePositions reports
// estimateToSettledGapPounds (the gap falls out) and produced reflects the settled figure. The
// commitment row lands too, and unsold subtracts it.

const FARM_ID = "farm_e2e";
const ENTITY_ID = "entity_e2e";
const CROP_YEAR = 2024;

function pdfPage(url: string, sha: string): RawPage {
  return { url, sha, contentType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) };
}

/** In-memory ledger backing both write tenants and loadLedger. */
function makeLedger(seed: ExistingProductionRow[]) {
  const production: ExistingProductionRow[] = [...seed];
  const commitments: { variety: string; pounds: number; buyer: string; supersededReason: string }[] = [];
  let seq = 0;

  const settlementTx: SettlementTx = {
    productionRecord: {
      findMany: () =>
        Promise.resolve(
          production.map((r) => ({
            id: r.id,
            variety: r.variety,
            pounds: r.pounds,
            source: r.source,
            supersedesId: r.supersedesId,
            supersededReason: r.supersededReason,
          })),
        ),
      create: (args) => {
        seq += 1;
        const id = `settled_${seq}`;
        production.push({
          id,
          variety: args.data.variety,
          pounds: args.data.pounds,
          source: args.data.source,
          supersedesId: args.data.supersedesId,
          supersededReason: args.data.supersededReason,
        });
        return Promise.resolve({ id });
      },
    },
  };
  const commitmentTx: CommitmentTx = {
    commitmentRecord: {
      findMany: (a) =>
        Promise.resolve(
          commitments
            .filter((c) => c.supersededReason === a.where.supersededReason)
            .map((c) => ({ buyer: c.buyer, variety: c.variety })),
        ),
      create: (args) => {
        commitments.push({
          variety: args.data.variety,
          pounds: args.data.pounds,
          buyer: args.data.buyer,
          supersededReason: args.data.supersededReason,
        });
        return Promise.resolve({ id: `c_${commitments.length}` });
      },
    },
  };

  const runInSettlementTenant: RunInSettlementTenant = (_f, fn) => fn(settlementTx);
  const runInCommitmentTenant: RunInCommitmentTenant = (_f, fn) => fn(commitmentTx);

  const loadLedger = (): Promise<CropLedger> => {
    const prod: ProductionEntry[] = production.map((r) => ({
      id: r.id,
      cropYear: CROP_YEAR,
      variety: r.variety,
      pounds: r.pounds,
      source: r.source === "PACKER_SETTLED" ? "PACKER_SETTLED" : "ALMOND_LOGIC",
      supersedesId: r.supersedesId,
    }));
    const comm: CommitmentEntry[] = commitments.map((c, i) => ({
      id: `cm${i}`,
      cropYear: CROP_YEAR,
      variety: c.variety,
      pounds: c.pounds,
      buyer: c.buyer,
      source: "ALMOND_LOGIC",
      supersedesId: null,
      status: "committed",
      priceCentsPerPound: null,
      settledPriceCentsPerPound: null,
      collectedCents: null,
      collectedAt: null,
    }));
    return Promise.resolve({ production: prod, commitments: comm, pools: [] });
  };

  return { production, commitments, runInSettlementTenant, runInCommitmentTenant, loadLedger };
}

const SETTLEMENT_TEXT = "Packer Settlement Statement — net pounds — grand total";
const COMMITMENT_TEXT = "Handler commitment report — committed pounds to buyer — total committed";

// The settlement prints "Nonpareil" (same spelling as the estimate) so the post-supersede production
// cell stays coherent with the commitment cell. normalizeVariety still bridges differing spellings
// for the supersede MATCH itself — that is asserted directly in write-settlement-records.test.ts.
const settlement: PoundExtraction = {
  rows: [{ variety: "Nonpareil", pounds: 130_000, settledPriceCentsPerPound: 220 }],
  controlTotalPounds: 130_000,
  confidence: 0.95,
};
const commitment: CommitmentExtraction = {
  rows: [{ handler: "Holland Nut", variety: "Nonpareil", committedPounds: 90_000, priceCentsPerPound: 220 }],
  controlTotalPounds: 90_000,
  confidence: 0.95,
};

function fakeSettlementReader(): PoundReader {
  return { extract: () => Promise.resolve(settlement) };
}
function fakeCommitmentReader(): CommitmentReader {
  return { extract: () => Promise.resolve(commitment) };
}

/** scrapeOverride: one settlement PDF + one commitment PDF. */
function fakeScrape(): NonNullable<IngestReportsDeps["scrapeOverride"]> {
  return (): ScrapeResult => ({
    branch: "stub",
    pages: [pdfPage("https://x/settlement", "sha_settlement"), pdfPage("https://x/commitment", "sha_commit")],
    storedKeys: [],
  });
}

/** pdfToText returns settlement text for the settlement sha, commitment text otherwise. */
function fakePdfToText(): (bytes: Uint8Array) => Promise<string> {
  // The two fixtures have distinct shas but identical bytes; classify by call order via a closure.
  let call = 0;
  return () => Promise.resolve(call++ === 0 ? SETTLEMENT_TEXT : COMMITMENT_TEXT);
}

describe("ingestCropReports end-to-end (settlement supersedes estimate; commitment lands)", () => {
  it("writes a superseding settlement + a commitment; the gap falls out of recomputePositions", async () => {
    const ledger = makeLedger([
      { id: "est_np", variety: "Nonpareil", pounds: 125_000, source: "ALMOND_LOGIC", supersedesId: null, supersededReason: "crop ingest entity e1" },
    ]);

    const result = await ingestCropReports(ENTITY_ID, CROP_YEAR, {
      farmId: FARM_ID,
      runInSettlementTenant: ledger.runInSettlementTenant,
      runInCommitmentTenant: ledger.runInCommitmentTenant,
      loadLedger: ledger.loadLedger,
      settlementReader: fakeSettlementReader(),
      commitmentReader: fakeCommitmentReader(),
      pdfToText: fakePdfToText(),
      scrapeOverride: fakeScrape(),
    });

    // Two documents processed, both reconciled.
    expect(result.documents).toHaveLength(2);
    const settledDoc = result.documents.find((d) => d.docClass === "settlement")!;
    expect(settledDoc.coverage).toBe("reconciled");
    expect(settledDoc.settlement!.supersededVarieties).toEqual(["Nonpareil"]);
    const commitDoc = result.documents.find((d) => d.docClass === "commitment")!;
    expect(commitDoc.coverage).toBe("reconciled");
    expect(commitDoc.commitment!.written).toBe(1);

    // The position: produced is the SETTLED figure, the gap fell out, and unsold subtracts commitment.
    const np = result.positions.find((p) => p.variety === "Nonpareil")!;
    expect(np.isSettled).toBe(true);
    expect(np.producedPounds).toBe(130_000); // settled, not the 125,000 estimate
    expect(np.estimateToSettledGapPounds).toBe(5_000); // 130,000 - 125,000
    expect(np.committedPounds).toBe(90_000);
    expect(np.unsoldPounds).toBe(40_000); // 130,000 - 90,000 - 0
  });

  it("is idempotent: a second run writes nothing new", async () => {
    const ledger = makeLedger([
      { id: "est_np", variety: "Nonpareil", pounds: 125_000, source: "ALMOND_LOGIC", supersedesId: null, supersededReason: "crop ingest entity e1" },
    ]);
    const deps: IngestReportsDeps = {
      farmId: FARM_ID,
      runInSettlementTenant: ledger.runInSettlementTenant,
      runInCommitmentTenant: ledger.runInCommitmentTenant,
      loadLedger: ledger.loadLedger,
      settlementReader: fakeSettlementReader(),
      commitmentReader: fakeCommitmentReader(),
      pdfToText: fakePdfToText(),
      scrapeOverride: fakeScrape(),
    };
    await ingestCropReports(ENTITY_ID, CROP_YEAR, deps);
    const second = await ingestCropReports(ENTITY_ID, CROP_YEAR, {
      ...deps,
      pdfToText: fakePdfToText(), // fresh closure for the second run's classify-by-order
    });
    const settledDoc = second.documents.find((d) => d.docClass === "settlement")!;
    expect(settledDoc.settlement!.written).toBe(0);
    expect(settledDoc.settlement!.skipped).toBe(1);
    expect(ledger.production.filter((r) => r.source === "PACKER_SETTLED")).toHaveLength(1);
    expect(ledger.commitments).toHaveLength(1);
  });
});
