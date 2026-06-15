// Shown while any dashboard view reads its data (home + every drill/detail page). The
// onboarding subtree overrides this with its own loading.tsx so its reveal flow keeps its
// look.
import { DashboardLoading } from "./_components/skeleton";

export default function Loading() {
  return <DashboardLoading />;
}
