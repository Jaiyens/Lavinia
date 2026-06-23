import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessFarm } from "@/lib/auth/access";
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
  // Membership-scoped read: a farm id arrives in the URL, so it is not trusted. canAccessFarm
  // gates on an active FarmMembership (the same gate the mutating actions and currentFarm use),
  // NOT the advisory Farm.userId - so an invited owner/manager can open their farm and a
  // non-member gets notFound (no cross-tenant IDOR on this read-side page).
  if (!(await canAccessFarm(prisma, farmId, session.user.id))) notFound();

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
