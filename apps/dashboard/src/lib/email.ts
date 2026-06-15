// Magic-link delivery boundary (Story 5.1). Real transactional send via Resend's HTTP API
// when RESEND_API_KEY is set; otherwise the offline stub (logs the URL to the server
// console in dev, sends nothing in prod) so `next build`, the unit suite, and the
// Playwright e2e never hit the network or need a key.
//
// Resend is called over plain `fetch` on purpose - no SDK dependency to install, and the
// call is skipped entirely without a key, keeping dev/CI zero-external-call by default.
// To send for real: set RESEND_API_KEY and AUTH_EMAIL_FROM (a sender on a domain verified
// in Resend, e.g. "Terra <login@yourdomain.com>"; use onboarding@resend.dev to test).

import { en } from "@/copy/en";

/** What Auth.js hands the sender: who to mail and the one-time sign-in URL. */
export type MagicLink = {
  identifier: string;
  url: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Brand tokens mirrored from globals.css. Inlined because email clients ignore external
// CSS and our Tailwind tokens are not available in a mail body.
const PAPER = "#faf9f4";
const INK = "#16190f";
const GREEN = "#2fa84f";
const MUTED = "#6b6f63";

/** The branded HTML body. Table-based + inline styles for broad mail-client support. */
function magicLinkHtml(url: string): string {
  const t = en.auth.email;
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${PAPER};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e7e5dc;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:32px 32px 8px;">
            <span style="font-family:Inter,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GREEN};">Terra</span>
            <h1 style="margin:12px 0 0;font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:600;color:${INK};">${t.heading}</h1>
            <p style="margin:12px 0 24px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:${MUTED};">${t.body}</p>
            <a href="${url}" style="display:inline-block;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;background:${GREEN};text-decoration:none;padding:12px 20px;border-radius:10px;">${t.button}</a>
            <p style="margin:28px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">${t.ignore}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Deliver a magic-link sign-in URL.
 *  - RESEND_API_KEY set  -> send the branded email via Resend's HTTP API.
 *  - no key, dev         -> log the URL to the server console (the v1 delivery channel).
 *  - no key, production  -> log a warning and send nothing (so a forgotten prod sender
 *                           swap can never leak a working sign-in token into prod logs).
 * Never throws on a transport/config problem: a build or e2e without creds keeps working,
 * and a transient Resend error surfaces as the login page's calm "that did not work".
 */
export async function sendMagicLink({ identifier, url }: MagicLink): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // The URL carries a one-time sign-in token (a live credential). NEVER log it in
    // production - in dev the console IS the v1 delivery channel.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[magic-link] no RESEND_API_KEY; no email sent to ${identifier}. Set RESEND_API_KEY + AUTH_EMAIL_FROM to send.`,
      );
      return;
    }
    console.log(`\n[magic-link] sign-in link for ${identifier}:\n${url}\n`);
    return;
  }

  const from = process.env.AUTH_EMAIL_FROM ?? "Terra <onboarding@resend.dev>";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: identifier,
        subject: en.auth.email.subject,
        html: magicLinkHtml(url),
      }),
    });
    if (!res.ok) {
      // Surface the status (not the token) so a misconfigured sender is debuggable from
      // logs without leaking the credential.
      const detail = await res.text().catch(() => "");
      console.error(`[magic-link] Resend send failed (${res.status}): ${detail.slice(0, 300)}`);
      throw new Error(`Resend send failed: ${res.status}`);
    }
  } catch (err) {
    // Re-throw so Auth.js renders the login error state rather than silently "sending"
    // an email that never arrived. The token is never included in the thrown message.
    console.error("[magic-link] send error:", err instanceof Error ? err.message : err);
    throw new Error("magic-link send failed");
  }
}
