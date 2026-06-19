import { ParcelView } from "@/app/(app)/_components/parcel-view";

// The public Tour's Parcel tab: the same public-records parcel lookup, available without signing
// in. It reads only free county GIS data, so there is nothing farm-specific to gate.
export const dynamic = "force-dynamic";

export default function TourEnergyParcelPage() {
  return <ParcelView />;
}
