import { SolarDashboard } from "@/app/(app)/_components/solar-dashboard";

// The public Tour's Solar tab: the same solar data hero the signed-in app shows at /solar,
// pinned to the demo farm (demoOnly) so no real grower data leaks. The demo shell (rail,
// findings, Almond, banner) comes from tour/layout.tsx.
export const dynamic = "force-dynamic";

export default function TourSolarPage() {
  return <SolarDashboard demoOnly />;
}
