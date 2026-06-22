// The bill-dispute agent's packet step: render the APPROVED draft letter to an immutable PDF
// dispute packet and persist it. v1 NEVER files with PG&E — this only produces a document the
// grower downloads and files by hand.
//
// REUSE over reinvention:
//   - the PDF is composed with the SAME pure-JS @react-pdf/renderer + warm theme the Almond
//     report composer uses (src/lib/almond/report/theme.ts), so the packet speaks the product's
//     design system and renders offline (no Chromium / Puppeteer);
//   - it is persisted through the EXISTING report store (src/lib/almond/reports/store.ts
//     storeReport -> src/lib/storage/blob.ts putPrivateBlob), so the bytes land in a PRIVATE,
//     non-guessable Vercel Blob and a GeneratedReport row records what/when, exactly like the
//     spreadsheet and report skills. The packet's kind is "bill_dispute" (added to
//     GENERATED_REPORT_KINDS, a one-line TS union widening, no migration).
//
// Every figure on the packet is the engine-authored excess/total/median off the DisputeCandidate
// (action.params); the letter body is the approved draft verbatim. This module fabricates no
// dollar. Farm scope is inherited from the store deps, never an argument the caller could forge.
//
// The @react-pdf/renderer import is DYNAMIC (mirroring render.ts) so this module's pure tree
// builder stays importable without pulling the Node-only renderer into a non-node context; the
// renderer is only needed at the moment of serialization.

import { createElement, type ReactElement } from "react";
import type { ComponentProps } from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { usd } from "@/copy/en";
import { styles, palette } from "@/lib/almond/report/theme";
import { storeReport, type ReportStoreDeps, type StoredReport } from "@/lib/almond/reports/store";
import type { DisputeCandidate } from "./detect";
import { disputeMonthLabel } from "./draft";
import type { DisputeLetter } from "./draft";

const t = en.agents.billDispute.packet;

/** The Document element renderToBuffer accepts (react-pdf types Document as a class, so its
 *  props are derived rather than imported — same pattern as render.ts). */
type PacketDocument = ReactElement<ComponentProps<typeof Document>>;

/** The PDF content type for the download/route. */
export const DISPUTE_PACKET_CONTENT_TYPE = "application/pdf";

/** Everything the packet renders and records, all grounded: the meter name, the cycle facts
 *  off the engine-authored candidate, and the approved letter verbatim. No farmId here (scope
 *  comes from the store deps). */
export type DisputePacketInput = {
  pumpName: string;
  candidate: DisputeCandidate;
  letter: DisputeLetter;
};

/** Portrait A4, generous margins so the letter prints readably on a phone (same as render.ts). */
const A4_PORTRAIT: [number, number] = [595.28, 841.89];

/** One labeled facts row on the packet (a muted label above a measured value). */
function statBlock(label: string, value: string): ReactElement {
  return createElement(
    View,
    { style: styles.stat, key: label },
    createElement(Text, { style: styles.statLabel }, label),
    createElement(Text, { style: styles.statValue }, value),
  );
}

/**
 * Build the dispute-packet Document: a header naming the meter, a grounded facts block (the
 * engine-authored statement total, usual cycle, and disputed amount), the approved draft
 * letter verbatim, and the honest footer (Terra prepared it, the grower files it). Pure tree
 * building — no I/O — so a test can assert the composed strings (see buildDisputePacketLines).
 */
export function buildDisputePacketDocument(input: DisputePacketInput): PacketDocument {
  const { pumpName, candidate, letter } = input;
  const month = disputeMonthLabel(candidate.cycleStart);
  const lines = letter.body.split("\n");

  const pageStyle = { backgroundColor: palette.paper, padding: 40 } as const;

  return createElement(
    Document,
    {
      title: t.title(pumpName, month),
      creator: "Terra",
      producer: "Terra",
    },
    createElement(
      Page,
      { size: A4_PORTRAIT, style: pageStyle, wrap: true },
      // Header.
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.eyebrow }, t.eyebrow),
        createElement(Text, { style: styles.heading }, t.heading(pumpName)),
      ),
      // Grounded facts block.
      createElement(
        View,
        { style: styles.section },
        createElement(
          View,
          { style: styles.statRow },
          statBlock(t.meterLabel, pumpName),
          statBlock(t.periodLabel, month),
          statBlock(t.billedLabel, usd(candidate.totalBillUsd)),
          statBlock(t.usualLabel, usd(candidate.medianTotalUsd)),
          statBlock(t.excessLabel, usd(candidate.excessUsd)),
        ),
      ),
      // The approved letter, verbatim, one Text per line so blank lines render as spacing.
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.eyebrow }, t.letterHeading),
        ...lines.map((line, i) =>
          createElement(
            Text,
            { key: `l-${i}`, style: line === "" ? styles.muted : styles.body },
            line === "" ? " " : line,
          ),
        ),
      ),
      // Honest footer: Terra prepared this, the grower files it.
      createElement(
        View,
        { style: styles.footer },
        createElement(Text, { style: styles.footerLine }, t.footer),
      ),
    ),
  );
}

/** The composed packet text, in order, for a test to assert without parsing PDF bytes. The
 *  same strings the Document renders (facts block + letter lines + footer). */
export function buildDisputePacketLines(input: DisputePacketInput): string[] {
  const { pumpName, candidate, letter } = input;
  const month = disputeMonthLabel(candidate.cycleStart);
  return [
    t.eyebrow,
    t.heading(pumpName),
    `${t.meterLabel}: ${pumpName}`,
    `${t.periodLabel}: ${month}`,
    `${t.billedLabel}: ${usd(candidate.totalBillUsd)}`,
    `${t.usualLabel}: ${usd(candidate.medianTotalUsd)}`,
    `${t.excessLabel}: ${usd(candidate.excessUsd)}`,
    t.letterHeading,
    ...letter.body.split("\n"),
    t.footer,
  ];
}

/** Serialize the packet Document to PDF bytes via pure-JS @react-pdf/renderer (dynamic import,
 *  same as render.ts). Returns a portable Uint8Array. */
export async function renderDisputePacket(input: DisputePacketInput): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(buildDisputePacketDocument(input));
  return buffer as unknown as Uint8Array;
}

/**
 * Render the approved dispute packet to PDF and persist it through the existing report store:
 * private blob (immutable, non-guessable key) + a GeneratedReport row (kind "bill_dispute").
 * Scope (`farmId`) and authorship come ONLY from `deps`, never from the caller's arguments, so
 * a forged farmId is impossible here. Returns the stored report id so the approval action can
 * persist it on the AgentAction. NEVER calls PG&E.
 */
export async function renderAndStoreDisputePacket(
  deps: ReportStoreDeps,
  input: DisputePacketInput,
): Promise<StoredReport> {
  const month = disputeMonthLabel(input.candidate.cycleStart);
  const bytes = await renderDisputePacket(input);
  return storeReport(deps, {
    kind: "bill_dispute",
    title: t.title(input.pumpName, month),
    requestText: t.requestText(input.pumpName, month),
    coverageAsOf: input.candidate.cycleClose ?? input.candidate.cycleStart,
    params: {
      pumpId: input.candidate.pumpId,
      cycleStart: input.candidate.cycleStart,
      excessUsd: input.candidate.excessUsd,
    },
    bytes,
    contentType: DISPUTE_PACKET_CONTENT_TYPE,
  });
}
