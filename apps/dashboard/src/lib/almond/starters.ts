import { en } from "@/copy/en";

/**
 * Grounded starter prompts for Almond's empty chat — so the grower is never staring at a blank
 * box. Pure and tested: the selection is driven by what the farm actually has (open findings) and
 * by the caller's capability, with always-safe read-question fallbacks. Copy lives in /copy.
 *
 * Two kinds of prompt (Story 10.1):
 *   - READ questions ("Which meters cost me the most?") — answered by the read tools, safe for any
 *     actor including the public Tour.
 *   - ACTION / EXPORT prompts that advertise Almond's operator powers (Epics 7-9): an open/navigate
 *     prompt (read-safe, every actor) and the export/PDF prompts (gated on `canExport` — they drive
 *     the `exportSpreadsheet`/`generateReport` skills).
 *
 * The export/PDF starters are gated on `canExport` so a starter is NEVER offered that the model would
 * refuse: the gate matches the chat route's `canExport` exactly.
 */
export type StarterContext = {
  /** Number of open findings on the farm. Finding-pointing prompts only show when this is > 0. */
  findingCount: number;
  /**
   * Whether the caller may build a downloadable report (the `exportSpreadsheet`/`generateReport`
   * skills). TRUE for a signed-in owner on their own farm AND for the demo/Tour viewer (a guest can
   * pull a report of the demo farm; persistence stays owner-only). The same signal the chat route
   * uses to hand the model the file skills.
   */
  canExport: boolean;
};

export function almondStarters(ctx: StarterContext): string[] {
  const s = en.shell.almond.starters;
  const hasFindings = ctx.findingCount > 0;
  const out: string[] = [];
  // Lead with the new powers so the operator discovers them, but only when grounded: the "open" and
  // "mis-rated PDF" prompts need a finding to point at, and the export/PDF prompts need an owner.
  if (hasFindings) out.push(s.openBiggestOpportunity); // navigate (read-safe, every actor)
  if (ctx.canExport) out.push(s.exportMeters); // exportSpreadsheet (owner-only); every farm has meters
  if (ctx.canExport && hasFindings) out.push(s.misRatedPdf); // generateReport (owner-only)
  // Always-safe read questions round out the set (and carry it entirely for a no-finding Tour visitor).
  // wrongRate leads the tail so the #1-lever question survives the 4-cap for an owner who has findings
  // (whose first three slots are the open/export/PDF actions).
  out.push(s.wrongRate, s.costliestMeters, s.dataCompleteness);
  // Cap at four (mobile-first restraint; surfacing stays gentle, FR22). De-dupe defensively.
  return [...new Set(out)].slice(0, 4);
}
