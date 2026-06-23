"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AGENTS, agentHref, isAgentActive, type AgentKey } from "./agents";

// The mobile bottom tab bar (the rail collapses to this). It shows a CURATED subset of the rail's
// live surfaces so the bar stays uncluttered on a phone; Almond is the prominent floating launcher
// FAB on mobile, so it stays out of this bar. The not-yet-shipped (Water/Solar/Agents) and the less-
// frequent desktop entries (Reports/Team) are reachable in the rail, not here. `demo` (the public
// Tour) points the tabs at /tour routes, drops the app-only items, and ends with a "Sign in" tab.
const MOBILE_TAB_KEYS: readonly AgentKey[] = ["home", "energy", "parcels", "todos", "settings"];

export function AgentTabBar({ demo = false }: { demo?: boolean } = {}) {
  const pathname = usePathname();
  const tabs = MOBILE_TAB_KEYS.map((key) => AGENTS.find((a) => a.key === key)).filter(
    (a): a is NonNullable<typeof a> => a != null && a.live && (!demo || !a.appOnly),
  );
  return (
    <nav
      aria-label={en.shell.agentsLabel}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-outline-variant bg-paper lg:hidden"
    >
      {tabs.map((agent) => {
        const Icon = agent.icon;
        const active = isAgentActive(agent, pathname, demo);
        const href = agentHref(agent, demo) ?? agent.href ?? "/";
        return (
          <Link
            key={agent.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-16 flex-1 flex-col items-center justify-center gap-0.5 type-label-caps transition-colors",
              active ? "font-semibold text-primary" : "text-on-surface-variant",
            )}
          >
            <Icon size={20} aria-hidden />
            <span>{agent.label}</span>
          </Link>
        );
      })}
      {/* The public Tour has no session, so it ends with a "Sign in" tab into the real onboarding. */}
      {demo && (
        <Link
          href="/login"
          className="flex h-16 flex-1 flex-col items-center justify-center gap-0.5 type-label-caps font-semibold text-primary transition-colors"
        >
          <LogIn size={20} aria-hidden />
          <span>{en.tour.connectCta}</span>
        </Link>
      )}
    </nav>
  );
}
