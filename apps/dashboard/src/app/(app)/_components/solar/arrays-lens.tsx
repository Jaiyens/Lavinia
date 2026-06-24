"use client";

import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Card } from "@/components/ui";
import { SURFACE } from "@/lib/dashboard/surface";
import type { SolarArrayGroup, SolarNeedsReview } from "@/lib/dashboard/solar";
import { auditAllocation, classifyProgramType } from "@/lib/energy/solar-allocation";
import { AllocationBar } from "./allocation-bar";

// The Arrays lens (A-5, UX-DR4): the DEFAULT solar data hero. One array-group card per SolarArray,
// header carrying the array name in plain words, its nameplate said as "840 kW solar" (from the
// array's nameplateKw, NEVER derived from a code, FR3), and its true-up month. Inside each card the
// benefiting meters render as rows with the meter name, a quiet program-code chip, and a share row.
//
// HONEST-BLANK discipline (FR10, the one law): the usage-proportional share arrives in Epic C and the
// credit DOLLAR is settled only by a true-up statement (Epic G). Until then the share bar renders its
// empty honest-blank rail and the credit cell reads not-on-file - never a fabricated zero, never a
// percentage multiplied into a dollar. The inline honest-blank cells below are the A-5 consumption
// point; G-0's shared <HonestBlank> primitive (solar/honest-blank.tsx) replaces them when it lands,
// and A-4's <ProgramCode> component (solar/program-code.tsx) refines the program chip's plain meaning.
//
// FR7: every meter the populator linked to an array appears under that array, including meters under
// different legal entities - the grouping is display-only, no render-time eligibility rule, no
// exception thrown. Solar meters with no array link are surfaced in a needs-review tray, never
// silently dropped. Tapping any meter row opens the shared drawer (`?meter=`) to that meter's solar
// section, matching the meter-table/map-lens open pattern.

const t = en.solar.arrays;

/** The quiet program-code chip (A-5 inline; A-4's <ProgramCode> refines the plain meaning). A generic
 *  NEM2 token reads as the generic program; an absent/unrecognized token reads not-on-file, never a
 *  guessed granular code (FR2/FR5). */
function ProgramChip({ nemType }: { nemType: string | null }) {
  const generic = nemType !== null && nemType.toLowerCase().startsWith("nem2");
  const text = generic ? t.programGeneric : t.programNotOnFile;
  return (
    <span
      className={cn(
        "type-label-caps inline-flex items-center rounded-[var(--radius-control)] px-2 py-0.5",
        generic
          ? "bg-surface-container-high text-on-surface-variant"
          : "text-on-surface-variant",
      )}
    >
      {text}
    </span>
  );
}

function MeterRow({
  meter,
  onOpen,
}: {
  meter: SolarArrayGroup["meters"][number];
  onOpen: (id: string) => void;
}) {
  return (
    <li className="border-t border-outline-variant first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(meter.pumpId)}
        aria-label={t.openMeter(meter.meterName)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="type-body-md text-on-surface">{meter.meterName}</span>
          <ProgramChip nemType={meter.nemType} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="type-caption text-on-surface-variant">
            {/* The meter's own paired nameplate; null reads not-on-file (never inferred, FR3). */}
            {meter.solarKw !== null ? t.meterNameplate(meter.solarKw) : en.shell.drawer.notOnFile}
          </span>
          {/* The credit DOLLAR is honest-blank until a statement settles it (FR10). */}
          <span className="type-caption text-on-surface-variant">
            {t.creditLabel}: <span className="tnum">{t.creditNotOnFile}</span>
          </span>
        </div>
        {/* The share row (C-2, FR8): the bar fills to the meter's usage-proportional share and the
            percentage reads beside it (tnum). A meter with no billed usage on file reads not-on-file
            (the bar stays an empty rail) - never a fabricated zero, never a percent times a dollar. */}
        <div className="flex items-center gap-3">
          <AllocationBar share={meter.share} label={t.shareLabel} />
          <span className="type-caption tnum shrink-0 text-on-surface-variant">
            {meter.share !== null ? t.sharePercent(meter.share) : t.shareNotOnFile}
          </span>
        </div>
      </button>
    </li>
  );
}

function ArrayCard({
  group,
  nameplateVerified,
  onOpen,
}: {
  group: SolarArrayGroup;
  /** DM4 (C-1, FR6): false renders the array nameplate CAUTIOUSLY with an "unverified layout"
   *  qualifier - never suppressed, never presented as confirmed. */
  nameplateVerified: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <Card asChild className="gap-0 overflow-hidden">
      <article>
      <header className="border-b border-outline-variant p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="type-title text-on-surface">{group.name ?? t.unnamed}</h3>
          {/* The nameplate is the ARRAY's nameplateKw, never derived from a code (FR3). When the
              farm's export layout is not yet verified (DM4) the value is shown WITH an "unverified
              layout" qualifier - cautious, not suppressed, never presented as confirmed. */}
          <span className="type-body-md tnum text-on-surface-variant">
            {t.nameplate(group.nameplateKw)}
          </span>
        </div>
        {!nameplateVerified && (
          <p className="type-caption mt-1 text-right text-on-surface-variant">
            {t.nameplateUnverified}
          </p>
        )}
        {/* C-3 (FR11): the array's program type said in plain operator English (single-meter solar /
            aggregation across N meters / virtual NEM), classified from the benefiting-meter count and
            the array's nemType token, never the raw token. The "nema" label already names the count. */}
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="type-caption text-on-surface-variant">
            {t.programType(
              classifyProgramType({
                benefitingMeterCount: group.meters.length,
                nemType: group.nemType,
              }),
              group.meters.length,
            )}
          </span>
          <span className="type-caption text-on-surface-variant">
            {group.trueUpMonth !== null ? t.trueUpMonth(group.trueUpMonth) : t.trueUpNone}
          </span>
        </div>
      </header>

      <div className="px-4 pt-3">
        <p className="type-label-caps text-on-surface-variant">{t.metersHeading}</p>
      </div>
      <ul>
        {group.meters.map((m) => (
          <MeterRow key={`${group.id}:${m.pumpId}`} meter={m} onOpen={onOpen} />
        ))}
      </ul>

      <AuditRows group={group} onOpen={onOpen} />
      </article>
    </Card>
  );
}

/** C-4 (FR9, UX-DR4): the inline allocation-audit rows on a card. A dropped meter (listed but absent
 *  from this array's allocation) or a mismatched recorded share renders as a watch-treatment row -
 *  typographic only, NO color (NFR6: red is reserved for money at stake, and the credit here is
 *  honest-blank). Runs the SAME pure `auditAllocation` the F3 emitter runs, so the rail and the card
 *  show the same gaps. The launch data carries no listed-but-unlinked-within-an-array nor recorded-
 *  split signal, so this renders nothing today - correct, not broken - and lights up when that data
 *  lands. Dropped meters scoped to THIS array open the drawer; the no-array dropped case lives in the
 *  needs-review tray below. */
const a = en.solar.aggregation;
function AuditRows({
  group,
  onOpen,
}: {
  group: SolarArrayGroup;
  onOpen: (id: string) => void;
}) {
  const findings = auditAllocation({
    result: {
      arrayId: group.id,
      arrayName: group.name,
      shares: group.meters.map((m) => ({
        pumpId: m.pumpId,
        meterName: m.meterName,
        share: m.share,
      })),
      notOnFilePumpIds: group.meters.filter((m) => m.share === null).map((m) => m.pumpId),
    },
    listedButUnlinked: [],
  });
  if (findings.length === 0) return null;

  const nameByPump = new Map(group.meters.map((m) => [m.pumpId, m.meterName]));
  return (
    <div className="border-t border-outline-variant px-4 py-3">
      <p className="type-label-caps text-on-surface-variant">{a.reviewHeading}</p>
      <ul className="mt-1 space-y-1">
        {findings.map((f) => {
          const name = nameByPump.get(f.pumpId) ?? f.pumpId;
          const text =
            f.kind === "dropped_meter"
              ? a.droppedRow(name)
              : a.mismatchedRow(name, f.computedPct, f.recordedPct);
          return (
            <li key={`${f.kind}:${f.pumpId}`}>
              <button
                type="button"
                onClick={() => onOpen(f.pumpId)}
                aria-label={t.openMeter(name)}
                className="type-caption w-full text-left text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ArraysLens({
  arrays,
  needsReview,
  nameplateVerified,
}: {
  arrays: SolarArrayGroup[];
  /** The SAME needs-review source the KPI count is computed from (C-1, FR6), so the strip total and
   *  the rendered rows (unlinked meters + unlinked NEMA codes) can never diverge. */
  needsReview: SolarNeedsReview;
  /** DM4 (C-1, FR6): drives the cautious "unverified layout" qualifier on each array nameplate. */
  nameplateVerified: boolean;
}) {
  const [, setMeter] = useQueryState(SURFACE.meter);
  const open = (id: string) => void setMeter(id);

  // Both needs-review gaps come straight from the dataset (the same set the KPI count totals), never
  // recomputed here - so a row shown below is always reflected in the strip count and vice versa.
  // (1) Solar meters with no array link; (2) NEMA codes meters referenced but no array was built for.
  const { unlinkedMeters, unlinkedCodes } = needsReview;

  if (arrays.length === 0 && unlinkedMeters.length === 0 && unlinkedCodes.length === 0) {
    return (
      <section
        id="solar-lens"
        aria-label={en.solar.lens.arrays}
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center"
      >
        <p className="type-body-md text-on-surface-variant">{t.noArrays}</p>
      </section>
    );
  }

  return (
    <section id="solar-lens" aria-label={en.solar.lens.arrays} className="scroll-mt-6 space-y-4">
      {arrays.map((group) => (
        <ArrayCard key={group.id} group={group} nameplateVerified={nameplateVerified} onOpen={open} />
      ))}

      {unlinkedMeters.length > 0 && (
        <Card asChild className="gap-0 overflow-hidden">
          <article>
          <header className="border-b border-outline-variant p-4">
            <h3 className="type-title text-on-surface">{t.unlinkedHeading}</h3>
            <p className="type-caption mt-1 text-on-surface-variant">{t.unlinkedNote}</p>
          </header>
          <ul>
            {unlinkedMeters.map((m) => (
              <li key={m.id} className="border-t border-outline-variant first:border-t-0">
                <button
                  type="button"
                  onClick={() => open(m.id)}
                  aria-label={t.openMeter(m.name)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="type-body-md text-on-surface">{m.name}</span>
                  <ProgramChip nemType={m.nemType} />
                </button>
              </li>
            ))}
          </ul>
          </article>
        </Card>
      )}

      {/* C-1 (FR6): array codes meters referenced but no generating meter defined, surfaced as a muted
          needs-review card rather than silently dropped. The code is shown verbatim (never a guess,
          never normalized); there is no meter to open, so the rows are static. */}
      {unlinkedCodes.length > 0 && (
        <Card asChild className="gap-0 overflow-hidden">
          <article>
          <header className="border-b border-outline-variant p-4">
            <h3 className="type-title text-on-surface">{t.unlinkedCodeHeading}</h3>
            <p className="type-caption mt-1 text-on-surface-variant">{t.unlinkedCodeNote}</p>
          </header>
          <ul>
            {unlinkedCodes.map((c) => (
              <li
                key={c.code}
                className="border-t border-outline-variant px-4 py-2 first:border-t-0"
              >
                <span className="type-body-md tnum text-on-surface">{t.unlinkedCode(c.code)}</span>
              </li>
            ))}
          </ul>
          </article>
        </Card>
      )}
    </section>
  );
}
