"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LogIn, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AGENTS, agentHref, isAgentActive } from "./agents";

// Mobile bottom tab bar (the agent rail collapses to this). Same agents; live agents tap to
// navigate, future agents are dimmed + non-interactive. Solid paper (no glass) with a hairline.
// `demo` (the public Tour) points the tabs at /tour routes and ends with a "Sign in" tab.
export function AgentTabBar({ demo = false }: { demo?: boolean } = {}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={en.shell.agentsLabel}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-outline-variant bg-paper lg:hidden"
    >
      {/* Almond is a desktop rail tab; on mobile its entry is the floating launcher FAB (so the
          bottom bar stays uncluttered), so it is filtered out here. */}
      {AGENTS.filter((agent) => agent.key !== "almond").map((agent) => {
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
        const active = isAgentActive(agent, pathname, demo);
        const href = agentHref(agent, demo) ?? agent.href;
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
      {/* Reports tab (signed-in only, parity with the desktop rail). The public Tour has no
          session, so it is omitted there. */}
      {!demo && (
        <Link
          href="/reports"
          aria-current={pathname === "/reports" ? "page" : undefined}
          className={cn(
            "flex h-16 flex-1 flex-col items-center justify-center gap-0.5 type-label-caps transition-colors",
            pathname === "/reports" ? "font-semibold text-primary" : "text-on-surface-variant",
          )}
        >
          <FileText size={20} aria-hidden />
          <span>{en.reports.navLabel}</span>
        </Link>
      )}
      {/* Last tab. Signed-in: Account. The public Tour shows "Sign in" instead, leading into
          the real onboarding. */}
      {demo ? (
        <Link
          href="/login"
          className="flex h-16 flex-1 flex-col items-center justify-center gap-0.5 type-label-caps font-semibold text-primary transition-colors"
        >
          <LogIn size={20} aria-hidden />
          <span>{en.tour.connectCta}</span>
        </Link>
      ) : (
        <Link
          href="/account"
          aria-current={pathname === "/account" ? "page" : undefined}
          className={cn(
            "flex h-16 flex-1 flex-col items-center justify-center gap-0.5 type-label-caps transition-colors",
            pathname === "/account" ? "font-semibold text-primary" : "text-on-surface-variant",
          )}
        >
          <UserRound size={20} aria-hidden />
          <span>{en.account.navLabel}</span>
        </Link>
      )}
    </nav>
  );
}
