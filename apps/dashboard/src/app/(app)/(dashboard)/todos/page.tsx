import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeFarmId } from "@/lib/auth/active-farm";
import { currentFarm } from "@/lib/onboarding/farm";
import { loadTodoFindings } from "@/lib/dashboard/findings";
import { en } from "@/copy/en";
import { FindingCard } from "../../_components/finding-card";

/**
 * The To-do area: findings the grower parked from the Energy findings rail (status "todo"). Each card
 * offers "Mark done" (resolve as done, snapshotting the predicted impact) and "Remove" (back to
 * dismissed), via the shared FindingCard in `mode="todo"`. Owner-scoped end to end: the (app) layout
 * enforces the session, and the membership-scoped active farm is resolved here. Renders live DB data,
 * so it is request-time dynamic. Sits inside the (dashboard) shell group, so it gets the agent rail.
 */
export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const userId = await sessionUserId();
  const activeId = await activeFarmId(userId);
  const farm = await currentFarm(prisma, userId, activeId);
  if (!farm) redirect("/start");

  const findings = await loadTodoFindings(prisma, farm.id);
  const t = en.todos;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 text-on-surface lg:px-12 lg:py-10">
      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
        <p className="type-body-md mt-2 text-on-surface-variant">{t.lede}</p>
      </header>

      {findings.length === 0 ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <ListChecks size={28} className="mx-auto mb-3 text-on-surface-variant/60" aria-hidden />
          <h2 className="type-title text-on-surface">{t.empty.title}</h2>
          <p className="type-body-md mx-auto mt-2 max-w-md text-on-surface-variant">{t.empty.body}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((finding) => (
            <li key={finding.id}>
              <FindingCard finding={finding} mode="todo" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
