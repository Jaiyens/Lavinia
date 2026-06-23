import { ParcelsGis } from "@/app/(app)/_components/parcels-gis/parcels-gis";
import { loadBatthFarm } from "@/lib/parcel/farm/seed";

// The public Tour's Parcels tab: the same GIS land-mapping surface as the signed-in app, beside the
// global rail. The farmer's blocks come from the committed Batth fixture (public records only); every
// other parcel streams live from the free public county layers. Identical look to the product.
export const dynamic = "force-dynamic";

function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export default function TourParcelsPage() {
  const today = todayPacific();
  const farm = loadBatthFarm(today);
  return <ParcelsGis myFarm={farm} year={Number(today.slice(0, 4))} />;
}
