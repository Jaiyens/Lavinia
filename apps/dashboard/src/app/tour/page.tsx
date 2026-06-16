import { HomeOverview } from "@/app/(app)/_components/home-overview";

// The public "Tour a sample" HOME (Story 5.3, AC1): the same farm-at-a-glance overview the
// signed-in app opens on, pinned to the demo farm (demoOnly) so no real grower data leaks
// (AC2). The full demo shell (rail + findings + Almond + the representative-data banner) is
// supplied by tour/layout.tsx; this is just the Home surface. Energy lives at /tour/energy.
export const dynamic = "force-dynamic";

export default function TourHomePage() {
  return <HomeOverview demoOnly />;
}
