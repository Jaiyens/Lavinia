import { CropDashboard } from "../../_components/crop-dashboard";

// The Crops agent (Phase 6): the crop production position — produced, committed, in pool, unsold by
// variety and crop year, the by-packer table, the year-over-year chart, and the reconciliation
// queue. The page is trivial; CropDashboard (a Server Component) resolves the farm and loads the
// position the same way the Energy tab does.
export default function CropsPage() {
  return <CropDashboard />;
}
