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

// The public-safe set: the six read tools + `navigate` (Story 7.3). `navigate` only sets URL state,
// so it is read-safe and handed to every actor; the owner-only export/report skills (Epic 8) are the
// first capability the gate will withhold.
const PUBLIC_SKILLS = [
  "getFarmOverview",
  "getMeter",
  "getRatesSummary",
  "getReconciliation",
  "listFindings",
  "listMeters",
  "navigate",
].sort();

describe("buildAlmondSkills capability gating", () => {
  it("hands an authenticated owner the six read tools plus navigate (no owner-only skill exists yet)", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: true });
    expect(Object.keys(skills).sort()).toEqual(PUBLIC_SKILLS);
  });

  it("hands the public Tour actor the SAME set — navigate is unconditional, capability gates nothing yet", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: false });
    expect(Object.keys(skills).sort()).toEqual(PUBLIC_SKILLS);
  });
});
