// The dashboard lens registry. One meter dataset, shown one lens at a time, switched by
// the nuqs `lens` URL key (architecture's canonical keys: lens|entity|ranch|rate|meter).
// Pure + tested so the toggle, the page, and any deep link agree on what is selectable and
// what the default is. EXPERIENCE.md: default to the SIMPLEST AVAILABLE lens (Chart becomes
// the default face once it ships in 2.8; until then the live default is the Table).

export type Lens = "chart" | "table" | "map" | "calendar";

type LensDef = {
  key: Lens;
  /** True once the lens's content exists. Unavailable lenses render a "coming" placeholder
      and are non-interactive, like the future agents in the rail. */
  available: boolean;
};

// Priority order = the order the default-picker walks. TABLE is first (the default): it is the
// grower's Excel, the lens a low-software-literacy operator reads without learning anything (the
// Carson/Maya/Sally relay decision). Calendar second, then chart and map behind a tap.
export const LENSES: readonly LensDef[] = [
  { key: "table", available: true },
  { key: "calendar", available: true },
  { key: "chart", available: true },
  { key: "map", available: true },
] as const;

export const LENS_KEYS: readonly Lens[] = LENSES.map((l) => l.key);

/** The simplest available lens (first available in priority order). */
export function defaultLens(): Lens {
  const first = LENSES.find((l) => l.available);
  // The registry invariant is that at least one lens is available; "table" is the honest
  // ultimate fallback (never a knowingly-unavailable lens) if that invariant is ever broken.
  return first ? first.key : "table";
}

export function isLensAvailable(key: Lens): boolean {
  return LENSES.find((l) => l.key === key)?.available ?? false;
}

/**
 * Resolve a raw URL value to a real, AVAILABLE lens. Unknown, absent, or not-yet-available
 * values fall back to the default, so a stale deep link never strands the grower on a blank
 * view.
 */
export function parseLens(value: string | null | undefined): Lens {
  const hit = LENSES.find((l) => l.key === value && l.available);
  return hit ? hit.key : defaultLens();
}
