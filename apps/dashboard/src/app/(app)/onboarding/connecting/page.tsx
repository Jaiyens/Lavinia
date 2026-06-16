import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OnboardingShell } from "../_components/chrome";
import { PgeConnecting } from "../_components/pge-connecting";

// The live PG&E connecting screen (step 2, mid-flight). The grower has opened PG&E's hosted
// sign-in; this page polls the pull and imports it into the farm, then moves on to review.
export const dynamic = "force-dynamic";

export default async function OnboardingConnectingPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  // Ownership-scoped: never poll/import another operator's farm from a URL-supplied id.
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId: session.user.id },
    select: { id: true },
  });
  if (!farm) notFound();

  return (
    <OnboardingShell step={2}>
      <PgeConnecting farmId={farmId} />
    </OnboardingShell>
  );
}
