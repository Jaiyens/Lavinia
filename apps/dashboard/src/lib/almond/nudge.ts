// First-run nudge gate (Story 10.2). The nudge points the grower at Almond on their first dashboard
// view. It is shown ONLY to a real connected owner (dataKind "real" — the same owner signal the chat
// route uses for `authedOwner` and Story 10.1 used for `canExport`), and only until it is dismissed.
// Dismissal is persisted as an httpOnly cookie read server-side, so the gate is decided BEFORE render
// (no flash of an already-dismissed hint, which would violate the calm-UX law). The public Tour /
// badged demo (dataKind "representative") is never "a grower's first run", so it never sees the nudge.

/** The cookie that records the grower dismissed (or engaged) the first-run nudge. */
export const ALMOND_NUDGE_COOKIE = "almond_nudge_seen";

export type NudgeGate = {
  /** "real" for a connected owner; "representative" for the badged demo / public Tour. */
  dataKind: "real" | "representative";
  /** Whether the dismissal cookie is present. */
  dismissed: boolean;
};

/** Show the first-run nudge only to a real owner who has not yet dismissed it. */
export function shouldShowAlmondNudge({ dataKind, dismissed }: NudgeGate): boolean {
  return dataKind === "real" && !dismissed;
}
