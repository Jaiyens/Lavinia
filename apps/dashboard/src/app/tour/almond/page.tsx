import { AlmondChat } from "@/app/(app)/_components/almond/almond-chat";

export const dynamic = "force-dynamic";

export default function TourAlmondPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl px-4 py-4 lg:px-8 lg:py-6">
      <AlmondChat className="flex-1" />
    </div>
  );
}
