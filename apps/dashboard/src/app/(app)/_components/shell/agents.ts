import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Zap, Droplets, Users } from "lucide-react";
import { en } from "@/copy/en";

// The agent rail lists AGENTS, not features (EXPERIENCE.md). Today only the Energy agent is
// live; Home is the Energy dashboard today. Water/Labor sell the OS but are not built, so they
// render at reduced opacity with a "coming" tag and are non-interactive (href === null).
export type AgentKey = "home" | "energy" | "water" | "labor";

export type AgentItem = {
  key: AgentKey;
  label: string;
  /** Destination, or null when the agent is not yet built (non-interactive). */
  href: string | null;
  icon: LucideIcon;
  live: boolean;
};

export const AGENTS: readonly AgentItem[] = [
  { key: "home", label: en.shell.agents.home, href: "/", icon: LayoutGrid, live: true },
  { key: "energy", label: en.shell.agents.energy, href: "/energy", icon: Zap, live: true },
  { key: "water", label: en.shell.agents.water, href: null, icon: Droplets, live: false },
  { key: "labor", label: en.shell.agents.labor, href: null, icon: Users, live: false },
] as const;

/** Active when the live agent's route matches the current path. Home owns exactly "/"; other
    agents match their route or a subroute, on a path boundary so "/energyXYZ" never lights
    "/energy". */
export function isAgentActive(item: AgentItem, pathname: string): boolean {
  if (!item.live || item.href === null) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
