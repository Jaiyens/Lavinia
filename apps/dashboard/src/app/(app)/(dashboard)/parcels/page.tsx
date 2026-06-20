import { ParcelView } from "@/app/(app)/_components/parcel-view";

// Parcels: the public-records parcel lookup by coordinate, a top-level agent (peer of Energy).
// Lives under (dashboard), so it is auth + farm gated like the rest of the app; the lookup itself
// reads only free public county data. Dynamic because the lookup is request-time, never prerendered.
export const dynamic = "force-dynamic";

export default function ParcelsPage() {
  return <ParcelView />;
}
