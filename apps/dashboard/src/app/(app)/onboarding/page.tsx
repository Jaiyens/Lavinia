import { redirect } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { en } from "@/copy/en";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resumableOnboardingFarm } from "@/lib/onboarding/farm";
import { OnboardingShell } from "./_components/chrome";
import { identifyFarmAction } from "./actions";

// Story 5.2 - step 1, identify. Operator enters the farm name + contact, then connects a
// source. Lives under (app) (so it is auth-gated) but OUTSIDE (app)/(dashboard) (so the
// dashboard's no-data redirect does not bounce a farm-less operator who is here to create
// one). Renders for a signed-in user with no farm.
export const dynamic = "force-dynamic";

export default async function OnboardingIdentifyPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const t = en.connect.identify;
  // Resume an interrupted onboarding instead of starting a fresh farm on every visit. A
  // signed-in operator with an in-progress (not-yet-finalized) farm is sent straight back to
  // its connect step, so abandoned attempts no longer pile up as duplicate farms (the
  // dashboard's no-farm gate routes here). The `?new=1` escape (the picker's "start a
  // different farm" link) skips the resume to deliberately begin a fresh farm.
  const { new: forceNew } = await searchParams;
  if (!forceNew) {
    const userId = await sessionUserId();
    const resume = userId ? await resumableOnboardingFarm(prisma, userId) : null;
    if (resume) redirect(`/onboarding/connect?farm=${resume.farmId}`);
  }
  return (
    <OnboardingShell step={1}>
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
          <h1 className="type-display-lg">{t.title}</h1>
          <p className="type-body-md text-on-surface-variant">{t.intro}</p>
        </div>
        <form action={identifyFarmAction} className="flex flex-col gap-4">
          <Input name="farmName" label={t.farmNameLabel} placeholder={t.farmNamePlaceholder} required />
          <Input name="ownerName" label={t.ownerLabel} placeholder={t.ownerPlaceholder} />
          <Input
            type="email"
            name="ownerEmail"
            label={t.emailLabel}
            placeholder={t.emailPlaceholder}
            autoComplete="email"
          />
          <Button type="submit" variant="primary" className="mt-2 w-full">
            {t.continue}
          </Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
