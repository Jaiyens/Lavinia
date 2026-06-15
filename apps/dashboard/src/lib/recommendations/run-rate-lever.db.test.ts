import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadRateCard } from "@/lib/pge/rate-card";
import { priceCycleCents } from "@/lib/energy/rates";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { runRateLever } from "./run-rate-lever";

// Integration test for the rate-lever runner (Story 3.3): persists grammar-conformant
// findings idempotently under the rate-optimization tool, scoped to that tool, and
// backfills Pump.isLegacy from the schedule mapping. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let legacyPumpId: string;
let currentPumpId: string;

const card = loadRateCard();

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Lever Farm", isDemo: false } });
  farmId = farm.id;

  // A legacy AG5C meter whose one reconciled winter cycle prints EXACTLY what the
  // card recomputes (deviation 0 -> the gate passes -> a dollar estimate).
  const ag5Small = card.plans.find((p) => p.family === "AG-5" && p.sizeClass === "small");
  if (!ag5Small) throw new Error("card is missing the AG-5 small plan");
  const printed = priceCycleCents(
    { days: 30, season: "winter", energyKwh: { peak: 20, off_peak: 300 }, maxDemandKw: 4 },
    ag5Small,
  ).totalCents;

  const legacyPump = await prisma.pump.create({
    data: {
      name: "P028",
      serviceId: "SA-LEGACY",
      rateSchedule: "AG5C",
      isLegacy: false, // the known import gap: legacy code, unflagged
      coverageState: "reconciled",
      farmId,
    },
  });
  legacyPumpId = legacyPump.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: legacyPumpId,
      start: new Date("2026-01-01T00:00:00.000Z"),
      close: new Date("2026-01-30T00:00:00.000Z"),
      printedTotalCents: printed,
      billingLineItems: {
        create: [
          { kind: "tou_energy", label: "Peak", amountCents: 0, quantity: 20, unit: "kWh" },
          { kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 300, unit: "kWh" },
          { kind: "other", label: "Customer Charge 30 days @ $5.30871", amountCents: 0 },
          { kind: "other", label: "Max Demand 01/01-01/30 4.000000 kW @ $14.90000", amountCents: 0 },
        ],
      },
    },
  });

  // A current AG-A1 meter with no reconciled billing: the lever must stay silent
  // about it and set nothing but isLegacy=false (already false -> no update).
  const currentPump = await prisma.pump.create({
    data: {
      name: "P043",
      serviceId: "SA-CURRENT",
      rateSchedule: "AGA1 Ag<35 kW Low Use",
      isLegacy: false,
      coverageState: "no_bill",
      farmId,
    },
  });
  currentPumpId = currentPump.id;

  // Another tool's pending rec + an already-resolved rate rec: both must survive.
  await prisma.recommendation.create({
    data: {
      farmId,
      tool: "solar",
      situation: "Other tool's finding",
      action: { kind: "x", label: "y" },
      severity: "info",
      status: "pending",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  });
  await prisma.recommendation.create({
    data: {
      farmId,
      tool: RATE_OPTIMIZATION_TOOL,
      situation: "Already handled",
      action: { kind: "switch_rate", label: "Move it" },
      severity: "act",
      status: "done",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      resolvedAt: new Date("2026-05-02T00:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("runRateLever", () => {
  it("persists a gated dollar finding for the legacy meter and backfills isLegacy", async () => {
    const result = await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.estimates).toBe(1);
    expect(result.created).toBe(1);
    expect(result.legacyFlagged).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    if (!rec) throw new Error("expected a rec");
    expect(rec.severity).toBe("act");
    expect(rec.impactUsd).not.toBeNull();
    expect(rec.impactUsd ?? 0).toBeGreaterThan(0);
    // The labeled estimate carries the rates used + the card's effective date.
    expect(rec.impactNote).toContain("Estimated savings ~$");
    expect(rec.impactNote).toContain("March 1, 2026");
    expect(rec.impactNote).toContain("one rate change per 12 months");
    // Meter linkage for the 3.1 trace contract.
    const action = rec.action as { kind: string; params?: { pumpId?: string } };
    expect(action.kind).toBe("switch_rate");
    expect(action.params?.pumpId).toBe(legacyPumpId);

    const legacyPump = await prisma.pump.findUniqueOrThrow({ where: { id: legacyPumpId } });
    expect(legacyPump.isLegacy).toBe(true);
    const currentPump = await prisma.pump.findUniqueOrThrow({ where: { id: currentPumpId } });
    expect(currentPump.isLegacy).toBe(false);
  });

  it("is idempotent and tool-scoped: re-runs never duplicate, other tools and resolved recs survive", async () => {
    await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
    await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");

    const pendingRate = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
    });
    expect(pendingRate).toHaveLength(1);

    const solar = await prisma.recommendation.findMany({ where: { farmId, tool: "solar" } });
    expect(solar).toHaveLength(1);
    expect(solar[0]?.status).toBe("pending");

    const resolved = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "done" },
    });
    expect(resolved).toHaveLength(1);
  });

  it("never resurrects a finding the farmer already answered", async () => {
    // Dismiss the pending dollar finding, re-run: the identical switch must NOT
    // come back as a fresh pending twin.
    const updated = await prisma.recommendation.updateMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    expect(updated.count).toBe(1);

    const result = await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.estimates).toBe(0);
    const pending = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
    });
    expect(pending).toHaveLength(0);

    // Un-dismiss to restore the baseline for the following tests.
    await prisma.recommendation.updateMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "dismissed" },
      data: { status: "pending", resolvedAt: null },
    });
    await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
  });

  it("a solar legacy meter is never priced: qualitative with the solar note, no dollar", async () => {
    // Flag the legacy meter solar (the importer does this for NEM generating
    // SAs): its reconciled cycle must no longer produce a dollar estimate.
    await prisma.pump.update({ where: { id: legacyPumpId }, data: { isSolar: true } });

    const result = await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.estimates).toBe(0);
    expect(result.qualitative).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.severity).toBe("watch");
    expect(recs[0]?.impactUsd).toBeNull();
    expect(recs[0]?.impactNote).toContain("true up");

    await prisma.pump.update({ where: { id: legacyPumpId }, data: { isSolar: false } });
    await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
  });

  it("emits a qualitative watch finding when the legacy meter's bills stop reconciling", async () => {
    // Knock the printed total off the band: the dollar must disappear and the
    // qualitative legacy finding take its place.
    const period = await prisma.billingPeriod.findFirstOrThrow({
      where: { pumpId: legacyPumpId },
    });
    const original = period.printedTotalCents;
    await prisma.billingPeriod.update({
      where: { id: period.id },
      data: { printedTotalCents: Math.round((original ?? 0) * 1.5) },
    });

    const result = await runRateLever(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.estimates).toBe(0);
    expect(result.qualitative).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.severity).toBe("watch");
    expect(recs[0]?.impactUsd).toBeNull();
    expect(recs[0]?.impactNote).not.toContain("$");

    // Restore for any later assertions.
    await prisma.billingPeriod.update({
      where: { id: period.id },
      data: { printedTotalCents: original },
    });
  });
});
