import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RevealMachine } from "../_components/reveal-machine";

export const metadata: Metadata = {
  title: "Connecting · Terra",
};

// Drives a live poll of the connection, so never prerender at build time.
export const dynamic = "force-dynamic";

export default async function RevealPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  return (
    <main className="grain min-h-[100svh]">
      <RevealMachine farmId={farmId} />
    </main>
  );
}
