import { ArrowRightLeft, Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import type { AgentActionStatus } from "@/lib/agents/types";
import { REQUEST_RATE_SWITCH_KIND } from "@/lib/agents/agents/rate-opt/run";
import { resolveFarm, resolveActiveFarmId } from "../../_data";
import { RequestRateSwitchButton } from "./request-button";

/**
 * The rate-switch request surface (the rate optimization agent's own richer card). A Server
 * Component that lists THIS farm's proposed/handled rate-switch actions and lets the farm OWNER
 * request a switch in one tap. It does NOT edit the frozen generic audit page; it is the focused
 * queue for one agent. Owner-scoped exactly like the audit page:
 *
 *  - The (app) layout enforces the session gate; the (dashboard) layout enforces the farm gate.
 *    We resolve the SAME farm via resolveFarm (the shared owner-scoped resolution), so a farmless
 *    grower is routed to onboarding.
 *  - Actions are read FARM-SCOPED (where: { farmId, kind }), so another farm's rows never list.
 *  - Request is owner-only: a non-owner (the badged demo fallback) sees this READ-ONLY. The
 *    server action re-checks ownership, so the page gate is convenience, not the boundary.
 *
 * Reads live DB data, so it is request-time dynamic. Mobile-first; copy from en.ts.
 */
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function actionStatusLabel(status: string): string {
  const map = en.agents.actionStatus as Record<AgentActionStatus, string>;
  return map[status as AgentActionStatus] ?? status;
}

export default async function RateSwitchesPage() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);
  if (resolved === null) redirect("/onboarding");

  const isOwner = resolved.dataKind === "real" && resolved.farm.userId === userId;
  const t = en.agents;

  const actions = await prisma.agentAction.findMany({
    where: { farmId: resolved.farm.id, kind: REQUEST_RATE_SWITCH_KIND },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl py-8 lg:py-12">
      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.rateAgent.label}</h1>
        <p className="type-body-md mt-2 text-on-surface-variant">{t.rateAgent.requested}</p>
        {!isOwner && (
          <p className="type-body-sm mt-2 text-on-surface-variant/80">{t.readOnlyNote}</p>
        )}
      </header>

      {actions.length === 0 ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <ArrowRightLeft
            size={28}
            className="mx-auto mb-3 text-on-surface-variant/60"
            aria-hidden
          />
          <h2 className="type-title text-on-surface">{t.empty.title}</h2>
          <p className="type-body-md mx-auto mt-2 max-w-md text-on-surface-variant">
            {t.empty.body}
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {actions.map((action) => (
            <li
              key={action.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="type-body-md min-w-0 text-on-surface">{action.summary}</p>
                <span className="type-label-caps shrink-0 text-on-surface-variant">
                  {actionStatusLabel(action.status)}
                </span>
              </div>
              <p className="type-body-sm mt-1 inline-flex items-center gap-1.5 text-on-surface-variant">
                <Clock size={14} aria-hidden />
                {t.runOnLabel} {DATE_FMT.format(action.createdAt)}
              </p>
              {action.status === "proposed" && isOwner && (
                <RequestRateSwitchButton agentActionId={action.id} summary={action.summary} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
