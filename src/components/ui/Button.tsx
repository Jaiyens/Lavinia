import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "press inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-grass-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60 disabled:pointer-events-none";

const sizes = "px-5 py-2.5";

const variants: Record<Variant, string> = {
  primary:
    "bg-grass-600 text-white shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_rgba(39,103,44,0.55)] hover:bg-grass-700",
  secondary:
    "bg-white text-ink ring-1 ring-line hover:ring-grass-300 hover:bg-grass-50",
  ghost: "text-ink-soft hover:text-ink hover:bg-grass-50",
};

export function LinkButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ComponentProps<"a"> & { variant?: Variant; children: ReactNode }) {
  return (
    <a className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props}>
      {children}
    </a>
  );
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
