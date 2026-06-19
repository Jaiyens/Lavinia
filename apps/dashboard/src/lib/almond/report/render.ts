// The PDF composer (Story 9.2): the ONE place a grower's "give me a PDF of whatever I need" becomes a
// real document. The model selects only the SHAPE - which of the Story 9.1 sections to include and in
// what order - and the deterministic caller authors every value (from the uncapped Story 8.1
// full-data loader and the pure rate lever, exactly as the spreadsheet path does). This composer takes
// that selection, lays the chosen sections out in order on a page, and stamps the SAME Story 8.4
// coverage / as-of footer on every PDF, so a report can never disagree with the spreadsheet about
// what is and is not covered.
//
// Honesty laws this enforces:
//  - The footer (Story 8.4 composer, via the 9.1 CoverageFooterSection) is stamped on EVERY report,
//    always, never optional - so completeness is always stated.
//  - No silent truncation: a section is rendered in full (the meter table lists every meter the loader
//    returned and react-pdf wraps it across as many pages as it needs). If a caller chooses to bound a
//    focused section (e.g. "top 10 mis-rated"), it passes a `cappedNote` and the composer STATES the
//    cap on the page; the composer itself never drops a row.
//  - Money is never hand-formatted here: each section formats through the shared formatUsd; this module
//    only places sections and the footer.
//  - Farm scope is inherited: the ExportData this renders came from the farm-scoped loader; this
//    composer takes no farm id and no scope argument.
//
// Pure-JS @react-pdf/renderer under the existing "nodejs" runtime (no Chromium, no Puppeteer), so the
// whole composer is answerable offline by a test and in CI. The page is sized and spaced to stay
// readable and printable on a phone: a portrait A4 with generous margins for the field sections, and a
// landscape page only for the wide meter table, so neither overflows the page edge when printed.

import { createElement, type ComponentProps, type ReactElement } from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

// The Document element renderToBuffer accepts. react-pdf types Document as a class, so its props are
// derived here rather than imported (the namespaced DocumentProps is not exported by name).
type ReportDocument = ReactElement<ComponentProps<typeof Document>>;
import { en } from "@/copy/en";
import type { ExportData, ExportCoverageState } from "@/lib/almond/export/load";
import { styles, palette } from "./theme";
import { CoverSection } from "./sections/cover";
import { OpportunitiesSection } from "./sections/opportunities";
import { ChartsSection } from "./sections/charts";
import { SummarySection } from "./sections/summary";
import { MeterTableSection } from "./sections/meter-table";
import { MisRatedSection } from "./sections/mis-rated";
import { SavingsSection } from "./sections/savings";
import { SingleMeterSection } from "./sections/single-meter";
import { CoverageFooterSection } from "./sections/footer";
import type {
  CoverSectionData,
  OpportunitiesSectionData,
  ChartsSectionData,
  SummarySectionData,
  MisRatedSectionData,
  SavingsSectionData,
  SingleMeterSectionData,
} from "./sections/types";

const t = en.shell.almond.report;

/**
 * One selected section: a discriminated union over the Story 9.1 templates. The model picks WHICH
 * variants to include and in what ORDER (the array order is the page order); the deterministic caller
 * fills each `data` from the uncapped loader and the pure lever. The optional `cappedNote` lets a
 * caller bound a FOCUSED section deliberately (e.g. the worst N mis-rated) and have the composer STATE
 * that bound on the page - the composer never silently drops a row, so a stated cap is the only cap.
 *
 * The meter table is the one full-inventory section: it takes the whole ExportData (every meter) and
 * is never capped, so it carries no `cappedNote` - it always lists every meter, wrapping across pages.
 */
export type ReportSection =
  | { kind: "cover"; data: CoverSectionData }
  | { kind: "opportunities"; data: OpportunitiesSectionData; cappedNote?: ReportCappedNote }
  | { kind: "charts"; data: ChartsSectionData }
  | { kind: "summary"; data: SummarySectionData }
  | { kind: "meterTable"; data: ExportData }
  | { kind: "misRated"; data: MisRatedSectionData; cappedNote?: ReportCappedNote }
  | { kind: "savings"; data: SavingsSectionData; cappedNote?: ReportCappedNote }
  | { kind: "singleMeter"; data: SingleMeterSectionData };

/**
 * A deterministic statement of a deliberate bound on a focused section, so a shortened section is
 * never mistaken for the whole picture. `shown`/`total` are real counts the caller computed; the
 * composer prints "shows the top {shown} of {total}; the spreadsheet lists all {total}". A section
 * with no `cappedNote` is shown in FULL.
 */
export type ReportCappedNote = {
  /** Plain operator name of what is bounded (e.g. "Rate review"), for the stated note. */
  sectionName: string;
  /** Rows actually shown in the PDF (the bound). */
  shown: number;
  /** Rows the underlying data has (the full count; always >= shown). */
  total: number;
};

/**
 * The full report selection the composer renders. `farmName` titles the document; `sections` is the
 * model-chosen shape, in page order; `coverage` is the Story 8.1 loader's coverage / as-of state,
 * stamped through the Story 8.4 footer on every PDF. Scope is inherited (the data is already
 * farm-scoped); there is deliberately no farm id or scope field a caller could redirect.
 */
export type ReportSelection = {
  farmName: string;
  sections: readonly ReportSection[];
  /** The coverage / as-of state for the footer, from the same loader the sections read. */
  coverage: ExportCoverageState;
};

// A4 in points (the PDF unit). Portrait for the field/detail sections; landscape for the wide meter
// table so its nine columns fit the page width without crowding when printed.
const PORTRAIT: [number, number] = [595.28, 841.89];
const LANDSCAPE: [number, number] = [841.89, 595.28];

// Generous, even margins so the document reads and prints clean on a phone (no content runs to the
// page edge, which a phone PDF viewer or a printer would clip).
const pageStyle: Style = {
  backgroundColor: palette.paper,
  paddingTop: 40,
  paddingBottom: 48,
  paddingHorizontal: 40,
};

/** The document title block, stamped once at the top of the report. A measured title (the farm name),
 *  never a screaming hero figure - the north-star rule. */
function TitleBlock({ farmName }: { farmName: string }): ReactElement {
  return createElement(
    View,
    { style: { marginBottom: 18 } },
    createElement(Text, { style: styles.eyebrow }, t.document.eyebrow),
    createElement(Text, { style: styles.heading }, t.document.title(farmName)),
  );
}

/** A deliberate-bound note, stated below a focused section so a shortened section is never read as the
 *  whole picture. Rendered only when the caller passed a `cappedNote`; never invented. */
function CappedNote({ note }: { note: ReportCappedNote }): ReactElement {
  return createElement(
    Text,
    { style: styles.muted },
    t.document.cappedNote(note.sectionName, note.shown, note.total),
  );
}

/**
 * Render one selected section to its Story 9.1 component. The meter table is the only wide section, so
 * it (and only it) is flagged for a landscape page; every other section is portrait. A `cappedNote`,
 * when present, is stated immediately under the section. The data is passed straight through - this
 * never authors a value.
 */
function renderSection(section: ReportSection): { node: ReactElement; wide: boolean } {
  switch (section.kind) {
    case "cover":
      return { node: createElement(CoverSection, { data: section.data }), wide: false };
    case "opportunities":
      return {
        node: createElement(
          View,
          null,
          createElement(OpportunitiesSection, { data: section.data }),
          section.cappedNote ? createElement(CappedNote, { note: section.cappedNote }) : null,
        ),
        wide: false,
      };
    case "charts":
      return { node: createElement(ChartsSection, { data: section.data }), wide: false };
    case "summary":
      return { node: createElement(SummarySection, { data: section.data }), wide: false };
    case "meterTable":
      return { node: createElement(MeterTableSection, { data: section.data }), wide: true };
    case "misRated":
      return {
        node: createElement(
          View,
          null,
          createElement(MisRatedSection, { data: section.data }),
          section.cappedNote ? createElement(CappedNote, { note: section.cappedNote }) : null,
        ),
        wide: false,
      };
    case "savings":
      return {
        node: createElement(
          View,
          null,
          createElement(SavingsSection, { data: section.data }),
          section.cappedNote ? createElement(CappedNote, { note: section.cappedNote }) : null,
        ),
        wide: false,
      };
    case "singleMeter":
      return { node: createElement(SingleMeterSection, { data: section.data }), wide: false };
  }
}

/**
 * Compose the report Document from a selection. Layout: portrait pages carry the title block (first
 * page only), the chosen portrait sections in order, and the coverage footer; the wide meter table, if
 * selected, gets its own landscape page (so its columns fit). The footer is stamped on EVERY report,
 * always - so completeness is stated even for a single-section PDF. react-pdf wraps any section that
 * overruns a page across more pages, so the 183-meter table is never truncated.
 *
 * Returned as a React element (not yet bytes) so a caller can hand it straight to renderReport, and a
 * test can also assert the tree. Pure: no I/O, no clock, no Prisma.
 */
export function buildReportDocument(selection: ReportSelection): ReportDocument {
  const rendered = selection.sections.map(renderSection);
  const portrait = rendered.filter((r) => !r.wide).map((r) => r.node);
  const wide = rendered.filter((r) => r.wide).map((r) => r.node);

  const footer = createElement(CoverageFooterSection, { state: selection.coverage });

  // The cover section carries the Terra mark and the farm name itself (it IS the title), so when a
  // report leads with a cover we suppress the plain TitleBlock to avoid stamping the farm name twice.
  // A report with no cover keeps the measured title block, exactly as before.
  const hasCover = selection.sections.some((s) => s.kind === "cover");

  const pages: ReactElement[] = [];

  // The main portrait page: the title (or the cover, which is its own title), every portrait section
  // in order, then the stamped footer. `wrap` lets a long section (or a long list of sections) flow
  // onto more portrait pages without truncation.
  pages.push(
    createElement(
      Page,
      { key: "portrait", size: PORTRAIT, style: pageStyle, wrap: true },
      hasCover ? null : createElement(TitleBlock, { farmName: selection.farmName }),
      ...portrait,
      // When the meter table is on its own landscape page, the footer still belongs to the report, so
      // it is stamped here on the portrait page (the document's coverage statement), always present.
      footer,
    ),
  );

  // The wide meter table, if selected, on its own landscape page so the nine columns fit and stay
  // readable when printed. It wraps across as many landscape pages as 183 meters need (no truncation).
  if (wide.length > 0) {
    pages.push(
      createElement(
        Page,
        { key: "landscape", size: LANDSCAPE, style: pageStyle, wrap: true },
        ...wide,
      ),
    );
  }

  return createElement(
    Document,
    { title: t.document.title(selection.farmName), creator: "Terra", producer: "Terra" },
    ...pages,
  );
}

/**
 * Render a report selection to the serialized PDF bytes a route streams to the grower. The single
 * entry point: it builds the Document (footer stamped, sections in the model-chosen order) and
 * serializes it via pure-JS @react-pdf/renderer - no Chromium, no Puppeteer, so it runs the same
 * offline in a test and on Vercel. Returns a portable Uint8Array (renderToBuffer returns a Node
 * Buffer, a Uint8Array subclass) so a caller streams or sizes it.
 *
 * The import is dynamic so this module's pure tree-building helpers (buildReportDocument, the section
 * mapping) stay importable without pulling the renderer's Node-only buffer path into a non-node
 * context; the renderer is only needed at the moment of serialization.
 */
export async function renderReport(selection: ReportSelection): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(buildReportDocument(selection));
  return buffer as unknown as Uint8Array;
}
