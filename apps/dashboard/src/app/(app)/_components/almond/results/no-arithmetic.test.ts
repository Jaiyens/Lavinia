// Track E result-component guard (mirrors Track C's import-guard style — reads source TEXT, no build,
// no DB). The gate's central law: a result component RENDERS tool-result data only — it never does
// arithmetic on a pound value (no + / - / * between figures) and never imports the pound-gate or the
// recompute. Every number is formatted by lbs() and produced upstream by a tool. If a later edit ever
// moves a calculation into a component, this test fails the build.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));

/** The result component sources (the .tsx files in this dir, excluding tests). */
function resultComponentFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => join(DIR, f));
}

function importsOf(text: string): string[] {
  const specifiers: string[] = [];
  const re = /\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec) specifiers.push(spec);
  }
  return specifiers;
}

// Forbidden modules: a component must not pull in anything that computes a pound.
const FORBIDDEN_IMPORTS = ["@/lib/crops/pound-gate", "@/lib/crops/positions", "@/lib/crops/views"];

// Arithmetic operators that would mean a component is computing a figure. We scan code lines only
// (a `+` inside a class string or a comment is fine), so we strip strings and comments first and
// then look for binary +, -, * between non-trivial operands. Allowance: nothing — the components
// format, never compute.
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/\/\/[^\n]*/g, " ") // line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, "''") // single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, "``"); // template literals
}

describe("crop result components do no arithmetic", () => {
  const files = resultComponentFiles();

  it("found the result component files (guard the guard)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.some((f) => f.endsWith("position-card.tsx"))).toBe(true);
  });

  it("no result component imports the pound-gate, the recompute, or the views", () => {
    for (const file of files) {
      const imports = importsOf(readFileSync(file, "utf8"));
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(imports, `${file} must not import ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("no result component contains pound arithmetic between identifiers/figures", () => {
    // Binary + - * with WHITESPACE on both sides and an identifier/number/closing-paren operand
    // (e.g. `a.pounds + b.pounds`, `produced - committed`, `n * rate`). The whitespace requirement
    // keeps hyphenated JSX attributes (`aria-hidden`) and increments (`i += 1`, `++`) out. Unary
    // minus is not whitespace-flanked on both sides. find-report's scorePct clamps a 0..1 STREAM
    // field with Math.min/round for display — not a pound computation — so it is exempted.
    const BINARY = /[\w)\]]\s[+\-*]\s[\w(]/;
    for (const file of files) {
      if (file.endsWith("find-report.tsx")) continue;
      const code = codeOnly(readFileSync(file, "utf8"));
      expect(BINARY.test(code), `${file} appears to do arithmetic`).toBe(false);
    }
  });
});
