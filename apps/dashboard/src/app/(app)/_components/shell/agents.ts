import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Zap,
  Sparkles,
  Sun,
  Boxes,
  MapPin,
  ListChecks,
  Bot,
  FileText,
  Users,
  Settings,
} from "lucide-react";
import { en } from "@/copy/en";

// The agent rail lists AGENTS, not features (EXPERIENCE.md), grouped into three sections for a
// Palantir-style hierarchy: OPERATIONS (the live operating surfaces + the not-yet-shipped tabs that
// still sell the OS), INTELLIGENCE (the assistant, the agentic layer, and the reports it makes), and
// ORGANIZATION (team + settings). Almond (the assistant) keeps its own mascot glyph in the rail. Not-
// yet-shipped tabs render grayed with a "Coming"/"Beta" tag and are non-interactive (href === null).
export type AgentKey =
  | "home"
  | "energy"
  | "almond"
  | "todos"
  | "parcels"
  | "almondlogic"
  | "water"
  | "solar"
  | "agents"
  | "reports"
  | "team"
  | "settings";

/** A "Coming" or "Beta" badge on a not-yet-shipped tab. */
export type NavTag = "coming" | "beta";

export type AgentItem = {
  key: AgentKey;
  label: string;
  /** Destination, or null when the agent is not yet built (non-interactive). */
  href: string | null;
  icon: LucideIcon;
  live: boolean;
  /** "Coming" / "Beta" tag for a not-yet-shipped tab. */
  tag?: NavTag;
  /** Live only inside the signed-in app, with no public-tour route (e.g. To-do, Reports, Account).
   *  Hidden from the demo rail rather than linked to an authed route. */
  appOnly?: boolean;
  /** Admin-only (owner/manager): shown only to a member who can manage the team. */
  adminOnly?: boolean;
  /** The /tour route on the public demo; absent for app-only items. */
  tourHref?: string;
};

export type NavSection = { key: string; title: string; items: readonly AgentItem[] };

// OPERATIONS: the live operating surfaces, To-do, and the two not-yet-shipped tabs (Water, Solar).
const OPERATIONS: readonly AgentItem[] = [
  { key: "home", label: en.shell.agents.dashboard, href: "/", icon: LayoutGrid, live: true, tourHref: "/tour" },
  { key: "energy", label: en.shell.agents.energy, href: "/energy", icon: Zap, live: true, tourHref: "/tour/energy" },
  { key: "parcels", label: en.shell.agents.parcels, href: "/parcels", icon: MapPin, live: true, tourHref: "/tour/parcels" },
  // Almond Logic: the grower portal rebuilt 1:1 inside Terra, plus the crop analytics (deliveries,
  // runs, reports, cost per pound, reconciliation + commitment ledger). The single crop hub. App-only.
  { key: "almondlogic", label: en.shell.agents.almondLogic, href: "/almondlogic", icon: Boxes, live: true, appOnly: true },
  // To-do: findings the grower parked from the Energy rail. App-only (no public-tour route).
  { key: "todos", label: en.shell.agents.todos, href: "/todos", icon: ListChecks, live: true, appOnly: true },
  { key: "solar", label: en.shell.agents.solar, href: null, icon: Sun, live: false, tag: "beta" },
];

// INTELLIGENCE: the assistant, the agentic layer (still coming), and the reports the assistant makes.
const INTELLIGENCE: readonly AgentItem[] = [
  // Almond renders its own mascot glyph in the rail (special-cased there); `icon` is only a fallback.
  { key: "almond", label: en.shell.agents.assistant, href: "/almond", icon: Sparkles, live: true, tourHref: "/tour/almond" },
  { key: "agents", label: en.shell.agents.agents, href: null, icon: Bot, live: false, tag: "coming" },
  { key: "reports", label: en.reports.navLabel, href: "/reports", icon: FileText, live: true, appOnly: true },
];

// ORGANIZATION: team management (admin-only) and account settings.
const ORGANIZATION: readonly AgentItem[] = [
  { key: "team", label: en.team.navLabel, href: "/account/team", icon: Users, live: true, appOnly: true, adminOnly: true },
  { key: "settings", label: en.shell.agents.settings, href: "/account", icon: Settings, live: true, appOnly: true },
];

export const NAV_SECTIONS: readonly NavSection[] = [
  { key: "operations", title: en.shell.sections.operations, items: OPERATIONS },
  { key: "intelligence", title: en.shell.sections.intelligence, items: INTELLIGENCE },
  { key: "organization", title: en.shell.sections.organization, items: ORGANIZATION },
];

// A flat list of every nav item (all sections), for callers that look an item up by key.
export const AGENTS: readonly AgentItem[] = [...OPERATIONS, ...INTELLIGENCE, ...ORGANIZATION];

/** The destination for an agent, under the tour shell (demo) or the real app. Demo only navigates
 *  items that carry a /tour route; app-only items return null there (and are filtered from the rail). */
export function agentHref(item: AgentItem, demo = false): string | null {
  if (!item.live || item.href === null) return null;
  return demo ? (item.tourHref ?? null) : item.href;
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
