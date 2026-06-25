import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { IdleLock } from "./_components/idle-lock";

// The (app) group is authed (Story 5.1, AC3). This layout enforces the SESSION gate for
// every (app) route - the dashboard AND the onboarding flow - and nothing else. The farm
// requirement + the three-zone shell live one level down in (app)/(dashboard)/layout.tsx,
// so the onboarding flow ((app)/onboarding/*) is auth-gated but NOT subject to the
// dashboard's no-data redirect (that is what prevents a redirect loop for a signed-in
// user who has no farm yet and is being sent to onboarding to create one).
//
// Middleware redirects too (the fast pre-render path); this Server-Component check is the
// authoritative gate, guaranteeing no (app) route renders without a session.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Sign-in time (epoch seconds) threaded onto the session in auth.config.ts, so the client
  // idle-lock can exempt a brand-new sign-in from its first-load staleness check.
  const loginAt = (session as { loginAt?: number }).loginAt;
  const loginAtMs = typeof loginAt === "number" ? loginAt * 1000 : null;
  return (
    <>
      <IdleLock loginAtMs={loginAtMs} />
      {children}
    </>
  );
}
