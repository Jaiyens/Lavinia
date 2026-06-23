"use client";

import type {
  ButtonHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

export type PromptInputMessage = {
  text: string;
};

export type PromptInputProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit?: (message: PromptInputMessage) => void;
};

export function PromptInput({ className, onSubmit, ...props }: PromptInputProps) {
  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        onSubmit?.({ text: String(data.get("message") ?? "") });
      }}
      {...props}
    />
  );
}

export function PromptInputBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function PromptInputFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}

export function PromptInputTextarea({
  className,
  name = "message",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      name={name}
      className={cn("w-full resize-none bg-transparent outline-none", className)}
      {...props}
    />
  );
}

export type PromptInputSubmitProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  status?: "submitted" | "streaming" | "ready" | "error";
};

export function PromptInputSubmit({
  className,
  status,
  children,
  disabled,
  type = "submit",
  ...props
}: PromptInputSubmitProps) {
  const busy = status === "submitted" || status === "streaming";
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary",
        "transition-opacity disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children ?? <ArrowUp size={18} aria-hidden />}
    </button>
  );
}
