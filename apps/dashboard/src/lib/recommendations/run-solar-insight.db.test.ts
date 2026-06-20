import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";
import { runEngines } from "./run";
import { routeDemandResponseFinding, runSolarInsight } from "./run-solar-insight";

// Integration test for the solar-insight runner (Story 3.4): persists the gated
// NEM demand insight idempotently under the solar tool. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let solarPumpId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Solar Farm", isDemo: false } });
  farmId = farm.id;

  // A reconciled NEM solar meter on AG-C with billed demand + persisted months:
  // every gate passes -> one insight.
  const solar = await prisma.pump.create({
    data: {
      name: "P041",
      serviceId: "SA-SOLAR",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: true,
      coverageState: "reconciled",
      trueUpAmountCents: 290,
      farmId,
    },
  });
  solarPumpId = solar.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: solarPumpId,
      start: new Date("2026-02-11T00:00:00.000Z"),
      close: new Date("2026-03-12T00:00:00.000Z"),
      printedTotalCents: 4550,
      billingLineItems: {
        create: [
          { kind: "demand", label: null, amountCents: 250, quantity: 0.16, unit: "kW" },
          { kind: "other", label: "Customer Charge 30 days @ $1.43343", amountCents: 4300 },
          // E-2: a TOU energy line makes the offsettable portion quotable, so the F2 note
          // and params carry the uncovered share. demand 250 / (250 + 750) = 25%.
          { kind: "tou_energy", label: "Peak energy", amountCents: 750, quantity: 100, unit: "kWh" },
        ],
      },
    },
  });
  await prisma.nemPeriod.createMany({
    data: [
      { pumpId: solarPumpId, start: new Date("2025-12-01T00:00:00.000Z"), close: new Date("2025-12-31T00:00:00.000Z"), netKwh: -5, amountCents: -80 },
      { pumpId: solarPumpId, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 14, amountCents: 240 },
      { pumpId: solarPumpId, start: new Date("2026-02-01T00:00:00.000Z"), close: new Date("2026-02-28T00:00:00.000Z"), netKwh: 3, amountCents: 50 },
    ],
  });

  // A solar AG-C meter that is NOT reconciled: must stay silent.
  const unreconciled = await prisma.pump.create({
    data: {
      name: "P038",
      serviceId: "SA-UNREC",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: true,
      coverageState: "needs_review",
      farmId,
    },
  });
  await prisma.nemPeriod.create({
    data: { pumpId: unreconciled.id, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 100, amountCents: 1600 },
  });

  // A reconciled solar meter on AG-A (no demand-carrying schedule): silent.
  await prisma.pump.create({
    data: {
      name: "P018",
      serviceId: "SA-AGA",
      rateSchedule: "AGA1 Ag<35 kW Low Use",
      isSolar: true,
      coverageState: "reconciled",
      farmId,
    },
  });

  // Another tool's pending rec must survive the runner's tool-scoped clear.
  await prisma.recommendation.create({
    data: {
      farmId,
      tool: "rate-optimization",
      situation: "Other tool's finding",
      action: { kind: "switch_rate", label: "Move it" },
      severity: "act",
      status: "pending",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("runSolarInsight", () => {
  it("persists the gated insight with the dollar in the note, never in impactUsd", async () => {
    const result = await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    if (!rec) throw new Error("expected a rec");
    expect(rec.severity).toBe("info");
    expect(rec.impactUsd).toBeNull(); // demand owed is not money at stake
    expect(rec.impactNote).toContain("demand charge");
    expect(rec.impactNote).toContain("$3"); // ~$2.50 rendered whole-dollar
    expect(rec.situation).toContain("between 5 and 8");
    expect(rec.situation).not.toContain("between 4 and 9"); // never the DR window
    const action = rec.action as {
      kind: string;
      params?: {
        pumpId?: string;
        position?: string;
        uncoveredShare?: number | null;
        floorCents?: number;
        floorDemandCents?: number;
        floorServiceCents?: number;
        floorNbcCents?: number;
      };
    };
    expect(action.kind).toBe("review_solar_demand");
    expect(action.params?.pumpId).toBe(solarPumpId);
    expect(action.params?.position).toBe("net_zero");

    // E-2 (FR21/FR23): the uncovered share rides BESIDE the dollar in the note, and the
    // floor (demand + service + non-bypassable) rides in params for the labeled-group
    // surface. demand 250 / (250 + 750 offsettable) = 25%; the note still carries no
    // impactUsd and never a credit dollar (the F2 contract preserved).
    expect(action.params?.uncoveredShare).toBeCloseTo(0.25);
    expect(rec.impactNote).toContain("25%"); // the share said beside the demand dollar
    // The floor is the charges solar never offsets: demand 250 + service 4300 = 4550.
    expect(action.params?.floorDemandCents).toBe(250);
    expect(action.params?.floorServiceCents).toBe(4300);
    expect(action.params?.floorNbcCents).toBe(0);
    expect(action.params?.floorCents).toBe(4550);
  });

  it("is idempotent and tool-scoped", async () => {
    await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(1);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: "rate-optimization" } }),
    ).toBe(1);
  });

  it("never resurrects a dismissed insight", async () => {
    await prisma.recommendation.updateMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    const result = await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(0);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(0);
  });
});

// Story B-1: engine reconciliation (ADR-S05). Exactly one engine owns SOLAR_TOOL per
// farm. For a real farm runEngines must NOT touch SOLAR_TOOL (no clear, no insert):
// runSolarInsight is the sole owner. For a demo/seed farm the legacy solarNemChecks
// branch inside runEngines still owns the key so the Tour/seed solar finding survives.
describe("SOLAR_TOOL ownership reconciliation (B-1)", () => {
  it("runEngines emits zero SOLAR_TOOL rows on a real farm; runSolarInsight is the sole owner; no duplicates", async () => {
    const realFarm = await prisma.farm.create({
      data: { name: "Real Solar Farm", isDemo: false },
    });
    const realFarmId = realFarm.id;

    // A reconciled NEM solar meter on AG-C with billed demand + persisted months:
    // every nemDemandInsight gate passes, so runSolarInsight emits one SOLAR_TOOL row.
    // Its solarKw is set, so the LEGACY solarNemChecks branch in runEngines WOULD have
    // fired here too (a true-up note) before B-1 - the no-duplicate proof.
    const solar = await prisma.pump.create({
      data: {
        name: "P101",
        serviceId: "SA-REAL-SOLAR",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2",
        trueUpMonth: 4,
        coverageState: "reconciled",
        trueUpAmountCents: 290,
        farmId: realFarmId,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: solar.id,
        start: new Date("2026-02-11T00:00:00.000Z"),
        close: new Date("2026-03-12T00:00:00.000Z"),
        printedTotalCents: 4550,
        billingLineItems: {
          create: [
            { kind: "demand", label: null, amountCents: 250, quantity: 0.16, unit: "kW" },
            { kind: "other", label: "Customer Charge", amountCents: 4300 },
          ],
        },
      },
    });
    await prisma.nemPeriod.createMany({
      data: [
        { pumpId: solar.id, start: new Date("2025-12-01T00:00:00.000Z"), close: new Date("2025-12-31T00:00:00.000Z"), netKwh: -5, amountCents: -80 },
        { pumpId: solar.id, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 14, amountCents: 240 },
        { pumpId: solar.id, start: new Date("2026-02-01T00:00:00.000Z"), close: new Date("2026-02-28T00:00:00.000Z"), netKwh: 3, amountCents: 50 },
      ],
    });

    // runEngines first (the onboarding finalize order), then runSolarInsight.
    await runEngines(prisma, realFarmId);
    const afterEngines = await prisma.recommendation.count({
      where: { farmId: realFarmId, tool: SOLAR_TOOL },
    });
    expect(afterEngines).toBe(0); // runEngines never touches SOLAR_TOOL on a real farm

    const solarResult = await runSolarInsight(prisma, realFarmId);
    expect(solarResult.created).toBe(1);

    const solarRows = await prisma.recommendation.findMany({
      where: { farmId: realFarmId, tool: SOLAR_TOOL },
    });
    // Exactly one SOLAR_TOOL row, from runSolarInsight, never doubled by the legacy path.
    expect(solarRows).toHaveLength(1);
    const row = solarRows[0];
    if (!row) throw new Error("expected a solar row");
    const action = row.action as { kind?: string };
    expect(action.kind).toBe("review_solar_demand"); // the canonical emitter, not legacy track_trueup

    // A re-run of runEngines must still not insert or clobber the SOLAR_TOOL row.
    await runEngines(prisma, realFarmId);
    expect(
      await prisma.recommendation.count({ where: { farmId: realFarmId, tool: SOLAR_TOOL } }),
    ).toBe(1);
  });

  it("a demo/seed farm still produces a Tour solar finding from the legacy path", async () => {
    const demoFarm = await prisma.farm.create({
      data: { name: "Demo Solar Farm", isDemo: true },
    });
    const demoFarmId = demoFarm.id;

    // A solar meter with a NEM type + true-up month: the legacy solarNemChecks
    // track_trueup branch fires (no intervals/demand peak needed).
    await prisma.pump.create({
      data: {
        name: "DEMO-P1",
        serviceId: "SA-DEMO-SOLAR",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 1092,
        nemType: "nem2",
        trueUpMonth: 9,
        farmId: demoFarmId,
      },
    });

    await runEngines(prisma, demoFarmId);
    const demoSolar = await prisma.recommendation.findMany({
      where: { farmId: demoFarmId, tool: SOLAR_TOOL },
    });
    expect(demoSolar.length).toBeGreaterThan(0); // the seed/Tour solar finding survives
    const kinds = demoSolar.map((r) => (r.action as { kind?: string }).kind);
    expect(kinds).toContain("track_trueup"); // the legacy emitter still owns SOLAR_TOOL here
  });
});

// Story C-4 (FR9): the allocation audit emitter (F3). A solar meter linked to no array is a dropped
// meter - its credits reach nowhere - and runSolarInsight emits a watch-severity `verify_aggregation`
// finding with the dollar HONEST-BLANK (impactNote only, never impactUsd, so it never inflates the
// rail's at-risk sum), traced to the named meter. The finding is sticky (a dismissal never resurrects)
// and idempotent under the SOLAR_TOOL clear, the same discipline as F2.
describe("allocation audit finding (C-4, F3)", () => {
  it("emits a watch verify_aggregation finding for a solar meter linked to no array, dollar honest-blank", async () => {
    const auditFarm = await prisma.farm.create({
      data: { name: "Audit Farm", isDemo: false },
    });
    const id = auditFarm.id;

    // An aggregation graph EXISTS on the farm: an array with a linked solar meter. So a SECOND solar
    // meter left out of every array is genuinely dropped from a graph it should be part of (FR9).
    const array = await prisma.solarArray.create({
      data: { name: "ARR-AUDIT", nameplateKw: 840, nemType: "nem2", farmId: id },
    });
    await prisma.pump.create({
      data: {
        name: "P199",
        serviceId: "SA-LINKED-AUDIT",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 400,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
        benefitingArrays: { connect: { id: array.id } },
      },
    });

    // A solar meter with NO benefiting array: it is not sharing in any array's credits (a dropped
    // meter). It is deliberately NOT on a demand-carrying AG-C schedule, so the F2 demand insight
    // stays silent and the only finding here is the F3 aggregation audit.
    const orphan = await prisma.pump.create({
      data: {
        name: "P200",
        serviceId: "SA-ORPHAN-SOLAR",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 200,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
      },
    });

    const result = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    if (!rec) throw new Error("expected an aggregation finding");
    expect(rec.severity).toBe("watch"); // a verify signal, not money at stake (no color)
    expect(rec.impactUsd).toBeNull(); // the credit is honest-blank (FR10) - never inflates at-risk
    expect(rec.impactNote).not.toBeNull();
    expect(rec.situation).toContain("P200"); // traces to the named, visible meter
    const action = rec.action as {
      kind: string;
      params?: { pumpId?: string; arrayId?: unknown; reason?: string };
    };
    expect(action.kind).toBe("verify_aggregation");
    expect(action.params?.pumpId).toBe(orphan.id);
    expect(action.params?.arrayId).toBeNull(); // no array to scope the dropped meter to
    expect(action.params?.reason).toBe("dropped_meter");
  });

  it("is idempotent and never resurrects a dismissed aggregation finding", async () => {
    const auditFarm = await prisma.farm.create({
      data: { name: "Audit Farm 2", isDemo: false },
    });
    const id = auditFarm.id;
    // An aggregation graph exists (an array + a linked meter), so the orphan below is genuinely dropped.
    const array = await prisma.solarArray.create({
      data: { name: "ARR-AUDIT-2", nameplateKw: 840, nemType: "nem2", farmId: id },
    });
    await prisma.pump.create({
      data: {
        name: "P203",
        serviceId: "SA-LINKED-2",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 400,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
        benefitingArrays: { connect: { id: array.id } },
      },
    });
    await prisma.pump.create({
      data: {
        name: "P201",
        serviceId: "SA-ORPHAN-2",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 150,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
      },
    });

    await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(
      await prisma.recommendation.count({ where: { farmId: id, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(1); // idempotent

    await prisma.recommendation.updateMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    const after = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(after.created).toBe(0); // a dismissed aggregation finding never comes back
    expect(
      await prisma.recommendation.count({ where: { farmId: id, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(0);
  });

  it("does not flag a solar meter that IS linked to an array (no false aggregation finding)", async () => {
    const auditFarm = await prisma.farm.create({
      data: { name: "Audit Farm 3", isDemo: false },
    });
    const id = auditFarm.id;
    const array = await prisma.solarArray.create({
      data: { name: "ARR-1", nameplateKw: 840, nemType: "nem2", farmId: id },
    });
    await prisma.pump.create({
      data: {
        name: "P202",
        serviceId: "SA-LINKED",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 300,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
        benefitingArrays: { connect: { id: array.id } },
      },
    });

    const result = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(0); // linked meter, demand-quiet schedule -> no finding at all
  });
});

// Story E-3 (FR24/FR25): the F1 rate-legibility emitter. A solar meter on the demand-charge AG-C
// family that measures low operating hours is flagged to verify, as a NON-dollar finding (severity
// watch, impactNote only, NEVER impactUsd - the priced rate-fit on solar is staged and the net credit
// hides the rate). The hours come purely from the per-cycle totalKwh + peakKw summaries (NFR4). The
// finding is sticky (a dismissal never resurrects) and idempotent, the same discipline as F2/F3.
describe("rate-legibility finding (E-3, F1)", () => {
  it("emits a watch verify_solar_schedule finding for a low-hours AG-C solar meter, dollar honest-blank", async () => {
    const rlFarm = await prisma.farm.create({
      data: { name: "Rate-Legibility Farm", isDemo: false },
    });
    const id = rlFarm.id;

    // A solar meter on the demand-charge AG-C schedule with LOW measured hours: 1000 kWh / 50 kW = 20
    // hours over a 30-day span, scaled to ~243 annual hours, well under the 2000-hour threshold. It is
    // deliberately NOT reconciled, so the F2 demand insight stays silent and F1 is the only finding -
    // proving F1 is evaluated independently of the F2 gate.
    const lowHours = await prisma.pump.create({
      data: {
        name: "P305",
        serviceId: "SA-LOWHOURS",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 200,
        nemType: "nem2",
        coverageState: "needs_review",
        farmId: id,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: lowHours.id,
        start: new Date("2026-02-01T00:00:00.000Z"),
        close: new Date("2026-03-03T00:00:00.000Z"),
        totalKwh: 1000,
        peakKw: 50,
      },
    });

    const result = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    if (!rec) throw new Error("expected a rate-legibility finding");
    expect(rec.severity).toBe("watch"); // a verify signal, not money at stake (no color)
    expect(rec.impactUsd).toBeNull(); // NON-dollar (FR25) - never inflates the at-risk sum
    expect(rec.impactNote).not.toBeNull();
    expect(rec.situation).toContain("P305"); // traces to the named, visible meter
    expect(rec.situation).toContain("AGC Ag35+ kW High Use"); // names the schedule
    const action = rec.action as {
      kind: string;
      params?: { pumpId?: string; scheduleLabel?: string };
    };
    expect(action.kind).toBe("verify_solar_schedule");
    expect(action.params?.pumpId).toBe(lowHours.id);
    expect(action.params?.scheduleLabel).toBe("AGC Ag35+ kW High Use");
  });

  it("does not flag an AG-C solar meter that runs many hours (the schedule fits)", async () => {
    const rlFarm = await prisma.farm.create({
      data: { name: "Rate-Legibility High-Hours Farm", isDemo: false },
    });
    const id = rlFarm.id;

    // 300,000 kWh / 50 kW = 6000 hours over a 30-day span scales far above the threshold, so the
    // schedule fits and no F1 fires. (Not reconciled, so F2 is also silent: zero findings.)
    const highHours = await prisma.pump.create({
      data: {
        name: "P306",
        serviceId: "SA-HIGHHOURS",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 200,
        nemType: "nem2",
        coverageState: "needs_review",
        farmId: id,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: highHours.id,
        start: new Date("2026-02-01T00:00:00.000Z"),
        close: new Date("2026-03-03T00:00:00.000Z"),
        totalKwh: 300_000,
        peakKw: 50,
      },
    });

    const result = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(0);
  });

  it("does not flag a low-hours solar meter off the AG-C family (non-solar lever territory)", async () => {
    const rlFarm = await prisma.farm.create({
      data: { name: "Rate-Legibility Non-AGC Farm", isDemo: false },
    });
    const id = rlFarm.id;

    // Low hours but on AG-A (no demand charge): the rate-legibility flag is AG-C-only, so no F1.
    const agA = await prisma.pump.create({
      data: {
        name: "P307",
        serviceId: "SA-AGA-LOWHOURS",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 100,
        nemType: "nem2",
        coverageState: "needs_review",
        farmId: id,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: agA.id,
        start: new Date("2026-02-01T00:00:00.000Z"),
        close: new Date("2026-03-03T00:00:00.000Z"),
        totalKwh: 1000,
        peakKw: 50,
      },
    });

    const result = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(0);
  });

  it("is idempotent and never resurrects a dismissed rate-legibility finding", async () => {
    const rlFarm = await prisma.farm.create({
      data: { name: "Rate-Legibility Sticky Farm", isDemo: false },
    });
    const id = rlFarm.id;
    const meter = await prisma.pump.create({
      data: {
        name: "P308",
        serviceId: "SA-STICKY-LOWHOURS",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 200,
        nemType: "nem2",
        coverageState: "needs_review",
        farmId: id,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: meter.id,
        start: new Date("2026-02-01T00:00:00.000Z"),
        close: new Date("2026-03-03T00:00:00.000Z"),
        totalKwh: 1000,
        peakKw: 50,
      },
    });

    await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(
      await prisma.recommendation.count({ where: { farmId: id, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(1); // idempotent

    await prisma.recommendation.updateMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    const after = await runSolarInsight(prisma, id, "2026-06-09T12:00:00.000Z");
    expect(after.created).toBe(0); // a dismissed rate-legibility finding never comes back
    expect(
      await prisma.recommendation.count({ where: { farmId: id, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(0);
  });
});

// Story F-3: the grandfather (F4) and aging-array (F5) finding emitters, DATA-GATED (ADR-S10). F4
// fires ONLY where a real interconnection (PTO) date is on file; the launch fleet has none, so it is
// silent - correct, not broken. F5 needs a per-array generation series the launch export does not
// carry, so it is uniformly silent at launch. Both carry impactNote only (never impactUsd, NFR5) and
// never a NEM3 framing (FR18).
describe("grandfather watch finding (F-3, F4)", () => {
  it("emits a watch protect_grandfather finding for a NEM2 array with a PTO date on file, dollar honest-blank", async () => {
    const farm = await prisma.farm.create({ data: { name: "GF Farm", isDemo: false } });
    const id = farm.id;
    // A grandfathered NEM2 array WITH an interconnection date on file -> a 20-year countdown.
    const array = await prisma.solarArray.create({
      data: {
        name: "ARR-GF",
        nameplateKw: 840,
        nemType: "nem2_agg",
        farmId: id,
        interconnectionDate: new Date("2018-03-01T00:00:00.000Z"),
      },
    });
    // A solar meter linked to the array, off the AG-C demand family so only the F4 finding emits.
    await prisma.pump.create({
      data: {
        name: "P300",
        serviceId: "SA-GF-1",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2_agg",
        coverageState: "reconciled",
        farmId: id,
        benefitingArrays: { connect: { id: array.id } },
      },
    });

    await runSolarInsight(prisma, id, "2026-06-20T12:00:00.000Z");
    const recs = await prisma.recommendation.findMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
    });
    const gf = recs.find((r) => (r.action as { kind?: string }).kind === "protect_grandfather");
    if (!gf) throw new Error("expected a protect_grandfather finding");
    expect(gf.severity).toBe("watch"); // protect-the-asset, never money at stake (no color)
    expect(gf.impactUsd).toBeNull(); // no fabricated dollar (NFR5) - never inflates the at-risk sum
    expect(gf.impactNote).not.toBeNull();
    expect(gf.situation).toContain("2038"); // the 20-year-from-PTO expiry year, traces to the array
    const action = gf.action as { kind: string; params?: { arrayId?: string; expiryYear?: number } };
    expect(action.params?.arrayId).toBe(array.id);
    expect(action.params?.expiryYear).toBe(2038);
    // Cohort isolation (FR18): no NEM3 / net-billing framing in the copy.
    expect(gf.situation.toLowerCase()).not.toContain("nem3");
  });

  it("is silent for an array with no interconnection date on file (the launch state, data-gated)", async () => {
    const farm = await prisma.farm.create({ data: { name: "GF Farm 2", isDemo: false } });
    const id = farm.id;
    const array = await prisma.solarArray.create({
      data: { name: "ARR-GF-2", nameplateKw: 840, nemType: "nem2_agg", farmId: id }, // no PTO date
    });
    await prisma.pump.create({
      data: {
        name: "P301",
        serviceId: "SA-GF-2",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2_agg",
        coverageState: "reconciled",
        farmId: id,
        benefitingArrays: { connect: { id: array.id } },
      },
    });

    await runSolarInsight(prisma, id, "2026-06-20T12:00:00.000Z");
    const grandfatherCount = (
      await prisma.recommendation.findMany({
        where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
      })
    ).filter((r) => (r.action as { kind?: string }).kind === "protect_grandfather").length;
    expect(grandfatherCount).toBe(0); // honest-unknown -> no finding, not an error
  });

  it("never fires the grandfather watch for the launch fleet (no PTO dates) and emits no F5 either", async () => {
    const farm = await prisma.farm.create({ data: { name: "Launch Fleet", isDemo: false } });
    const id = farm.id;
    // A plain solar meter, no array with a PTO date, no generation series: both F4 and F5 stay silent.
    await prisma.pump.create({
      data: {
        name: "P302",
        serviceId: "SA-LAUNCH",
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        isSolar: true,
        solarKw: 500,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
      },
    });
    await runSolarInsight(prisma, id, "2026-06-20T12:00:00.000Z");
    const kinds = (
      await prisma.recommendation.findMany({
        where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
      })
    ).map((r) => (r.action as { kind?: string }).kind);
    expect(kinds).not.toContain("protect_grandfather"); // data-gated silence is correct
    expect(kinds).not.toContain("investigate_array"); // F5 silent: no generation series at launch
  });
});

// Story H-4: the F7 demand-response routing finding (FR30), the path Almond invokes to "route a
// demand-response/repower finding". DISPLAY-ONLY in v1 with the dollar HONEST-BLANK (no published DR
// rate table exists, NFR12). routeDemandResponseFinding upserts ONLY this meter's F7, leaving every
// other SOLAR_TOOL finding untouched, idempotent and sticky.
describe("demand-response routing finding (H-4, F7)", () => {
  it("routes an act finding with no fabricated DR dollar, leaving other SOLAR_TOOL findings untouched", async () => {
    const farm = await prisma.farm.create({ data: { name: "DR Farm", isDemo: false } });
    const id = farm.id;
    // An un-enrolled solar meter on the demand-charge AG-C family: F7-eligible.
    const meter = await prisma.pump.create({
      data: {
        name: "P400",
        serviceId: "SA-DR-1",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
        billingPeriods: {
          create: {
            start: new Date("2026-02-11T00:00:00.000Z"),
            close: new Date("2026-03-12T00:00:00.000Z"),
            billingLineItems: { create: [{ kind: "other", label: "Customer Charge", amountCents: 4300 }] },
          },
        },
      },
    });

    const result = await routeDemandResponseFinding(prisma, id, meter.id, "2026-06-20T12:00:00.000Z");
    expect(result.created).toBe(1);

    const rows = await prisma.recommendation.findMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
    });
    const f7 = rows.find((r) => (r.action as { kind?: string }).kind === "enroll_demand_response");
    if (!f7) throw new Error("expected an F7 finding");
    expect(f7.severity).toBe("act"); // shaped for action, display-only in v1
    expect(f7.impactUsd).toBeNull(); // NO fabricated DR $/kW (NFR12) - never inflates the at-risk sum
    expect(f7.impactNote).not.toBeNull(); // the opportunity is named, never a figure
    expect(f7.situation).toContain("P400"); // traces to the named, visible meter
    const action = f7.action as { kind: string; execute: unknown; params?: { pumpId?: string } };
    expect(action.execute).toBeNull(); // display-only: nothing is actually enrolled
    expect(action.params?.pumpId).toBe(meter.id);
  });

  it("is idempotent (a re-route replaces, never duplicates) and sticky (a dismissed F7 never resurrects)", async () => {
    const farm = await prisma.farm.create({ data: { name: "DR Farm 2", isDemo: false } });
    const id = farm.id;
    const meter = await prisma.pump.create({
      data: {
        name: "P401",
        serviceId: "SA-DR-2",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
      },
    });

    await routeDemandResponseFinding(prisma, id, meter.id, "2026-06-20T12:00:00.000Z");
    await routeDemandResponseFinding(prisma, id, meter.id, "2026-06-20T12:00:00.000Z");
    const drCount = (
      await prisma.recommendation.findMany({ where: { farmId: id, tool: SOLAR_TOOL, status: "pending" } })
    ).filter((r) => (r.action as { kind?: string }).kind === "enroll_demand_response").length;
    expect(drCount).toBe(1); // idempotent: a re-route replaces, never doubles

    await prisma.recommendation.updateMany({
      where: { farmId: id, tool: SOLAR_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    const after = await routeDemandResponseFinding(prisma, id, meter.id, "2026-06-20T12:00:00.000Z");
    expect(after.created).toBe(0); // a dismissed DR routing finding never comes back
  });

  it("routes nothing for an ineligible meter (non-AG-C or already enrolled)", async () => {
    const farm = await prisma.farm.create({ data: { name: "DR Farm 3", isDemo: false } });
    const id = farm.id;
    const meter = await prisma.pump.create({
      data: {
        name: "P402",
        serviceId: "SA-DR-3",
        rateSchedule: "AGA1 Ag<35 kW Low Use", // not the demand-charge AG-C family
        isSolar: true,
        solarKw: 200,
        nemType: "nem2",
        coverageState: "reconciled",
        farmId: id,
      },
    });
    const result = await routeDemandResponseFinding(prisma, id, meter.id, "2026-06-20T12:00:00.000Z");
    expect(result.created).toBe(0); // ineligible -> no finding, never a fabricated route
  });
});
