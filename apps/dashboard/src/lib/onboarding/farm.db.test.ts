import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { parseInventory } from "@/lib/spreadsheet";
import { createFarmFromConnection, importInventory, markSolarLayoutVerified } from "./farm";

// C-1 (FR6 + DM4): harden the importInventory populator. These integration tests run against a
// throwaway local Postgres (no network, never the dev/prod db), the same harness the rest of the
// onboarding suite uses. They pin the four C-1 invariants:
//   1. a referenced NEMA code with no generating meter is SURFACED (unlinkedNemaCodes), never
//      silently dropped, and the referencing meter still persists;
//   2. NO SolarArray.nameplateKw is ever set from a NEMA code value (a code is not a capacity);
//   3. the populator links a benefiting meter to an array CROSS-ENTITY (PG&E NEM aggregation
//      credits meters in several legal entities from one array) and never to a code it never listed;
//   4. re-import is idempotent (no duplicate arrays / benefiting-meter edges);
// plus the DM4 markSolarLayoutVerified provenance write/clear.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

// A generating meter (carries a 1500 kW nameplate) feeding TWO array codes, two benefiting meters
// under DIFFERENT legal entities than the generator, and an "orphan" meter that lists a code no
// generating row defines (GHOST). Numbers are array nameplates; the codes are never capacities.
const fixtureCsv = [
  "Legal Entity,Account,SA ID,Pump Name,Rate Schedule,Crop,Status,Kind,NEMA,Net Metering,Solar kW,True-Up Month",
  "Gen Entity LLC,09000000001,6000000001,Generator,NEMEXPM,almonds,GOOD,non_pump,AGG-A;AGG-B,nem2,1500,April",
  "Benef Entity One LLC,09000000002,6000000002,Cross Benef 1,AG-C,almonds,GOOD,pump,AGG-A,,,",
  "Benef Entity Two LLC,09000000003,6000000003,Cross Benef 2,AG-C,walnuts,GOOD,pump,AGG-B,,,",
  "Orphan Entity LLC,09000000004,6000000004,Orphan Benef,AG-C,walnuts,GOOD,pump,GHOST,,,",
].join("\n");

async function landFixture(name: string): Promise<{ farmId: string }> {
  const { farmId } = await createFarmFromConnection(prisma, { name });
  const { rows } = parseInventory(fixtureCsv);
  await importInventory(prisma, { rows, farmId });
  return { farmId };
}

describe("importInventory hardening - unlinked codes surfaced, never dropped (C-1, FR6)", () => {
  it("surfaces a referenced code with no generating meter and keeps the referencing meter", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "Unlinked Farm" });
    const { rows } = parseInventory(fixtureCsv);
    const res = await importInventory(prisma, { rows, farmId });

    // GHOST is referenced (by the orphan meter) but no generating row defines it: surfaced.
    expect(res.unlinkedNemaCodes).toEqual(["GHOST"]);

    // The orphan meter still persists, just with no array link (needs-review, not a drop).
    const orphan = await prisma.pump.findFirstOrThrow({
      where: { farmId, serviceId: "6000000004" },
      include: { benefitingArrays: true },
    });
    expect(orphan.benefitingArrays).toHaveLength(0);

    // GHOST built no SolarArray (only codes with a generating nameplate become arrays).
    expect(await prisma.solarArray.findFirst({ where: { farmId, name: "GHOST" } })).toBeNull();
  });
});

describe("importInventory hardening - a NEMA code is never a capacity (C-1, FR6)", () => {
  it("array nameplates come from the generating meter's solarKw, never from a code value", async () => {
    const { farmId } = await landFixture("Capacity Farm");

    const a = await prisma.solarArray.findFirstOrThrow({ where: { farmId, name: "AGG-A" } });
    const b = await prisma.solarArray.findFirstOrThrow({ where: { farmId, name: "AGG-B" } });
    // Both arrays carry the generating meter's 1500 kW nameplate - NOT a number parsed from the
    // code string "AGG-A"/"AGG-B" (which would be NaN/0, never 1500).
    expect(a.nameplateKw).toBe(1500);
    expect(b.nameplateKw).toBe(1500);
    // Every built array has a numeric nameplate sourced from a meter, never the code text.
    const arrays = await prisma.solarArray.findMany({ where: { farmId } });
    for (const arr of arrays) {
      expect(Number.isFinite(arr.nameplateKw)).toBe(true);
      expect(arr.nameplateKw).toBeGreaterThan(0);
      expect(arr.nameplateKw).not.toBe(Number(arr.name)); // the code is not the capacity
    }
  });
});

describe("importInventory hardening - entity-boundary correctness (C-1, FR6)", () => {
  it("links benefiting meters CROSS-ENTITY and never to a code they did not list", async () => {
    const { farmId } = await landFixture("Cross Entity Farm");

    const arrayA = await prisma.solarArray.findFirstOrThrow({
      where: { farmId, name: "AGG-A" },
      include: { benefitingMeters: { include: { account: { include: { entity: true } } } } },
    });
    const aIds = arrayA.benefitingMeters.map((m) => m.serviceId).sort();
    // AGG-A: the generator (Gen Entity LLC) + the benefiting meter in a DIFFERENT entity
    // (Benef Entity One LLC). The cross-entity link is correct - aggregation spans entities.
    expect(aIds).toEqual(["6000000001", "6000000002"]);

    // And the two are genuinely under different legal entities (the boundary was crossed, not blocked).
    const owners = new Set(
      arrayA.benefitingMeters.map((m) => m.account?.entity?.actualOwner ?? null),
    );
    expect(owners.size).toBeGreaterThan(1);

    // The orphan meter (lists only GHOST) is NEVER linked to AGG-A/AGG-B (never a code it did not list).
    expect(aIds).not.toContain("6000000004");
    const arrayB = await prisma.solarArray.findFirstOrThrow({
      where: { farmId, name: "AGG-B" },
      include: { benefitingMeters: true },
    });
    expect(arrayB.benefitingMeters.map((m) => m.serviceId)).not.toContain("6000000004");
  });
});

describe("importInventory hardening - idempotent re-import (C-1, FR6)", () => {
  it("re-importing builds no duplicate arrays or benefiting-meter edges", async () => {
    const { farmId } = await landFixture("Idempotent Farm");

    const firstArrays = await prisma.solarArray.count({ where: { farmId } });
    const firstA = await prisma.solarArray.findFirstOrThrow({
      where: { farmId, name: "AGG-A" },
      include: { benefitingMeters: true },
    });

    const { rows } = parseInventory(fixtureCsv);
    const again = await importInventory(prisma, { rows, farmId });
    expect(again.unlinkedNemaCodes).toEqual(["GHOST"]); // still surfaced, deterministically

    const secondArrays = await prisma.solarArray.count({ where: { farmId } });
    const secondA = await prisma.solarArray.findFirstOrThrow({
      where: { farmId, name: "AGG-A" },
      include: { benefitingMeters: true },
    });
    expect(secondArrays).toBe(firstArrays); // no duplicate arrays
    expect(secondA.benefitingMeters).toHaveLength(firstA.benefitingMeters.length); // no dup edges
  });
});

describe("markSolarLayoutVerified - the DM4 provenance write (C-1, FR6)", () => {
  it("sets, then clears, Farm.solarLayoutVerifiedAt", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "DM4 Farm" });

    // Unverified by default (the cautious-render branch).
    const before = await prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    expect(before.solarLayoutVerifiedAt).toBeNull();

    const at = new Date("2026-06-20T00:00:00.000Z");
    await markSolarLayoutVerified(prisma, farmId, at);
    const verified = await prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    expect(verified.solarLayoutVerifiedAt?.toISOString()).toBe(at.toISOString());

    // Clearing it returns the farm to the cautious state.
    await markSolarLayoutVerified(prisma, farmId, null);
    const cleared = await prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    expect(cleared.solarLayoutVerifiedAt).toBeNull();
  });
});
