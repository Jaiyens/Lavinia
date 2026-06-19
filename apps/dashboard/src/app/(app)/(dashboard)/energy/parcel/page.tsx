import { ParcelView } from "@/app/(app)/_components/parcel-view";

// Energy > Parcel: public-records parcel lookup by coordinate. Lives under (dashboard), so it is
// auth + farm gated like the rest of Energy; the lookup itself reads only free public county data
// (no grower data). Dynamic because the lookup is request-time, never prerendered.
export const dynamic = "force-dynamic";

export default function EnergyParcelPage() {
  return <ParcelView />;
}
