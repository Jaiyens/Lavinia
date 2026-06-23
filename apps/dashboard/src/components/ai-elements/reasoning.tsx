"use client";

import type { DetailsHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type ReasoningProps = DetailsHTMLAttributes<HTMLDetailsElement> & {
  isStreaming?: boolean;
};

export function Reasoning({ className, isStreaming, ...props }: ReasoningProps) {
  return (
    <details
      data-streaming={isStreaming ? "" : undefined}
      className={cn("group/reasoning", className)}
      {...props}
    />
  );
}

export function ReasoningTrigger({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return (
    <summary
      className={cn(
        "inline-flex cursor-pointer list-none items-center gap-1",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
      {...props}
    >
      <ChevronRight
        size={12}
        className="transition-transform group-open/reasoning:rotate-90"
        aria-hidden
      />
      {children}
    </summary>
  );
}

export function ReasoningContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-1 whitespace-pre-wrap border-l-2 border-outline-variant pl-2", className)}
      {...props}
    />
  );
}
