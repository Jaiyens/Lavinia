import { NextResponse } from "next/server";
import { encode } from "@auth/core/jwt";
import { prisma } from "@/lib/db";

// DEV-ONLY instant sign-in. Visiting /api/dev-login mints the same JWT session cookie the real
// auth flow would (signed with AUTH_SECRET, same cookie name + salt as auth.config.ts) for the farm
// owner, then redirects to the dashboard - so the local demo never gets stuck on the email code.
// HARD-GATED to non-production: in a production build this route returns 403 and mints nothing, so
// it can never ship as an auth bypass. Pass ?email= to sign in as a different existing user.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match auth.config.ts: plain cookie name over http (local dev), __Secure- only on https.
const useSecureCookies =
  Boolean(process.env.VERCEL) ||
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const COOKIE_NAME = `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`;

const DEFAULT_EMAIL = "jaiyen_shetty@berkeley.edu"; // the Batth Farms owner in the local DB
const MAX_AGE_SECONDS = 4 * 60 * 60; // matches the JWT session maxAge in auth.ts

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev-login is disabled in production" }, { status: 403 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET is not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? DEFAULT_EMAIL;
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: `no user with email ${email} in this database` },
      { status: 404 },
    );
  }

  // The token shape the app reads: the jwt/session callbacks key on `id` (-> session.user.id, which
  // owner-scopes every dashboard read). sub/email/name fill out the standard session.user fields.
  const token = await encode({
    token: { id: user.id, sub: user.id, email: user.email, name: user.name },
    secret,
    salt: COOKIE_NAME,
    maxAge: MAX_AGE_SECONDS,
  });

  // Absolute-path Location (resolved by the browser against the origin) - avoids any origin/base
  // surprises from NextResponse.redirect() in dev.
  const dest = url.searchParams.get("next") ?? "/energy";
  const res = new NextResponse(null, { status: 307, headers: { Location: dest } });
  // Browser-session cookie (no maxAge), matching the "log in every browser session" policy: the JWT
  // inside still carries a 4h expiry. Same name/flags the middleware + handlers read.
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies,
  });
  return res;
}
