import { EnergyDashboard } from "@/app/(app)/_components/energy-dashboard";

// The public Tour's Energy tab: the same PG&E data hero the signed-in app shows at /energy,
// pinned to the demo farm (demoOnly) so no real grower data leaks. The demo shell (rail,
// findings, Almond, banner) comes from tour/layout.tsx.
export const dynamic = "force-dynamic";

export default function TourEnergyPage() {
  return <EnergyDashboard demoOnly />;
}
