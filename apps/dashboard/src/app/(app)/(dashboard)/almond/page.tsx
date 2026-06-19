import { AlmondPage } from "../../_components/almond/almond-page";

// The dedicated Almond tab. The conversation lives in the dashboard layout's AlmondChatProvider
// (shared with the floating panel), so this page only renders the full-page surface.
export default function AlmondRoute() {
  return <AlmondPage />;
}
