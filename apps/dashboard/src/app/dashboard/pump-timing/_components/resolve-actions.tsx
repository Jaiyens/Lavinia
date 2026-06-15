"use client";

// The one-tap responses on a recommendation detail. Each maps to a Recommendation status
// (done / dismissed / overridden) and, on success, returns the farmer to the feed. The
// primary action is honest about what it does in v1: it records the choice; the agent
// files the real change later (see the stub note in the detail).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { en } from "@/copy/en";
import type { RecStatus } from "@/lib/recommendations";
import { resolveRecommendation } from "../actions";

export function ResolveActions({ recId }: { recId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resolve(status: RecStatus) {
    startTransition(async () => {
      await resolveRecommendation(recId, status);
      router.push("/dashboard/pump-timing");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => resolve("done")}
        className="label-caps bg-green-deep hover:bg-green-hover rounded-full px-5 py-2.5 text-white transition-colors disabled:opacity-60"
      >
        {pending ? en.dashboard.feed.saving : en.dashboard.feed.done}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => resolve("dismissed")}
        className="label-caps border-line-strong text-foreground hover:bg-tint rounded-full border px-5 py-2.5 transition-colors disabled:opacity-60"
      >
        {en.dashboard.feed.notNow}
      </button>
    </div>
  );
}
