"use server";

// Server Actions for good-meats (TGM) ingestion — the two customer-sourced paths that populate the
// worksheet's Good-meats / Sellable columns. Both are manager-gated (viewers are read-only) and
// re-check the session + active-farm membership + writer role THEMSELVES, since a Server Action is a
// POST endpoint reachable independently of the page that rendered it. Neither computes a pound: the
// manual path stores the grower's own stated figure (validated by manualTgmInput); the statement path
// runs the ZDR pound-gate (runExtraction) and stores only what the deterministic gate approved.
//
// TGM is customer-sourced ONLY. There is no ALMOND_LOGIC path here by construction, and the writer +
// the DB check constraint both refuse it.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { hasZdrKey } from "@/lib/ai/zdr";
import { en } from "@/copy/en";
import type { ActionResult } from "@/app/(app)/actions";
import { manualTgmInput, tgmInputsFromStatement, type ManualTgmRaw } from "./tgm-ingest";
import { writeTgmRecords } from "./tgm-write";
import { blockInFarm } from "./block-scope";
import { createZdrPoundReader, runExtraction } from "./extract/reader";
import type { PoundCoverage } from "./types";

/** Resolve the signed-in operator's active farm with WRITE (manager+) rights, or a calm error. */
async function requireWriterFarm(errorCopy: string): Promise<ActionResult<{ farmId: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: errorCopy };
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) return { ok: false, error: errorCopy };
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: errorCopy };
  }
  return { ok: true, data: { farmId: resolved.farm.id } };
}

/**
 * Record a MANUAL good-meats figure for one (cropYear, block, variety). The payload is untrusted, so
 * every field is validated by the pure manualTgmInput (plausible year, positive whole pounds, a known
 * variety, a rate in [0,1)); an invalid payload returns the calm error instead of writing a malformed
 * row. Append-only: it supersedes any prior live figure for the key.
 */
export async function recordManualTgmAction(raw: ManualTgmRaw): Promise<ActionResult<null>> {
  const gate = await requireWriterFarm(en.crops.worksheet.tgmForm.error);
  if (!gate.ok) return gate;

  const input = manualTgmInput(raw);
  if (input === null) return { ok: false, error: en.crops.worksheet.tgmForm.invalid };
  // The block must belong to this farm (Block is not RLS-scoped).
  if (!(await blockInFarm(prisma, gate.data.farmId, input.blockId))) {
    return { ok: false, error: en.crops.worksheet.tgmForm.invalid };
  }

  try {
    await writeTgmRecords(prisma, gate.data.farmId, [input], "manual good-meats entry");
  } catch {
    return { ok: false, error: en.crops.worksheet.tgmForm.error };
  }
  revalidatePath("/almondlogic", "layout");
  return { ok: true, data: null };
}

export type TgmStatementRaw = { cropYear: number; blockId: string; page: string };

/**
 * Ingest a Blue Diamond settlement statement (pasted text/OCR layer) for one target block + crop
 * year: run it through the ZDR pound-gate (runExtraction), then store the gate-approved variety
 * figures as BLUE_DIAMOND_STATEMENT TGM. FAIL-CLOSED: with no zero-retention key we never call out.
 * The returned coverage is the gate's verdict, so the UI can show reconciled vs needs_review honestly.
 */
export async function ingestTgmStatementAction(
  raw: TgmStatementRaw,
): Promise<ActionResult<{ written: number; coverage: PoundCoverage }>> {
  const gate = await requireWriterFarm(en.crops.worksheet.tgmForm.error);
  if (!gate.ok) return gate;

  if (!Number.isInteger(raw.cropYear) || typeof raw.blockId !== "string" || raw.blockId === "") {
    return { ok: false, error: en.crops.worksheet.tgmForm.invalid };
  }
  const page = typeof raw.page === "string" ? raw.page.trim() : "";
  if (page.length === 0) return { ok: false, error: en.crops.worksheet.tgmForm.invalid };
  // The target block must belong to this farm (Block is not RLS-scoped).
  if (!(await blockInFarm(prisma, gate.data.farmId, raw.blockId))) {
    return { ok: false, error: en.crops.worksheet.tgmForm.invalid };
  }

  // Fail closed: never send grower data without a zero-retention path.
  if (!hasZdrKey()) return { ok: false, error: en.crops.worksheet.tgmForm.zdrUnavailable };

  try {
    const result = await runExtraction(createZdrPoundReader(), page);
    const inputs = tgmInputsFromStatement(result, { cropYear: raw.cropYear, blockId: raw.blockId });
    if (inputs.length === 0) return { ok: false, error: en.crops.worksheet.tgmForm.noRows };
    const { written } = await writeTgmRecords(
      prisma,
      gate.data.farmId,
      inputs,
      "blue diamond statement",
    );
    revalidatePath("/almondlogic", "layout");
    return { ok: true, data: { written, coverage: result.coverage } };
  } catch {
    return { ok: false, error: en.crops.worksheet.tgmForm.error };
  }
}
