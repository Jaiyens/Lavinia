import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Spark } from "@/components/spark";
import { en } from "@/copy/en";
import { PendingPoller } from "../_components/pending-poller";

export const metadata: Metadata = {
  title: "Connecting · Pump Timing · Terra",
};

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  const c = en.onboarding.pending;

  return (
    <main className="min-h-[100svh]">
      <Nav variant="solid" />
      <section className="px-6 py-14 lg:px-10">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center gap-2.5">
            <Spark className="text-accent size-5" />
            <span className="label-caps text-muted">{c.eyebrow}</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-tight text-balance">
            {c.title}
          </h1>
          <p className="text-muted mt-4 max-w-xl text-lg leading-relaxed text-pretty">{c.intro}</p>
          <div className="mt-10">
            <PendingPoller farmId={farmId} />
          </div>
          <div className="mt-6">
            <Link
              href="/dashboard/pump-timing/onboarding"
              className="label-caps text-muted hover:text-foreground transition-colors"
            >
              {c.startOver}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
