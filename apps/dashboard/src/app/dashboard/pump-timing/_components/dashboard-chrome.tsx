// The quiet dashboard top bar. Receded so the content area takes precedence (paper
// background, one hairline border). Carries the wordmark, an optional back affordance for
// drill/detail pages, and the persistent "Representative data" badge whenever the screen
// is showing the seed rather than a live PG&E pull. Server component.

import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { en } from "@/copy/en";

export function RepresentativeBadge() {
  return (
    <span
      className="border-line-strong text-muted inline-flex items-center gap-2 rounded-full border bg-surface/70 px-3 py-1 font-mono text-[0.66rem] tracking-wide"
      title={en.dashboard.badgeNote}
    >
      <span className="bg-gold size-2 rounded-full" aria-hidden />
      {en.dashboard.badge}
    </span>
  );
}

export function DashboardChrome({
  dataKind,
  back,
}: {
  dataKind?: "real" | "representative";
  back?: { href: string; label: string };
}) {
  return (
    <header className="bg-bg/85 border-line sticky top-0 z-30 w-full border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5 lg:px-8">
        {back ? (
          <Link
            href={back.href}
            className="label-caps text-muted hover:text-foreground inline-flex items-center gap-2 transition-colors"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">{back.label}</span>
          </Link>
        ) : (
          <Link href="/dashboard/pump-timing" className="inline-flex items-center gap-2" aria-label="Terra dashboard">
            <LogoMark className="text-green-deep size-5" />
            <span className="font-display text-[1.3rem] leading-none">Terra</span>
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3">
          {dataKind === "representative" ? <RepresentativeBadge /> : null}
        </div>
      </div>
    </header>
  );
}
