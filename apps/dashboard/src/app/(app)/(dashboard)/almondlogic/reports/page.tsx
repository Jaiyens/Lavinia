import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadHullers, loadRuns, REPORT_LIST, type RunInfo } from "@/lib/almond-portal/data";
import { loadCropDeliveries } from "@/lib/crops/deliveries";
import { Reveal } from "@/app/(app)/_components/shell/reveal";
import { resolveAlmondFarm, resolveContext, resolveDefaultContext } from "../_data";
import { ReportList, type ReportView } from "../_components/reports/report-list";
import {
  TurnoutReportTable,
  DeliverySummaryTable,
} from "../_components/reports/report-tables";
import {
  turnoutByFieldVariety,
  deliverySummaryByVariety,
  deliverySummaryTotal,
} from "../_components/reports/aggregate";

// The Almond Logic REPORTS screen, rebuilt 1:1 in the Terra palette. The shell (layout.tsx) renders
// the grower header, sub-nav, and hullers/handlers sidebar; this page renders only the main content:
// the full grower-report index (REPORT_LIST) as a card grid, then the two data-driven reports we can
// compute - turnout by field/variety and delivery summary by variety - scoped to the active huller +
// crop year from the URL. Server Component. Every figure is summed in ../_components/reports/aggregate
// (pure); this page only loads + formats. NEXT 16: searchParams is a Promise, awaited below.
export default async function AlmondReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ hullerId?: string; cropYear?: string }>;
}) {
  const resolved = await resolveAlmondFarm();

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.crops.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const sp = await searchParams;
  const hullers = await loadHullers(prisma, farm.id);
  const ctx = resolveContext(sp, hullers, await resolveDefaultContext(farm.id));

  // The turnout report needs a concrete huller + crop year; deliveries are scoped after loading.
  const [runs, deliveries] = await Promise.all([
    ctx.hullerId != null && ctx.cropYear != null
      ? loadRuns(prisma, farm.id, ctx.hullerId, ctx.cropYear)
      : Promise.resolve<RunInfo[]>([]),
    loadCropDeliveries(prisma, farm.id),
  ]);

  const turnoutGroups = turnoutByFieldVariety(runs);

  const scopedDeliveries = deliveries.filter(
    (r) => r.hullerId === ctx.hullerId && r.cropYear === ctx.cropYear,
  );
  const deliverySummary = deliverySummaryByVariety(scopedDeliveries);
  const deliveryTotal = deliverySummaryTotal(deliverySummary);

  // Report card status is data-driven: the turnout report renders here (anchor); run + delivery
  // reports are backed by synced data and link to their tab; the rest are genuinely not synced yet.
  const runsSynced = runs.length > 0;
  const deliveriesSynced = deliveries.length > 0;
  const reportViews: Record<string, ReportView | undefined> = {
    "Turnout by Grower/Field/Variety": { kind: "anchor", anchor: "report-turnout" },
    ...(runsSynced
      ? {
          "Turnout by Run": { kind: "link" as const, href: "/almondlogic/runs", label: "View in Runs" },
          "Run Summary Report": { kind: "link" as const, href: "/almondlogic/runs", label: "View in Runs" },
        }
      : {}),
    ...(deliveriesSynced
      ? {
          "Field Ticket Deliveries": { kind: "link" as const, href: "/almondlogic/deliveries", label: "View in Deliveries" },
          "Grower Manifest Summary": { kind: "link" as const, href: "/almondlogic/deliveries", label: "View in Deliveries" },
        }
      : {}),
  };

  const activeHuller = hullers.find((h) => h.id === ctx.hullerId) ?? null;
  const scopeLabel =
    activeHuller && ctx.cropYear != null
      ? `${activeHuller.name}, crop year ${ctx.cropYear}`
      : "Select a huller from the sidebar to scope these reports.";

  return (
    <div className="relative min-w-0">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 h-[280px] text-primary/15",
          "[mask-image:radial-gradient(360px_circle_at_top,white,transparent)]",
        )}
      />
      <Reveal>
        <header className="mb-6">
          <p className="type-label-caps text-primary">Reports</p>
          <h2 className="type-headline mt-1 text-on-surface">Grower reports</h2>
          <p className="type-body-md mt-2 text-on-surface-variant">{scopeLabel}</p>
        </header>

        <section className="mb-10">
          <ReportList reports={REPORT_LIST} views={reportViews} />
        </section>

        <section id="report-turnout" className="mb-10 scroll-mt-24">
          <h3 className="type-title mb-3 text-on-surface">Turnout by Grower/Field/Variety</h3>
          <p className="type-caption mb-3 text-on-surface-variant">
            Average turnout and run count per field and variety, from validated runs.
          </p>
          <TurnoutReportTable groups={turnoutGroups} />
        </section>

        <section>
          <h3 className="type-title mb-3 text-on-surface">Delivery summary by variety</h3>
          <p className="type-caption mb-3 text-on-surface-variant">
            Net pounds delivered and load count per variety, for the active huller and crop year.
          </p>
          <DeliverySummaryTable rows={deliverySummary} total={deliveryTotal} />
        </section>
      </Reveal>
    </div>
  );
}
