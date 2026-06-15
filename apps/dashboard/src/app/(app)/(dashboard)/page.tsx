import { HomeOverview } from "../_components/home-overview";

// Home is the farm-at-a-glance landing (the north star), DISTINCT from the Energy tool that
// lives at /energy. It opens into the agents rather than rendering the full meter dashboard,
// which is also what keeps switching to Home fast.
export default function HomePage() {
  return <HomeOverview />;
}
