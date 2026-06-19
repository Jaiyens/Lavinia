"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Wordmark } from "@/components/logo";
import { signOutAction } from "../../actions";
import { AlmondAvatar } from "../almond/almond-avatar";
import { useAlmondLauncher } from "../almond/almond-launcher-provider";
import { AGENTS, agentHref, isAgentActive } from "./agents";

// Desktop left rail (240px). Lists agents; the active live agent is primary, future agents are
// dimmed + non-interactive with a "coming" tag. Mobile uses AgentTabBar instead. `demo` (the
// public Tour) points the nav at the /tour routes and swaps the account/sign-out footer for a
// single "Sign in" CTA, since a prospect on the tour has no session.
export function AgentRail({ demo = false }: { demo?: boolean } = {}) {
  const pathname = usePathname();
  const { open, openAlmond } = useAlmondLauncher();
  return (
    <aside
      aria-label={en.shell.agentsLabel}
      className="sticky top-0 hidden h-dvh w-40 shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-paper px-2.5 py-5 lg:flex"
    >
      <div className="px-3 pb-6">
        <Wordmark className="text-on-surface" />
      </div>
      <p className="px-3 pb-2 type-label-caps text-on-surface-variant/70">{en.shell.navTrack}</p>
      <nav className="flex flex-col gap-1">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          if (!agent.live || agent.href === null) {
            return (
              <span
                key={agent.key}
                aria-disabled="true"
                className="flex h-11 cursor-not-allowed select-none items-center gap-3 rounded-xl px-3 text-on-surface-variant/50"
              >
                <Icon size={18} aria-hidden />
                <span className="type-body-md">{agent.label}</span>
                <span className="type-label-caps ml-auto text-on-surface-variant/60">
                  {en.shell.comingTag}
                </span>
              </span>
            );
          }
          const active = isAgentActive(agent, pathname, demo);
          const href = agentHref(agent, demo) ?? agent.href;
          // Active item = a soft white pill with a hairline + gentle shadow and the brand green
          // on the icon and label (the reference's selected-nav treatment, in Terra's palette).
          return (
            <Link
              key={agent.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 type-body-md transition-colors",
                active
                  ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <Icon size={18} aria-hidden className={active ? "text-primary" : undefined} />
              <span>{agent.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* Ask Almond: a clear, persistent entry that opens the SAME assistant panel as the floating
          launcher (Story 10.2, UX-DR4). Almond is a panel, not a route, so this is a <button>, not a
          <Link>. Shown in both the signed-in and the demo (Tour) rails; the floating launcher FAB is
          the mobile entry, so the mobile tab bar deliberately adds no Almond tab. */}
      <button
        type="button"
        onClick={openAlmond}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="mt-1 flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
      >
        <span aria-hidden className="flex shrink-0 items-center">
          <AlmondAvatar size={18} />
        </span>
        <span>{en.shell.almond.railLabel}</span>
      </button>
      {/* Footer. Signed-in: account + sign out. The public Tour has no session, so it shows a
          single "Sign in" CTA that leads into the real onboarding instead. */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {demo ? null : (
          <>
            <Link
              href="/reports"
              aria-current={pathname === "/reports" ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md transition-colors",
                pathname === "/reports"
                  ? "bg-primary-container font-semibold text-on-primary-container"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <FileText size={18} aria-hidden />
              <span>{en.reports.navLabel}</span>
            </Link>
            <Link
              href="/account"
              aria-current={pathname === "/account" ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 type-body-md transition-colors",
                pathname === "/account"
                  ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <UserRound
                size={18}
                aria-hidden
                className={pathname === "/account" ? "text-primary" : undefined}
              />
              <span>{en.account.navLabel}</span>
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 type-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                <LogOut size={18} aria-hidden />
                <span>{en.auth.signOut}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
