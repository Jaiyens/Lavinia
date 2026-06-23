/**
 * The PURE deterministic turn classifier for Almond's Auto router. No I/O, no model, no DB: it reads
 * the latest user text plus the SERVER-DERIVED attachment kinds and returns a closed `TurnClass`, so
 * the whole module is unit-testable in CI with no gateway key. This is the first half of the router
 * brain — route.ts maps a `TurnClass` (and a cache probe) onto the concrete `AutoDecision`.
 *
 * The two gates that carry the most weight:
 *   - An attachment present is a HARD override (the route reads a bill/image natively, deep reasoning),
 *     so it wins over every verb/noun signal.
 *   - A file ask requires BOTH a file ACTION verb (export/download/make/create/generate/...) AND a
 *     file OBJECT NOUN (spreadsheet/workbook/report/...). A noun without a producing action ("what
 *     does this report mean") is a chatty read, not a build — it falls through to `read`, never a
 *     wasted file build. `REPORT_VERB` is then used only to pick the file SHAPE (report vs export).
 */
import { NAV_VERB } from "../responder";
import { LENS_KEYS } from "@/lib/dashboard/surface";
import type { UIMessage } from "ai";
import type { AttachmentKind } from "./types";

/**
 * The attachment kinds surviving on the LAST user message, derived SERVER-SIDE from the prepared
 * message parts (never from the model or client). Spreadsheets are parsed to text upstream, so a
 * surviving `file` part is a PDF or image the live model reads natively; we map each by its media
 * type. Returns [] when the latest user turn carries no file part.
 */
export function attachmentKindsFromMessages(messages: UIMessage[]): AttachmentKind[] {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser === undefined) return [];
  const kinds: AttachmentKind[] = [];
  for (const part of lastUser.parts ?? []) {
    if (part.type !== "file") continue;
    const media = part.mediaType;
    if (media.startsWith("application/pdf")) kinds.push("pdf");
    else if (media.startsWith("image/")) kinds.push("image");
    else kinds.push("other");
  }
  return kinds;
}

/** The file OBJECT NOUN gate: a turn must name a file artifact (not just a file verb) to be a build. */
const FILE_NOUN =
  /\b(spreadsheet|workbook|excel|xlsx|csv|sheet|report|pdf|printout|print[- ]?out|write[- ]?up|one[- ]?pager|document|export|download)\b/;

/**
 * The file ACTION gate: a true imperative to PRODUCE a file. Carries the genuine actions
 * `export`/`download` plus the build imperatives `make`/`create`/`generate`/`build`/`write`/`give me`/
 * `send me`. This is the half of the verb+noun gate that separates a real file ask ("make me a pdf
 * report") from a chatty mention of a file noun ("what does this report mean"): the latter has the
 * noun but no producing action, so it falls through to a read.
 */
const FILE_ACTION =
  /\b(export|download|make|create|generate|build|write|produce|draft|prepare|compile|give me|send me|put together)\b/;

/**
 * The closed classification of a turn. All four kinds are terminal: a `file` ask is a SINGLE path now
 * (the model builds the spreadsheet or report from scratch and picks which by the grower's words), so
 * there is no pre-intent or bespoke discriminator to carry.
 */
export type TurnClass =
  | { kind: "attachment" }
  | { kind: "file" }
  | { kind: "navigate" }
  | { kind: "read" };

/**
 * Classify a turn from its lower-cased text and the server-derived attachment kinds. ORDER is
 * load-bearing and mirrors the intent contract (types.ts):
 *   1. an attachment present is a hard override -> `attachment`
 *   2. a file ask (file VERB *and* file NOUN) -> `file` (built from scratch)
 *   3. a navigation (nav verb OR a lens word) -> `navigate`
 *   4. otherwise -> `read` (the verb+noun gate biases ambiguity here)
 */
export function classifyTurn(text: string, attachmentKinds: AttachmentKind[]): TurnClass {
  if (attachmentKinds.length > 0) return { kind: "attachment" };

  if (FILE_ACTION.test(text) && FILE_NOUN.test(text)) {
    return { kind: "file" };
  }

  if (NAV_VERB.test(text) || LENS_KEYS.some((k) => new RegExp(`\\b${k}\\b`).test(text))) {
    return { kind: "navigate" };
  }

  return { kind: "read" };
}
