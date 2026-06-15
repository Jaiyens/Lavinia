import { describe, expect, it } from "vitest";
import { en } from "@/copy/en";
import { almondStarters } from "./starters";

const s = en.shell.almond.starters;

describe("almondStarters", () => {
  it("includes the biggest-opportunity question when the farm has findings", () => {
    const out = almondStarters({ findingCount: 3 });
    expect(out).toContain(s.biggestOpportunity);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(s.biggestOpportunity);
  });

  it("omits the biggest-opportunity question when there are no findings", () => {
    const out = almondStarters({ findingCount: 0 });
    expect(out).not.toContain(s.biggestOpportunity);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(s.costliestMeters);
  });

  it("never returns more than 4 starters and they are all non-empty", () => {
    const out = almondStarters({ findingCount: 99 });
    expect(out.length).toBeLessThanOrEqual(4);
    for (const q of out) expect(q.trim().length).toBeGreaterThan(0);
  });
});
