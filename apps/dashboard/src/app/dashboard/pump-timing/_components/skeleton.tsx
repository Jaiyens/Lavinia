// Honest loading state for the dashboard: a calm skeleton and a quiet spinner while the
// server reads the meter data. It never stands in fabricated numbers, only neutral
// placeholders, so a figure on screen is always real. The spinner respects
// prefers-reduced-motion (the keyframe is zeroed by the reduced-motion block in globals).

import { en } from "@/copy/en";
import { cn } from "@/lib/cn";

function Bar({ className }: { className: string }) {
  return <div className={cn("bg-line/70 rounded-md", className)} />;
}

export function DashboardLoading() {
  return (
    <main className="min-h-[100svh]" aria-busy="true">
      <header className="border-line bg-bg/85 sticky top-0 z-30 h-16 w-full border-b" />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-5xl">
          <Bar className="h-3 w-28" />
          <Bar className="mt-3 h-10 w-64" />
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <Bar className="h-20 w-full" />
            <Bar className="h-20 w-full" />
          </div>
          <div className="border-line mt-10 grid grid-cols-1 gap-5 border-t pt-6 sm:grid-cols-3">
            <Bar className="h-12 w-full" />
            <Bar className="h-12 w-full" />
            <Bar className="h-12 w-full" />
          </div>
          <div className="mt-12 flex items-center gap-3">
            <span
              className="border-green-deep/30 border-t-green-deep inline-block size-4 rounded-full border-2"
              style={{ animation: "terra-spin 0.8s linear infinite" }}
              aria-hidden
            />
            <span className="text-muted font-mono text-xs">{en.dashboard.state.loading}</span>
          </div>
          <div className="mt-5 space-y-4">
            <Bar className="h-40 w-full" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Bar className="h-28 w-full" />
              <Bar className="h-28 w-full" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
