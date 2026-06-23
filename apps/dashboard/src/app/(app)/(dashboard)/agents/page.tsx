import { Bot, Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import type { AgentActionStatus, AgentRunStatus } from "@/lib/agents/types";
import { resolveFarm, resolveActiveFarmId } from "../_data";
import { AgentActionButtons } from "./action-buttons";

/**
 * The Agents audit area (the agentic foundation). A Server Component that lists THIS farm's
 * agent runs newest-first with their actions, and lets the farm OWNER approve or reject any
 * action an agent proposed. Owner-scoped end to end:
 *
 *  - The (app) layout enforces the SESSION gate; the (dashboard) layout enforces the FARM
 *    gate. We resolve the SAME farm here via resolveFarm (the shared owner-scoped resolution
 *    the rest of the shell uses), so a farmless grower is routed to onboarding.
 *  - Runs and actions are read FARM-SCOPED (where: { farmId }), so another farm's audit rows
 *    are never listed.
 *  - Approve/Reject are owner-only: a non-owner (the badged demo fallback, dataKind
 *    "representative") sees the audit READ-ONLY. The server actions re-check ownership too,
 *    so the page-level gate is convenience, not the security boundary.
 *
 * Reads live DB data, so it is request-time dynamic. Mobile-first; warm palette; copy from
 * en.ts. The (dashboard) layout supplies the rail / findings chrome.
 */
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function runStatusLabel(status: string): string {
  const map = en.agents.runStatus as Record<AgentRunStatus, string>;
  return map[status as AgentRunStatus] ?? status;
}

function actionStatusLabel(status: string): string {
  const map = en.agents.actionStatus as Record<AgentActionStatus, string>;
  return map[status as AgentActionStatus] ?? status;
}

export default async function AgentsPage() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);
  if (resolved === null) redirect("/onboarding");

  // Owner = the signed-in operator owns this resolved farm. The badged demo fallback
  // (dataKind "representative") is read-only; only a real connected owner can approve.
  const isOwner = resolved.dataKind === "real" && resolved.farm.userId === userId;
  const t = en.agents;

  const runs = await prisma.agentRun.findMany({
    where: { farmId: resolved.farm.id },
    orderBy: { createdAt: "desc" },
    include: { actions: { orderBy: { createdAt: "asc" } } },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl py-8 lg:py-12">
      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
        <p className="type-body-md mt-2 text-on-surface-variant">{t.lede}</p>
        <p className="type-body-sm mt-3 text-on-surface-variant/80">{t.refresh.note}</p>
        {!isOwner && (
          <p className="type-body-sm mt-2 text-on-surface-variant/80">{t.readOnlyNote}</p>
        )}
      </header>

      {runs.length === 0 ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <Bot size={28} className="mx-auto mb-3 text-on-surface-variant/60" aria-hidden />
          <h2 className="type-title text-on-surface">{t.empty.title}</h2>
          <p className="type-body-md mx-auto mt-2 max-w-md text-on-surface-variant">
            {t.empty.body}
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-body-md font-medium text-on-surface">
                    {run.kind === "refresh" ? t.refresh.label : run.kind}
                  </p>
                  <p className="type-body-sm mt-0.5 inline-flex items-center gap-1.5 text-on-surface-variant">
                    <Clock size={14} aria-hidden />
                    {t.runOnLabel} {DATE_FMT.format(run.createdAt)}
                  </p>
                </div>
                <span className="type-label-caps shrink-0 text-on-surface-variant">
                  {runStatusLabel(run.status)}
                </span>
              </div>

              {run.actions.length > 0 && (
                <ul className="mt-4 flex flex-col gap-3 border-t border-outline-variant pt-4">
                  {run.actions.map((action) => (
                    <li key={action.id}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="type-body-md min-w-0 text-on-surface">{action.summary}</p>
                        <span className="type-label-caps shrink-0 text-on-surface-variant">
                          {actionStatusLabel(action.status)}
                        </span>
                      </div>
                      {action.draftSubject !== null && (
                        <p className="type-body-sm mt-1 truncate text-on-surface-variant">
                          {action.draftSubject}
                        </p>
                      )}
                      {/* The approval gate: only a proposed action awaits the owner, and only
                          the owner sees the controls. */}
                      {action.status === "proposed" && isOwner && (
                        <AgentActionButtons agentActionId={action.id} summary={action.summary} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
