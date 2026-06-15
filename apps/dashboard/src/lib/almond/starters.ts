import { en } from "@/copy/en";

/**
 * Grounded starter questions for Almond's empty chat — so the grower is never staring at a
 * blank box. Pure and tested: the selection is driven by what the farm actually has (today,
 * whether there are open findings), with always-safe fallbacks. Copy lives in /copy.
 */
export type StarterContext = {
  /** Number of open findings on the farm. */
  findingCount: number;
};

export function almondStarters(ctx: StarterContext): string[] {
  const s = en.shell.almond.starters;
  const out: string[] = [];
  // Only suggest "biggest opportunity" when there is actually a finding to point at.
  if (ctx.findingCount > 0) out.push(s.biggestOpportunity);
  out.push(s.costliestMeters, s.wrongRate, s.dataCompleteness);
  return out.slice(0, 4);
}
