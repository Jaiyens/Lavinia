import { ParcelsGis } from "@/app/(app)/_components/parcels-gis/parcels-gis";
import { loadBatthFarm } from "@/lib/parcel/farm/seed";

// Parcels: the farmer's land as a GIS land-mapping surface, docked beside the global Terra sidebar.
// A full-bleed dark satellite map (shared Esri-imagery basemap) under light floating panels. The
// farmer's own blocks (Batth) are preloaded and drawn on top; every other parcel streams in live
// per viewport from the county engine. Server-loads the farm fixture and hands it to the client map.
export const dynamic = "force-dynamic";

function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export default function ParcelsPage() {
  const today = todayPacific();
  const farm = loadBatthFarm(today);
  return <ParcelsGis myFarm={farm} year={Number(today.slice(0, 4))} />;
}
