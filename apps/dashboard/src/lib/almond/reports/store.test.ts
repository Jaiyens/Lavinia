import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

// Offline unit test for the Reports store (Story 8.6). The private-blob storage seam is MOCKED and
// the Prisma client is a hand-rolled fake, so there are ZERO external calls (no Blob API, no DB).
// It proves: (1) bytes are written to a PRIVATE blob FIRST, then a GeneratedReport row records what
// the file was / when / the request that produced it (never the bytes); (2) scope (farmId) and
// authorship (createdById) come only from deps; (3) immutability — a refresh writes a NEW key + row.
// The farm-scoped loader is also proven to be `where: { id, farmId }` so a cross-farm id is unreachable.

const putPrivateBlob = vi.fn();
const newReportBlobKey = vi.fn();

vi.mock("@/lib/storage/blob", () => ({
  XLSX_CONTENT_TYPE: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  newReportBlobKey: (...args: unknown[]) => newReportBlobKey(...args),
  putPrivateBlob: (...args: unknown[]) => putPrivateBlob(...args),
}));

import {
  GENERATED_REPORT_KINDS,
  loadReportForFarm,
  storeReport,
  type ReportToStore,
} from "./store";

/** A fake Prisma whose generatedReport delegate records its create/findFirst calls. */
function fakePrisma() {
  const created: Array<Record<string, unknown>> = [];
  const findFirst = vi.fn();
  const prisma = {
    generatedReport: {
      create: vi.fn(async ({ data, select: _select }: { data: Record<string, unknown>; select?: unknown }) => {
        created.push(data);
        return { id: `report_${created.length}`, blobPathname: data.blobPathname, byteSize: data.byteSize };
      }),
      findFirst,
    },
  } as unknown as PrismaClient;
  return { prisma, created, findFirst };
}

const baseReport: ReportToStore = {
  kind: "meters",
  title: "acme-meters.xlsx",
  requestText: "export my meters",
  coverageAsOf: "2026-03-12",
  params: { table: "meters", filterKey: null, filterValue: null },
  bytes: new Uint8Array([1, 2, 3]),
};

beforeEach(() => {
  putPrivateBlob.mockReset();
  newReportBlobKey.mockReset();
});

describe("GENERATED_REPORT_KINDS", () => {
  it("mirrors the export tables (meters, billDue)", () => {
    expect([...GENERATED_REPORT_KINDS]).toEqual(["meters", "billDue"]);
  });
});

describe("storeReport", () => {
  it("writes the bytes PRIVATELY first, then records a row of WHAT/WHEN/the request (never the bytes)", async () => {
    newReportBlobKey.mockReturnValueOnce("reports/key-1.xlsx");
    putPrivateBlob.mockResolvedValueOnce({ pathname: "reports/key-1.xlsx", byteSize: 3 });
    const { prisma, created } = fakePrisma();

    const result = await storeReport(
      { prisma, farmId: "farm_a", createdById: "user_1" },
      baseReport,
    );

    // The blob is written privately under the generated key, with the file's content type.
    expect(putPrivateBlob).toHaveBeenCalledWith(
      "reports/key-1.xlsx",
      baseReport.bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    // Exactly one row, recording WHAT/WHEN/request + the storage pointer — never the bytes.
    expect(created).toHaveLength(1);
    const row = created[0]!;
    expect(row.farmId).toBe("farm_a"); // scope from deps, never the model
    expect(row.createdById).toBe("user_1"); // authorship from deps
    expect(row.kind).toBe("meters");
    expect(row.title).toBe("acme-meters.xlsx");
    expect(row.requestText).toBe("export my meters");
    expect(row.coverageAsOf).toBe("2026-03-12");
    expect(row.blobPathname).toBe("reports/key-1.xlsx");
    expect(row.byteSize).toBe(3);
    expect(row.paramsJson).toEqual({ table: "meters", filterKey: null, filterValue: null });
    // The bytes themselves are NEVER persisted in the row.
    expect(JSON.stringify(row)).not.toContain("bytes");
    expect(Object.values(row)).not.toContainEqual(baseReport.bytes);

    expect(result).toEqual({ id: "report_1", blobPathname: "reports/key-1.xlsx", byteSize: 3 });
  });

  it("records a null createdById when the user is unknown (ownership is on the farm, not this column)", async () => {
    newReportBlobKey.mockReturnValueOnce("reports/key-2.xlsx");
    putPrivateBlob.mockResolvedValueOnce({ pathname: "reports/key-2.xlsx", byteSize: 3 });
    const { prisma, created } = fakePrisma();

    await storeReport({ prisma, farmId: "farm_a" }, baseReport);
    expect(created[0]!.createdById).toBeNull();
  });

  it("is IMMUTABLE: a refresh writes a NEW key + a NEW row, never an in-place rewrite", async () => {
    newReportBlobKey.mockReturnValueOnce("reports/key-A.xlsx").mockReturnValueOnce("reports/key-B.xlsx");
    putPrivateBlob
      .mockResolvedValueOnce({ pathname: "reports/key-A.xlsx", byteSize: 3 })
      .mockResolvedValueOnce({ pathname: "reports/key-B.xlsx", byteSize: 3 });
    const { prisma, created } = fakePrisma();

    const first = await storeReport({ prisma, farmId: "farm_a", createdById: "u" }, baseReport);
    const second = await storeReport({ prisma, farmId: "farm_a", createdById: "u" }, baseReport);

    // Two distinct rows, two distinct blob keys — nothing was overwritten.
    expect(first.id).not.toBe(second.id);
    expect(first.blobPathname).not.toBe(second.blobPathname);
    expect(created).toHaveLength(2);
    // No update was ever issued (the fake exposes only create/findFirst); the blob writer is the
    // only side effect and it was called with allowOverwrite:false (asserted in blob.test.ts).
    expect(putPrivateBlob).toHaveBeenCalledTimes(2);
  });

  it("writes the blob BEFORE the row, so the row never points at bytes that failed to land", async () => {
    const order: string[] = [];
    newReportBlobKey.mockReturnValueOnce("reports/key-3.xlsx");
    putPrivateBlob.mockImplementationOnce(async () => {
      order.push("blob");
      return { pathname: "reports/key-3.xlsx", byteSize: 3 };
    });
    const prisma = {
      generatedReport: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          order.push("row");
          return { id: "r", blobPathname: data.blobPathname, byteSize: data.byteSize };
        }),
        findFirst: vi.fn(),
      },
    } as unknown as PrismaClient;

    await storeReport({ prisma, farmId: "farm_a" }, baseReport);
    expect(order).toEqual(["blob", "row"]);
  });
});

describe("loadReportForFarm", () => {
  it("queries FARM-SCOPED (where id AND farmId), so a cross-farm id finds no row", async () => {
    const { prisma, findFirst } = fakePrisma();
    findFirst.mockResolvedValueOnce(null); // another farm's id -> no match

    const result = await loadReportForFarm(prisma, "farm_a", "report_owned_by_b");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "report_owned_by_b", farmId: "farm_a" },
      select: { blobPathname: true, title: true, byteSize: true },
    });
    expect(result).toBeNull();
  });

  it("returns the row when it belongs to the caller's farm", async () => {
    const { prisma, findFirst } = fakePrisma();
    findFirst.mockResolvedValueOnce({ blobPathname: "reports/x.xlsx", title: "acme-meters.xlsx", byteSize: 7 });
    const result = await loadReportForFarm(prisma, "farm_a", "report_1");
    expect(result).toEqual({ blobPathname: "reports/x.xlsx", title: "acme-meters.xlsx", byteSize: 7 });
  });
});
