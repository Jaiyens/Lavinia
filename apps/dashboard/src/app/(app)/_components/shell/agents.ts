import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Zap, Sparkles, Sun, MapPin, Droplets } from "lucide-react";
import { en } from "@/copy/en";

// The agent rail lists AGENTS, not features (EXPERIENCE.md). Almond (the farm assistant) sits right
// under Home as the second item — its own mascot glyph marks it out (rendered in AgentRail), and the
// floating launcher still offers the same assistant from anywhere. Home, Almond, Energy, Solar, and
// Parcels are live; Water sells the OS but is not built, so it renders at reduced opacity with a
// "coming" tag and is non-interactive (href === null). (Meters was folded into Energy: every meter
// is searchable + groupable in Energy's table, and clicking one opens its load-curve graph.)
export type AgentKey = "home" | "almond" | "energy" | "solar" | "parcels" | "water";

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
  // Almond is second, right under Home. It renders its own mascot glyph in the rail (special-cased
  // there); `icon` is only a sensible lucide fallback.
  { key: "almond", label: en.shell.agents.almond, href: "/almond", icon: Sparkles, live: true },
  { key: "energy", label: en.shell.agents.energy, href: "/energy", icon: Zap, live: true },
  // Solar is a first-class rail entry (the grower thinks "show me my solar", not "switch a lens
  // inside Energy"). It opens the /solar tab on the same shell as Energy, scoped to the active farm.
  { key: "solar", label: en.shell.agents.solar, href: "/solar", icon: Sun, live: true },
  { key: "parcels", label: en.shell.agents.parcels, href: "/parcels", icon: MapPin, live: true },
  { key: "water", label: en.shell.agents.water, href: null, icon: Droplets, live: false },
] as const;

// The public Tour renders the SAME shell as the signed-in app, but its routes live under
// /tour (Home == /tour, Energy == /tour/energy) so an unauthenticated visitor navigates the
// demo without bouncing to login. agentHref maps an agent's canonical route to its tour route.
const TOUR_HREF: Partial<Record<AgentKey, string>> = {
  home: "/tour",
  almond: "/tour/almond",
  energy: "/tour/energy",
  solar: "/tour/solar",
  parcels: "/tour/parcels",
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
