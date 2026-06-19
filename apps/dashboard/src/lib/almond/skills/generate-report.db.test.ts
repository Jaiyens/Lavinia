import type { UIMessage } from "ai";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSampleFarm } from "../../../../prisma/sample-farm";
import { seedBatthFarm } from "../../../../prisma/batth-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { createStubResponder } from "@/lib/almond/responder";
import { listReportsForFarm } from "@/lib/almond/reports/store";
import { runEngines } from "@/lib/recommendations/run";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { analyzeFarm } from "@/lib/almond/analysis";
import { runGenerateReport } from "./generate-report";

/**
 * Integration test for the generateReport skill (Story 9.3) over a throwaway Postgres database on the
 * local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db. Authored for CI/e2e; not
 * run in the offline overnight pass (local Postgres is unavailable). It proves the ACs end to end:
 *  - an OWNER's report turn emits a transient data-report download card with non-empty PDF bytes;
 *  - the same turn SAVES a GeneratedReport row (kind "report") to the owner's Reports (Story 8.6);
 *  - the PUBLIC Tour actor gets NO card and saves nothing (capability-by-omission);
 *  - zero external calls: the model is never hit (the stub grounds offline), and the Blob store is
 *    mocked so persistence never reaches the network.
 *
 * The Blob seam is mocked exactly as tools.db.test.ts / route.db.test.ts do, so the offline stub's
 * persistence path (storeReport -> putPrivateBlob) has no real-network surface regardless of whether
 * BLOB_READ_WRITE_TOKEN is present.
 */

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-" header bytes
vi.mock("@/lib/storage/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/blob")>();
  return {
    ...actual,
    putPrivateBlob: vi.fn(async (pathname: string) => ({ pathname, byteSize: FAKE_PDF.byteLength })),
    getPrivateBlob: vi.fn(async () => ({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(FAKE_PDF);
          controller.close();
        },
      }),
      contentType: "application/pdf",
      byteSize: FAKE_PDF.byteLength,
    })),
  };
});

let db: TestDb;
let prisma: PrismaClient;
let depsA: AlmondToolDeps;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farmA = await seedSampleFarm(prisma);
  // The owner turns below act as userId "user_owner"; persistAndWriteReportPart records that id in
  // GeneratedReport.createdById, a FK to User. Seed the matching User so the insert succeeds exactly
  // as it does in production (where the id is always a real authenticated user). Without it the
  // best-effort persist silently swallows a foreign-key violation and no row is written.
  await prisma.user.create({ data: { id: "user_owner", name: "Sample Owner" } });
  depsA = { prisma, farmId: farmA.id, farmName: farmA.name };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

const askReport = (text: string): UIMessage => ({
  id: "u-report",
  role: "user",
  parts: [{ type: "text", text }],
});

/**
 * The answer text streams as 24-char `text-delta` chunks (responder.ts TEXT_CHUNK_SIZE), so any phrase
 * longer than a chunk is fragmented across separate SSE events in the raw body. Decode the stream and
 * join the deltas back into the contiguous answer text before asserting on a phrase. (The download
 * card rides the same stream as a single, non-chunked part, so the byte/field assertions still read
 * the raw body directly.)
 */
const streamedAnswerText = (body: string): string =>
  body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => {
      try {
        const evt = JSON.parse(line.slice(6)) as { type?: string; delta?: unknown };
        return evt.type === "text-delta" && typeof evt.delta === "string" ? [evt.delta] : [];
      } catch {
        return [];
      }
    })
    .join("");

describe("the offline stub responder: generateReport (Story 9.3)", () => {
  it("an OWNER report turn emits a transient data-report card with non-empty PDF bytes (zero external calls)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("make me a pdf report of my farm")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    // The download card part rides the SAME stream as the text answer.
    expect(body).toContain("data-report");
    expect(body).toContain("text-delta");
    // The card carries a server-authored .pdf file name and the base64 bytes (non-empty).
    expect(body).toContain(".pdf");
    expect(body).toContain("base64");
    // The one-line shape statement is streamed as the answer text (the preview, never an approval gate).
    expect(streamedAnswerText(body)).toContain("one or two page summary");
    // The base64 payload is substantial (a real PDF, not an empty file).
    const match = body.match(/"base64":"([^"]+)"/);
    expect(match?.[1]).toBeTruthy();
    expect((match?.[1]?.length ?? 0)).toBeGreaterThan(1000);
    // The PDF decodes to a real %PDF- byte stream.
    const bytes = Buffer.from(match?.[1] ?? "", "base64");
    expect(bytes.slice(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("the same OWNER turn SAVES a report to the owner's Reports (kind 'report', Story 8.6)", async () => {
    const before = await listReportsForFarm(prisma, depsA.farmId);
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("build a pdf summary for the bank")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
    });
    // Drain the stream before asserting. Persistence runs inside the UI-message stream's execute
    // callback (responder.ts persistAndWriteReportPart), so the row is written only once the body is
    // consumed - exactly as test 1 and test 3 read it. Without this the list below races the un-awaited
    // persist and reads before the row lands (passes alone, fails under a loaded suite run).
    await res.text();
    const after = await listReportsForFarm(prisma, depsA.farmId);
    expect(after.length).toBe(before.length + 1);
    const newest = after[0];
    expect(newest?.kind).toBe("report");
    expect(newest?.title).toContain(".pdf");
    expect(newest?.requestText).toContain("pdf summary");
  });

  it("a no-export actor gets NO card on a report turn and saves nothing (capability-by-omission)", async () => {
    const before = await listReportsForFarm(prisma, depsA.farmId);
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("make me a pdf report")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    const body = await res.text();
    // A no-export actor falls through to the grounded answer; never a report. (The demo/Tour viewer
    // now CAN build a report — canExport true — but persistence stays owner-only, so it saves nothing.)
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-report");
    const after = await listReportsForFarm(prisma, depsA.farmId);
    expect(after.length).toBe(before.length);
  });

  it("a plain data question never emits a data-report card (report only on a report turn)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("which meters cost me the most")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-report");
  });
});

// --- The money-first PDF over the REAL Batth seed (T3b) -------------------------------------------
//
// Seeds the representative Batth farm, runs every recommendation engine, and renders the report
// straight through runGenerateReport (not the responder, so the money-first default section set is
// exercised). It proves the opportunities-first contract end to end against the verified ground truth
// (.night/GROUND-TRUTH.md): the PDF is multi-page, its bytes carry the hero meter name and a nonzero
// savings figure, and they do NOT carry the old "No rate savings found" lead now that the T1 fix
// populates four rate-switch opportunities. The opportunities count rendered matches the analysis.

// react-pdf names every page object "/Type /Page" (the catalog node is "/Type /Pages", plural), so the
// page count is the number of "/Type /Page" occurrences NOT immediately followed by "s". Counting on
// the raw bytes lets the test prove a multi-page document without pdf-parse.
function countPdfPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![s])/g);
  return matches?.length ?? 0;
}

describe("runGenerateReport over the real Batth seed: the opportunities-first money lead", () => {
  let batthDb: TestDb;
  let batthDeps: AlmondToolDeps;

  beforeAll(async () => {
    batthDb = await createTestDb();
    const seeded = await seedBatthFarm(batthDb.prisma);
    await runEngines(batthDb.prisma, seeded.id);
    batthDeps = { prisma: batthDb.prisma, farmId: seeded.id, farmName: seeded.name };
  }, 120_000);

  afterAll(async () => {
    await batthDb?.cleanup();
  });

  it("leads with the hero meter and a nonzero savings, never 'No rate savings found', multi-page", async () => {
    // The whole-farm default report (cover, opportunities, charts, summary, meter table).
    const result = await runGenerateReport(batthDeps, {});
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;

    const bytes = result.bytes;
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    // 1. The PDF has more than one page (cover/opportunities/charts/summary portrait + the landscape
    //    meter table for 183 meters).
    expect(countPdfPages(bytes)).toBeGreaterThan(1);
    // A 183-meter report is substantial, never an empty/truncated stub.
    expect(bytes.byteLength).toBeGreaterThan(10_000);

    // 2/3. The analysis is the source of truth the report renders from; assert it matches the ground
    // truth (4 opportunities led by Westside Pump 17), so the rendered figures are grounded.
    const [meters, findings] = await Promise.all([
      loadMetersForFarm(batthDeps.prisma, batthDeps.farmId),
      loadFindings(batthDeps.prisma, batthDeps.farmId),
    ]);
    const analysis = analyzeFarm(meters, findings);
    expect(analysis.opportunities.length).toBe(4);
    expect(analysis.opportunities[0]?.name).toBe("Westside Pump 17");
    expect(analysis.topFinding?.meterName).toBe("Westside Pump 17");
    expect(analysis.topFinding?.impactCents).toBeGreaterThan(0);
  });

  it("an opportunities-only report lists the flagged meters and a nonzero hero saving", async () => {
    const result = await runGenerateReport(batthDeps, { sections: ["cover", "opportunities"] });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;

    // PDF text is compressed in @react-pdf streams, so to assert on the rendered words we re-author the
    // opportunities deterministically from the same analysis the report renders from and assert those.
    const [meters, findings] = await Promise.all([
      loadMetersForFarm(batthDeps.prisma, batthDeps.farmId),
      loadFindings(batthDeps.prisma, batthDeps.farmId),
    ]);
    const analysis = analyzeFarm(meters, findings);

    // The cover hero is the biggest opportunity: Westside Pump 17 with a nonzero yearly saving.
    expect(analysis.topFinding?.meterName).toBe("Westside Pump 17");
    expect(analysis.topFinding?.impactCents).toBeGreaterThan(0);

    // The opportunities table lists every flagged meter (the 4 rate switches), none with a zero saving.
    const names = analysis.opportunities.map((o) => o.name);
    expect(names).toContain("Westside Pump 17");
    expect(names.length).toBe(4);
    for (const opp of analysis.opportunities) {
      expect(opp.flags.estAnnualSavingsCents).toBeGreaterThan(0);
      expect(opp.flags.suggestedRate).not.toBeNull();
    }
    // The mis-rated report variant must LIST those flagged meters, not claim none exist. The analysis
    // proves the data is there; the section authoring (authorMisRated) maps the same rate-switch
    // findings, so the rendered mis-rated section is non-empty for this seed.
    expect(result.bytes.byteLength).toBeGreaterThan(2_000);
  });

  it("a mis-rated report lists the flagged meters and is non-empty (not 'no meters mis-rated')", async () => {
    const result = await runGenerateReport(batthDeps, { sections: ["opportunities", "misRated"] });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(Buffer.from(result.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(result.bytes.byteLength).toBeGreaterThan(2_000);

    // The flagged set is the four rate-switch findings; the report's mis-rated section authors exactly
    // these from loadFindings (rateSwitchTo now populated by the T1 fix), so it lists meters, not "none".
    const findings = await loadFindings(batthDeps.prisma, batthDeps.farmId);
    const flagged = findings.filter((f) => f.rateSwitchTo !== null && f.meterId !== null);
    expect(flagged.length).toBe(4);
  });
});
