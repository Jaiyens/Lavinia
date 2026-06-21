import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Zap, Gauge, MapPin, Droplets } from "lucide-react";
import { en } from "@/copy/en";

// The agent rail lists AGENTS, not features (EXPERIENCE.md). Home, Energy, Meters, and Parcels are
// live; Water sells the OS but is not built, so it renders at reduced opacity with a "coming" tag
// and is non-interactive (href === null).
export type AgentKey = "home" | "energy" | "meters" | "parcels" | "water";

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
  { key: "meters", label: en.shell.agents.meters, href: "/meters", icon: Gauge, live: true },
  { key: "parcels", label: en.shell.agents.parcels, href: "/parcels", icon: MapPin, live: true },
  { key: "water", label: en.shell.agents.water, href: null, icon: Droplets, live: false },
] as const;

// The public Tour renders the SAME shell as the signed-in app, but its routes live under
// /tour (Home == /tour, Energy == /tour/energy) so an unauthenticated visitor navigates the
// demo without bouncing to login. agentHref maps an agent's canonical route to its tour route.
const TOUR_HREF: Partial<Record<AgentKey, string>> = {
  home: "/tour",
  energy: "/tour/energy",
  meters: "/tour/meters",
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
