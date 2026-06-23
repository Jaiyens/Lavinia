import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./persona";

// WS6 items 1 + 2: the persona must phrase capability from the caller's role (a viewer is read-only)
// and instruct the honest costSource discipline (an estimate is never quoted as a posted bill). These
// are correctness-critical: they are the model-instruction half of the data threaded through the tools.
describe("buildSystemPrompt capability by role (WS6 item 2)", () => {
  it("names the farm and always carries the costSource honesty rule", () => {
    const prompt = buildSystemPrompt("Batth Farms");
    expect(prompt).toContain("Batth Farms");
    // The costSource discipline is present regardless of role.
    expect(prompt).toContain("costSource");
    expect(prompt.toLowerCase()).toContain("estimate");
    expect(prompt).toContain("BILLED");
    expect(prompt).toContain("MODELED");
  });

  it("tells an owner they can build AND keep files, and that they never change a record", () => {
    const prompt = buildSystemPrompt("Batth Farms", "owner");
    expect(prompt.toLowerCase()).toContain("owner");
    expect(prompt.toLowerCase()).toContain("reports");
    expect(prompt.toLowerCase()).toContain("never change a record");
  });

  it("tells a manager they can build AND keep files", () => {
    const prompt = buildSystemPrompt("Batth Farms", "manager");
    expect(prompt.toLowerCase()).toContain("manager");
    expect(prompt.toLowerCase()).toContain("reports");
  });

  it("tells a viewer they are read-only and cannot keep files or change records", () => {
    const prompt = buildSystemPrompt("Batth Farms", "viewer");
    expect(prompt.toLowerCase()).toContain("read-only");
    expect(prompt.toLowerCase()).toContain("view-only");
  });

  it("defaults a null role (the public Tour) to the read-only framing", () => {
    const prompt = buildSystemPrompt("Batth Farms", null);
    expect(prompt.toLowerCase()).toContain("read-only");
  });
});
