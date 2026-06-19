import { DotPattern } from "@/components/ui/dot-pattern";

// Site background: a faint Magic UI dot grid behind all content. Fixed, decorative
// (aria-hidden, pointer-events-none), tinted into the warm palette, and faded at the
// edges so it never competes with the data.
export function TopoBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <DotPattern
        width={24}
        height={24}
        cr={1.1}
        className="text-on-surface-variant/20 [mask-image:radial-gradient(ellipse_at_center,white,transparent_92%)]"
      />
    </div>
  );
}
