import type { UIMessage } from "ai";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSampleFarm } from "../../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { AlmondToolDeps } from "../tools";
import { createStubResponder } from "../responder";

// End-to-end emission test for the Auto "what it decided" line (the Auto router). The pure tests in
// auto/route.test.ts pin the intent -> (model, headline) table; this proves the responder actually
// WRITES the decided headline onto the UI-message stream, and that the honest pulledCached ->
// buildingNew correction fires when a PREDICTED cache hit builds fresh. It runs on the OFFLINE stub
// (zero external calls is a Law), which carries the same once-write + correction logic as the live
// model path (responder.ts), so this is the conventional way to cover emission in this codebase (the
// data-navigate / data-report emission tests live in tools.db.test.ts the same way). A *.db.test.ts:
// it needs a seeded farm, so it runs on the local Postgres cluster and is excluded from CI.

// Mock the Blob seam so the OWNER export branch (which persists to Reports via storeReport ->
// putPrivateBlob, Story 8.6) never reaches the real Vercel Blob store - mirrored exactly from
// tools.db.test.ts so the offline path keeps zero real-network surface regardless of the environment.
const FAKE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // a tiny "PK.." zip header
vi.mock("@/lib/storage/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/blob")>();
  return {
    ...actual,
    putPrivateBlob: vi.fn(async (pathname: string) => ({ pathname, byteSize: FAKE_BYTES.byteLength })),
    getPrivateBlob: vi.fn(async () => ({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(FAKE_BYTES);
          controller.close();
        },
      }),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: FAKE_BYTES.byteLength,
    })),
  };
});

let db: TestDb;
let prisma: PrismaClient;
let deps: AlmondToolDeps;

const ask = (text: string): UIMessage => ({ id: "u-0", role: "user", parts: [{ type: "text", text }] });

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await seedSampleFarm(prisma);
  deps = { prisma, farmId: farm.id, farmName: farm.name, meterUserId: null };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("the Auto decided line is emitted on the stream (the offline stub path)", () => {
  it("writes a transient data-decided part carrying the predicted headline on an Auto turn", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("which meters cost me the most")],
      system: "ignored by the stub",
      deps,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
      decided: { headline: "answeredDirect" },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    // The decided part rides the SAME stream as the grounded text answer.
    expect(body).toContain("text-delta");
    expect(body).toContain("data-decided");
    // It carries the copy KEY (resolved to text client-side), not the prose.
    expect(body).toContain("answeredDirect");
  });

  it("writes NO data-decided part when the grower hand-picked a model (no Auto turn)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("which meters cost me the most")],
      system: "ignored by the stub",
      deps,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
      // no `decided` -> not an Auto turn -> the line is never written, behavior unchanged.
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-decided");
  });

  it("a file ask builds fresh with the buildingNew headline (no cache)", async () => {
    // A file ask always builds from scratch now (no cache probe), so the Auto headline for it is
    // buildingNew and the offline stub still produces the download card for an owner.
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("export my meters as a spreadsheet")],
      system: "ignored by the stub",
      deps,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
      decided: { headline: "buildingNew" },
    });
    const body = await res.text();
    expect(body).toContain("data-report");
    expect(body).toContain("data-decided");
    expect(body).toContain("buildingNew");
  });
});
