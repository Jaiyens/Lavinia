import { type NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkVerifyAttempt } from "@/lib/auth/login-rate-limit";

// The Auth.js v5 HTTP endpoint (sign-in, callback, sign-out, verify). Public per the
// allowlist in auth.config.ts. Lives in the (auth) group; resolves to /api/auth/*.
//
// POST is Auth.js's, untouched. GET is wrapped to harden the 6-digit code callback
// (/api/auth/callback/email), which is the only GET that carries a guessable credential.
const { GET: authGet, POST } = handlers;
export { POST };

/** Build a same-origin /login URL with the given query, dropping empty values and only honoring a
 *  relative, same-origin callbackUrl (never an open redirect). */
function loginUrl(
  origin: string,
  params: { step?: string; email?: string; error?: string; callbackUrl?: string | null },
): URL {
  const dest = new URL("/login", origin);
  if (params.step) dest.searchParams.set("step", params.step);
  if (params.email) dest.searchParams.set("email", params.email);
  if (params.error) dest.searchParams.set("error", params.error);
  const cb = params.callbackUrl;
  if (typeof cb === "string" && cb.startsWith("/") && !cb.startsWith("//")) {
    dest.searchParams.set("callbackUrl", cb);
  }
  return dest;
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl;

  // Only the code callback is rate-limited; everything else (Google callback, signout, etc.)
  // passes straight through to Auth.js.
  if (!url.pathname.endsWith("/callback/email")) {
    return authGet(request);
  }

  // Auth.js normalizes the identifier to lowercase + trim; match it so the budget key and the
  // stored VerificationToken identifier agree.
  const email = (url.searchParams.get("email") ?? "").toLowerCase().trim();
  const callbackUrl = url.searchParams.get("callbackUrl");

  // 1) Brute-force budget. checkVerifyAttempt counts this attempt; when the budget is spent we
  //    INVALIDATE every outstanding code for this email (so a guesser cannot keep trying the same
  //    code) and bounce to the email step to request a fresh one. The deleteMany is best-effort:
  //    a DB hiccup must not 500 the sign-in page.
  if (email && !checkVerifyAttempt(email).allowed) {
    await prisma.verificationToken
      .deleteMany({ where: { identifier: email } })
      .catch(() => {});
    return NextResponse.redirect(loginUrl(url.origin, { error: "locked", callbackUrl }));
  }

  // 2) Let Auth.js verify the typed code (re-hash, match, check expiry, single-use). On a WRONG
  //    or expired code it redirects to pages.error (/login?error=...). Rewrite that so the
  //    operator stays on the code step with their email preserved - "kept on one screen" - rather
  //    than being dumped back to the email entry screen. The valid code is untouched on a miss
  //    (Auth.js only deletes it on success), so they can simply retype.
  const res = await authGet(request);
  const location = res.headers.get("location");
  if (location) {
    try {
      const locUrl = new URL(location, url.origin);
      if (locUrl.pathname === "/login" && locUrl.searchParams.has("error")) {
        return NextResponse.redirect(
          loginUrl(url.origin, { step: "code", email, error: "1", callbackUrl }),
        );
      }
    } catch {
      // Non-URL Location header: leave Auth.js's response as-is.
    }
  }
  return res;
}
