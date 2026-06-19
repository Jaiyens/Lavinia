"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/cn";

/**
 * Renders Almond's answer as light markdown so the emphasis the model writes actually shows —
 * **bold** becomes bold, lists become lists, a $13,645 stays a clean figure — instead of leaking
 * raw asterisks into the chat (the grower's #1 complaint). Deliberately MINIMAL: bold/italic, bullet
 * and numbered lists, links, inline code, and small GFM tables, all styled into Terra's palette and
 * the chat's `type-body-md` scale. No heading hero, no code-block syntax highlighting, no math — a
 * farm assistant answers in plain prose, not docs (so we skip streamdown's shiki/katex weight).
 *
 * `remark-breaks` makes a single newline a line break, so multi-line answers read the way they do in
 * Claude/Notion rather than collapsing into one run-on paragraph. Safe by default: react-markdown
 * never renders raw HTML (no rehype-raw plugin), so a model that emits an HTML tag shows it as text.
 *
 * Memoized on the text so the markdown AST is only re-parsed when the streamed string actually grows,
 * not on every unrelated chat re-render.
 */
export const AlmondMarkdown = memo(function AlmondMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("text-on-surface", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-on-surface">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="marker:text-on-surface-variant">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-container px-1 py-0.5 type-caption tnum text-on-surface">
              {children}
            </code>
          ),
          // Headings are demoted to bold lead lines: Almond answers in chat prose, never a document.
          h1: ({ children }) => <p className="mt-2 font-semibold text-on-surface">{children}</p>,
          h2: ({ children }) => <p className="mt-2 font-semibold text-on-surface">{children}</p>,
          h3: ({ children }) => <p className="mt-2 font-semibold text-on-surface">{children}</p>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-left type-body-sm tnum">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-outline-variant px-2 py-1 font-semibold text-on-surface-variant">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-outline-variant px-2 py-1">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
