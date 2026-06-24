"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  ChevronDown,
  Download,
  FileText,
  Mic,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
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
      <div className="flex items-center gap-2 text-xs font-medium text-on-surface">
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
        className="min-w-0 max-w-full overflow-hidden text-sm text-pretty [overflow-wrap:anywhere] [&_[data-streamdown='code-block']]:max-w-full [&_[data-streamdown='code-block']]:overflow-x-auto [&_[data-streamdown='code-block']]:bg-surface-container-low [&_[data-streamdown='code-block']]:text-on-surface [&_[data-streamdown='inline-code']]:bg-surface-container [&_[data-streamdown='table-wrapper']]:max-w-full [&_[data-streamdown='table-wrapper']]:overflow-x-auto [&_[data-streamdown='table-wrapper']]:bg-surface-container-low [&_pre]:max-w-full [&_pre]:overflow-x-auto"
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
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words text-xs text-on-surface-variant">
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
      <Collapsible defaultOpen={part.state !== "output-available"} className="w-full min-w-0 max-w-full overflow-hidden">
        <Card className="w-full min-w-0 max-w-full gap-0 overflow-hidden rounded-xl border-outline-variant bg-surface-container-low p-3 py-3 shadow-none">
          <CollapsibleTrigger className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 overflow-hidden text-left text-xs font-medium text-on-surface [&[data-state=open]>svg:last-child]:rotate-180">
            {part.type === "tool-bash" ? (
              <Terminal size={16} aria-hidden className="shrink-0" />
            ) : (
              <FileText size={16} aria-hidden className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{toolTitle(part)}</span>
            <Badge
              variant={part.state === "output-error" ? "destructive" : "secondary"}
              className="shrink-0 uppercase tracking-wide"
            >
              {part.state.replace("-", " ")}
            </Badge>
            <ChevronDown size={14} aria-hidden className="shrink-0" />
          </CollapsibleTrigger>
          <GeneratedFilesList files={generatedFiles} />
          <CollapsibleContent className="min-w-0 max-w-full overflow-hidden">
            {output ? (
              <div className="mt-3 h-72 w-full overflow-y-auto overflow-x-hidden rounded-lg bg-paper">
                <pre className="w-full whitespace-pre-wrap break-all p-3 text-[11px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere] [word-break:break-all]">
                  {output}
                </pre>
              </div>
            ) : null}
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }
  return null;
}

function MessageTurn({
  message,
  isStreaming,
  showRegenerate,
  onRegenerate,
}: {
  message: UIMessage;
  isStreaming: boolean;
  showRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="min-w-0 max-w-[85%] rounded-3xl rounded-br-md bg-surface-container-high px-4 py-2.5 text-sm text-on-surface">
          {message.parts.map((part, index) =>
            part.type === "text" ? (
              <MessagePart key={`${message.id}-${index}`} part={part} isUser isStreaming={false} />
            ) : null,
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {message.parts.map((part, index) => (
          <MessagePart key={`${message.id}-${index}`} part={part} isUser={false} isStreaming={isStreaming} />
        ))}
        {showRegenerate ? (
          <div className="flex">
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <RotateCcw size={13} aria-hidden />
              Regenerate
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ starters, onStarter }: { starters: readonly string[]; onStarter: (text: string) => void }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-2 text-center">
      <span aria-hidden className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles size={28} />
      </span>
      <h2 className="type-display-lg mt-5 text-on-surface">Ask about this farm</h2>
      <p className="text-sm mt-2 max-w-md text-on-surface-variant">
        Almond can inspect your meters, rates, and bills, then save notes you can download.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onStarter(starter)}
            className="rounded-full border border-outline-variant bg-surface-bright px-3.5 py-2 text-xs text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

type SpeechRecognitionResultLike = ArrayLike<ArrayLike<{ transcript: string }>>;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: SpeechRecognitionResultLike }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const subscribeNoop = () => () => {};
const isVoiceSupported = () => getSpeechRecognitionCtor() !== null;
const isVoiceSupportedOnServer = () => false;

// Optional voice dictation via the browser Speech Recognition API. Feature-detected
// (through useSyncExternalStore so it stays SSR-safe) so the mic only shows where it
// actually works (Chrome and friends) and the UI stays honest everywhere else.
function useVoiceInput(onTranscript: (text: string) => void) {
  const supported = useSyncExternalStore(subscribeNoop, isVoiceSupported, isVoiceSupportedOnServer);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onTranscript]);

  return { supported, listening, toggle };
}

function ComposerIconButton({
  label,
  onClick,
  disabled,
  active,
  filled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  filled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            filled
              ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
            active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Composer({
  input,
  setInput,
  onSubmit,
  busy,
  onStop,
  model,
  setModel,
  hasMessages,
  onNewChat,
}: {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  onStop: () => void;
  model: AlmondModelId;
  setModel: (value: AlmondModelId) => void;
  hasMessages: boolean;
  onNewChat: () => void;
}) {
  const appendTranscript = useCallback(
    (text: string) => setInput(input.trim() ? `${input.trim()} ${text}` : text),
    [input, setInput],
  );
  const voice = useVoiceInput(appendTranscript);
  const canSend = input.trim().length > 0 && !busy;

  return (
    <form onSubmit={onSubmit} className="px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-1.5 rounded-[1.75rem] border border-outline-variant bg-surface-bright px-2.5 py-2 shadow-[var(--shadow-soft)] transition-colors focus-within:border-outline">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={1}
            placeholder="Ask Almond about this farm"
            aria-label="Message Almond"
            className="max-h-44 min-h-9 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-on-surface shadow-none placeholder:text-on-surface-variant/60 focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="flex items-center gap-1">
            <ComposerIconButton label="New chat" onClick={onNewChat} disabled={!hasMessages} filled>
              <Plus size={18} aria-hidden />
            </ComposerIconButton>

            <div className="flex-1" />

            <Select value={model} onValueChange={(value) => setModel(value as AlmondModelId)} disabled={busy}>
              <SelectTrigger aria-label="Model" className="w-full max-w-48">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Model</SelectLabel>
                  {ALMOND_MODELS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {voice.supported ? (
              <ComposerIconButton
                label={voice.listening ? "Stop listening" : "Dictate"}
                onClick={voice.toggle}
                active={voice.listening}
              >
                <Mic size={18} aria-hidden />
              </ComposerIconButton>
            ) : null}

            {busy ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onStop}
                    aria-label="Stop Almond"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface transition-colors hover:bg-inverse-surface/90"
                  >
                    <Square size={15} aria-hidden className="fill-current" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Stop Almond</TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface transition-colors hover:bg-inverse-surface/90 disabled:bg-surface-container-high disabled:text-on-surface-variant"
              >
                <ArrowUp size={18} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
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
  const { messages, sendMessage, setMessages, status, stop, regenerate, error } = useChat<UIMessage>({
    transport,
    experimental_throttle: 80,
  });
  const busy = status === "submitted" || status === "streaming";
  const lastMessageId = messages.at(-1)?.id;
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const starters = [
    "What should I look at first?",
    "Find meters with the highest demand charges.",
    "Summarize open findings by dollars at stake.",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      await sendMessage({ text: trimmed }, { body: { model } });
    },
    [busy, model, sendMessage],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitText(input);
  }

  function onNewChat() {
    void stop();
    setMessages([]);
    setInput("");
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex h-full min-h-[480px] min-w-0 max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-[var(--shadow-soft)]",
          className,
        )}
      >
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles size={15} />
            </span>
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="type-title leading-none text-on-surface">Almond</p>
              <span className="hidden type-caption text-on-surface-variant sm:inline">Farm data agent</span>
            </div>
          </div>
          {header ? <div className="flex shrink-0 items-center gap-2">{header}</div> : null}
        </header>

        <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:!overflow-x-hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0">
          <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState starters={starters} onStarter={submitText} />
            ) : (
              <div className="flex w-full min-w-0 max-w-full flex-col gap-6 overflow-hidden">
                {messages.map((message) => (
                  <MessageTurn
                    key={message.id}
                    message={message}
                    isStreaming={busy && message.role === "assistant" && message.id === lastMessageId}
                    showRegenerate={!busy && message.role === "assistant" && message.id === lastMessageId}
                    onRegenerate={() => void regenerate({ body: { model } })}
                  />
                ))}
                <div ref={bottomRef} aria-hidden />
              </div>
            )}
          </div>
        </ScrollArea>

        {error ? (
          <div className="mx-auto w-full max-w-3xl px-4">
            <Alert
              variant="destructive"
              className="rounded-[var(--radius-control)] border-risk/20 bg-risk/10 text-risk"
            >
              <AlertDescription className="flex items-center justify-between gap-2 text-risk">
                <span>Almond could not finish that request.</span>
                <Button type="button" variant="secondary" size="sm" onClick={() => void regenerate({ body: { model } })}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <Composer
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          busy={busy}
          onStop={() => void stop()}
          model={model}
          setModel={setModel}
          hasMessages={messages.length > 0}
          onNewChat={onNewChat}
        />
      </div>
    </TooltipProvider>
  );
}
