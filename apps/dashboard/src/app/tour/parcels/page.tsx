import { ParcelsGis } from "@/app/(app)/_components/parcels-gis/parcels-gis";

// The public Tour's Parcels tab: the same full-screen GIS land-mapping surface as the signed-in
// app, on placeholder data (it reads only public records + free public layers). Renders the same
// self-contained full-bleed map + floating panels, so the tour and the product look identical.
export const dynamic = "force-dynamic";

export default function TourParcelsPage() {
  return <ParcelsGis />;
}
