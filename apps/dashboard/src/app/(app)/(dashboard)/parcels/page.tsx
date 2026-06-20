import { ParcelsWorkspace } from "@/app/(app)/_components/parcels-workspace";
import { loadRepresentativeFarm } from "@/lib/parcel/farm/seed";

// Parcels: the farmer's land, map-first. Loads straight to the operation's blocks on a full-screen
// map (zero manual entry); the lat/long lookup is demoted to the "+ Add parcel" tool, and the
// coordinate/APN engine is the ingestion mechanism behind it. Under (dashboard) so it is auth +
// farm gated; the blocks are the seeded representative farm until a real farm is connected.
export const dynamic = "force-dynamic";

export default function ParcelsPage() {
  // The grower's Pacific calendar date (one timezone, like the rest of the dashboard), so relative
  // dates (lease expiry, overdue tasks) and tree-age coloring anchor correctly.
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const farm = loadRepresentativeFarm(todayIso);
  return <ParcelsWorkspace farm={farm} year={Number(todayIso.slice(0, 4))} demo={false} />;
}
