// The bill-dispute agent's draft step: turn a selected DisputeCandidate into the {subject,
// body} of a farmer-English letter to PG&E. This is the ONLY LLM in the whole agent suite,
// and even here the LLM is OPTIONAL polish — the deterministic /copy-template letter is the
// LOAD-BEARING path: the packet must be filable from it alone, and every dollar in it is the
// engine-authored figure off action.params (never recomputed).
//
// OFFLINE-GREEN LAW: with no AI_GATEWAY_API_KEY this module makes ZERO external calls and
// constructs NO gateway model. `draftDisputeLetter` returns the deterministic template
// whenever hasGatewayKey() is false; the gateway model + generateText are imported LAZILY so
// a no-key path never even loads the AI SDK boundary. The LLM, when a key IS present, is a
// single-shot generateText (no tools, no stopWhen loop) whose system prompt FORBIDS
// inventing or recomputing any number — it may only reword the deterministic letter, and if
// the call fails or returns nothing usable we fall back to the deterministic letter. So the
// numbers a grower files are ALWAYS the engine's, polished or not.

import { en } from "@/copy/en";
import { hasGatewayKey } from "@/lib/ai/gateway";
import type { DisputeCandidate } from "./detect";

const t = en.agents.billDispute;

/** The drafted letter the packet renders and the proposed action stores verbatim. */
export type DisputeLetter = { subject: string; body: string };

/** Zero-based month index of an ISO instant or date-only string, in UTC (matches the
 *  bill-audit engine's monthOf so the letter's month equals the finding's month). */
function monthIndexOf(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso).getUTCMonth();
}

/** Day-of-month (UTC) of an ISO instant or date-only string. */
function dayOf(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso).getUTCDate();
}

/** A plain "June 14 to July 13" service-period range from the cycle window. When the close
 *  is absent (a malformed row) the range is just the start date, so the letter is still
 *  honest rather than fabricating a close. */
function cycleRange(cycleStart: string, cycleClose: string | null): string {
  const start = en.pumpTiming.dateLabel(monthIndexOf(cycleStart), dayOf(cycleStart));
  if (cycleClose === null) return start;
  const close = en.pumpTiming.dateLabel(monthIndexOf(cycleClose), dayOf(cycleClose));
  return `${start} to ${close}`;
}

/** The cycle's month name (the finding's month), used in the subject + body. */
export function disputeMonthLabel(cycleStart: string): string {
  return en.pumpTiming.monthLabel(monthIndexOf(cycleStart));
}

/**
 * The deterministic /copy letter for a dispute candidate. PURE: no clock, no DB, no I/O, no
 * gateway. Every figure comes straight from the candidate (the engine-authored action.params)
 * and is formatted by the shared `usd` helper in en.ts — this function NEVER recomputes a
 * dollar. This is the offline default and the load-bearing path the packet renders from.
 */
export function deterministicDisputeLetter(
  candidate: DisputeCandidate,
  pumpName: string,
): DisputeLetter {
  const month = disputeMonthLabel(candidate.cycleStart);
  return {
    subject: t.letter.subject(pumpName, month),
    body: t.letter.body({
      pump: pumpName,
      month,
      cycleRange: cycleRange(candidate.cycleStart, candidate.cycleClose),
      totalBillUsd: candidate.totalBillUsd,
      medianTotalUsd: candidate.medianTotalUsd,
      excessUsd: candidate.excessUsd,
    }),
  };
}

/** The model id for the OPTIONAL polish pass. Sonnet 4.6 per the feature spec (cheaper than
 *  Opus, and the task is a reword of an already-correct letter, not extraction). */
const DRAFT_MODEL_ID = "anthropic/claude-sonnet-4.6";

/** The system prompt for the optional polish. It hands the model the FINISHED deterministic
 *  letter and the bare facts, and forbids changing any number, name, date, or claim — the
 *  model may only smooth the wording. So the LLM can never invent or recompute a figure. */
const POLISH_SYSTEM =
  "You are helping a farmer reword a letter disputing a charge on their PG&E electricity " +
  "bill. You will be given a complete draft letter. Your only job is to make it read a " +
  "little more naturally in plain, polite, plain-English. STRICT RULES: do NOT change, add, " +
  "or remove ANY dollar amount, date, meter name, or factual claim. Do NOT compute anything. " +
  "Do NOT invent new facts, account numbers, or names. Keep it a short business letter. " +
  "Keep the greeting and the closing. Reply with ONLY the rewritten letter body, nothing else.";

/**
 * Draft the dispute letter for a candidate. OFFLINE-GREEN: when no Gateway key is configured
 * this returns the deterministic letter and constructs NOTHING (the AI SDK is never even
 * imported). When a key IS present it tries a single-shot generateText polish of the
 * deterministic body (no tools, no loop); the subject is always the deterministic one (a
 * stable, searchable subject line), and any failure or empty/over-long model output falls
 * back to the deterministic body — so the filed numbers are always the engine's.
 */
export async function draftDisputeLetter(
  candidate: DisputeCandidate,
  pumpName: string,
): Promise<DisputeLetter> {
  const base = deterministicDisputeLetter(candidate, pumpName);

  // Offline default: zero external calls, no model constructed, no AI SDK imported.
  if (!hasGatewayKey()) return base;

  try {
    // Lazy imports so the no-key path above never loads the gateway/AI SDK boundary.
    const { generateText } = await import("ai");
    const { createGatewayModel } = await import("@/lib/ai/gateway");
    const model = createGatewayModel(DRAFT_MODEL_ID);

    const { text } = await generateText({
      model,
      system: POLISH_SYSTEM,
      prompt: base.body,
    });

    const polished = text.trim();
    // Guard the polish: an empty reply, or one that ran away far longer than the source, is
    // discarded for the deterministic body (the model may only smooth, never balloon).
    if (polished === "" || polished.length > base.body.length * 3) return base;
    return { subject: base.subject, body: polished };
  } catch {
    // Any model/transport failure: the deterministic letter is the contract, so use it.
    return base;
  }
}
