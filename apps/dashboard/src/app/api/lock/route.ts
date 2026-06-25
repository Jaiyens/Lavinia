import { NextResponse } from "next/server";

// Session lock endpoint. The client idle-lock (src/app/(app)/_components/idle-lock.tsx)
// navigates here when a tab is reopened or refocused after the operator stepped away, so the
// stepped-away session ends. An httpOnly session cookie can only be cleared by the server, so
// this route expires it and returns the operator to /login to sign in again.
//
// Cookie name + flags MIRROR auth.config.ts exactly (the `__Secure-` prefix + `secure` flag on
// https, plain over http) so it clears the precise cookie the gate reads. Auth.js may chunk a
// large JWT across `.0`/`.1`, so those are cleared too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const useSecureCookies =
  Boolean(process.env.VERCEL) ||
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const baseCookie = `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`;

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 307 });
  for (const name of [baseCookie, `${baseCookie}.0`, `${baseCookie}.1`]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 0,
    });
  }
  return res;
}
