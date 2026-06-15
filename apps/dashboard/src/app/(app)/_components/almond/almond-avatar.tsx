import { cn } from "@/lib/cn";

/**
 * Almond, the farm assistant's face: a warm almond shape with a center seam and a small
 * friendly look. Drawn inline (no asset) so it scales crisply and tints to the brand. Used in
 * the launcher and the panel header.
 */
export function AlmondAvatar({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Almond"
      className={cn("shrink-0", className)}
    >
      {/* Almond body: a teardrop ellipse. */}
      <path
        d="M16 2C9.5 2 5 9 5 17c0 7.2 4.9 13 11 13s11-5.8 11-13C27 9 22.5 2 16 2Z"
        fill="#E7C9A0"
        stroke="#7A5C36"
        strokeWidth="1.5"
      />
      {/* Center seam. */}
      <path d="M16 5c-2.6 4-2.6 18 0 22" stroke="#7A5C36" strokeWidth="1.3" strokeLinecap="round" />
      {/* Eyes. */}
      <circle cx="12.3" cy="16" r="1.4" fill="#1A1A17" />
      <circle cx="19.7" cy="16" r="1.4" fill="#1A1A17" />
      {/* Small smile. */}
      <path
        d="M13 20.5c1.8 1.6 4.2 1.6 6 0"
        stroke="#1A1A17"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
