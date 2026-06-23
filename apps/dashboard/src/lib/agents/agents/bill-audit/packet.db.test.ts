import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Integration test for the dispute packet against a throwaway Postgres on the local test cluster
// (never Neon). The PRIVATE-blob seam is MOCKED (the byte store needs a Vercel Blob token and is
// the one external call), so this stays offline-green: react-pdf renders the PDF bytes locally and
// the GeneratedReport row is written to the real test DB. It proves: the packet text carries the
// engine figures + the approved letter; rendering produces non-empty PDF bytes (the %PDF magic);
// storing writes a farm-scoped GeneratedReport row of kind "bill_dispute" with the bytes routed to
// the private blob (never inline).

const putPrivateBlob = vi.fn(
  async (pathname: string, bytes: Uint8Array, _contentType?: string) => ({
    pathname,
    byteSize: bytes.byteLength,
  }),
);

vi.mock("@/lib/storage/blob", () => ({
  XLSX_CONTENT_TYPE: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  newReportBlobKey: (ext = "pdf") => `reports/test-${Math.random().toString(36).slice(2)}.${ext}`,
  putPrivateBlob: (...args: [string, Uint8Array, string?]) => putPrivateBlob(...args),
}));

import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  buildDisputePacketLines,
  renderDisputePacket,
  renderAndStoreDisputePacket,
  DISPUTE_PACKET_CONTENT_TYPE,
  type DisputePacketInput,
} from "./packet";
import { usd } from "@/copy/en";

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

const input: DisputePacketInput = {
  pumpName: "West Pump 12",
  candidate: {
    recommendationId: "rec-1",
    pumpId: "pump-a",
    cycleStart: "2026-05-01",
    cycleClose: "2026-05-31",
    totalBillUsd: 1800,
    medianTotalUsd: 1200,
    excessUsd: 600,
    dedupeKey: "pump-a::2026-05-01",
  },
  letter: {
    subject: "Billing dispute, West Pump 12, May statement",
    body: "To the PG&E Billing Department,\n\nI am writing to dispute a charge.\n\nSincerely,\nThe account holder",
  },
};

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await prisma.farm.create({ data: { name: "Packet Farm", isDemo: false } });
  farmId = farm.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(() => {
  putPrivateBlob.mockClear();
});

describe("dispute packet composition", () => {
  it("carries the engine figures, the meter, and the approved letter verbatim", () => {
    const lines = buildDisputePacketLines(input);
    const joined = lines.join("\n");
    expect(joined).toContain("West Pump 12");
    expect(joined).toContain(usd(1800));
    expect(joined).toContain(usd(1200));
    expect(joined).toContain(usd(600));
    // The approved letter body appears verbatim.
    expect(joined).toContain("To the PG&E Billing Department,");
    expect(joined).toContain("The account holder");
    // No em dash in the composed packet text.
    expect(joined).not.toContain("—");
  });

  it("renders non-empty PDF bytes offline (the %PDF magic header)", async () => {
    const bytes = await renderDisputePacket(input);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const head = Buffer.from(bytes.slice(0, 5)).toString("latin1");
    expect(head).toBe("%PDF-");
  });
});

describe("renderAndStoreDisputePacket", () => {
  it("routes the bytes to the private blob and writes a farm-scoped bill_dispute report row", async () => {
    const stored = await renderAndStoreDisputePacket({ prisma, farmId, createdById: null }, input);

    // The bytes went to the private blob (the only external write), as a PDF.
    expect(putPrivateBlob).toHaveBeenCalledTimes(1);
    const [, bytes, contentType] = putPrivateBlob.mock.calls[0]!;
    expect((bytes as Uint8Array).byteLength).toBeGreaterThan(0);
    expect(contentType).toBe(DISPUTE_PACKET_CONTENT_TYPE);

    // A GeneratedReport row exists for THIS farm, of kind bill_dispute, with no inline bytes.
    const row = await prisma.generatedReport.findUniqueOrThrow({ where: { id: stored.id } });
    expect(row.farmId).toBe(farmId);
    expect(row.kind).toBe("bill_dispute");
    expect(row.title).toContain("West Pump 12");
    expect(row.byteSize).toBeGreaterThan(0);
    expect(row.coverageAsOf).toBe("2026-05-31");
  });

  it("is immutable: a second store writes a NEW row + key (history is append-only)", async () => {
    const a = await renderAndStoreDisputePacket({ prisma, farmId, createdById: null }, input);
    const b = await renderAndStoreDisputePacket({ prisma, farmId, createdById: null }, input);
    expect(a.id).not.toBe(b.id);
    expect(a.blobPathname).not.toBe(b.blobPathname);
  });
});
