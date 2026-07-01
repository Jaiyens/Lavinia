// The ZDR import-guard (Crops rule 6). Mirrors the bill engine's import-guard test
// (`src/lib/normalize/no-raw-source-in-ui.test.ts`): it reads the source TEXT and asserts on the
// import specifiers, so it needs no build and no DB.
//
// The hard rule it locks: grower-data extraction must go through the DIRECT Anthropic
// zero-data-retention endpoint and NEVER the Vercel AI Gateway. So:
//   1. `src/lib/ai/zdr.ts` (the ZDR boundary itself) must NOT import `@/lib/ai/gateway`.
//   2. `src/lib/crops/extract/reader.ts` (the settlement reader) must import the ZDR boundary
//      (transitively, via the shared cascade) and must NOT import the gateway.
//   3. `src/lib/crops/extract/cascade.ts` (the shared Sonnet->Opus cascade) must import the ZDR
//      boundary and must NOT import the gateway — it is the single place the live model is built.
//   4. `src/lib/crops/extract/commitment-reader.ts` (the commitment reader) must NOT import the
//      gateway (it reuses the cascade, so the ZDR boundary is reached transitively).
//   5. The live extraction stream route + the report-ingest route must NOT import the gateway.
// If a later edit ever wires grower extraction back through the gateway, this test fails the build.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const GATEWAY = "@/lib/ai/gateway";
const ZDR = "@/lib/ai/zdr";

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

describe("ZDR boundary import-guard", () => {
  it("the ZDR boundary never imports the Vercel AI Gateway", () => {
    expect(importsOf("src/lib/ai/zdr.ts")).not.toContain(GATEWAY);
  });

  it("the shared cascade imports the ZDR boundary, not the gateway", () => {
    const imports = importsOf("src/lib/crops/extract/cascade.ts");
    expect(imports).toContain(ZDR);
    expect(imports).not.toContain(GATEWAY);
  });

  it("the settlement reader never imports the gateway (ZDR reached via the cascade)", () => {
    expect(importsOf("src/lib/crops/extract/reader.ts")).not.toContain(GATEWAY);
  });

  it("the commitment reader never imports the gateway (ZDR reached via the cascade)", () => {
    expect(importsOf("src/lib/crops/extract/commitment-reader.ts")).not.toContain(GATEWAY);
  });

  it("the live extraction stream route never imports the gateway", () => {
    expect(importsOf("src/app/api/crop/extract/stream/route.ts")).not.toContain(GATEWAY);
  });

  it("the report-ingest route never imports the gateway", () => {
    expect(importsOf("src/app/api/crop/ingest-reports/route.ts")).not.toContain(GATEWAY);
  });
});

// Guard the guard: if a path moved and the read returned empty, the asserts above would pass
// vacuously. Anchor on imports we KNOW are present so a silent miss is caught.
describe("guard self-check", () => {
  it("actually read the boundary, the cascade, and the readers", () => {
    expect(importsOf("src/lib/ai/zdr.ts")).toContain("@ai-sdk/anthropic");
    expect(importsOf("src/lib/crops/extract/cascade.ts")).toContain(ZDR);
    // The readers reach the ZDR boundary through the cascade, so they import "./cascade".
    expect(importsOf("src/lib/crops/extract/reader.ts")).toContain("./cascade");
    expect(importsOf("src/lib/crops/extract/commitment-reader.ts")).toContain("./cascade");
  });
});
