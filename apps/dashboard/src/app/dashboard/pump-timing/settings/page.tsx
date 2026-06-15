import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";
import { currentFarm } from "@/lib/onboarding/farm";
import { ConnectPaths } from "../onboarding/_components/connect-paths";

export const metadata: Metadata = {
  title: "Settings · Pump Timing · Terra",
  description: "Connections and data sources for your farm.",
};

// Reads the database (the current farm), so never prerender at build time.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = en.onboarding.settings;
  const farm = await currentFarm(prisma);

  return (
    <main className="min-h-[100svh]">
      <Nav variant="solid" />
      <section className="px-6 py-14 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-tight text-balance">
            {s.title}
          </h1>
          <p className="text-muted mt-4 max-w-xl text-lg leading-relaxed text-pretty">{s.intro}</p>

          {farm ? (
            <Link
              href={`/dashboard/pump-timing/onboarding/confirm?farm=${farm.id}`}
              className="border-border bg-card hover:bg-card-hover mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 transition-colors"
            >
              <span>
                <span className="font-display block text-xl">{s.editFarmTitle}</span>
                <span className="text-muted mt-1 block text-sm leading-relaxed text-pretty">
                  {s.editFarmNote}
                </span>
              </span>
              <span className="label-caps text-muted shrink-0">
                {s.editFarmCta} <span aria-hidden>→</span>
              </span>
            </Link>
          ) : null}

          <div className="mt-10">
            <ConnectPaths />
          </div>

          <div className="border-border mt-12 border-t pt-6">
            <Link
              href="/dashboard/pump-timing"
              className="label-caps text-muted hover:text-foreground transition-colors"
            >
              <span aria-hidden>←</span> {s.back}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
