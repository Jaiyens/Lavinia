"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Wordmark } from "@/components/logo";
import { signOutAction } from "../../actions";
import { AGENTS, isAgentActive } from "./agents";

// Desktop left rail (240px). Lists agents; the active live agent is primary, future agents are
// dimmed + non-interactive with a "coming" tag. Mobile uses AgentTabBar instead.
export function AgentRail() {
  const pathname = usePathname();
  return (
    <aside
      aria-label={en.shell.agentsLabel}
      className="sticky top-0 hidden h-dvh w-agent-rail shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-paper px-3 py-5 lg:flex"
    >
      <div className="px-3 pb-6">
        <Wordmark className="text-on-surface" />
      </div>
      <nav className="flex flex-col gap-1">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          if (!agent.live || agent.href === null) {
            return (
              <span
                key={agent.key}
                aria-disabled="true"
                className="flex h-11 cursor-not-allowed select-none items-center gap-3 rounded-[var(--radius-control)] px-3 text-on-surface-variant/50"
              >
                <Icon size={18} aria-hidden />
                <span className="type-body-md">{agent.label}</span>
                <span className="type-label-caps ml-auto text-on-surface-variant/60">
                  {en.shell.comingTag}
                </span>
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
                "flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md transition-colors",
                active
                  ? "bg-primary-container font-semibold text-on-primary-container"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <Icon size={18} aria-hidden />
              <span>{agent.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* Sign out (Story 5.1). Unobtrusive rail footer; posts to the server action. */}
      <form action={signOutAction} className="mt-auto pt-4">
        <button
          type="submit"
          className="flex h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <LogOut size={18} aria-hidden />
          <span>{en.auth.signOut}</span>
        </button>
      </form>
    </aside>
  );
}
