import { Button, Input } from "@/components/ui";
import { en } from "@/copy/en";
import { identifyFarmAction } from "./actions";

// Story 5.2 - step 1, identify. Operator enters the farm name + contact, then connects a
// source. Lives under (app) (so it is auth-gated) but OUTSIDE (app)/(dashboard) (so the
// dashboard's no-data redirect does not bounce a farm-less operator who is here to create
// one). Renders for a signed-in user with no farm.
export const dynamic = "force-dynamic";

export default function OnboardingIdentifyPage() {
  const t = en.connect.identify;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-5 py-12">
      <div className="flex flex-col gap-3">
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
        <h1 className="type-title text-on-surface">{t.title}</h1>
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
    </main>
  );
}
