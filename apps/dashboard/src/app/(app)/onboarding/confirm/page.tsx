import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessFarm } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { loadConfirmFarm } from "@/lib/onboarding/farm";
import { hasRealSource, summarizeFarmSources } from "@/lib/onboarding/sources";
import { en } from "@/copy/en";
import {
  type ConfirmData,
  ConfirmClient,
} from "@/app/dashboard/pump-timing/onboarding/_components/confirm-client";
import { OnboardingShell } from "../_components/chrome";
import { PartialConnectNote } from "../_components/partial-connect-note";
import { saveConfirmationAction } from "../actions";

// Story 5.2 - step 3, confirm. Reuses the shared confirm machinery (farmForConfirm +
// ConfirmClient + saveConfirmation), surfacing only the classifier-unsure verdicts for a
// double-check (AC4: only what we could not read, never blank-faked). The save action is
// the (app) flow's own, which lands on the dashboard with findings (not the legacy /done).
export const dynamic = "force-dynamic";
// Confirm runs the recommendation engines over every meter; give a large farm room so the
// finalize server action is not killed mid-run.
export const maxDuration = 300;

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

  // Membership-scoped: do not render another operator's farm from a URL-supplied id (the same
  // gate the actions and currentFarm use; an invited owner/manager passes, a non-member does not).
  if (!(await canAccessFarm(prisma, farmId, session.user.id))) notFound();

  const farm = await loadConfirmFarm(prisma, farmId);
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
      // The verdict + confidence were persisted by classifyFarmPumps at import time (from the
      // exact same signature this page used to recompute), so we read them straight off the
      // pump instead of reloading every meter's interval history to re-derive them - the
      // confirm-step OOM at 183 meters. At this point the farm is pre-finalize, so the stored
      // kind IS the classifier's verdict (the farmer's override is applied only on save).
      const verdictKind = p.kind === "non_pump" ? "non_pump" : "pump";
      return {
        id: p.id,
        name: p.name,
        kind: verdictKind,
        verdictKind,
        // A null confidence (a meter never classified, e.g. legacy data) is treated as
        // confident so we never fabricate doubt on the grower's screen.
        unsure: (p.confidence ?? 1) < UNSURE_BELOW,
        blockTempIds: p.blocks.map((b) => b.id),
        latitude: p.latitude,
        longitude: p.longitude,
      };
    }),
  };

  return (
    <OnboardingShell step={3} wide>
      <PartialConnectNote farmId={farm.id} />
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
