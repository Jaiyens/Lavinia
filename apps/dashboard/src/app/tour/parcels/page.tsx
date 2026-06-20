import { ParcelsWorkspace } from "@/app/(app)/_components/parcels-workspace";
import { loadRepresentativeFarm } from "@/lib/parcel/farm/seed";

// The public Tour's Parcels tab: the same map-first farm OS on the seeded representative operation,
// available without signing in (it reads only public records + free public layers).
export const dynamic = "force-dynamic";

export default function TourParcelsPage() {
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const farm = loadRepresentativeFarm(todayIso);
  return <ParcelsWorkspace farm={farm} year={Number(todayIso.slice(0, 4))} demo />;
}
