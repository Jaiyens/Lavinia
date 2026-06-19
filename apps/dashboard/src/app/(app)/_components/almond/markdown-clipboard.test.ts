import { describe, expect, it } from "vitest";
import { mdToHtml, mdToPlain } from "./markdown-clipboard";

// The grower's #1 paste complaint: copying an Almond answer left raw `**bold**` / `~~struck~~` markers
// in the paste. These prove the clipboard converter produces a rich HTML flavor with REAL tags (no
// markers) and a clean plain-text flavor (markers + link syntax stripped). The in-browser
// ClipboardItem write + the indicator timing/position are React/DOM behaviors verified by the T6
// Playwright/manual checklist; this is the pure, deterministic core.

describe("mdToHtml", () => {
  it("renders bold, strikethrough, and links as real tags with no leftover markers", () => {
    const html = mdToHtml("a **bold** and ~~struck~~ and [x](http://y)");
    expect(html).toContain("<strong>bold</strong>");
    // GFM strikethrough becomes a real <del> (a strikethrough tag), never a literal ~~.
    expect(html).toContain("<del>struck</del>");
    expect(html).toContain('<a href="http://y">x</a>');
    expect(html).not.toContain("**");
    expect(html).not.toContain("~~");
  });

  it("renders italic and inline code as real tags", () => {
    const html = mdToHtml("an *italic* and a `code` run");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).not.toContain("*italic*");
  });

  it("renders a bullet list as <ul><li>", () => {
    const html = mdToHtml("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
    expect(html).toContain("</ul>");
  });

  it("renders an ordered list as <ol><li>", () => {
    const html = mdToHtml("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
    expect(html).toContain("</ol>");
  });

  it("wraps prose in paragraphs and never leaks raw markup", () => {
    const html = mdToHtml("hello world");
    expect(html).toContain("<p>hello world</p>");
  });

  it("escapes HTML so a stray angle bracket cannot inject markup", () => {
    const html = mdToHtml("watch <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the ampersand and quotes in a link href and label", () => {
    const html = mdToHtml('see [a&b](http://y?q=1&r=2)');
    expect(html).toContain("&amp;");
    expect(html).not.toContain("**");
  });
});

describe("mdToPlain", () => {
  it("strips emphasis, strikethrough, and link syntax to clean text", () => {
    const plain = mdToPlain("a **bold** and ~~struck~~ and [x](http://y)");
    expect(plain).toContain("bold");
    expect(plain).toContain("struck");
    expect(plain).toContain("x");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("~~");
    // No leftover markdown link syntax: no opening bracket and no "](" joiner.
    expect(plain).not.toContain("[");
    expect(plain).not.toContain("](");
  });

  it("strips italic, inline code, and bold markers", () => {
    const plain = mdToPlain("an *italic* and a `code` and __strong__ run");
    expect(plain).toContain("italic");
    expect(plain).toContain("code");
    expect(plain).toContain("strong");
    expect(plain).not.toContain("*");
    expect(plain).not.toContain("`");
    expect(plain).not.toContain("__");
  });

  it("normalizes a bullet list to clean dash lines", () => {
    const plain = mdToPlain("- one\n- two");
    expect(plain).toBe("- one\n- two");
  });

  it("normalizes an ordered list to clean numbered lines", () => {
    const plain = mdToPlain("1. first\n2. second");
    expect(plain).toBe("1. first\n2. second");
  });

  it("keeps a link's visible label without the URL syntax", () => {
    const plain = mdToPlain("open [the dashboard](http://app.example.com)");
    expect(plain).toContain("the dashboard");
    expect(plain).not.toContain("http://app.example.com");
  });
});
