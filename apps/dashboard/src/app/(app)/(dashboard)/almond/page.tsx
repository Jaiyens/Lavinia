import { AlmondChat } from "@/app/(app)/_components/almond/almond-chat";

export const dynamic = "force-dynamic";

export default function AlmondPage() {
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] min-w-0">
      <AlmondChat className="flex-1" variant="full" />
    </div>
  );
}
