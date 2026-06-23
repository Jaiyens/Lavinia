"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system" | "data";
};

export function Message({ from, className, ...props }: MessageProps) {
  return (
    <div
      data-from={from}
      className={cn("group/message flex w-full", from === "user" && "justify-end", className)}
      {...props}
    />
  );
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

export function MessageResponse({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("whitespace-normal break-words", className)} {...props}>
      {children}
    </div>
  );
}
