import { AlmondChat } from "@/app/(app)/_components/almond/almond-chat";

export const dynamic = "force-dynamic";

export default function AlmondPage() {
  return (
    <div className="flex h-dvh min-h-0 min-w-0 -mb-32 lg:-mb-12">
      <AlmondChat className="flex-1" variant="full" />
    </div>
  );
}
