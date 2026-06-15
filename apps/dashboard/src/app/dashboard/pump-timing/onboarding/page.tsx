import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { resumableBayouFarm } from "@/lib/onboarding/farm";
import { Hook } from "./_components/hook";

export const metadata: Metadata = {
  title: "Connect · Terra",
  description: "Connect your PG&E account to see what your power is actually costing you.",
};

// Reads the database (resume check), so never prerender at build time.
export const dynamic = "force-dynamic";

export default async function OnboardingConnectPage() {
  const resume = await resumableBayouFarm(prisma);
  return (
    <main className="grain min-h-[100svh]">
      <Hook resumeFarmId={resume?.farmId ?? null} />
    </main>
  );
}
