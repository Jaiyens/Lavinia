import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy/en";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { DashboardChrome } from "../../_components/dashboard-chrome";
import { loadRecDetail } from "../../_components/rec-detail-data";
import { RecDetail } from "../../_components/rec-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finding · Terra",
  description: "The evidence behind a Terra finding.",
};

export default async function RecPage({ params }: { params: Promise<{ recId: string }> }) {
  const { recId } = await params;
  // Resolve only the caller's own farm, then scope the rec to it. The route is sign-in
  // gated; this second check stops one authed member reading another farm's finding by id.
  const userId = await sessionUserId();
  const resolved = await dashboardFarm(prisma, userId);
  if (!resolved) notFound();
  const data = await loadRecDetail(prisma, recId, resolved.farm.id);
  if (!data) notFound();

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome back={{ href: "/dashboard/pump-timing", label: en.dashboard.detail.backToFeed }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <RecDetail data={data} />
        </div>
      </section>
    </main>
  );
}
