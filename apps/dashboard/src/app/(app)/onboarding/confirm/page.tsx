import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { classifyMeter, meterSignature } from "@/lib/energy";
import { prisma } from "@/lib/db";
import { farmForConfirm } from "@/lib/onboarding/farm";
import { hasRealSource, summarizeFarmSources } from "@/lib/onboarding/sources";
import { en } from "@/copy/en";
import {
  type ConfirmData,
  ConfirmClient,
} from "@/app/dashboard/pump-timing/onboarding/_components/confirm-client";
import { OnboardingShell } from "../_components/chrome";
import { saveConfirmationAction } from "../actions";

// Story 5.2 - step 3, confirm. Reuses the shared confirm machinery (farmForConfirm +
// ConfirmClient + saveConfirmation), surfacing only the classifier-unsure verdicts for a
// double-check (AC4: only what we could not read, never blank-faked). The save action is
// the (app) flow's own, which lands on the dashboard with findings (not the legacy /done).
export const dynamic = "force-dynamic";

// Below this the classifier is unsure enough that the farmer should look twice.
const UNSURE_BELOW = 0.7;

export default async function OnboardingConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  // Ownership-scoped: do not render another operator's farm from a URL-supplied id.
  const owned = await prisma.farm.findFirst({
    where: { id: farmId, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) notFound();

  const farm = await farmForConfirm(prisma, farmId);
  if (!farm) notFound();

  // Single-use: a finalized farm belongs on the dashboard, not back in confirm.
  const pge = farm.connections.find((c) => c.type === "pge_smd");
  if (pge?.status === "active") redirect("/");

  // Gate tightening: confirm requires a real source. A direct visit to this URL with only
  // a meter list (inventory) is sent back to connect, so the gate cannot be URL-bypassed.
  if (!hasRealSource(await summarizeFarmSources(prisma, farmId))) {
    redirect(`/onboarding/connect?farm=${farmId}`);
  }

  const crops = (await prisma.crop.findMany({ orderBy: { name: "asc" } })).map((c) => c.name);

  const data: ConfirmData = {
    farmId: farm.id,
    farmName: farm.name,
    crops,
    blocks: farm.blocks.map((b) => ({
      tempId: b.id,
      name: b.name,
      acreage: b.acreage,
      cropName: b.crop?.name ?? null,
    })),
    pumps: farm.pumps.map((p) => {
      const sig = meterSignature(
        p.intervals.map((r) => ({
          start: r.start.toISOString(),
          durationSec: r.durationSec,
          kWh: r.kWh,
        })),
        {
          tariff: p.rateSchedule,
          cyclePeakKw: p.billingPeriods
            .map((b) => b.peakKw)
            .filter((k): k is number => k !== null),
        },
      );
      const verdict = classifyMeter(sig);
      return {
        id: p.id,
        name: p.name,
        kind: p.kind === "non_pump" ? "non_pump" : "pump",
        verdictKind: verdict.kind,
        unsure: verdict.confidence < UNSURE_BELOW,
        blockTempIds: p.blocks.map((b) => b.id),
        latitude: p.latitude,
        longitude: p.longitude,
      };
    }),
  };

  return (
    <OnboardingShell step={3} wide>
      <div className="mb-8 flex flex-col gap-2">
        <span className="type-label-caps text-on-surface-variant">{en.onboarding.confirm.eyebrow}</span>
        <h1 className="type-display-lg">{en.onboarding.confirm.title}</h1>
        <p className="type-body-md text-on-surface-variant">
          {en.onboarding.confirm.intro(data.pumps.length)}
        </p>
      </div>
      <ConfirmClient data={data} saveAction={saveConfirmationAction} />
    </OnboardingShell>
  );
}
