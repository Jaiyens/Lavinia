import { redirect } from "next/navigation";
import Link from "next/link";
import { Sprout, Users } from "lucide-react";
import { auth, sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { Alert, AlertDescription, AlertTitle, Card } from "@/components/ui";
import { activeFarmId } from "@/lib/auth/active-farm";
import { resolveLanding } from "@/lib/onboarding/landing";
import { claimInvitesForUser } from "@/lib/auth/invite";
import { ForkShell } from "../_components/fork-shell";
import { WaitingForApproval } from "../_components/waiting-for-approval";

// The post-login fork. A signed-in user with no farm lands here (the dashboard layout sends every
// farm-less user to /start) and chooses to create a new farm or join one a teammate set up. Lives
// under (app) (auth-gated) but OUTSIDE (app)/(dashboard) so the dashboard's no-farm redirect cannot
// bounce a farm-less user who belongs here. resolveLanding is the routing brain; this page redirects
// on every non-render verdict so a ready member is never stranded on the fork, an owner mid-
// onboarding resumes, and a pending requester sees the waiting screen.
export const dynamic = "force-dynamic";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  const addIntent = add === "1";
  const session = await auth();
  const userId = await sessionUserId();
  const email = session?.user?.email ?? null;
  const activeId = await activeFarmId(userId);
  const landing = await resolveLanding(prisma, { userId, email, activeFarmId: activeId, addIntent });

  switch (landing.kind) {
    case "dashboard":
      redirect("/");
    case "resume":
      // Let the identify page's own resume guard forward to the connect step (one owner of that).
      redirect("/onboarding");
    case "invite":
      // Self-heal a rare missed claim: convert the pending invite, then land on the dashboard.
      if (userId) await claimInvitesForUser(prisma, { id: userId, email });
      redirect("/");
    case "waiting":
      return (
        <ForkShell maxWidth="max-w-md">
          <WaitingForApproval requestId={landing.requestId} farmName={landing.farmName} />
        </ForkShell>
      );
    case "choose":
    case "declined":
      break;
  }

  // The fork. A recently declined request shows a calm notice above it (so a denial is not a silent
  // bounce back to the choice screen); otherwise it is the plain Create-vs-Join choice.
  const declinedFarm = landing.kind === "declined" ? landing.farmName : null;
  const t = en.start;
  return (
    <ForkShell>
      {declinedFarm ? (
        <Alert
          role="status"
          className="mb-6 rounded-2xl border-outline-variant bg-surface-container px-5 py-4"
        >
          <AlertTitle className="type-body-md font-semibold text-on-surface">
            {en.join.declined.title}
          </AlertTitle>
          <AlertDescription className="mt-1 type-body-sm text-on-surface-variant">
            {en.join.declined.body(declinedFarm)}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-8 flex flex-col gap-2">
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
        <h1 className="type-display-lg">{t.title}</h1>
        <p className="type-body-md text-on-surface-variant">{t.lede}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Create a farm -> the existing onboarding identify step. Not ?new=1, so an interrupted
            onboarding still resumes rather than spawning a duplicate farm. */}
        <Card
          asChild
          className="gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[var(--shadow-soft)] ring-0 transition-colors hover:bg-surface-container-low"
        >
          <Link href="/onboarding">
            <Sprout size={24} aria-hidden className="text-primary" />
            <h2 className="type-title text-on-surface">{t.create.title}</h2>
            <p className="type-body-sm text-on-surface-variant">{t.create.body}</p>
            <span className="mt-auto pt-2 type-body-sm font-semibold text-primary">{t.create.cta}</span>
          </Link>
        </Card>
        {/* Join a farm -> the /join code-entry page (request-to-join). */}
        <Card
          asChild
          className="gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[var(--shadow-soft)] ring-0 transition-colors hover:bg-surface-container-low"
        >
          <Link href="/join">
            <Users size={24} aria-hidden className="text-on-surface-variant" />
            <h2 className="type-title text-on-surface">{t.join.title}</h2>
            <p className="type-body-sm text-on-surface-variant">{t.join.body}</p>
            <span className="mt-auto pt-2 type-body-sm font-semibold text-primary">{t.join.cta}</span>
          </Link>
        </Card>
      </div>
      {/* Escape hatch: a native link (not next/link) to the /api/lock route handler, so it does a
          full navigation that clears the session cookie server-side and returns to the login page -
          the way out for anyone who landed here on a stale/leftover session. */}
      <div className="mt-8 text-center">
        <a
          href="/api/lock"
          className="type-body-sm text-on-surface-variant underline underline-offset-4 transition-colors hover:text-on-surface"
        >
          {t.backToLogin}
        </a>
      </div>
    </ForkShell>
  );
}
