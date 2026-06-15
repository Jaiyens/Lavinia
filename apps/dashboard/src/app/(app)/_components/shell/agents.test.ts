import { describe, expect, it } from "vitest";
import { AGENTS, isAgentActive } from "./agents";

const home = AGENTS.find((a) => a.key === "home")!;
const energy = AGENTS.find((a) => a.key === "energy")!;
const water = AGENTS.find((a) => a.key === "water")!;

describe("isAgentActive", () => {
  it("Home is active only on exactly /", () => {
    expect(isAgentActive(home, "/")).toBe(true);
    expect(isAgentActive(home, "/energy")).toBe(false);
    expect(isAgentActive(home, "/dashboard/pump-timing")).toBe(false);
  });

  it("Energy is active on its route and subroutes", () => {
    expect(isAgentActive(energy, "/energy")).toBe(true);
    expect(isAgentActive(energy, "/energy/")).toBe(true);
    expect(isAgentActive(energy, "/energy/meter/abc")).toBe(true);
    expect(isAgentActive(energy, "/")).toBe(false);
  });

  it("matches on a path boundary, so a prefix-sharing sibling route does not light Energy", () => {
    // The bug guarded here: startsWith("/energy") would wrongly light Energy for these.
    expect(isAgentActive(energy, "/energyXYZ")).toBe(false);
    expect(isAgentActive(energy, "/energy-archive")).toBe(false);
  });

  it("a future (non-live) agent is never active", () => {
    expect(water.live).toBe(false);
    expect(isAgentActive(water, "/water")).toBe(false);
    expect(isAgentActive(water, "/")).toBe(false);
  });
});
