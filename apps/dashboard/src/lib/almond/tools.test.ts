import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildAlmondSkills, type AlmondToolDeps } from "./tools";

/**
 * Pure (no DB) test of the SKILL FACTORY's capability mechanism. `buildAlmondSkills` wraps each
 * executor in an AI SDK `tool()` and does NOT touch Prisma at build time (`execute` only runs when
 * the model invokes a tool), so we can assert WHICH skills the model is handed — the capability
 * gate (ADR-A08) — without a database. Executor behavior over a real farm lives in tools.db.test.ts.
 */

// The factory never dereferences `prisma` while assembling the tool set, so a typed stub is safe.
const deps: AlmondToolDeps = {
  prisma: {} as unknown as PrismaClient,
  farmId: "farm_test",
  farmName: "Test Farm",
};

const READ_TOOLS = [
  "getFarmOverview",
  "getMeter",
  "getRatesSummary",
  "getReconciliation",
  "listFindings",
  "listMeters",
].sort();

describe("buildAlmondSkills capability gating", () => {
  it("hands an authenticated owner exactly the six read tools (no owner-only skill exists yet)", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: true });
    expect(Object.keys(skills).sort()).toEqual(READ_TOOLS);
  });

  it("hands the public Tour actor the SAME read tools — capability gates nothing yet", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: false });
    expect(Object.keys(skills).sort()).toEqual(READ_TOOLS);
  });
});
