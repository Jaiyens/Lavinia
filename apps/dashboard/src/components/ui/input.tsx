import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** label-caps label shown above the field. Omit for an unlabeled control. */
  label?: string;
  ref?: Ref<HTMLInputElement>;
};

// DESIGN.md input. Minimalist: a label-caps label above, a hairline outline-variant box
// that goes to brand green on focus. The label is associated with the field for screen
// readers. Tokens only; no hardcoded color.
export function Input({ label, id, className, ref, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="type-label-caps text-on-surface-variant">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "type-body-md h-11 rounded-[var(--radius-control)] border border-outline-variant bg-surface-bright px-3 text-on-surface",
          "placeholder:text-on-surface-variant/60",
          "focus:border-primary focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}
