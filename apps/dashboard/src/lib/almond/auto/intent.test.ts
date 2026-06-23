import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { attachmentKindsFromMessages, classifyTurn } from "./intent";

// Pure, offline (zero DB, zero gateway): the deterministic turn classifier. The verb+noun file gate,
// the attachment hard-override, the navigation lens/verb gate, and the read fallthrough are all
// exercised on inline fixtures, so this runs in CI with no key.

/** A one-text-part user turn (the shape the classifier reads the latest text from). */
function userText(text: string): UIMessage {
  return { id: "u", role: "user", parts: [{ type: "text", text }] };
}

/** A user turn carrying a single file part of the given media type (a data URL is irrelevant here). */
function userFile(mediaType: string): UIMessage {
  return {
    id: "u-file",
    role: "user",
    parts: [{ type: "file", mediaType, url: "data:application/octet-stream;base64,AA==" }],
  };
}

describe("classifyTurn", () => {
  it("a file VERB + file NOUN -> a file build (a single from-scratch path)", () => {
    expect(classifyTurn("export my meters as a spreadsheet", [])).toEqual({ kind: "file" });
  });

  it("a custom-styling spreadsheet ask is still just a file build", () => {
    expect(classifyTurn("make me a custom one-off workbook", [])).toEqual({ kind: "file" });
  });

  it("a report VERB + report NOUN -> a file build", () => {
    expect(classifyTurn("make me a pdf report", [])).toEqual({ kind: "file" });
  });

  it("a file NOUN with NO file verb is a chatty read, not a build (the verb+noun gate)", () => {
    // "report" is a noun but there is no export/report VERB -> read, never a wasted file build.
    expect(classifyTurn("what does this report mean", [])).toEqual({ kind: "read" });
  });

  it("a navigation verb -> navigate", () => {
    expect(classifyTurn("open the map", [])).toEqual({ kind: "navigate" });
  });

  it("a plain data question -> read", () => {
    expect(classifyTurn("which meter costs the most", [])).toEqual({ kind: "read" });
  });

  it("an attachment is a HARD override, winning over any text signal", () => {
    expect(classifyTurn("anything at all", ["pdf"])).toEqual({ kind: "attachment" });
  });
});

describe("attachmentKindsFromMessages", () => {
  it("maps a PDF file part to 'pdf'", () => {
    expect(attachmentKindsFromMessages([userFile("application/pdf")])).toEqual(["pdf"]);
  });

  it("maps an image file part to 'image'", () => {
    expect(attachmentKindsFromMessages([userFile("image/png")])).toEqual(["image"]);
  });

  it("returns [] when the latest user turn has no file part", () => {
    expect(attachmentKindsFromMessages([userText("just a question")])).toEqual([]);
  });
});
