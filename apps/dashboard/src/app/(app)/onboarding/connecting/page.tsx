import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessFarm } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { farmHasLivePgeForm } from "@/lib/onboarding/farm";
import { OnboardingShell } from "../_components/chrome";
import { PgeConnecting } from "../_components/pge-connecting";

// The live PG&E connecting screen (step 2, mid-flight). The grower has opened PG&E's hosted
// sign-in; this page polls the pull and imports it into the farm, then moves on to review.
export const dynamic = "force-dynamic";
// A first import for a large farm (Batth runs ~183 meters) does the live pull + per-meter
// persistence inside finishPgeConnectAction, which can take minutes; raise the function
// ceiling so the platform does not kill it mid-import. Ordinary connects finish in seconds.
export const maxDuration = 300;

export default async function OnboardingConnectingPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  // Membership-scoped: never poll/import another operator's farm from a URL-supplied id.
  if (!(await canAccessFarm(prisma, farmId, session.user.id))) notFound();

  // Only the LIVE PG&E connect belongs on the poller. A bill-only farm (no authorization
  // form) or a stale/back-button visit has nothing to pull, so send it back to connect
  // rather than spin on a poll that can never land. (The import edge also refuses to land
  // the committed sample into such a farm, so this never fabricates meters either.)
  if (!(await farmHasLivePgeForm(prisma, farmId))) {
    redirect(`/onboarding/connect?farm=${farmId}`);
  }

  return (
    <OnboardingShell step={2}>
      <PgeConnecting farmId={farmId} />
    </OnboardingShell>
  );
}
