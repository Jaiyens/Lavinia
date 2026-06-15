import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Spark } from "@/components/spark";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Set up · Pump Timing · Terra",
};

export default async function OnboardingDonePage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: { pumps: true, blocks: true },
  });
  if (!farm) notFound();

  const pumps = farm.pumps.filter((p) => p.kind === "pump").length;
  const fields = farm.blocks.length;
  const d = en.onboarding.done;

  return (
    <main className="min-h-[100svh]">
      <Nav variant="solid" />
      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <Spark className="text-accent mx-auto mb-6 size-9" />
          <h1 className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-tight text-balance">
            {d.title(farm.name)}
          </h1>
          <p className="text-muted mt-5 text-lg leading-relaxed text-pretty">
            {d.summary(pumps, fields)}
          </p>
          <div className="mt-10">
            <Link
              href="/dashboard/pump-timing"
              className="label-caps bg-accent text-accent-ink hover:bg-accent/90 inline-flex items-center gap-2 rounded-full px-7 py-4 transition-colors"
            >
              {d.cta} <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
