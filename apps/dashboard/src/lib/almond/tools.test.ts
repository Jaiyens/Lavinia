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
// so it is read-safe and handed to every actor; the owner-only export skill (Story 8.5) is the first
// capability the gate withholds from the public Tour.
const PUBLIC_SKILLS = [
  "getFarmOverview",
  "getMeter",
  "getRatesSummary",
  "getReconciliation",
  "listFindings",
  "listMeters",
  "navigate",
].sort();

// The owner-only skills: each WRITES a file, so it is handed only to an authenticated owner, never
// to the public Tour (capability-by-omission). exportSpreadsheet was added in Story 8.5;
// generateReport in Story 9.3. Keep this list in sync with ownerOnlySkills() in tools.ts.
const OWNER_ONLY_SKILLS = ["exportSpreadsheet", "generateReport"];
const OWNER_SKILLS = [...PUBLIC_SKILLS, ...OWNER_ONLY_SKILLS].sort();

describe("buildAlmondSkills capability gating", () => {
  it("hands an authenticated owner the read tools, navigate, AND the owner-only write skills", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: true, userId: "user_1" });
    expect(Object.keys(skills).sort()).toEqual(OWNER_SKILLS);
  });

  it("withholds every owner-only write skill from the public Tour actor (capability-by-omission)", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: false, userId: null });
    expect(Object.keys(skills).sort()).toEqual(PUBLIC_SKILLS);
    // No owner-only write skill is present for the public actor.
    for (const skill of OWNER_ONLY_SKILLS) {
      expect(Object.keys(skills)).not.toContain(skill);
    }
  });
});
