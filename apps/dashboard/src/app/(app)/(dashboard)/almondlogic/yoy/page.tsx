import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { Card } from "@/components/ui/card";
import { loadYearOverYear } from "@/lib/crops/worksheet-load";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveAlmondFarm } from "../_data";
import { YoyTable } from "../_components/yoy-table";

// Year-over-year comparison. Server Component: resolves the operator's OWN farm, runs the worksheet
// engine across the recent seasons (loadYearOverYear), and hands the pivot to the client table. Every
// figure is the season's own gated worksheet figure; nothing is computed here.
const c = en.crops.worksheet.yoyView;

export default async function YoyPage() {
  const resolved = await resolveAlmondFarm();

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.crops.worksheet.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const { years, rows, farmByYear } = await loadYearOverYear(prisma, farm.id);

  return (
    <div className="relative min-w-0 flex-1">
      <Reveal>
        <header className="mb-6">
          <Link
            href="/almondlogic"
            className="type-label-caps inline-flex items-center gap-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={14} aria-hidden /> {en.crops.worksheet.title}
          </Link>
          <p className="type-label-caps mt-3 text-primary">{c.eyebrow}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{c.title}</h1>
          <p className="mt-2 max-w-2xl type-body-md text-on-surface-variant">{c.subtitle}</p>
        </header>

        {years.length < 2 || rows.length === 0 ? (
          <Card className="rounded-[var(--radius-control)] p-8 text-center">
            <p className="type-body-md text-on-surface-variant">{c.empty}</p>
          </Card>
        ) : (
          <YoyTable years={years} rows={rows} farmByYear={farmByYear} />
        )}
      </Reveal>
    </div>
  );
}
