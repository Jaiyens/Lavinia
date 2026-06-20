// Sign-in code delivery boundary (Story 5.1). Real transactional send via Resend's HTTP API
// when RESEND_API_KEY is set; otherwise the offline stub (logs the code to the server
// console in dev, sends nothing in prod) so `next build`, the unit suite, and the
// Playwright e2e never hit the network or need a key.
//
// We email a 6-digit CODE (not a magic link): the operator types it back into the same tab.
// That is more reliable on a phone than a tapped link (a link opened in a different browser
// than the one that requested it fails, and email security scanners "click" one-time links
// and burn them before the user can). Auth.js still owns the token: it hashes the code into
// the VerificationToken table and verifies the typed code at /api/auth/callback/email.
//
// Resend is called over plain `fetch` on purpose - no SDK dependency to install, and the
// call is skipped entirely without a key, keeping dev/CI zero-external-call by default.
// To send for real: set RESEND_API_KEY and AUTH_EMAIL_FROM (a sender on a domain verified
// in Resend, e.g. "Terra <login@yourdomain.com>"; use onboarding@resend.dev to test).

import { en } from "@/copy/en";

/** What the sender needs: who to mail and the one-time 6-digit code. */
export type LoginCode = {
  identifier: string;
  code: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Brand tokens mirrored from globals.css. Inlined because email clients ignore external
// CSS and our Tailwind tokens are not available in a mail body.
const PAPER = "#faf9f4";
const INK = "#16190f";
const GREEN = "#2fa84f";
const MUTED = "#6b6f63";

/** The branded HTML body. Table-based + inline styles for broad mail-client support. The
    code is rendered large with wide letter-spacing so it is easy to read and copy. */
function loginCodeHtml(code: string): string {
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
            <p style="margin:12px 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:${MUTED};">${t.body}</p>
            <div style="font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.32em;color:${INK};background:#f4f6f1;border:1px solid #e7e5dc;border-radius:12px;padding:16px 8px;text-align:center;">${code}</div>
            <p style="margin:24px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">${t.ignore}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Deliver a one-time sign-in code.
 *  - RESEND_API_KEY set  -> send the branded email via Resend's HTTP API.
 *  - no key, dev         -> log the code to the server console (the offline channel).
 *  - no key, production  -> log a warning and send nothing (so a forgotten prod sender
 *                           swap can never leak a working sign-in code into prod logs).
 * Never throws on a transport/config problem: a build or e2e without creds keeps working,
 * and a transient Resend error surfaces as the login page's calm "that did not work".
 */
export async function sendLoginCode({ identifier, code }: LoginCode): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // The code is a live credential. NEVER log it in production - in dev the console IS the
    // offline delivery channel.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[login-code] no RESEND_API_KEY; no email sent to ${identifier}. Set RESEND_API_KEY + AUTH_EMAIL_FROM to send.`,
      );
      return;
    }
    console.log(`\n[login-code] sign-in code for ${identifier}: ${code}\n`);
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
        html: loginCodeHtml(code),
      }),
    });
    if (!res.ok) {
      // Surface the status (not the code) so a misconfigured sender is debuggable from
      // logs without leaking the credential.
      const detail = await res.text().catch(() => "");
      console.error(`[login-code] Resend send failed (${res.status}): ${detail.slice(0, 300)}`);
      throw new Error(`Resend send failed: ${res.status}`);
    }
  } catch (err) {
    // Re-throw so Auth.js renders the login error state rather than silently "sending"
    // an email that never arrived. The code is never included in the thrown message.
    console.error("[login-code] send error:", err instanceof Error ? err.message : err);
    throw new Error("login-code send failed");
  }
}
