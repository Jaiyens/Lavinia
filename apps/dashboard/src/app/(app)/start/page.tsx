import { redirect } from "next/navigation";
import Link from "next/link";
import { Sprout, Users } from "lucide-react";
import { auth, sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { activeFarmId } from "@/lib/auth/active-farm";
import { resolveLanding } from "@/lib/onboarding/landing";
import { claimInvitesForUser } from "@/lib/auth/invite";

// The post-login fork. A signed-in user with no farm lands here (the dashboard layout sends
// every farm-less user to /start) and chooses to create a new farm or join one a teammate set
// up. Lives under (app) (so it is auth-gated) but OUTSIDE (app)/(dashboard) (so the dashboard's
// no-farm redirect cannot bounce a farm-less user who legitimately belongs here). resolveLanding
// is the routing brain; this page redirects on every non-"choose" verdict so a ready member can
// never be stranded on the fork, and an owner mid-onboarding resumes instead of starting over.
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
    case "choose":
      break;
  }

  const t = en.start;
  return (
    <main className="grain relative flex min-h-dvh w-full flex-col bg-surface text-on-surface">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5">
        <span className="font-display text-lg font-semibold tracking-tight">Terra</span>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-20 pt-2">
        <div className="mb-8 flex flex-col gap-2">
          <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
          <h1 className="type-display-lg">{t.title}</h1>
          <p className="type-body-md text-on-surface-variant">{t.lede}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Create a farm -> the existing onboarding identify step. Not ?new=1, so an interrupted
              onboarding still resumes rather than spawning a duplicate farm. */}
          <Link
            href="/onboarding"
            className="group flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[var(--shadow-soft)] transition-colors hover:bg-surface-container-low"
          >
            <Sprout size={24} aria-hidden className="text-primary" />
            <h2 className="type-title text-on-surface">{t.create.title}</h2>
            <p className="type-body-sm text-on-surface-variant">{t.create.body}</p>
            <span className="mt-auto pt-2 type-body-sm font-semibold text-primary">{t.create.cta}</span>
          </Link>
          {/* Join a farm. Phase 1: joining is by invite, so this card explains how. Phase 2 turns
              it into a request-to-join link to /join. */}
          <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <Users size={24} aria-hidden className="text-on-surface-variant" />
            <h2 className="type-title text-on-surface">{t.join.title}</h2>
            <p className="type-body-sm text-on-surface-variant">{t.join.body}</p>
            <p className="mt-auto rounded-lg bg-surface-container px-3 py-2 type-caption text-on-surface-variant">
              {email ? t.join.emailNote(email) : t.join.noEmail}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
