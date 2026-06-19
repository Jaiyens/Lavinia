import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Zap } from "lucide-react";
import { en } from "@/copy/en";

// The agent rail lists AGENTS, not features (EXPERIENCE.md). Today only Home and Energy are built,
// so only they appear here. Almond (the farm assistant) is NOT a domain in this list — it is a
// cross-cutting assistant, surfaced as the prominent "Ask Almond" entry pinned at the bottom of the
// rail (AgentRail) and as the floating launcher. Unbuilt domains (Water/Labor) are not shown at all.
export type AgentKey = "home" | "energy";

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
] as const;

// The public Tour renders the SAME shell as the signed-in app, but its routes live under
// /tour (Home == /tour, Energy == /tour/energy) so an unauthenticated visitor navigates the
// demo without bouncing to login. agentHref maps an agent's canonical route to its tour route.
const TOUR_HREF: Partial<Record<AgentKey, string>> = {
  home: "/tour",
  energy: "/tour/energy",
};

/** The destination for an agent, under the tour shell (demo) or the real app. */
export function agentHref(item: AgentItem, demo = false): string | null {
  if (!item.live || item.href === null) return null;
  return demo ? (TOUR_HREF[item.key] ?? item.href) : item.href;
}

/** Active when the live agent's route matches the current path. Home owns exactly its root
    ("/" or "/tour"); other agents match their route or a subroute, on a path boundary so
    "/energyXYZ" never lights "/energy". */
export function isAgentActive(item: AgentItem, pathname: string, demo = false): boolean {
  const href = agentHref(item, demo);
  if (href === null) return false;
  if (href === "/" || href === "/tour") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
