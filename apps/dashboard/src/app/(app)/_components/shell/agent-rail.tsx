"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MapPin, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Wordmark } from "@/components/logo";
import { signOutAction } from "../../actions";
import { AGENTS, agentHref, isAgentActive } from "./agents";

// Desktop left rail (240px). Lists agents; the active live agent is primary, future agents are
// dimmed + non-interactive with a "coming" tag. Mobile uses AgentTabBar instead. `demo` (the
// public Tour) points the nav at the /tour routes and swaps the account/sign-out footer for a
// single "Sign in" CTA, since a prospect on the tour has no session.
export function AgentRail({ demo = false }: { demo?: boolean } = {}) {
  const pathname = usePathname();
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
          const href = agentHref(agent, demo) ?? agent.href;
          // Energy has one sub-route today: the Parcel lookup, shown as a nested rail item so it
          // is findable from anywhere (not only once you are inside the Energy page). When you are
          // on Parcel, the sub-item owns the active state so the parent Energy pill does not also
          // light up.
          const parcelHref = `${href}/parcel`;
          const onParcel =
            agent.key === "energy" &&
            (pathname === parcelHref || pathname.startsWith(`${parcelHref}/`));
          const active = isAgentActive(agent, pathname, demo) && !onParcel;
          // Active item = a soft white pill with a hairline + gentle shadow and the brand green
          // on the icon and label (the reference's selected-nav treatment, in Terra's palette).
          return (
            <Fragment key={agent.key}>
              <Link
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
              {agent.key === "energy" && (
                <Link
                  href={parcelHref}
                  aria-current={onParcel ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-xl pl-9 pr-3 type-body-md transition-colors",
                    onParcel
                      ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
                  )}
                >
                  <MapPin size={16} aria-hidden className={onParcel ? "text-primary" : undefined} />
                  <span>{en.parcel.navTab}</span>
                </Link>
              )}
            </Fragment>
          );
        })}
      </nav>
      {/* Footer. Signed-in: account + sign out. The public Tour has no session, so it shows a
          single "Sign in" CTA that leads into the real onboarding instead. */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {demo ? null : (
          <>
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
