"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Conversation({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export function ConversationContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export function ConversationEmptyState({
  className,
  icon,
  title,
  description,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", className)} {...props}>
      {icon}
      <p className="type-title text-on-surface">{title}</p>
      {description ? <p className="type-body-md text-on-surface-variant">{description}</p> : null}
    </div>
  );
}

export function ConversationScrollButton({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn("sr-only", className)}
      onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
      {...props}
    />
  );
}
