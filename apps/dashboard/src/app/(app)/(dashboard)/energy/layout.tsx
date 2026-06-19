import type { ReactNode } from "react";
import { EnergySubnav } from "../../_components/energy-subnav";

// Sub-tab shell for the Energy agent: a strip that switches between the meter dashboard (/energy)
// and the public-records Parcel lookup (/energy/parcel). Both routes render below it, so the tab
// strip is shared chrome rather than duplicated per page.
export default function EnergyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EnergySubnav />
      {children}
    </>
  );
}
