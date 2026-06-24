"use client";

import { ArrowDown, Download } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type ConversationContextValue = {
  viewportRef: RefObject<HTMLDivElement | null>;
  atBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversation() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used inside <Conversation />");
  }
  return context;
}

export function Conversation({ className, children, ...props }: ComponentProps<"div">) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const updateAtBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setAtBottom(distanceFromBottom < 48);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const context = useMemo(
    () => ({ viewportRef, atBottom, scrollToBottom }),
    [atBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={context}>
      <div className={cn("relative flex min-h-0 min-w-0 flex-1 overflow-hidden", className)} {...props}>
        <div ref={viewportRef} onScroll={updateAtBottom} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </ConversationContext.Provider>
  );
}

export function ConversationContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { children: ReactNode }) {
  const { atBottom, scrollToBottom } = useConversation();

  useEffect(() => {
    if (atBottom) scrollToBottom("smooth");
  }, [atBottom, children, scrollToBottom]);

  return (
    <div className={cn("min-w-0", className)} {...props}>
      {children}
    </div>
  );
}

export function ConversationScrollButton({ className, ...props }: ComponentProps<typeof Button>) {
  const { atBottom, scrollToBottom } = useConversation();
  if (atBottom) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={cn("absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-e2", className)}
      onClick={() => scrollToBottom("smooth")}
      aria-label="Scroll to latest message"
      {...props}
    >
      <ArrowDown size={16} aria-hidden />
    </Button>
  );
}

export function ConversationEmptyState({
  className,
  icon,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  children,
  ...props
}: ComponentProps<"div"> & {
  icon?: ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col items-center justify-center text-center", className)} {...props}>
      {icon}
      <h2 className="type-display-lg mt-5 text-on-surface">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-on-surface-variant">{description}</p>
      {children}
    </div>
  );
}

export function messagesToMarkdown(
  messages: UIMessage[],
  formatMessage: (message: UIMessage, index: number) => string = (message) => {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return `## ${message.role}\n\n${text}`;
  },
) {
  return messages.map(formatMessage).join("\n\n");
}

export function ConversationDownload({
  messages,
  filename = "conversation.md",
  formatMessage,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => {
        const blob = new Blob([messagesToMarkdown(messages, formatMessage)], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }}
      {...props}
    >
      <Download size={14} aria-hidden />
      Download
    </Button>
  );
}
