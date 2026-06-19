import { AlmondPage } from "@/app/(app)/_components/almond/almond-page";

// The Almond tab on the public Tour (badged demo farm). Same surface as the signed-in /almond page;
// the tour layout's provider withholds attachments/export (demo is never an owner).
export default function TourAlmondRoute() {
  return <AlmondPage />;
}
