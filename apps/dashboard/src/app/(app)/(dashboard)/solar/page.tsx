import { SolarDashboard } from "../../_components/solar-dashboard";

// The Solar agent: the grower's solar fleet on the same shell as Energy, scoped to the active
// farm by the (dashboard) layout. The rail distinguishes Solar from Energy; the data hero is the
// solar lens set (it ships empty-but-structured here, the lenses arrive in later stories).
export default function SolarPage() {
  return <SolarDashboard />;
}
