// The single-meter PDF section (Story 9.1): one meter's detail, for a report scoped to a single pump,
// rendered ONLY from the grounded SingleMeterSectionData the deterministic caller passes in. Every
// field comes from the data argument; the money fields follow the EXACT same coverage rule the meter
// table / CSV use (src/lib/dashboard/csv.ts -> moneyCell, AR-15): a reconciled meter shows its real
// whole-dollar money through the shared formatUsd; an unreconciled meter's money fields show the
// coverage LABEL (the shared table.coverage copy), never a fabricated or zero figure; a reconciled
// meter with no demand charge shows the shared "None"; a null inventory field shows "Not on file".
// The labels are the SAME copy the table uses, so the PDF and the screen can never disagree.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The label/value field list is the exported `singleMeterFields`, so a test asserts the
// exact strings (including the coverage-label rule) without parsing PDF bytes; the component lays out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { styles } from "../theme";
import type { SingleMeterSectionData } from "./types";

const t = en.shell.almond.report.singleMeter;
// The SHARED coverage labels and the "None" absence label the meter table uses, reused verbatim so a
// withheld figure reads identically across the PDF and the screen.
const tt = en.shell.table;

/** A meter detail field: a label and its grounded value. */
export type MeterField = { label: string; value: string };

/** An inventory field's display: the value, or the not-on-file label for a null (never fabricated). */
function inventoryValue(value: string | null): string {
  return value ?? t.notOnFile;
}

/**
 * The money value for a detail field, following the EXACT meter-table rule (csv.ts moneyCell):
 *  - not reconciled  -> the shared coverage label (never a number, never $0);
 *  - reconciled, cents present -> the real money via the shared formatUsd;
 *  - reconciled, cents null     -> "None" for demand (honest absence), "Not on file" for cost.
 */
function moneyValue(
  coverageState: SingleMeterSectionData["coverageState"],
  cents: number | null,
  kind: "cost" | "demand",
): string {
  if (coverageState !== "reconciled") return tt.coverage[coverageState];
  if (cents === null) return kind === "demand" ? tt.none : t.notOnFile;
  return formatUsd(cents);
}

/** Author the meter's detail fields from grounded data. Inventory fields show "Not on file" when
 *  null; money fields follow the meter-table coverage rule. Exported so a test asserts the exact
 *  strings without reading PDF bytes. */
export function singleMeterFields(data: SingleMeterSectionData): MeterField[] {
  return [
    { label: t.ranchLabel, value: inventoryValue(data.ranch) },
    { label: t.entityLabel, value: inventoryValue(data.entity) },
    { label: t.rateLabel, value: inventoryValue(data.rate) },
    { label: t.statusLabel, value: inventoryValue(data.status) },
    { label: t.costLabel, value: moneyValue(data.coverageState, data.costCents, "cost") },
    { label: t.demandLabel, value: moneyValue(data.coverageState, data.demandCents, "demand") },
  ];
}

/** The single-meter section. Renders the meter name and a labeled field list in the warm palette. */
export function SingleMeterSection({ data }: { data: SingleMeterSectionData }) {
  const fields = singleMeterFields(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading(data.name)}</Text>
      <View style={styles.statRow}>
        {fields.map((field) => (
          <View key={field.label} style={styles.stat}>
            <Text style={styles.statLabel}>{field.label}</Text>
            <Text style={styles.statValue}>{field.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
