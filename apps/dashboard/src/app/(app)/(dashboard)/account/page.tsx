import Link from "next/link";
import { Plus } from "lucide-react";
import { auth, sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
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
        <h2 className="type-label-caps mb-4 text-on-surface-variant">{t.signedInAs}</h2>
        <dl className="flex flex-col gap-4">
          <Row label={t.nameLabel} value={name ?? t.noName} />
          <Row label={t.emailLabel} value={email ?? t.noName} />
        </dl>
      </section>

      {farm && (
        <section className="mb-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="type-label-caps mb-4 text-on-surface-variant">{t.farmHeading}</h2>
          <Row label={t.farmLabel} value={farm.name} />
        </section>
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
        {farm && (
          <Link
            href={`/onboarding/connect?farm=${farm.id}&add=1`}
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-4 py-2 type-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <Plus size={16} aria-hidden />
            {t.connectMore}
          </Link>
        )}
      </section>

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
