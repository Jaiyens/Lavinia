import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodegenRuntimeUnavailableError, renderPdf, renderXlsx } from "./run";
import type { ReportSnapshot } from "./snapshot";
import { composeReportSnapshot } from "./snapshot";

// Pure, offline: the runtime DISPATCHER's "no runtime configured" path. We scrub every env var the
// runtime resolver reads so codegenRuntime() returns "none", then assert renderXlsx/renderPdf THROW
// CodegenRuntimeUnavailableError. This never boots a Vercel Sandbox or a python subprocess: the throw
// happens BEFORE either runtime function is reached (the "none" branch is the first thing hit). That is
// the contract the codegen skills rely on — a throw means "runtime unavailable" (serve the deterministic
// fallback), distinct from a non-zero exitCode (the model's code failed -> repair).

/** Every env var codegenRuntime() consults. Scrubbed before each test (forcing the "none" runtime),
 *  restored after, so we never depend on or leak the ambient environment. */
const KEYS = [
  "ALMOND_CODEGEN_LOCAL",
  "ALMOND_CODEGEN_SNAPSHOT_ID",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
  "VERCEL_OIDC_TOKEN",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const SNAPSHOT: ReportSnapshot = composeReportSnapshot({
  farm: { id: "farm1", name: "Batth Farms" },
  meterCount: 1,
  coverageAsOf: null,
  latestMonthSpendCents: null,
  opportunities: [],
});

describe("renderXlsx / renderPdf with no runtime configured", () => {
  it("renderXlsx throws CodegenRuntimeUnavailableError (does not boot any runtime)", async () => {
    await expect(
      renderXlsx({ snapshot: SNAPSHOT, code: 'wb.save("out.xlsx")' }),
    ).rejects.toBeInstanceOf(CodegenRuntimeUnavailableError);
  });

  it("renderPdf throws CodegenRuntimeUnavailableError (does not boot any runtime)", async () => {
    await expect(
      renderPdf({ snapshot: SNAPSHOT, html: "<html></html>", css: "" }),
    ).rejects.toBeInstanceOf(CodegenRuntimeUnavailableError);
  });

  it("the error carries a stable name + an actionable message", async () => {
    const err = await renderXlsx({ snapshot: SNAPSHOT, code: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodegenRuntimeUnavailableError);
    if (err instanceof CodegenRuntimeUnavailableError) {
      expect(err.name).toBe("CodegenRuntimeUnavailableError");
      expect(err.message).toMatch(/ALMOND_CODEGEN_LOCAL=true|Vercel Sandbox/i);
    }
  });
});
