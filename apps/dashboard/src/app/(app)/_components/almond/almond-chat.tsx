"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChevronDown, FileText, RotateCcw, Send, Square, Terminal } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ALMOND_MODELS, DEFAULT_ALMOND_MODEL, type AlmondModelId } from "@/lib/almond/models";

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";
type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};
type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolTitle(part: ToolPart): string {
  if (part.type === "tool-bash" && isObject(part.input) && typeof part.input.command === "string") {
    return part.input.command;
  }
  if (
    (part.type === "tool-readFile" || part.type === "tool-writeFile") &&
    isObject(part.input) &&
    typeof part.input.path === "string"
  ) {
    return part.input.path;
  }
  return part.type.replace("tool-", "");
}

function clipped(value: unknown): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 4_000 ? `${text.slice(0, 4_000)}\n... clipped` : text;
}

function toolOutput(part: ToolPart): string {
  if (part.state === "output-error") return part.errorText ?? "Tool failed.";
  if (part.type === "tool-bash" && isObject(part.output)) {
    const stdout = typeof part.output.stdout === "string" ? part.output.stdout : "";
    const stderr = typeof part.output.stderr === "string" ? part.output.stderr : "";
    const exitCode = typeof part.output.exitCode === "number" ? part.output.exitCode : null;
    return [`exit ${exitCode ?? "unknown"}`, stdout, stderr ? `stderr:\n${stderr}` : ""]
      .filter(Boolean)
      .join("\n\n");
  }
  if (part.type === "tool-readFile" && isObject(part.output)) {
    return typeof part.output.content === "string" ? part.output.content : clipped(part.output);
  }
  return clipped(part.output);
}

function isToolPart(part: UIMessage["parts"][number]): part is UIMessage["parts"][number] & ToolPart {
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap">{(part as TextPart).text}</p>;
  }
  if (part.type === "reasoning") {
    return (
      <details className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
        <summary className="cursor-pointer type-label-caps text-on-surface-variant">Reasoning</summary>
        <pre className="mt-2 whitespace-pre-wrap type-body-sm text-on-surface-variant">
          {(part as ReasoningPart).text}
        </pre>
      </details>
    );
  }
  if (isToolPart(part)) {
    const output = part.state === "output-available" || part.state === "output-error" ? toolOutput(part) : "";
    return (
      <details className="rounded-xl border border-outline-variant bg-surface-container-low p-3" open={part.state !== "output-available"}>
        <summary className="flex cursor-pointer list-none items-center gap-2 type-body-sm font-medium text-on-surface">
          {part.type === "tool-bash" ? <Terminal size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{toolTitle(part)}</span>
          <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[11px] uppercase tracking-wide text-on-surface-variant">
            {part.state.replace("-", " ")}
          </span>
          <ChevronDown size={14} aria-hidden />
        </summary>
        {output ? (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 text-[12px] leading-relaxed text-on-surface-variant">
            {output}
          </pre>
        ) : null}
      </details>
    );
  }
  return null;
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[92%] flex-col gap-3 rounded-2xl px-4 py-3 type-body-md shadow-[var(--shadow-soft)]",
          isUser
            ? "bg-primary text-on-primary"
            : "border border-outline-variant bg-surface-container-lowest text-on-surface",
        )}
      >
        {message.parts.map((part, index) => (
          <MessagePart key={`${message.id}-${index}`} part={part} />
        ))}
      </div>
    </article>
  );
}

function EmptyState({ starters, onStarter }: { starters: readonly string[]; onStarter: (text: string) => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center">
      <p className="type-label-caps text-primary">Almond</p>
      <h2 className="type-display-lg mt-1 text-on-surface">Ask about this farm</h2>
      <p className="type-body-md mt-2 max-w-md text-on-surface-variant">
        Almond can inspect the farm files with bash, read full files, and save notes in the sandbox.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onStarter(starter)}
            className="rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-2 type-body-sm text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AlmondChat({
  className,
  header,
}: {
  className?: string;
  header?: ReactNode;
}) {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AlmondModelId>(DEFAULT_ALMOND_MODEL);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/almond/chat" }), []);
  const { messages, sendMessage, status, stop, regenerate, error } = useChat<UIMessage>({
    transport,
    experimental_throttle: 80,
  });
  const busy = status === "submitted" || status === "streaming";
  const starters = [
    "What should I look at first?",
    "Find meters with the highest demand charges.",
    "Summarize open findings by dollars at stake.",
  ];

  async function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    await sendMessage({ text: trimmed }, { body: { model } });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitText(input);
  }

  return (
    <section
      className={cn(
        "flex h-full min-h-[560px] flex-col overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest text-on-surface shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
        <div>
          <p className="type-label-caps text-primary">Almond</p>
          <h1 className="type-title text-on-surface">Farm data agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="almond-model">
            Model
          </label>
          <select
            id="almond-model"
            value={model}
            onChange={(event) => setModel(event.target.value as AlmondModelId)}
            className="h-9 rounded-[var(--radius-control)] border border-outline-variant bg-surface-bright px-2 type-body-sm text-on-surface"
            disabled={busy}
          >
            {ALMOND_MODELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {header}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <EmptyState starters={starters} onStarter={submitText} />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="border-t border-outline-variant bg-risk/10 px-4 py-2 type-body-sm text-risk">
          Almond could not finish that request.
          <button
            type="button"
            className="ml-2 font-semibold underline-offset-4 hover:underline"
            onClick={() => void regenerate({ body: { model } })}
          >
            Retry
          </button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="border-t border-outline-variant bg-surface-container-low p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder="Ask Almond to inspect the farm files..."
            className="type-body-md min-h-11 flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-bright px-3 py-2 text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus-visible:outline-none"
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitText(input);
              }
            }}
          />
          {busy ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void stop()} aria-label="Stop Almond">
              <Square size={15} aria-hidden />
            </Button>
          ) : messages.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void regenerate({ body: { model } })}
              aria-label="Regenerate response"
            >
              <RotateCcw size={15} aria-hidden />
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={busy || input.trim().length === 0}>
            <Send size={15} aria-hidden />
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
