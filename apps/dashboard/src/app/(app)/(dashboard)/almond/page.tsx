import { AlmondPage } from "../../_components/almond/almond-page";

// The dedicated Almond tab. The conversation lives in the dashboard layout's AlmondChatProvider
// (shared with the floating panel), so this page renders only the full-page surface. The landing is a
// minimalist, centered command center (greeting + composer + suggestions); no farm-stat rollups.
export default function AlmondRoute() {
  return <AlmondPage />;
}
