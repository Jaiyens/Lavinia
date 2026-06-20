import { ParcelsGis } from "@/app/(app)/_components/parcels-gis/parcels-gis";

// Parcels: the farmer's land as a full-screen GIS land-mapping surface. A full-bleed dark
// satellite map (reusing the shared Esri-imagery basemap) under light floating panels: a left
// icon rail, a search pill, a listings panel, a map-tools toolbar, a right info/actions panel,
// and bottom map controls. All placeholder/hardcoded data, no backend. The view pins itself to
// fixed inset-0 and owns the whole viewport over the app shell.
export const dynamic = "force-dynamic";

export default function ParcelsPage() {
  return <ParcelsGis />;
}
