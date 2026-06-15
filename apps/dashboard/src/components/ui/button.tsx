import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";
type Size = "default" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
};

// DESIGN.md button. Primary: solid green fill, on-primary text, generous horizontal
// padding. Secondary: 1px outline-variant hairline, charcoal text, no fill. One primary
// action per screen (a usage rule, not enforced here). Soft control radius; tokens only.
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary/90 disabled:bg-primary/40",
  secondary:
    "border border-outline-variant bg-transparent text-on-surface hover:bg-surface-container-low disabled:text-on-surface/40",
};

const SIZES: Record<Size, string> = {
  default: "h-11 px-6 text-[0.9375rem]", // >=44px tall tap target
  sm: "h-9 px-4 text-[0.875rem]",
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  type,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-colors",
        "focus-visible:outline-none disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
