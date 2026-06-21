import { MetersBoard } from "@/app/(app)/_components/meters/meters-board";
import { representativeFeed } from "@/lib/meters/generate";

// The public Tour's Meters tab: the same per-meter demand-risk board the signed-in app shows at
// /meters, on the representative feed (no real grower data, safe under the public tour shell).
// SERVER component: it pulls the feed (rate card read server-side) and hands the resolved
// snapshots to the client board. The demo shell (rail, banner, Almond) comes from tour/layout.tsx.
export const dynamic = "force-dynamic";

export default function TourMetersPage() {
  const now = new Date();
  const feed = representativeFeed(now).load();
  return <MetersBoard feed={feed} now={now.toISOString()} />;
}
