import { describe, expect, it } from "vitest";
import { AGENTS, isAgentActive, type AgentItem } from "./agents";

const home = AGENTS.find((a) => a.key === "home")!;
const energy = AGENTS.find((a) => a.key === "energy")!;

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

  it("a non-live agent (no built route) is never active", () => {
    // Coverage for the guard that keeps an unbuilt agent dark; the live list no longer ships one.
    const future: AgentItem = { key: "energy", label: "Future", href: null, icon: energy.icon, live: false };
    expect(isAgentActive(future, "/water")).toBe(false);
    expect(isAgentActive(future, "/")).toBe(false);
  });
});
