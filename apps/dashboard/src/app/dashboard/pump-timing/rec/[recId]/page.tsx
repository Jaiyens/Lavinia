import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";
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
  const data = await loadRecDetail(prisma, recId);
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
