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
  meterUserId: null,
};

// The read-safe set: the six read tools + `navigate` (Story 7.3). `navigate` only sets URL state,
// so it is read-safe and handed to every actor regardless of capability.
const READ_SAFE_SKILLS = [
  "getFarmOverview",
  "getMeter",
  "getRatesSummary",
  "getReconciliation",
  "listFindings",
  "listMeters",
  "navigate",
].sort();

// The file-building skills: each WRITES a file, so each is handed only to a caller who `canExport`
// (an authed owner OR the demo/Tour viewer), withheld from a no-export actor by omission.
// exportSpreadsheet was added in Story 8.5; generateReport in Story 9.3. Keep this list in sync with
// fileSkills() in tools.ts.
const FILE_SKILLS = ["exportSpreadsheet", "generateReport"];
const EXPORT_SKILLS = [...READ_SAFE_SKILLS, ...FILE_SKILLS].sort();

describe("buildAlmondSkills capability gating", () => {
  it("hands an authenticated owner the read tools, navigate, AND the file-building skills", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: true, canExport: true, userId: "user_1" });
    expect(Object.keys(skills).sort()).toEqual(EXPORT_SKILLS);
  });

  it("hands the demo/Tour viewer (canExport, not an owner) the file-building skills too", () => {
    // The guest-export capability: a non-owner who canExport still gets exportSpreadsheet and
    // generateReport (the demo only ever sees demo-farm data; persistence stays owner-only,
    // gated separately in the responder).
    const skills = buildAlmondSkills(deps, { authedOwner: false, canExport: true, userId: null });
    expect(Object.keys(skills).sort()).toEqual(EXPORT_SKILLS);
  });

  it("withholds every file-building skill from a no-export actor (capability-by-omission)", () => {
    const skills = buildAlmondSkills(deps, { authedOwner: false, canExport: false, userId: null });
    expect(Object.keys(skills).sort()).toEqual(READ_SAFE_SKILLS);
    for (const skill of FILE_SKILLS) {
      expect(Object.keys(skills)).not.toContain(skill);
    }
  });
});
