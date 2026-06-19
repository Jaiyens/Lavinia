// Token-presence guard for the DESIGN.md design system (Story 2.1). A CSS-only story
// has no render surface in the node-env Vitest, so the testable invariant is: every
// DESIGN.md token exists in the one tokens file (src/app/globals.css) with its verbatim
// value, and every token is exposed as a Tailwind utility via @theme. A future edit that
// silently drops or mistypes a token fails here. Values are copied verbatim from
// DESIGN.md frontmatter `colors:` / `spacing:` / `rounded:`.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

// DESIGN.md colors: (verbatim hex). The :root declaration must read `--name: #hex;`.
// NOTE (2026-06-18 merge): values synced to Kamran's Home-redesign palette reskin (warm cream ->
// cool light-grey) as committed in globals.css. DESIGN.md / CLAUDE.md still describe the prior warm
// palette and need updating to match (flagged in the merge report); this guard now protects the new
// committed values so a later silent drift still fails here.
const COLOR_TOKENS: Record<string, string> = {
  surface: "#eef1f5",
  "surface-dim": "#e3e7ee",
  "surface-container-lowest": "#ffffff",
  "surface-container-low": "#f7f8fb",
  "surface-container": "#eef1f5",
  "surface-container-high": "#e6eaf1",
  "surface-container-highest": "#dde2eb",
  "on-surface": "#16181d",
  "on-surface-variant": "#5b6470",
  "inverse-surface": "#24262c",
  "inverse-on-surface": "#f3f5f9",
  outline: "#c3c9d3",
  "outline-variant": "#e5e8ee",
  primary: "#2fa84f",
  "on-primary": "#ffffff",
  "primary-container": "#cdebd4",
  "on-primary-container": "#0c3d1c",
  // One green across the dashboard: savings green == the aurora brand green (#2fa84f).
  "money-positive": "#2fa84f",
  "on-money-positive": "#ffffff",
  alert: "#bd4b34",
  "on-alert": "#ffffff",
  "alert-container": "#f7ddd4",
  "on-alert-container": "#4e1306",
  "surface-bright": "#ffffff",
};

const LAYOUT_TOKENS: Record<string, string> = {
  "agent-rail": "184px",
  "findings-rail": "320px",
  "radius-control": "0.625rem",
  "radius-lg": "1.25rem",
};

// Each color token is exposed as a Tailwind color utility through @theme as
// `--color-<name>: var(--<name>)`. Two exceptions: the paper canvas (DESIGN `surface`)
// is exposed as `bg-paper` because the legacy tool already owns `bg-surface` (white),
// and `surface` therefore is asserted separately below.
const THEME_COLOR_NAMES = Object.keys(COLOR_TOKENS).filter(
  (n) => n !== "surface",
);

const TYPE_ROLES = [
  "type-money-hero",
  "type-display-lg",
  "type-headline",
  "type-title",
  "type-body-lg",
  "type-body-md",
  "type-num",
  "type-label-caps",
  "type-caption",
];

describe("DESIGN.md tokens present in globals.css", () => {
  it("declares every color token with its verbatim DESIGN.md value", () => {
    const missing: string[] = [];
    for (const [name, hex] of Object.entries(COLOR_TOKENS)) {
      const re = new RegExp(`--${name}:\\s*${hex};`, "i");
      if (!re.test(CSS)) missing.push(`--${name}: ${hex}`);
    }
    expect(missing).toEqual([]);
  });

  it("declares the layout + radius tokens", () => {
    const missing: string[] = [];
    for (const [name, value] of Object.entries(LAYOUT_TOKENS)) {
      const re = new RegExp(`--${name}:\\s*${value.replace(".", "\\.")};`);
      if (!re.test(CSS)) missing.push(`--${name}: ${value}`);
    }
    expect(missing).toEqual([]);
  });

  it("exposes every color token as a Tailwind utility via @theme (--color-*)", () => {
    const missing: string[] = [];
    for (const name of THEME_COLOR_NAMES) {
      // @theme maps the color to a utility, e.g. `--color-on-surface: var(--on-surface);`
      const re = new RegExp(`--color-${name}:\\s*var\\(--${name}\\);`);
      if (!re.test(CSS)) missing.push(`--color-${name}`);
    }
    expect(missing).toEqual([]);
  });

  it("exposes the paper canvas as bg-paper and keeps bg-surface white for the legacy tool", () => {
    expect(CSS).toMatch(/--color-paper:\s*var\(--surface\);/);
    expect(CSS).toMatch(/--color-surface:\s*var\(--surface-bright\);/);
  });

  it("exposes the rail widths as spacing utilities via @theme", () => {
    expect(CSS).toMatch(/--spacing-agent-rail:\s*var\(--agent-rail\);/);
    expect(CSS).toMatch(/--spacing-findings-rail:\s*var\(--findings-rail\);/);
  });

  it("defines every DESIGN.md typography role class", () => {
    const missing = TYPE_ROLES.filter((cls) => !CSS.includes(`.${cls}`));
    expect(missing).toEqual([]);
  });

  it("bakes tabular figures into the figure-bearing type roles", () => {
    // money-hero and num roles must carry tabular-nums so columns of meter costs align.
    // Bound each slice to its own rule body so a later rule's tnum can't satisfy it.
    const ruleBody = (selector: string): string => {
      const start = CSS.indexOf(selector);
      if (start < 0) throw new Error(`${selector} not found`);
      const open = CSS.indexOf("{", start);
      const close = CSS.indexOf("}", open);
      return CSS.slice(open, close);
    };
    expect(ruleBody(".type-money-hero")).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(ruleBody(".type-num")).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("does not leave a stale duplicate --color-surface mapping (paper vs white)", () => {
    // bg-surface must resolve to white for the legacy tool; the paper canvas is bg-paper.
    expect(CSS).not.toMatch(/--color-surface:\s*var\(--surface\)\s*;/);
  });
});
