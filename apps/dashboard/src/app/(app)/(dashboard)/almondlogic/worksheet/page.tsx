import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { en, num } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { groupByEntity, subtotal } from "@/lib/crops/worksheet";
import { loadWorksheet, worksheetSeasons } from "@/lib/crops/worksheet-load";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveAlmondFarm } from "../_data";
import { WorksheetTable } from "../_components/worksheet-table";
import { WorksheetSeason } from "../_components/worksheet-season";

// Gagan's production worksheet ("Crop position") at /almondlogic/worksheet. The grower's own master
// sheet recreated on top of the scraped Almond Logic data, grouped Entity -> Block -> Variety for one
// crop year. Server Component: resolves the operator's OWN farm, picks the season (?cropYear, else the
// latest with data), loads the worksheet through the pure engine (loadWorksheet -> worksheetRows), and
// formats it. Every pound and percent here is computed by the tested engine; nothing is computed in
// the UI. The Almond Logic Home is the module landing; the "Source data" link returns there.
const t = en.crops.worksheet;

export default async function WorksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ cropYear?: string }>;
}) {
  const resolved = await resolveAlmondFarm();

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{t.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const sp = await searchParams;
  const seasons = await worksheetSeasons(prisma, farm.id);

  // Active season: the URL wins when it names a season we have data for; else the latest with data,
  // else the current calendar year (a brand-new farm still renders an honest empty state).
  const fromUrl = sp.cropYear ? Number(sp.cropYear) : null;
  const cropYear =
    fromUrl != null && seasons.includes(fromUrl) ? fromUrl : seasons[0] ?? new Date().getFullYear();

  const { rows, unmappedFieldWeightLb } = await loadWorksheet(prisma, farm.id, cropYear);
  const groups = groupByEntity(rows);
  const farmTotal = subtotal(rows);

  return (
    <div className="relative min-w-0 flex-1">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 h-[320px] text-primary/15",
          "[mask-image:radial-gradient(360px_circle_at_top,white,transparent)]",
        )}
      />
      <Reveal>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-label-caps text-primary">{t.eyebrow}</p>
            <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
            <p className="mt-2 max-w-2xl type-body-md text-on-surface-variant">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/almondlogic/sales"
              className="type-label-caps whitespace-nowrap text-primary transition-colors hover:text-primary/80"
            >
              {t.sales.link}
            </Link>
            <Link
              href="/almondlogic/inventory"
              className="type-label-caps whitespace-nowrap text-primary transition-colors hover:text-primary/80"
            >
              {t.inventory.link}
            </Link>
            <Link
              href="/almondlogic/yoy"
              className="type-label-caps whitespace-nowrap text-primary transition-colors hover:text-primary/80"
            >
              {t.yoyView.link}
            </Link>
            <Link
              href="/almondlogic/tgm"
              className="type-label-caps whitespace-nowrap text-primary transition-colors hover:text-primary/80"
            >
              {t.tgmForm.addLink}
            </Link>
            {seasons.length > 0 ? <WorksheetSeason seasons={seasons} active={cropYear} /> : null}
          </div>
        </header>

        {rows.length === 0 ? (
          <Card className="rounded-[var(--radius-control)] p-8 text-center">
            <p className="type-body-md text-on-surface-variant">{t.empty}</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <section aria-label={t.table.caption}>
              <WorksheetTable groups={groups} farmTotal={farmTotal} />
            </section>

            {unmappedFieldWeightLb > 0 ? (
              <Card className="gap-1 rounded-[var(--radius-control)] p-4">
                <p className="type-body-md text-on-surface">{t.residual(num(unmappedFieldWeightLb))}</p>
                <p className="type-caption text-on-surface-variant">{t.residualHint}</p>
              </Card>
            ) : null}
          </div>
        )}

        {/* Back to the Almond Logic Home (the module landing + the raw source-data screens). */}
        <section aria-label={t.sourceData} className="mt-10 border-t border-outline-variant pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="type-label-caps text-on-surface-variant">{t.sourceData}</h2>
              <p className="mt-1 type-caption text-on-surface-variant">{t.sourceDataHint}</p>
            </div>
            <Link
              href="/almondlogic"
              className="type-label-caps inline-flex items-center gap-1 text-primary transition-colors hover:text-primary/80"
            >
              {t.sourceData}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
