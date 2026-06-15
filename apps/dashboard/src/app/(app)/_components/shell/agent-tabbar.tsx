"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AGENTS, isAgentActive } from "./agents";

// Mobile bottom tab bar (the agent rail collapses to this). Same agents; live agents tap to
// navigate, future agents are dimmed + non-interactive. Solid paper (no glass) with a hairline.
export function AgentTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={en.shell.agentsLabel}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-outline-variant bg-paper lg:hidden"
    >
      {AGENTS.map((agent) => {
        const Icon = agent.icon;
        if (!agent.live || agent.href === null) {
          return (
            <span
              key={agent.key}
              aria-disabled="true"
              className="flex h-16 flex-1 select-none flex-col items-center justify-center gap-0.5 text-on-surface-variant/45"
            >
              <Icon size={20} aria-hidden />
              <span className="type-label-caps">{agent.label}</span>
            </span>
          );
        }
        const active = isAgentActive(agent, pathname);
        return (
          <Link
            key={agent.key}
            href={agent.href}
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
    </nav>
  );
}
