import type { SVGProps } from "react";

/**
 * Terra leaf mark, a single open leaf with a stem/vein,
 * echoing the wordmark from the deck.
 */
export function TerraMark({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* leaf body */}
      <path
        d="M39 9C39 9 14 8 9.5 24C6.7 33.9 13 39.5 13 39.5C13 39.5 20 24 39 9Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* central vein / stem */}
      <path
        d="M13 39.5C13 39.5 21 22 35 13.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* side vein */}
      <path
        d="M19.5 28.5C19.5 28.5 23.5 27 27.5 28.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function TerraWordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <TerraMark className="h-7 w-7 text-grass-600" />
      <span className="font-display text-2xl font-semibold tracking-tight text-ink">
        Terra
      </span>
    </span>
  );
}
