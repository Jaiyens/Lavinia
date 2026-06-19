// The palette + plain-typography theme for every PDF section Almond renders (Epic 9). A PDF is
// not the browser: @react-pdf/renderer takes literal style values, never CSS custom properties, so
// the DESIGN.md tokens that live as `--surface` / `--primary` / `--alert` in globals.css are
// mirrored here as the hex literals the renderer needs. This is the ONE place the report palette is
// defined, so every section (summary, meter table, mis-rated, savings, single-meter, footer) speaks
// the same system the screen does and no section can drift to an off-palette color.
//
// Verbatim hex from src/app/globals.css (the DESIGN.md design-system block): one dominant green, one
// clay alert, charcoal ink on the cool light-grey paper (Kamran's 2026-06-18 Home-redesign reskin
// replaced the earlier warm cream). Pure constants and a shared StyleSheet; no React, no I/O, so it
// is safe to import from a "nodejs"-runtime section and from an offline test.

import { StyleSheet } from "@react-pdf/renderer";

/** The cool-grey palette, hex literals mirrored from globals.css (DESIGN.md design-system tokens). */
export const palette = {
  /** Cool light-grey paper canvas (--surface / --bg). */
  paper: "#eef1f5",
  /** A stepped lighter off-white for header/table bands (--surface-container-low). */
  band: "#f7f8fb",
  /** A deeper grey band for table header rows, kept visible on the cool paper now that
   *  --surface-container equals the canvas (--surface-container-high). */
  bandStrong: "#e6eaf1",
  /** Near-black charcoal ink, never pure black (--on-surface). */
  ink: "#16181d",
  /** Muted cool grey for secondary text (--on-surface-variant). */
  inkMuted: "#5b6470",
  /** Hairline border before any shadow (--outline-variant). */
  line: "#e5e8ee",
  /** Dominant brand green: headings accent, positive state (--primary). */
  green: "#2fa84f",
  /** The savings/credit green (--money-positive; unified to the brand green in the reskin). */
  moneyPositive: "#2fa84f",
  /** The one clay alert tone, used sparingly for a mis-rated / at-risk row (--alert). */
  alert: "#bd4b34",
  /** White, for ink reversed onto a green band (--on-primary). */
  onAccent: "#ffffff",
} as const;

/**
 * The shared section StyleSheet. Sections compose these named styles so type scale, spacing, the
 * warm palette, and tabular money alignment are defined ONCE (no per-section magic numbers). Money
 * cells carry `fontFamily: "Courier"` so columns of dollars align to the digit (the PDF analog of
 * the screen's tabular-nums); never a lone screaming hero number, so even the headline figure sits
 * at a measured title size, not a giant hero.
 */
export const styles = StyleSheet.create({
  // A section is a self-contained block with breathing room and a hairline rule under its heading.
  section: {
    marginBottom: 18,
    paddingBottom: 4,
  },
  // Section eyebrow: small, green, wide tracking (the screen's `.eyebrow`).
  eyebrow: {
    fontSize: 8,
    color: palette.green,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  // Section heading: a measured title, deliberately NOT a screaming hero figure.
  heading: {
    fontSize: 15,
    color: palette.ink,
    fontWeight: 700,
    marginBottom: 8,
  },
  // A line of plain operator body text.
  body: {
    fontSize: 10,
    color: palette.ink,
    lineHeight: 1.4,
  },
  // Secondary / coverage-label text, muted so a withheld figure reads as a label, not a number.
  muted: {
    fontSize: 9,
    color: palette.inkMuted,
    lineHeight: 1.4,
  },
  // A labeled summary stat row: a muted label above a measured value.
  statLabel: {
    fontSize: 8,
    color: palette.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    color: palette.ink,
    fontWeight: 700,
  },
  // A horizontal row of stats (summary tiles).
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  stat: {
    marginRight: 24,
    marginBottom: 8,
  },
  // Table primitives. A header band, then one row per record, each a flex row of cells.
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: palette.bandStrong,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  th: {
    fontSize: 8,
    color: palette.inkMuted,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    padding: 4,
  },
  td: {
    fontSize: 9,
    color: palette.ink,
    padding: 4,
  },
  // A money cell: monospace so dollar columns align to the digit (tabular-nums analog).
  tdMoney: {
    fontSize: 9,
    color: palette.ink,
    padding: 4,
    fontFamily: "Courier",
  },
  // A withheld money cell shows the coverage LABEL, muted, never a fabricated figure.
  tdCoverage: {
    fontSize: 9,
    color: palette.inkMuted,
    padding: 4,
  },
  // A savings / credit figure: the brighter green, still a measured size.
  moneyPositive: {
    color: palette.moneyPositive,
    fontWeight: 700,
  },
  // A mis-rated / at-risk marker: the one warm clay tone.
  alert: {
    color: palette.alert,
  },
  // The coverage footer band: a hairline rule above muted coverage lines.
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  footerLine: {
    fontSize: 8,
    color: palette.inkMuted,
    lineHeight: 1.5,
    marginBottom: 2,
  },
});
