import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeFarmId } from "@/lib/auth/active-farm";
import { currentFarm } from "@/lib/onboarding/farm";
import { listReportsForFarm } from "@/lib/almond/reports/store";
import { toReportListItem } from "@/lib/almond/reports/view";
import { en } from "@/copy/en";

/**
 * The Reports area (Story 8.7). A Server Component that lists every spreadsheet Almond has made the
 * signed-in grower, newest first. It is owner-scoped end to end:
 *
 *  - The (app) layout already enforces the SESSION gate, so this never renders without a user.
 *  - We resolve the caller's OWN farm via `currentFarm` (the Farm.userId gate); a signed-in grower
 *    with no connected farm is sent to onboarding, exactly like the dashboard layout's no-data rule.
 *    A report id from ANOTHER farm is never listed (the query is `where: { farmId }`) and never
 *    reachable (the download route re-checks ownership), so cross-farm access is structurally absent.
 *  - Each row links to the OWNER-SCOPED download route (Story 8.6), the only path that streams a
 *    byte; the list never embeds a blob URL or the bytes themselves.
 *
 * Reads live DB data, so it is request-time dynamic. It sits OUTSIDE the (dashboard) shell group
 * (build-notes path), so it is a self-contained page with its own back-to-home link and its own
 * auth + farm resolution. Mobile-first; the rows are real anchors (keyboard + tap, >= 44px targets).
 */
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const userId = await sessionUserId();
  // Membership-scoped: the active farm the caller is a member of, or null when they belong to none
  // yet. A farmless grower is routed to onboarding rather than shown an empty Reports list for a
  // farm they do not have.
  const activeId = await activeFarmId(userId);
  const farm = await currentFarm(prisma, userId, activeId);
  if (!farm) redirect("/onboarding");

  const rows = await listReportsForFarm(prisma, farm.id);
  const items = rows.map(toReportListItem);
  const t = en.reports;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-paper px-5 py-8 text-on-surface lg:px-0 lg:py-12">
      <Link
        href="/"
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 type-body-sm text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowLeft size={16} aria-hidden />
        {en.shell.agents.home}
      </Link>

      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
        <p className="type-body-md mt-2 text-on-surface-variant">{t.lede}</p>
      </header>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <FileSpreadsheet
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
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              {/* A plain anchor, not next/link: the target is the owner-scoped download ROUTE
                  (Story 8.6), which returns the file as a Content-Disposition attachment. A real
                  document navigation lets the browser take the attachment as a download instead of
                  the client router trying to render a non-page route. */}
              <a
                href={item.downloadHref}
                aria-label={t.downloadAria(item.title)}
                className="flex min-h-[44px] items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-4 transition-colors hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <FileSpreadsheet size={24} className="shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="type-body-md truncate font-medium text-on-surface">{item.title}</p>
                  <p className="type-body-sm mt-0.5 text-on-surface-variant">
                    {item.kindLabel} · {t.madeOnLabel} {item.madeOn}
                  </p>
                  <p className="type-body-sm mt-1 truncate text-on-surface-variant/80">
                    {t.requestLabel}: {item.requestText}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 type-label-caps text-primary">
                  <Download size={16} aria-hidden />
                  <span className="hidden sm:inline">{t.download}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
