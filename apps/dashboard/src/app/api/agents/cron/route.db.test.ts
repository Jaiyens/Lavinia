import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { AgentDefinition } from "@/lib/agents/registry";

// Integration test for the cron dispatcher against a throwaway Postgres on the local test
// cluster (never dev/prod). It proves: 401 without the Bearer CRON_SECRET; demo farms are
// excluded; the refresh predicate selects only farms with a DURABLE re-pullable SMD
// connection (type pge_smd + source smd + externalRef not null), NOT status active; the
// cadence-window skip; and that one farm's failure does not abort the sweep.
//
// `@/lib/db` is pointed at the test database. The agent registry is mocked so a CONTROLLABLE
// test agent runs instead of the real refresh agent (which would attempt a PG&E pull): we
// drive its kind/cadence and make it throw for one farm to prove failure isolation. The
// barrel import is mocked to a no-op so importing it does not register the real agent.

let db: TestDb;
let prisma: PrismaClient;

vi.mock("@/lib/db", () => ({
  get prisma() {
    return prisma;
  },
}));

// The barrel normally registers the real agents on import; stub it so the route's
// `import "@/lib/agents/agents"` is inert and only our mocked listAgents is consulted.
vi.mock("@/lib/agents/agents", () => ({}));

// A controllable agent list + a record of which farms each agent ran for.
let agents: AgentDefinition[] = [];
const ranFor: string[] = [];
const failFarmIds = new Set<string>();

vi.mock("@/lib/agents/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/registry")>();
  return {
    ...actual,
    listAgents: () => agents,
  };
});

let GET: (typeof import("./route"))["GET"];

const PGE_SMD = "pge_smd";

/** Make a refresh-style controllable agent that records (and optionally fails) per farm. */
function testRefreshAgent(): AgentDefinition {
  return {
    kind: "refresh",
    label: "Test refresh",
    trigger: "cron",
    cadence: "daily",
    run: async (_p, farmId) => {
      if (failFarmIds.has(farmId)) throw new Error("boom");
      ranFor.push(farmId);
    },
  };
}

function callGet(secret?: string): Promise<Response> {
  const headers: HeadersInit = secret ? { authorization: `Bearer ${secret}` } : {};
  return GET(new Request("http://localhost/api/agents/cron", { headers }));
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  ({ GET } = await import("./route"));
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
  delete process.env.CRON_SECRET;
});

afterEach(async () => {
  // Reset state between tests; clear all farms/runs so each test seeds its own.
  ranFor.length = 0;
  failFarmIds.clear();
  agents = [];
  await prisma.agentRun.deleteMany({});
  await prisma.farm.deleteMany({});
});

describe("GET /api/agents/cron (dispatcher)", () => {
  it("returns 401 when CRON_SECRET is unset (fail-closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await callGet("anything");
    expect(res.status).toBe(401);
  });

  it("returns 401 without a matching Bearer header", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await callGet(undefined)).status).toBe(401);
    expect((await callGet("wrong")).status).toBe(401);
  });

  it("excludes demo farms and selects only the durable-SMD farm for refresh", async () => {
    process.env.CRON_SECRET = "s3cret";
    agents = [testRefreshAgent()];

    // A real authorized farm sits at status "pending" with source smd + an externalRef.
    const eligible = await prisma.farm.create({
      data: {
        name: "Eligible",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "pending", source: "smd", externalRef: "585637" }],
        },
      },
    });
    // A demo farm with the same durable connection: excluded by isDemo.
    await prisma.farm.create({
      data: {
        name: "Demo",
        isDemo: true,
        connections: {
          create: [{ type: PGE_SMD, status: "active", source: "smd", externalRef: "999" }],
        },
      },
    });
    // A non-demo farm whose connection is NOT durable (no externalRef): excluded by predicate.
    await prisma.farm.create({
      data: {
        name: "No externalRef",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "active", source: "smd", externalRef: null }],
        },
      },
    });
    // A non-demo farm whose source is not smd (a sample/bill-only farm): excluded.
    await prisma.farm.create({
      data: {
        name: "Sample only",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "active", source: "sample", externalRef: "abc" }],
        },
      },
    });

    const res = await callGet("s3cret");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ran: number };
    expect(ranFor).toEqual([eligible.id]);
    expect(body.ran).toBe(1);
  });

  it("skips a farm with a completed run inside the daily cadence window", async () => {
    process.env.CRON_SECRET = "s3cret";
    agents = [testRefreshAgent()];

    const farm = await prisma.farm.create({
      data: {
        name: "Recently refreshed",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "pending", source: "smd", externalRef: "585637" }],
        },
      },
    });
    // A completed refresh from one hour ago: inside the ~20h daily window -> skip.
    await prisma.agentRun.create({
      data: {
        farmId: farm.id,
        kind: "refresh",
        status: "succeeded",
        triggeredBy: "cron",
        completedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const res = await callGet("s3cret");
    const body = (await res.json()) as { ran: number; skipped: number };
    expect(ranFor).toEqual([]);
    expect(body.skipped).toBe(1);
    expect(body.ran).toBe(0);
  });

  it("runs a farm whose last completed run is OUTSIDE the cadence window", async () => {
    process.env.CRON_SECRET = "s3cret";
    agents = [testRefreshAgent()];
    const farm = await prisma.farm.create({
      data: {
        name: "Stale",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "pending", source: "smd", externalRef: "585637" }],
        },
      },
    });
    // 2 days ago: outside the ~20h window -> due.
    await prisma.agentRun.create({
      data: {
        farmId: farm.id,
        kind: "refresh",
        status: "succeeded",
        triggeredBy: "cron",
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await callGet("s3cret");
    expect(ranFor).toEqual([farm.id]);
  });

  it("one farm's failure does not abort the sweep over the rest", async () => {
    process.env.CRON_SECRET = "s3cret";
    agents = [testRefreshAgent()];
    const a = await prisma.farm.create({
      data: {
        name: "Will fail",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "pending", source: "smd", externalRef: "1" }],
        },
      },
    });
    const b = await prisma.farm.create({
      data: {
        name: "Will run",
        isDemo: false,
        connections: {
          create: [{ type: PGE_SMD, status: "pending", source: "smd", externalRef: "2" }],
        },
      },
    });
    failFarmIds.add(a.id);

    const res = await callGet("s3cret");
    const body = (await res.json()) as { ran: number; failed: number };
    // b still ran even though a threw.
    expect(ranFor).toContain(b.id);
    expect(ranFor).not.toContain(a.id);
    expect(body.failed).toBe(1);
    expect(body.ran).toBe(1);
  });
});
