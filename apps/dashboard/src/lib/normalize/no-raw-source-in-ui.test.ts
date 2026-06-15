// Architecture guard. The whole point of the normalize layer is that the data source
// is swappable: we build on Bayou's Speculoos fake utility today and flip to real PG&E
// later with no code changes. That only holds if raw source code stays behind the
// boundary, so every screen and finding reads the normalized internal model (landed in
// the DB from NormalizedMeter), never raw Bayou fields.
//
// This locks two invariants so a future edit cannot quietly leak a raw source into a
// screen:
//   1. Nothing under src/app (the screens) imports the raw Bayou HTTP client or a raw
//      source mapper module.
//   2. The raw Bayou HTTP client is imported only by the data-source boundary
//      (src/lib/onboarding), nowhere else in the app.
// Both run off the source text, so they need no build and no DB.

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Every .ts/.tsx file under `dir` (repo-relative, forward-slashed), tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...sourceFiles(rel));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Modules a file imports from (the specifier after `from`, plus bare side-effect imports). */
function importsOf(relPath: string): string[] {
  const text = readFileSync(join(ROOT, relPath), "utf8");
  const specifiers: string[] = [];
  const re = /\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec) specifiers.push(spec);
  }
  return specifiers;
}

// Raw source modules that must never appear in a screen: the Bayou HTTP client, the
// per-source mappers (which speak the raw Bayou/ESPI shapes or the raw NEM extraction),
// and the raw-extraction Zod schemas (the RawExtraction layer Claude returns). The
// "@/lib/normalize" index is fine: it is how the NormalizedMeter / canonical-billing /
// canonical-NEM types are imported.
const RAW_SOURCE_MODULES = [
  "@/lib/bayou/client",
  "@/lib/normalize/bayou",
  "@/lib/normalize/espi",
  "@/lib/normalize/nem",
  "@/lib/normalize/billing",
  "@/lib/extract/schema",
  "@/lib/extract",
  // Server-only extract modules: reader pulls in the `ai` SDK + the gateway key resolution,
  // import is a Prisma DB edge - neither may ever be bundled into a screen (Story 1.8).
  "@/lib/extract/reader",
  "@/lib/extract/import",
];

// The only modules allowed to import the raw Bayou HTTP client: the data-source
// boundary (connect handshake + the pull that feeds the normalizer).
const BAYOU_CLIENT_ALLOWLIST = [
  "src/lib/onboarding/farm.ts",
  "src/lib/onboarding/source.ts",
];

describe("normalized-model boundary", () => {
  it("no screen (src/app) imports a raw source module", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src/app")) {
      const bad = importsOf(file).filter((s) => RAW_SOURCE_MODULES.includes(s));
      if (bad.length > 0) offenders.push(`${file} -> ${bad.join(", ")}`);
    }
    // Screens must read the normalized model out of the DB, never raw Bayou fields.
    expect(offenders).toEqual([]);
  });

  it("the raw Bayou client is imported only by the data-source boundary", () => {
    const importers = sourceFiles("src")
      .filter((file) => importsOf(file).includes("@/lib/bayou/client"))
      .map((file) => file.split(sep).join("/"))
      .sort();
    expect(importers).toEqual(BAYOU_CLIENT_ALLOWLIST);
  });
});

// Guard the guard: if the tree ever moves and the walk matches nothing, the asserts
// above would pass vacuously. Anchor on a tree we know is populated.
describe("guard self-check", () => {
  it("actually scanned the app tree", () => {
    expect(sourceFiles("src/app").length).toBeGreaterThan(0);
  });
});
