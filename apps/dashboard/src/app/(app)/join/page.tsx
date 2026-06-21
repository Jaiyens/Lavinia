import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { en } from "@/copy/en";
import { ForkShell } from "../_components/fork-shell";
import { JoinForm } from "./join-form";

// Request-to-join entry (Phase 2). A signed-in user enters the join code a teammate gave them and
// asks to join; an admin approves before they see anything. Lives under (app) (auth-gated) but
// OUTSIDE (app)/(dashboard), like /start and /onboarding, so the dashboard's no-farm redirect does
// not bounce a farm-less user who belongs here. The "Create vs Join" fork at /start links here.
export const dynamic = "force-dynamic";

export default function JoinPage() {
  const t = en.join;
  return (
    <ForkShell maxWidth="max-w-md">
      <div className="flex flex-col gap-7">
        <Link
          href="/start"
          className="inline-flex min-h-[44px] items-center gap-2 type-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <ArrowLeft size={16} aria-hidden />
          {t.back}
        </Link>
        <div className="flex flex-col gap-2">
          <span className="type-label-caps text-on-surface-variant">{en.start.eyebrow}</span>
          <h1 className="type-display-lg">{t.title}</h1>
          <p className="type-body-md text-on-surface-variant">{t.lede}</p>
        </div>
        <JoinForm />
      </div>
    </ForkShell>
  );
}
