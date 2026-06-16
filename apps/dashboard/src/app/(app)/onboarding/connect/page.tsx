import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasRealSource, summarizeFarmSources } from "@/lib/onboarding/sources";
import { OnboardingShell } from "../_components/chrome";
import { SourcePicker } from "../_components/source-picker";

// Story 5.2 - step 2, the source picker. Reads the in-progress farm, summarizes what is
// connected, and gates "Continue to review" on at least one real source (AC2).
export const dynamic = "force-dynamic";

export default async function OnboardingConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string; add?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { farm: farmId, add } = await searchParams;
  if (!farmId) notFound();
  // Ownership-scoped read: a farm id arrives in the URL, so it is not trusted. Loading by
  // (id, userId) keeps one operator from reading another operator's farm (no cross-tenant
  // IDOR on this read-side page; the mutating actions already gate on ownsFarm).
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId: session.user.id },
    select: { id: true },
  });
  if (!farm) notFound();

  // A finalized farm (active connection) normally belongs on the dashboard, not back in
  // connect. The one exception is `?add=1` (the Account page's "Connect another account"):
  // an already-connected operator deliberately returning to add more accounts/sources.
  if (!add) {
    const active = await prisma.connection.findFirst({
      where: { farmId, type: "pge_smd", status: "active" },
      select: { id: true },
    });
    if (active) redirect("/");
  }

  const summary = await summarizeFarmSources(prisma, farmId);
  const total = summary.metersWithUsage + summary.metersWithBilling + summary.inventoryOnlyMeters;
  return (
    <OnboardingShell step={2} wide>
      <SourcePicker
        farmId={farmId}
        total={total}
        hasInventory={summary.inventoryOnlyMeters > 0}
        canContinue={hasRealSource(summary)}
      />
    </OnboardingShell>
  );
}
