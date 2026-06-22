import Link from "next/link";
import { Plus } from "lucide-react";
import { auth, sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { resolveFarmAccess } from "@/lib/auth/access";
import { checkUsageBudget, usageMeterCounts, type UsageBudgetDecision } from "@/lib/almond/usage-budget";
import { RolePill } from "@/app/(app)/_components/shell/role-pill";
import { signOutAction } from "../../actions";
import { resolveActiveFarmId, resolveFarm } from "../_data";

// The account / profile page (#3). The signed-in operator's own details, the farm, and the
// connected data sources, plus a path to connect another account (#6) and sign out. Lives
// under (dashboard) so it wears the OS shell; auth + farm are already enforced by the layouts.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  const userId = await sessionUserId();
  // resolveFarm is request-cached and the layout already redirected a farmless user to
  // onboarding, so a farm is present. dataKind is "real" for a connected grower.
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);
  const farm = resolved?.farm ?? null;

  const connections = farm
    ? await prisma.connection.findMany({
        where: { farmId: farm.id },
        select: { type: true, status: true },
        orderBy: { type: "asc" },
      })
    : [];
  const memberCount = farm
    ? await prisma.farmMembership.count({ where: { farmId: farm.id, status: "active" } })
    : 0;
  // The signed-in member's role/capabilities on this farm. A viewer is read-only: no "connect
  // another", and the team card invites them to "see who has access" rather than "manage".
  const access = farm ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const canManageData = access?.canManageData ?? false;
  const canManageTeam = access?.canManageTeam ?? false;

  // The signed-in operator's own Almond usage for the current window (per-user, durable). Read-only
  // here (no recording). Null for the public Tour, where there is no userId to meter.
  const usage = userId ? await checkUsageBudget(prisma, userId) : null;

  const t = en.account;
  const name = session?.user?.name?.trim() || null;
  const email = session?.user?.email ?? null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 lg:px-12 lg:py-12">
      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
      </header>

      <section className="mb-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="type-label-caps text-on-surface-variant">{t.signedInAs}</h2>
          {access ? <RolePill role={access.role} /> : null}
        </div>
        <dl className="flex flex-col gap-4">
          <Row label={t.nameLabel} value={name ?? t.noName} />
          <Row label={t.emailLabel} value={email ?? t.noName} />
        </dl>
      </section>

      {usage && (
        <section className="mb-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="type-label-caps mb-4 text-on-surface-variant">{t.usage.heading}</h2>
          <UsageMeter budget={usage} />
        </section>
      )}

      {farm && (
        <section className="mb-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="type-label-caps mb-4 text-on-surface-variant">{t.farmHeading}</h2>
          <Row label={t.farmLabel} value={farm.name} />
        </section>
      )}

      {farm && (
        <Link
          href="/account/team"
          className="mb-6 flex items-center justify-between rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 transition-colors hover:bg-surface-container-low"
        >
          <div>
            <h2 className="type-label-caps mb-1 text-on-surface-variant">{en.team.eyebrow}</h2>
            <p className="type-body-md text-on-surface">{en.team.summaryCard(memberCount)}</p>
          </div>
          <span className="type-body-sm font-semibold text-primary">
            {canManageTeam ? en.team.manageLink : en.team.viewLink}
          </span>
        </Link>
      )}

      <section className="mb-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="type-label-caps mb-4 text-on-surface-variant">{t.sourcesHeading}</h2>
        {connections.length === 0 ? (
          <p className="type-body-md text-on-surface-variant">{t.sourcesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.map((c, i) => (
              <li
                key={`${c.type}-${i}`}
                className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3"
              >
                <span className="type-body-md text-on-surface">{labelForType(c.type)}</span>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {farm && canManageData ? (
          <Link
            href={`/onboarding/connect?farm=${farm.id}&add=1`}
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-4 py-2 type-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <Plus size={16} aria-hidden />
            {t.connectMore}
          </Link>
        ) : farm ? (
          <p className="mt-4 type-body-sm text-on-surface-variant">{t.connectMoreHint}</p>
        ) : null}
      </section>

      {/* Whole-new-farm entry: start or join ANOTHER farm (distinct from adding sources above).
          /start?add=1 always shows the Create-vs-Join fork even for a user who already has a farm. */}
      <Link
        href="/start?add=1"
        className="mb-6 inline-flex items-center gap-2 type-body-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <Plus size={16} aria-hidden />
        {t.addFarm}
      </Link>

      <form action={signOutAction}>
        <button
          type="submit"
          className="type-body-md text-on-surface-variant underline-offset-4 hover:underline"
        >
          {t.signOut}
        </button>
      </form>
    </div>
  );
}

// Almond usage meter — the per-user budget shown like Claude's account usage panel, but in
// plain operator English: a concrete "about N messages left" count over a bar, with the bar
// filling and shifting green -> amber -> red as the window drains (color reinforces the count,
// never the sole signal). The count is approximate (the real cap is token-based); "About" is honest.
function UsageMeter({ budget }: { budget: UsageBudgetDecision }) {
  const t = en.account.usage;
  const weekly = budget.window === "weekly";
  const { total, remaining, fractionUsed } = usageMeterCounts(budget);
  const remainingFraction = 1 - fractionUsed;
  const fillPct = Math.round(fractionUsed * 100);
  const fill =
    !budget.allowed || remainingFraction <= 0.1
      ? "bg-risk"
      : remainingFraction <= 0.4
        ? "bg-gold"
        : "bg-primary";
  const period = weekly ? t.periodWeekly : t.periodDaily;
  return (
    <div className="flex flex-col gap-2">
      {budget.allowed ? (
        <p className="type-body-md text-on-surface">{t.remaining(remaining, total, period)}</p>
      ) : (
        <p className="type-body-md text-risk">{weekly ? t.limitReachedWeekly : t.limitReachedDaily}</p>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-container"
        role="progressbar"
        aria-valuenow={budget.allowed ? fillPct : 100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.heading}
      >
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${budget.allowed ? fillPct : 100}%` }}
        />
      </div>
      <p className="type-body-sm text-on-surface-variant">{weekly ? t.resetsWeekly : t.resetsDaily}</p>
      <p className="type-body-sm text-on-surface-variant">{t.hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-body-sm text-on-surface-variant">{label}</dt>
      <dd className="type-body-md text-on-surface">{value}</dd>
    </div>
  );
}

// Human label for a connection type code. Falls back to the raw code so a new source type
// is never blank.
function labelForType(type: string): string {
  switch (type) {
    case "pge_smd":
      return "PG&E";
    case "bill_pdf":
      return "Uploaded bill";
    case "spreadsheet":
      return "Meter list";
    case "green_button":
      return "PG&E export";
    default:
      return type;
  }
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={
        active
          ? "rounded-full bg-primary-container px-2.5 py-0.5 type-label-caps text-on-primary-container"
          : "rounded-full bg-surface-container px-2.5 py-0.5 type-label-caps text-on-surface-variant"
      }
    >
      {status}
    </span>
  );
}
