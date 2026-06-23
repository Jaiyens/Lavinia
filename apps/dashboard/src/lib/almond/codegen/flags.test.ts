import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  codegenRuntime,
  codegenSnapshotId,
  hasSandboxCreds,
  isCodegenExportAvailable,
  isCodegenExportEnabled,
  isLocalRuntimeEnabled,
} from "./flags";

// Pure, offline: these are READ-ONLY env probes. We drive them by setting/scrubbing process.env in the
// test and restore the full set of touched keys in afterEach so no test leaks state to another (or to
// the rest of the suite, which may rely on a clean env). No DB, no sandbox, no AI Gateway is ever booted
// — the whole point is that the flag layer is the gate BEFORE any external dependency is reached.

/** Every env var the flag layer reads. We snapshot + scrub all of them before each test so each case
 *  starts from a known-empty environment, then restore the originals afterward. */
const KEYS = [
  "ALMOND_CODEGEN_EXPORTS",
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

/** Set the explicit Vercel Sandbox credential triple (the non-OIDC auth path). */
function setExplicitSandboxCreds(): void {
  process.env.VERCEL_TOKEN = "tok";
  process.env.VERCEL_TEAM_ID = "team_123";
  process.env.VERCEL_PROJECT_ID = "prj_123";
}

describe("isCodegenExportEnabled (default ON; disabled only by the literal 'false')", () => {
  it("is ON when the env var is absent", () => {
    expect(isCodegenExportEnabled()).toBe(true);
  });

  it("is OFF only for the exact string 'false'", () => {
    process.env.ALMOND_CODEGEN_EXPORTS = "false";
    expect(isCodegenExportEnabled()).toBe(false);
  });

  it("stays ON for any other value (true, 1, empty, garbage) — only 'false' disables", () => {
    for (const v of ["true", "1", "", "off", "FALSE", "no"]) {
      process.env.ALMOND_CODEGEN_EXPORTS = v;
      expect(isCodegenExportEnabled()).toBe(true);
    }
  });
});

describe("hasSandboxCreds", () => {
  it("is false with no creds at all", () => {
    expect(hasSandboxCreds()).toBe(false);
  });

  it("is true with the explicit VERCEL_TOKEN + TEAM_ID + PROJECT_ID triple", () => {
    setExplicitSandboxCreds();
    expect(hasSandboxCreds()).toBe(true);
  });

  it("is false when the explicit triple is only partly set", () => {
    process.env.VERCEL_TOKEN = "tok";
    process.env.VERCEL_TEAM_ID = "team_123";
    // PROJECT_ID missing -> not resolvable, and no OIDC token either.
    expect(hasSandboxCreds()).toBe(false);
  });

  it("is true with just the auto-injected VERCEL_OIDC_TOKEN", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    expect(hasSandboxCreds()).toBe(true);
  });
});

describe("codegenSnapshotId (null unless a non-empty id is set)", () => {
  it("is null when unset", () => {
    expect(codegenSnapshotId()).toBeNull();
  });

  it("is null for an empty / whitespace-only id (fail closed: disables the Vercel runtime)", () => {
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "   ";
    expect(codegenSnapshotId()).toBeNull();
  });

  it("returns the id verbatim when set", () => {
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "snap_abc123";
    expect(codegenSnapshotId()).toBe("snap_abc123");
  });
});

describe("isLocalRuntimeEnabled (opt-in; only the literal 'true')", () => {
  it("is false when unset", () => {
    expect(isLocalRuntimeEnabled()).toBe(false);
  });

  it("is true only for the exact string 'true'", () => {
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(isLocalRuntimeEnabled()).toBe(true);
  });

  it("is false for any non-'true' value", () => {
    for (const v of ["false", "1", "", "TRUE", "yes"]) {
      process.env.ALMOND_CODEGEN_LOCAL = v;
      expect(isLocalRuntimeEnabled()).toBe(false);
    }
  });
});

describe("codegenRuntime (vercel > local > none)", () => {
  it("is 'none' with nothing configured", () => {
    expect(codegenRuntime()).toBe("none");
  });

  it("is 'vercel' when sandbox creds AND a snapshot id are both present", () => {
    setExplicitSandboxCreds();
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "snap_abc123";
    expect(codegenRuntime()).toBe("vercel");
  });

  it("is 'vercel' via the OIDC token + snapshot id (the prod path)", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "snap_abc123";
    expect(codegenRuntime()).toBe("vercel");
  });

  it("is NOT 'vercel' when the snapshot id is missing even with sandbox creds (no per-request install)", () => {
    setExplicitSandboxCreds();
    // No ALMOND_CODEGEN_SNAPSHOT_ID -> Vercel runtime disabled -> falls through to 'none'.
    expect(codegenRuntime()).toBe("none");
  });

  it("is 'local' when ALMOND_CODEGEN_LOCAL=true and no Vercel runtime is configured", () => {
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(codegenRuntime()).toBe("local");
  });

  it("prefers 'vercel' over 'local' when BOTH are configured (Vercel is the strong isolation boundary)", () => {
    setExplicitSandboxCreds();
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "snap_abc123";
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(codegenRuntime()).toBe("vercel");
  });
});

describe("isCodegenExportAvailable (flag ON + gateway key + a runtime)", () => {
  it("is false when no runtime is configured, even with the gateway key and flag on", () => {
    expect(isCodegenExportAvailable(true)).toBe(false);
  });

  it("is false without a gateway key, even when a runtime is configured", () => {
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(isCodegenExportAvailable(false)).toBe(false);
  });

  it("is false when the flag is explicitly disabled, even with a key and a runtime", () => {
    process.env.ALMOND_CODEGEN_EXPORTS = "false";
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(isCodegenExportAvailable(true)).toBe(false);
  });

  it("is true when the flag is on (default), a gateway key is present, and a local runtime is opted in", () => {
    process.env.ALMOND_CODEGEN_LOCAL = "true";
    expect(isCodegenExportAvailable(true)).toBe(true);
  });

  it("is true via the Vercel runtime (sandbox creds + snapshot id) + a gateway key", () => {
    setExplicitSandboxCreds();
    process.env.ALMOND_CODEGEN_SNAPSHOT_ID = "snap_abc123";
    expect(isCodegenExportAvailable(true)).toBe(true);
  });
});
