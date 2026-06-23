/**
 * Pure markdown -> {html, text} converter for the chat copy button.
 *
 * The grower's #1 paste complaint: copying an Almond answer dropped raw `**bold**` and `~~struck~~`
 * markers into Mail / Notes / a spreadsheet. The fix is to put BOTH a rich `text/html` flavor (real
 * `<strong>`, `<em>`, `<del>`, `<ul>/<ol><li>`, `<a>`) and a clean `text/plain` flavor (markers
 * stripped) on the clipboard, so a rich target pastes bold-as-bold and a plain target pastes clean
 * prose. This module is the deterministic, dependency-free, unit-testable core of that.
 *
 * Deliberately MINIMAL and matched to what `almond-markdown.tsx` actually renders: bold, italic,
 * strikethrough, inline code, links, bullet + numbered lists, and paragraphs. No tables, headings as
 * bold lead lines, no nested-list depth tracking, no raw-HTML passthrough. The model writes light
 * markdown; this mirrors that surface, nothing more. HTML is always escaped first so a model that
 * emits an angle bracket can never inject markup (the same safe-by-default stance as the renderer's
 * no-rehype-raw policy).
 */

/** Escape the five characters that are unsafe in HTML text/attribute context. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One run of inline markdown: a span of text with optional emphasis/code/link. */
type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "del"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

/**
 * Tokenize one line of inline markdown. Inline code is matched first and its content is treated as
 * literal (no nested emphasis), matching how renderers escape code spans. Bold (`**`/`__`) is matched
 * before italic (`*`/`_`) so `**x**` reads as one strong run, not two stray italics. Strikethrough is
 * GFM `~~`. Links are `[text](href)`. Anything left over is plain text.
 */
function tokenizeInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = line;

  // Ordered so the greediest / most specific markers win before their substrings.
  const matchers: Array<{ re: RegExp; make: (m: RegExpExecArray) => InlineToken }> = [
    { re: /^`([^`]+)`/, make: (m) => ({ kind: "code", value: m[1] ?? "" }) },
    {
      re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      make: (m) => ({ kind: "link", value: m[1] ?? "", href: m[2] ?? "" }),
    },
    { re: /^\*\*([^*]+)\*\*/, make: (m) => ({ kind: "strong", value: m[1] ?? "" }) },
    { re: /^__([^_]+)__/, make: (m) => ({ kind: "strong", value: m[1] ?? "" }) },
    { re: /^~~([^~]+)~~/, make: (m) => ({ kind: "del", value: m[1] ?? "" }) },
    { re: /^\*([^*]+)\*/, make: (m) => ({ kind: "em", value: m[1] ?? "" }) },
    { re: /^_([^_]+)_/, make: (m) => ({ kind: "em", value: m[1] ?? "" }) },
  ];

  // Buffer of plain characters consumed while no marker matched, flushed as a text token.
  let plain = "";
  const flush = () => {
    if (plain) {
      tokens.push({ kind: "text", value: plain });
      plain = "";
    }
  };

  while (rest.length > 0) {
    let matched = false;
    for (const { re, make } of matchers) {
      const m = re.exec(rest);
      if (m) {
        flush();
        tokens.push(make(m));
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += rest.charAt(0);
      rest = rest.slice(1);
    }
  }
  flush();
  return tokens;
}

function inlineToHtml(line: string): string {
  return tokenizeInline(line)
    .map((tok) => {
      switch (tok.kind) {
        case "text":
          return escapeHtml(tok.value);
        case "strong":
          return `<strong>${escapeHtml(tok.value)}</strong>`;
        case "em":
          return `<em>${escapeHtml(tok.value)}</em>`;
        case "del":
          return `<del>${escapeHtml(tok.value)}</del>`;
        case "code":
          return `<code>${escapeHtml(tok.value)}</code>`;
        case "link":
          return `<a href="${escapeHtml(tok.href)}">${escapeHtml(tok.value)}</a>`;
      }
    })
    .join("");
}

function inlineToPlain(line: string): string {
  // Every inline token reduces to its visible text in the plain flavor: a link drops to its label,
  // emphasis/code/strikethrough drop their markers, plain text is itself.
  return tokenizeInline(line)
    .map((tok) => tok.value)
    .join("");
}

/** A parsed block: a paragraph, or a bullet / ordered list with its item lines. */
type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Group raw markdown lines into paragraph and list blocks. Blank lines separate paragraphs. */
function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ kind: "p", lines: para });
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw;
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);

    if (bullet) {
      flushPara();
      const item = bullet[1] ?? "";
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
      continue;
    }
    if (ordered) {
      flushPara();
      const item = ordered[1] ?? "";
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item] });
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

/**
 * Convert light markdown to an HTML fragment with real emphasis/list/link tags and NO `**`/`~~`
 * markers. Suitable for the clipboard `text/html` flavor so a rich paste target shows bold as bold.
 */
export function mdToHtml(md: string): string {
  return parseBlocks(md)
    .map((block) => {
      if (block.kind === "ul") {
        const items = block.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (block.kind === "ol") {
        const items = block.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("");
        return `<ol>${items}</ol>`;
      }
      // A paragraph's internal newlines become <br> (the renderer uses remark-breaks for the same).
      const html = block.lines.map((l) => inlineToHtml(l)).join("<br>");
      return `<p>${html}</p>`;
    })
    .join("");
}

/**
 * Convert light markdown to clean plain text: emphasis/strikethrough/code markers stripped, links
 * reduced to their visible label (no `[text](href)` syntax), bullets normalized to "- ", ordered
 * items to "N. ". Suitable for the clipboard `text/plain` flavor and the writeText fallback.
 */
export function mdToPlain(md: string): string {
  return parseBlocks(md)
    .map((block) => {
      if (block.kind === "ul") {
        return block.items.map((i) => `- ${inlineToPlain(i)}`).join("\n");
      }
      if (block.kind === "ol") {
        return block.items.map((i, idx) => `${idx + 1}. ${inlineToPlain(i)}`).join("\n");
      }
      return block.lines.map((l) => inlineToPlain(l)).join("\n");
    })
    .join("\n\n")
    .trim();
}
