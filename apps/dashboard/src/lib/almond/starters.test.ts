import { describe, expect, it } from "vitest";
import { en } from "@/copy/en";
import { almondStarters } from "./starters";

const s = en.shell.almond.starters;
// The owner-only prompts that must never reach the public Tour.
const EXPORT_STARTERS = [s.exportMeters, s.misRatedPdf];

describe("almondStarters", () => {
  it("leads with the open-biggest-opportunity action when the farm has findings", () => {
    const out = almondStarters({ findingCount: 3, canExport: true });
    expect(out).toContain(s.openBiggestOpportunity);
    expect(out[0]).toBe(s.openBiggestOpportunity);
  });

  it("offers the export starter to an owner (canExport)", () => {
    const out = almondStarters({ findingCount: 3, canExport: true });
    expect(out).toContain(s.exportMeters);
  });

  it("never shows export or PDF starters to a non-owner (public Tour)", () => {
    const withFindings = almondStarters({ findingCount: 3, canExport: false });
    const noFindings = almondStarters({ findingCount: 0, canExport: false });
    for (const starter of EXPORT_STARTERS) {
      expect(withFindings).not.toContain(starter);
      expect(noFindings).not.toContain(starter);
    }
  });

  it("only points at a finding when one exists (open + mis-rated PDF need findings)", () => {
    const out = almondStarters({ findingCount: 0, canExport: true });
    expect(out).not.toContain(s.openBiggestOpportunity);
    expect(out).not.toContain(s.misRatedPdf);
    // An owner with no findings still gets the always-valid export-meters starter (every farm has meters).
    expect(out).toContain(s.exportMeters);
  });

  it("falls back to read questions for a no-finding Tour visitor", () => {
    const out = almondStarters({ findingCount: 0, canExport: false });
    expect(out).toContain(s.costliestMeters);
    expect(out).toContain(s.wrongRate);
    expect(out).toContain(s.dataCompleteness);
  });

  it("never returns more than four starters, and they are all non-empty and unique", () => {
    const out = almondStarters({ findingCount: 99, canExport: true });
    expect(out.length).toBeLessThanOrEqual(4);
    expect(new Set(out).size).toBe(out.length);
    for (const q of out) expect(q.trim().length).toBeGreaterThan(0);
  });
});
