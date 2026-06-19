import type { UIMessage } from "ai";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSampleFarm } from "../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  buildAlmondSkills,
  farmOverview,
  findingList,
  meterDetail,
  meterList,
  navigateSkill,
  ratesSummary,
  reconciliation,
  type AlmondToolDeps,
} from "./tools";
import { composeStubAnswer, createStubResponder } from "./responder";

// Integration test: run Almond's tool executors through Prisma against a throwaway Postgres
// database on the local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db.

// Mock the Blob storage seam so the OWNER export path (which now persists to Reports via
// storeReport -> putPrivateBlob, Story 8.6) never reaches the real Vercel Blob store. The stub
// responder is an OFFLINE path (zero external calls is a Law), and an owner export turn flows
// through persistence; without this mock the test would fire a real network write whenever
// BLOB_READ_WRITE_TOKEN is present in the environment. Mocked exactly as route.db.test.ts does, so
// the offline stub export path has no real-network surface regardless of the environment.
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
let depsA: AlmondToolDeps;
let depsB: AlmondToolDeps;
let farmAPumpNames: string[];
const FARM_B_PUMP = "ZZZ Secret Pump B";

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  // Farm A: the full sample farm. Farm B: a separate farm with one distinctively-named pump,
  // used to prove cross-farm isolation.
  const farmA = await seedSampleFarm(prisma);
  farmAPumpNames = farmA.pumps.map((p) => p.name);
  depsA = { prisma, farmId: farmA.id, farmName: farmA.name };

  const farmB = await prisma.farm.create({ data: { name: "Other Grower Farms", isDemo: true } });
  await prisma.pump.create({ data: { name: FARM_B_PUMP, farmId: farmB.id } });
  depsB = { prisma, farmId: farmB.id, farmName: farmB.name };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("Almond tool executors over the seeded farm", () => {
  it("getFarmOverview reports the farm's own name and meter count", async () => {
    const o = await farmOverview(depsA);
    expect(o.farmName).toBe(depsA.farmName);
    expect(o.meterCount).toBe(farmAPumpNames.length);
    expect(o.meterCount).toBeGreaterThan(0);
  });

  it("listMeters returns the farm's pumps", async () => {
    const r = await meterList(depsA);
    expect(r.total).toBe(farmAPumpNames.length);
    const names = r.meters.map((m) => m.name);
    for (const n of farmAPumpNames) expect(names).toContain(n);
  });

  it("getMeter finds a meter by name and reports it not found otherwise", async () => {
    const firstName = farmAPumpNames[0] ?? "";
    const hit = await meterDetail(depsA, firstName);
    expect(hit.found).toBe(true);
    if (hit.found) expect(hit.meter.name).toBe(firstName);

    const miss = await meterDetail(depsA, "no-such-meter-xyz");
    expect(miss.found).toBe(false);
  });

  it("getRatesSummary and getReconciliation cover every meter", async () => {
    const rates = await ratesSummary(depsA);
    const rateTotal = rates.rates.reduce((sum, r) => sum + r.meterCount, 0);
    expect(rateTotal).toBe(farmAPumpNames.length);

    const recon = await reconciliation(depsA);
    expect(recon.meterCount).toBe(farmAPumpNames.length);
    const stateTotal = recon.byCoverageState.reduce((sum, s) => sum + s.meterCount, 0);
    expect(stateTotal).toBe(farmAPumpNames.length);
  });

  it("buildAlmondSkills gates the file-writing skills on canExport; a no-export actor gets only the read-safe set", () => {
    const readSafe = [
      "getFarmOverview",
      "getMeter",
      "getRatesSummary",
      "getReconciliation",
      "listFindings",
      "listMeters",
      "navigate",
    ].sort();
    // A caller who canExport (an authed owner OR the demo/Tour viewer) gets the read-safe set + the
    // file skills: exportSpreadsheet (Story 8.5) and generateReport (Story 9.3).
    const ownerSkills = buildAlmondSkills(depsA, { authedOwner: true, canExport: true, userId: "user_owner" });
    expect(Object.keys(ownerSkills).sort()).toEqual(
      [...readSafe, "exportSpreadsheet", "generateReport"].sort(),
    );
    // A no-export actor gets ONLY the read-safe set: the file-writing skills are withheld by
    // omission, so the model can never call them. `navigate` (Story 7.3) stays unconditional.
    const noExportSkills = buildAlmondSkills(depsA, { authedOwner: false, canExport: false, userId: null });
    expect(Object.keys(noExportSkills).sort()).toEqual(readSafe);
    expect(Object.keys(noExportSkills)).not.toContain("exportSpreadsheet");
    expect(Object.keys(noExportSkills)).not.toContain("generateReport");
  });
});

describe("the offline stub responder: exportSpreadsheet (Story 8.5)", () => {
  const askExport = (text: string): UIMessage => ({
    id: "u-export",
    role: "user",
    parts: [{ type: "text", text }],
  });

  it("an OWNER export turn emits a transient data-report download card with non-empty bytes (zero external calls)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askExport("export my meters as a spreadsheet")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    // The download card part rides the SAME stream as the text answer.
    expect(body).toContain("data-report");
    expect(body).toContain("text-delta");
    // The card carries a server-authored file name and the base64 bytes (non-empty).
    expect(body).toContain(".xlsx");
    expect(body).toContain("base64");
    // The one-line preview is streamed as the answer text.
    expect(body).toContain("I will export your");
    // The base64 payload is substantial (a real zipped workbook, not an empty file).
    const match = body.match(/"base64":"([^"]+)"/);
    expect(match?.[1]).toBeTruthy();
    expect((match?.[1]?.length ?? 0)).toBeGreaterThan(1000);
  });

  it("a no-export actor gets NO download card even on an export turn (capability-by-omission)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askExport("export my meters as a spreadsheet")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    const body = await res.text();
    // A no-export actor falls through to the grounded answer; never an export. (The demo/Tour viewer
    // now CAN export — canExport true, streamed but not persisted — covered by the pure factory test.)
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-report");
  });

  it("a plain data question never emits a data-report card (export only on an export turn)", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [askExport("which meters cost me the most")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: true, canExport: true, userId: "user_owner" },
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-report");
  });
});

describe("farm scoping (cross-farm reads are impossible)", () => {
  it("farm B's tools never surface farm A's meters, and vice versa", async () => {
    const bMeters = await meterList(depsB);
    expect(bMeters.total).toBe(1);
    expect(bMeters.meters[0]?.name).toBe(FARM_B_PUMP);

    const aMeters = await meterList(depsA);
    const aNames = aMeters.meters.map((m) => m.name);
    expect(aNames).not.toContain(FARM_B_PUMP);
    // Farm B cannot reach any of farm A's pumps by name lookup.
    for (const n of farmAPumpNames) {
      const probe = await meterDetail(depsB, n);
      expect(probe.found).toBe(false);
    }
  });

  it("navigate is farm-scoped: farm B cannot navigate to a farm A meter", async () => {
    // The navigate skill inherits scope from `deps` (FR7): resolving a farm A meter name against
    // farm B's meters finds nothing and emits no action, so Almond can never drive one farm to
    // another farm's pump. (Self-match still works: farm B navigates to its own pump.)
    const aName = farmAPumpNames[0];
    expect(aName).toBeTruthy();
    const crossFarm = await navigateSkill(depsB, { open: "meter", query: aName as string });
    expect(crossFarm).toEqual({ kind: "none" });

    const ownFarm = await navigateSkill(depsB, { open: "meter", query: FARM_B_PUMP });
    expect(ownFarm.kind).toBe("navigate");
  });

  it("findings are scoped to the farm", async () => {
    await prisma.recommendation.create({
      data: {
        farmId: depsA.farmId,
        tool: "rate-optimization",
        situation: "This meter looks mis-rated",
        action: { label: "Move to AG-A1" },
        impactUsd: 4322,
        severity: "act",
        status: "pending",
      },
    });
    const aFindings = await findingList(depsA);
    expect(aFindings.count).toBe(1);
    expect(aFindings.findings[0]?.situation).toBe("This meter looks mis-rated");

    const bFindings = await findingList(depsB);
    expect(bFindings.count).toBe(0);
  });
});

describe("the offline stub responder", () => {
  it("composeStubAnswer grounds in the farm's real name and meter count (zero external calls)", async () => {
    const answer = await composeStubAnswer(depsA);
    expect(answer).toContain(depsA.farmName);
    expect(answer).toContain(String(farmAPumpNames.length));
  });

  it("routes on the user's question instead of always returning the overview", async () => {
    const ask = (text: string): UIMessage => ({
      id: "u1",
      role: "user",
      parts: [{ type: "text", text }],
    });
    const recon = await composeStubAnswer(depsA, [ask("how complete is my billing data")]);
    expect(recon).toMatch(/billing coverage breaks down/i);

    const meters = await composeStubAnswer(depsA, [ask("which meters cost me the most")]);
    expect(meters).toMatch(/costliest|do not have a posted bill/i);
    // The two intents produce different answers (it is not a canned constant).
    expect(recon).not.toBe(meters);
  });

  it("toResponse returns a 200 UI-message stream", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [],
      system: "ignored by the stub",
      deps: depsA,
      // The stub is read-only and grounds directly, so it ignores the actor; the field is
      // required on AlmondRequest because the model path needs it (capability gate).
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("text-start");
    expect(body).toContain("text-delta");
  });

  it("emits a transient data-navigate part on a navigation turn, carrying the resolved meter id (Story 7.4, AC4)", async () => {
    // The stub drives the SAME shipped `navigate` skill offline, then the bridge writes the
    // transient `data-navigate` part onto the stream — proving navigation end-to-end with zero
    // external calls. The part carries the resolved meter ID (not the raw query), the value the
    // `meter` URL key holds, so the client drawer opens on the right pump.
    const name =
      farmAPumpNames.find((n) => !/\b(chart|table|map|calendar|open|show|see|view|filter)\b/i.test(n)) ??
      farmAPumpNames[0];
    expect(name).toBeTruthy();
    const askNav = (text: string): UIMessage => ({
      id: "u-nav",
      role: "user",
      parts: [{ type: "text", text }],
    });
    const res = await createStubResponder().toResponse({
      uiMessages: [askNav(`open ${name}`)],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("data-navigate");
    const hit = await meterDetail(depsA, name as string);
    expect(hit.found).toBe(true);
    if (hit.found) expect(body).toContain(hit.meter.id);
    // Story 7.5: the part also carries the server-composed action-chip label, by meter NAME (not id),
    // identically on the stub and live paths. "Opened <name>" is the plain-English chip text.
    expect(body).toContain(`Opened ${name}`);
  });

  it("writes NO data-navigate part for a data question (only the grounded text answer)", async () => {
    const ask = (text: string): UIMessage => ({
      id: "u-q",
      role: "user",
      parts: [{ type: "text", text }],
    });
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("how complete is my billing data")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-navigate");
  });

  it("never-hijack: an idle turn with no user request emits NO data-navigate part (Story 7.5, FR4)", async () => {
    // The guarantee is structural — a navigation is written only in direct response to a user turn
    // that drives it, never spontaneously. With no user request to drive navigation, the responder
    // must move nothing on screen.
    const res = await createStubResponder().toResponse({
      uiMessages: [],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    const body = await res.text();
    expect(body).not.toContain("data-navigate");
  });

  it("a navigation-looking question that resolves to nothing falls through to the grounded answer, not a dead-end", async () => {
    // "show me the data" trips isNavigationTurn (the verb "show"), but resolves to no meter -> the
    // stub must fall through to composeStubAnswer rather than emit a part or dead-end on
    // "I could not find that on your farm." (both of those substrings fit within one unsplit text chunk).
    const ask = (text: string): UIMessage => ({
      id: "u-fall",
      role: "user",
      parts: [{ type: "text", text }],
    });
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("show me the data")],
      system: "ignored by the stub",
      deps: depsA,
      actor: { authedOwner: false, canExport: false, userId: null },
    });
    const body = await res.text();
    expect(body).toContain("text-delta");
    expect(body).not.toContain("data-navigate");
    expect(body).not.toContain("could not find");
  });
});
