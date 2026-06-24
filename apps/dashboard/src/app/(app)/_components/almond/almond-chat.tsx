"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChevronDown, Download, FileText, RotateCcw, Send, Square, Terminal } from "lucide-react";
import { Streamdown } from "streamdown";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
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
type GeneratedFile = {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
};
type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };

const STREAMDOWN_CONTROLS = {
  code: { copy: true, download: false },
  table: { copy: true, download: false, fullscreen: false },
  mermaid: false,
} as const;

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

const MIME_TYPES: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  jsonl: "application/x-ndjson",
  md: "text/markdown",
  txt: "text/plain",
  tsv: "text/tab-separated-values",
  xml: "application/xml",
  html: "text/html",
  pdf: "application/pdf",
  png: "image/png",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/typescript",
  sh: "text/x-shellscript",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  yaml: "text/yaml",
  yml: "text/yaml",
  zip: "application/zip",
};

function filenameFromPath(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function mimeForPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function isGeneratedFile(value: unknown): value is GeneratedFile {
  return (
    isObject(value) &&
    typeof value.path === "string" &&
    typeof value.filename === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.size === "number" &&
    (value.encoding === "utf8" || value.encoding === "base64") &&
    typeof value.content === "string"
  );
}

function generatedFilesFromOutput(output: unknown): GeneratedFile[] {
  if (!isObject(output) || !Array.isArray(output.generatedFiles)) return [];
  return output.generatedFiles.filter(isGeneratedFile);
}

function bytesFromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function downloadBlob(content: string | ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadGeneratedFile(file: GeneratedFile) {
  downloadBlob(
    file.encoding === "base64" ? bytesFromBase64(file.content) : file.content,
    file.filename,
    file.mimeType,
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function GeneratedFilesList({ files }: { files: GeneratedFile[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <Button
          key={`${file.path}:${file.size}`}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => downloadGeneratedFile(file)}
          className="h-auto min-w-0 max-w-full justify-start gap-2 py-1.5 text-primary"
        >
          <Download size={14} aria-hidden className="shrink-0" />
          <span className="min-w-0 truncate">Download {file.filename}</span>
          <span className="shrink-0 text-[11px] font-normal text-on-surface-variant">{formatBytes(file.size)}</span>
        </Button>
      ))}
    </div>
  );
}

function WriteFileCard({ part }: { part: ToolPart }) {
  const path = isObject(part.input) && typeof part.input.path === "string" ? part.input.path : "";
  const content = isObject(part.input) && typeof part.input.content === "string" ? part.input.content : null;
  const filename = filenameFromPath(path);
  const succeeded =
    part.state === "output-available" && isObject(part.output) && part.output.success === true;

  return (
    <Card className="min-w-0 gap-3 overflow-hidden rounded-xl border-outline-variant bg-surface-container-low p-3 py-3 shadow-none">
      <div className="flex items-center gap-2 type-body-sm font-medium text-on-surface">
        <FileText size={16} aria-hidden className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{path || "writeFile"}</span>
        <Badge variant="secondary" className="shrink-0 uppercase tracking-wide text-on-surface-variant">
          {succeeded ? "created" : part.state.replace("-", " ")}
        </Badge>
      </div>
      {succeeded && content !== null ? (
        <GeneratedFilesList
          files={[
            {
              path,
              filename,
              mimeType: mimeForPath(path),
              size: new Blob([content]).size,
              encoding: "utf8",
              content,
            },
          ]}
        />
      ) : null}
    </Card>
  );
}

function MessagePart({
  part,
  isUser,
  isStreaming,
}: {
  part: UIMessage["parts"][number];
  isUser: boolean;
  isStreaming: boolean;
}) {
  if (part.type === "text") {
    const text = (part as TextPart).text;
    if (isUser) {
      return <p className="whitespace-pre-wrap text-pretty">{text}</p>;
    }
    return (
      <Streamdown
        className="min-w-0 max-w-full overflow-hidden type-body-md text-pretty [overflow-wrap:anywhere] [&_[data-streamdown='code-block']]:max-w-full [&_[data-streamdown='code-block']]:overflow-x-auto [&_[data-streamdown='code-block']]:bg-surface-container-low [&_[data-streamdown='code-block']]:text-on-surface [&_[data-streamdown='inline-code']]:bg-surface-container [&_[data-streamdown='table-wrapper']]:max-w-full [&_[data-streamdown='table-wrapper']]:overflow-x-auto [&_[data-streamdown='table-wrapper']]:bg-surface-container-low [&_pre]:max-w-full [&_pre]:overflow-x-auto"
        controls={STREAMDOWN_CONTROLS}
        lineNumbers={false}
        mode={isStreaming ? "streaming" : "static"}
      >
        {text}
      </Streamdown>
    );
  }
  if (part.type === "reasoning") {
    return (
      <Collapsible className="min-w-0 max-w-full">
        <Card className="min-w-0 gap-0 overflow-hidden rounded-xl border-outline-variant bg-surface-container-low p-3 py-3 shadow-none">
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 text-left type-label-caps text-on-surface-variant [&[data-state=open]>svg]:rotate-180">
            <span className="min-w-0 flex-1">Reasoning</span>
            <ChevronDown size={14} aria-hidden className="shrink-0 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words type-body-sm text-on-surface-variant">
              {(part as ReasoningPart).text}
            </pre>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }
  if (isToolPart(part)) {
    if (part.type === "tool-writeFile") {
      return <WriteFileCard part={part} />;
    }

    const output = part.state === "output-available" || part.state === "output-error" ? toolOutput(part) : "";
    const generatedFiles = generatedFilesFromOutput(part.output);
    return (
      <Collapsible defaultOpen={part.state !== "output-available"} className="min-w-0 max-w-full">
        <Card className="min-w-0 gap-0 overflow-hidden rounded-xl border-outline-variant bg-surface-container-low p-3 py-3 shadow-none">
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 text-left type-body-sm font-medium text-on-surface [&[data-state=open]>svg:last-child]:rotate-180">
            {part.type === "tool-bash" ? <Terminal size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{toolTitle(part)}</span>
            <Badge
              variant={part.state === "output-error" ? "destructive" : "secondary"}
              className="shrink-0 uppercase tracking-wide"
            >
              {part.state.replace("-", " ")}
            </Badge>
            <ChevronDown size={14} aria-hidden />
          </CollapsibleTrigger>
          <GeneratedFilesList files={generatedFiles} />
          <CollapsibleContent>
            {output ? (
              <ScrollArea className="mt-3 h-72 max-w-full rounded-lg bg-paper">
                <pre className="max-w-full whitespace-pre-wrap break-words p-3 text-[12px] leading-relaxed text-on-surface-variant">
                  {output}
                </pre>
              </ScrollArea>
            ) : null}
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }
  return null;
}

function MessageBubble({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex min-w-0", isUser ? "justify-end" : "justify-start")}>
      <Card
        className={cn(
          "min-w-0 max-w-[92%] gap-3 overflow-hidden rounded-2xl px-4 py-3 type-body-md shadow-[var(--shadow-soft)]",
          isUser
            ? "bg-primary text-on-primary"
            : "border border-outline-variant bg-surface-container-lowest text-on-surface",
        )}
      >
        {message.parts.map((part, index) => (
          <MessagePart key={`${message.id}-${index}`} part={part} isUser={isUser} isStreaming={isStreaming} />
        ))}
      </Card>
    </article>
  );
}

function EmptyState({ starters, onStarter }: { starters: readonly string[]; onStarter: (text: string) => void }) {
  return (
    <Card className="mx-auto flex min-h-72 max-w-2xl items-center justify-center border-dashed border-outline-variant bg-surface-container-lowest px-4 py-8 text-center shadow-none">
      <CardContent className="px-0">
        <p className="type-label-caps text-primary">Almond</p>
        <h2 className="type-display-lg mt-1 text-on-surface">Ask about this farm</h2>
        <p className="type-body-md mt-2 max-w-md text-on-surface-variant">
          Almond can inspect the farm files with bash, read full files, and save notes in the sandbox.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {starters.map((starter) => (
            <Button
              key={starter}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onStarter(starter)}
              className="h-auto rounded-full px-3 py-2 font-medium"
            >
              {starter}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
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
  const lastMessageId = messages.at(-1)?.id;
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
    <TooltipProvider>
      <Card
        className={cn(
          "flex h-full min-h-[560px] min-w-0 max-w-full gap-0 overflow-hidden rounded-3xl border-outline-variant bg-surface-container-lowest py-0 text-on-surface shadow-[var(--shadow-soft)]",
          className,
        )}
      >
        <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <p className="type-label-caps text-primary">Almond</p>
            <CardTitle className="type-title text-on-surface">Farm data agent</CardTitle>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Select value={model} onValueChange={(value) => setModel(value as AlmondModelId)} disabled={busy}>
              <SelectTrigger
                aria-label="Model"
                size="sm"
                className="max-w-[11rem] border-outline-variant bg-surface-bright type-body-sm text-on-surface sm:max-w-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALMOND_MODELS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {header}
          </div>
        </CardHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:!overflow-x-hidden">
          <CardContent className="min-w-0 overflow-hidden px-4 py-5">
            {messages.length === 0 ? (
              <EmptyState starters={starters} onStarter={submitText} />
            ) : (
              <div className="flex min-w-0 flex-col gap-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isStreaming={busy && message.role === "assistant" && message.id === lastMessageId}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </ScrollArea>

        {error ? (
          <Alert
            variant="destructive"
            className="rounded-none border-x-0 border-b-0 border-outline-variant bg-risk/10 text-risk"
          >
            <AlertDescription className="flex items-center gap-2 text-risk">
              <span>Almond could not finish that request.</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void regenerate({ body: { model } })}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator className="bg-outline-variant" />
        <form onSubmit={onSubmit} className="bg-surface-container-low p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={2}
              placeholder="Ask Almond to inspect the farm files..."
              className="type-body-md min-h-11 flex-1 resize-none rounded-2xl border-outline-variant bg-surface-bright text-on-surface placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:ring-primary/20"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitText(input);
                }
              }}
            />
            {busy ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void stop()} aria-label="Stop Almond">
                    <Square size={15} aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop Almond</TooltipContent>
              </Tooltip>
            ) : messages.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void regenerate({ body: { model } })}
                    aria-label="Regenerate response"
                  >
                    <RotateCcw size={15} aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate response</TooltipContent>
              </Tooltip>
            ) : null}
            <Button type="submit" size="sm" disabled={busy || input.trim().length === 0}>
              <Send size={15} aria-hidden />
              Send
            </Button>
          </div>
        </form>
      </Card>
    </TooltipProvider>
  );
}
