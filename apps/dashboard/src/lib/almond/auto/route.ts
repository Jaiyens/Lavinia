/**
 * The Auto router's resolution: from a classified turn (intent.ts) to a concrete `AutoDecision` (a real
 * allowlisted model id + the headline key). PURE + deterministic — there is no cache probe and no I/O:
 * every file ask builds the artifact FROM SCRATCH, so the router only needs the classification. The route
 * NEVER lets the classifier name a model: it returns an intent, and the server-side table in types.ts
 * picks the id, so a forged intent can never steer the gateway.
 */
import { modelForIntent, headlineForIntent, type AutoDecision, type TurnIntent, type AttachmentKind } from "./types";
import { classifyTurn } from "./intent";

/**
 * PURE: assemble the decision for a known intent. The cheapest CAPABLE model id and the headline key both
 * come from the server-side tables in types.ts; this is the unit-tested core and the single place an
 * intent becomes a concrete (model id, headline).
 */
export function decideFromIntent(intent: TurnIntent, codegenAvailable: boolean): AutoDecision {
  return { intent, modelId: modelForIntent(intent, codegenAvailable), headline: headlineForIntent(intent) };
}

/**
 * The router entry point: classify the turn, then resolve a concrete `AutoDecision`.
 *   - attachment -> `reason_attachment` (the hard override)
 *   - navigate   -> `navigate`
 *   - file       -> `generate_file` (build the spreadsheet / report FROM SCRATCH)
 *   - read       -> `read_answer`
 * `codegenOn` rides through to the model table only for symmetry; the file path is from-scratch when
 * codegen is configured and the deterministic builder otherwise, with the same Sonnet orchestrator.
 */
export function routeAutoModel(args: {
  text: string;
  attachmentKinds: AttachmentKind[];
  codegenOn: boolean;
}): AutoDecision {
  const cls = classifyTurn(args.text, args.attachmentKinds);
  if (cls.kind === "attachment") return decideFromIntent("reason_attachment", args.codegenOn);
  if (cls.kind === "navigate") return decideFromIntent("navigate", args.codegenOn);
  if (cls.kind === "file") return decideFromIntent("generate_file", args.codegenOn);
  return decideFromIntent("read_answer", args.codegenOn);
}
