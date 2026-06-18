import type { UIMessage } from "ai";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSampleFarm } from "../../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { createStubResponder } from "@/lib/almond/responder";
import { listReportsForFarm } from "@/lib/almond/reports/store";

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

describe("the offline stub responder: generateReport (Story 9.3)", () => {
  it("an OWNER report turn emits a transient data-report card with non-empty PDF bytes (zero external calls)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("make me a pdf report of my farm")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, userId: "user_owner" },
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
    expect(body).toContain("one or two page summary");
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
    await createStubResponder().toResponse({
      uiMessages: [askReport("build a pdf summary for the bank")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, userId: "user_owner" },
    });
    const after = await listReportsForFarm(prisma, depsA.farmId);
    expect(after.length).toBe(before.length + 1);
    const newest = after[0];
    expect(newest?.kind).toBe("report");
    expect(newest?.title).toContain(".pdf");
    expect(newest?.requestText).toContain("pdf summary");
  });

  it("the PUBLIC Tour actor gets NO card on a report turn and saves nothing (capability-by-omission)", async () => {
    const before = await listReportsForFarm(prisma, depsA.farmId);
    const res = await createStubResponder().toResponse({
      uiMessages: [askReport("make me a pdf report")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, userId: null },
    });
    const body = await res.text();
    // The public actor falls through to the grounded answer; never a report.
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
      actor: { authedOwner: true, userId: "user_owner" },
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-report");
  });
});
