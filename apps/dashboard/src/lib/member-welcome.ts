// First-run welcome for an INVITED member: someone added to a farm another operator set up. Shown
// once on Home, then dismissed via an httpOnly cookie read server-side, so there is no flash of an
// already dismissed banner (the calm-UX law, mirroring the Almond first-run nudge). The farm's
// creator (an owner) never sees it - "invited" is signalled by FarmMembership.invitedById being set.

/** The cookie that records the member dismissed the welcome banner. */
export const MEMBER_WELCOME_COOKIE = "member_welcome_seen";

/** Show the welcome only to an invited member who has not yet dismissed it. */
export function shouldShowMemberWelcome({
  wasInvited,
  dismissed,
}: {
  wasInvited: boolean;
  dismissed: boolean;
}): boolean {
  return wasInvited && !dismissed;
}
