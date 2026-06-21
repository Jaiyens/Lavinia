// One place the three risk levels map to the warm-palette tokens, so the board, the tiles, the
// legend, and the group indicators all speak the SAME color language (the mechanic the farmer
// learns: red = about to set a new peak). Tokens only, never hex (globals.css owns the values).

import type { RiskLevel } from "@/lib/meters";

/** Background tint, border, and accent for a risk level. */
export const RISK_STYLE: Record<
  RiskLevel,
  { bg: string; border: string; dot: string; text: string }
> = {
  safe: {
    bg: "var(--primary-container)",
    border: "var(--primary)",
    dot: "var(--primary)",
    text: "var(--on-surface)",
  },
  watch: {
    bg: "var(--gold)",
    border: "var(--gold)",
    dot: "var(--gold)",
    text: "var(--on-surface)",
  },
  danger: {
    bg: "var(--alert-container)",
    border: "var(--alert)",
    dot: "var(--alert)",
    text: "var(--alert)",
  },
};
