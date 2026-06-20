import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { storeReport } from "@/lib/almond/reports/store";

// Integration test for the owner-scoped report download route (Story 8.6) against a throwaway
// Postgres database on the local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db.
// It proves the AC's core guarantee: CROSS-FARM ACCESS IS IMPOSSIBLE. A grower can fetch their own
// report, but a different farm's report id returns 404 and an anonymous caller returns 401.
//
// NOTE: this file is intentionally NOT run in the overnight pass (local Postgres is unavailable). It
// is authored to the AC's requirement and runs in CI / locally where the cluster is up.
//
// The session (sessionUserId) and the Blob storage seam are mocked so the test is hermetic: it
// exercises the route's OWNERSHIP gate (the part that matters) without a real Auth.js session or a
// real Vercel Blob store. `@/lib/db` is pointed at the test database so the route's prisma reads the
// two seeded farms. The blob bytes are returned from the mock, so a 200 proves the full happy path.

let db: TestDb;
let prisma: PrismaClient;

// A mutable "current session" the auth mock returns; each test sets it before calling the route.
let currentUserId: string | null = null;

vi.mock("@/lib/auth", () => ({
  sessionUserId: async () => currentUserId,
}));

// Point the route's prisma singleton at the throwaway test database.
vi.mock("@/lib/db", () => ({
  get prisma() {
    return prisma;
  },
}));

// Mock the private-blob read so a 200 returns deterministic bytes (no real Blob store needed).
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

// Imported AFTER the mocks so the route closes over them.
let GET: (typeof import("./route"))["GET"];

let farmAId: string;
let farmAUserId: string;
let farmBReportId: string;
let farmAReportId: string;

const PGE_SMD = "pge_smd";

/** Create a user + their own connected (active PG&E) farm with an owner membership, so
 *  currentFarm (now membership-scoped) resolves it. */
async function seedOwnedFarm(name: string): Promise<{ userId: string; farmId: string }> {
  const user = await prisma.user.create({ data: { email: `${name}@example.com` } });
  const farm = await prisma.farm.create({
    data: {
      name,
      isDemo: false,
      userId: user.id,
      memberships: { create: [{ role: "owner", status: "active", user: { connect: { id: user.id } } }] },
      connections: { create: [{ type: PGE_SMD, status: "active", authorizedAt: new Date() }] },
    },
  });
  return { userId: user.id, farmId: farm.id };
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  ({ GET } = await import("./route"));

  const a = await seedOwnedFarm("Farm A");
  const b = await seedOwnedFarm("Farm B");
  farmAId = a.farmId;
  farmAUserId = a.userId;

  // One report on EACH farm. Persisted via the store (blob write mocked).
  const reportA = await storeReport(
    { prisma, farmId: a.farmId, createdById: a.userId },
    {
      kind: "meters",
      title: "farm-a-meters.xlsx",
      requestText: "export my meters",
      coverageAsOf: null,
      params: { table: "meters", filterKey: null, filterValue: null },
      bytes: FAKE_BYTES,
    },
  );
  farmAReportId = reportA.id;

  const reportB = await storeReport(
    { prisma, farmId: b.farmId, createdById: b.userId },
    {
      kind: "meters",
      title: "farm-b-meters.xlsx",
      requestText: "export my meters",
      coverageAsOf: null,
      params: { table: "meters", filterKey: null, filterValue: null },
      bytes: FAKE_BYTES,
    },
  );
  farmBReportId = reportB.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

/** Invoke the route GET with a given report id (params is an async promise in Next 16). */
function callGet(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/reports/${id}/download`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/reports/[id]/download (owner-scoped)", () => {
  it("returns 401 for an anonymous caller (no session)", async () => {
    currentUserId = null;
    const res = await callGet(farmAReportId);
    expect(res.status).toBe(401);
  });

  it("streams the bytes for the OWNER's own report (200)", async () => {
    currentUserId = farmAUserId;
    const res = await callGet(farmAReportId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toContain("farm-a-meters.xlsx");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBe(FAKE_BYTES.byteLength);
  });

  it("CROSS-FARM ACCESS IS IMPOSSIBLE: farm A's owner gets 404 for farm B's report id", async () => {
    currentUserId = farmAUserId; // signed in as farm A's owner
    const res = await callGet(farmBReportId); // ...asking for farm B's report
    expect(res.status).toBe(404);
    // And the body never leaks the other farm's file name.
    const body = await res.text();
    expect(body).not.toContain("farm-b-meters.xlsx");
  });

  it("returns 404 for a non-existent report id", async () => {
    currentUserId = farmAUserId;
    const res = await callGet("report_does_not_exist");
    expect(res.status).toBe(404);
  });

  it("the seeded farms are distinct (sanity: farm A really does not own farm B's report)", async () => {
    const owned = await prisma.generatedReport.findFirst({
      where: { id: farmBReportId, farmId: farmAId },
    });
    expect(owned).toBeNull();
  });
});
