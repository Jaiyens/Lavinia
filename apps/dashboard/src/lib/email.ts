// Magic-link delivery boundary (Story 5.1). STUBBED in v1, exactly like the other
// external boundaries (onboarding/source.ts, vision.ts, geocode.ts): zero external
// calls, so dev, tests, and the e2e never send mail. The link is written to the
// server console; copy it from there to sign in locally by magic link.
//
// TODO(prod): wire a real sender (Resend or SMTP) here. The signature already matches
// Auth.js's sendVerificationRequest shape, so prod only swaps the body, not the call site.

/** What Auth.js hands the sender: who to mail and the one-time sign-in URL. */
export type MagicLink = {
  identifier: string;
  url: string;
};

/**
 * Deliver a magic-link sign-in URL. v1 logs it to the server console (no email is
 * sent); prod replaces the body with a real transactional send. Never throws on a
 * missing transport, so a build/e2e without email creds keeps working.
 */
export async function sendMagicLink({ identifier, url }: MagicLink): Promise<void> {
  // The URL carries a one-time sign-in token (a live credential). NEVER log it in
  // production - if the prod sender swap is forgotten, this guard prevents leaking working
  // tokens into production logs. In dev the console IS the v1 delivery channel.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[magic-link] no sender configured; no email sent to ${identifier}. TODO(prod): wire a real sender.`,
    );
    return;
  }
  console.log(`\n[magic-link] sign-in link for ${identifier}:\n${url}\n`);
}
