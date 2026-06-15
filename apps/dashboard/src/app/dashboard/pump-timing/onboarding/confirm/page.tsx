import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { Spark } from "@/components/spark";
import { en } from "@/copy/en";
import { classifyMeter, meterSignature } from "@/lib/energy";
import { prisma } from "@/lib/db";
import { farmForConfirm } from "@/lib/onboarding/farm";
import {
  type ConfirmData,
  ConfirmClient,
} from "../_components/confirm-client";

export const metadata: Metadata = {
  title: "Confirm · Pump Timing · Terra",
};

// Below this the classifier is unsure enough that the farmer should look twice.
// 0.7 flags verdicts with |score| <= 2 (a peak-only or load-factor-only cue);
// a lone agricultural-tariff cue (score 3 -> 0.74) stays confident.
const UNSURE_BELOW = 0.7;

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  const farm = await farmForConfirm(prisma, farmId);
  if (!farm) notFound();

  // Onboarding is single-use: once finalized, the confirm form would silently no-op
  // (saveConfirmation's compare-and-swap), so send a finalized farm to the tool index
  // rather than letting the farmer make edits that are dropped.
  const pgeConnection = farm.connections.find((c) => c.type === "pge_smd");
  if (pgeConnection?.status === "active") redirect("/dashboard/pump-timing");

  const crops = (await prisma.crop.findMany({ orderBy: { name: "asc" } })).map(
    (c) => c.name,
  );

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
        // `kind` is the (possibly farmer-overridden) persisted value the toggle edits;
        // `verdictKind` is what the data classified it as, so the shown reason stays
        // honest even after an override.
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
    <main className="min-h-[100svh]">
      <Nav variant="solid" />
      <section className="px-6 py-14 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center gap-2.5">
            <Spark className="text-accent size-5" />
            <span className="label-caps text-muted">{en.onboarding.index.eyebrow}</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-tight text-balance">
            {en.onboarding.confirm.title}
          </h1>
          <p className="text-muted mt-4 max-w-xl text-lg leading-relaxed text-pretty">
            {en.onboarding.confirm.intro(data.pumps.length)}
          </p>
          <div className="mt-10">
            <ConfirmClient data={data} />
          </div>
        </div>
      </section>
    </main>
  );
}
