import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse";

describe("parseCsv", () => {
  it("parses a simple grid", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and keeps them as one cell", () => {
    expect(parseCsv('name,addr\nWell 1,"4624 W Nebraska Ave, Caruthers, CA"')).toEqual([
      ["name", "addr"],
      ["Well 1", "4624 W Nebraska Ave, Caruthers, CA"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('q\n"she said ""hi"""')).toEqual([["q"], ['she said "hi"']]);
  });

  it("supports newlines inside quotes", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
  });

  it("strips a leading BOM and tolerates CRLF", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops fully blank lines but keeps rows with any content", () => {
    expect(parseCsv("a,b\n\n1,2\n   \n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns an empty grid for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
