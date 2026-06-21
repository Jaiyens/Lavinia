import { MetersBoard } from "@/app/(app)/_components/meters/meters-board";
import { representativeFeed } from "@/lib/meters/generate";

// The Meters agent: the per-meter demand-risk board. Separate from Energy (which is untouched).
// The (dashboard) layout already enforces auth + the farm requirement. This SERVER component
// pulls the representative feed (which reads the shared rate card via node:fs, server-only) and
// hands the already-resolved snapshots + the reference clock to the client board, so nothing
// fs-bound runs in the browser. The live Share My Data feed plugs into the same seam later
// (src/lib/meters/generate.ts -> a sibling implementing MetersFeed). force-dynamic so the server
// clock the freshness math reads is request-time, never a stale prerender.
export const dynamic = "force-dynamic";

export default function MetersPage() {
  const now = new Date();
  const feed = representativeFeed(now).load();
  return <MetersBoard feed={feed} now={now.toISOString()} />;
}
