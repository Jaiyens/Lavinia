import type { ReactNode } from "react";
import { EnergySubnav } from "@/app/(app)/_components/energy-subnav";

// The public Tour's Energy sub-tab shell: the same Energy | Parcel strip the signed-in app shows,
// pointed at the /tour/energy base path. The parcel lookup reads only public county records, so it
// is safe on the unauthenticated Tour (no grower data is involved).
export default function TourEnergyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EnergySubnav basePath="/tour/energy" />
      {children}
    </>
  );
}
