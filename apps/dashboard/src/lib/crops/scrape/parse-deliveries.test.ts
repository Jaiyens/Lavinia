import { describe, expect, it } from "vitest";
import { parseDeliveries, toIntPounds } from "./parse-deliveries";

const CTX = { hullerId: 7, huller: "Sierra Valley Holding", cropYear: 2025 };

describe("toIntPounds — forgiving of the portal's mixed encodings, never fabricating", () => {
  it("rounds numbers and parses numeric strings (stripping commas/units)", () => {
    expect(toIntPounds(631_000)).toBe(631_000);
    expect(toIntPounds(108_651.6)).toBe(108_652);
    expect(toIntPounds("109,000 lb")).toBe(109_000);
    expect(toIntPounds("48500")).toBe(48_500);
  });

  it("returns 0 for unparseable / missing weights (never a guess)", () => {
    expect(toIntPounds(null)).toBe(0);
    expect(toIntPounds(undefined)).toBe(0);
    expect(toIntPounds("n/a")).toBe(0);
    expect(toIntPounds(Number.NaN)).toBe(0);
  });
});

describe("parseDeliveries — getDeliveries.php payload -> typed rows", () => {
  it("maps every load to an integer-pound row tagged ALMOND_LOGIC, with huller/year context", () => {
    const payload = [
      {
        loadId: 5501,
        fieldTicketNumber: "FT-12",
        deliveryDate: "2025-09-14",
        field: "10",
        variety: "Nonpareil",
        gross: "631,000",
        tare: 12_000,
        net: "619000",
        mediaId: 42,
      },
    ];
    const rows = parseDeliveries(payload, CTX);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      hullerId: 7,
      huller: "Sierra Valley Holding",
      cropYear: 2025,
      loadId: "5501",
      fieldTicket: "FT-12",
      field: "10",
      variety: "Nonpareil",
      grossLb: 631_000,
      tareLb: 12_000,
      netLb: 619_000,
      deliveryDate: "2025-09-14",
      mediaId: "42",
      source: "ALMOND_LOGIC",
    });
  });

  it("defaults missing loadId/variety and nulls missing optional fields (never invents a name)", () => {
    const rows = parseDeliveries([{ net: 1000 }], CTX);
    expect(rows[0]).toMatchObject({
      loadId: "",
      variety: "Unknown",
      fieldTicket: null,
      field: null,
      deliveryDate: null,
      mediaId: null,
      grossLb: 0,
      tareLb: 0,
      netLb: 1000,
    });
  });

  it("returns [] on a non-array payload (error object / omitted response) without throwing", () => {
    expect(parseDeliveries({ error: "boom" }, CTX)).toEqual([]);
    expect(parseDeliveries(null, CTX)).toEqual([]);
    expect(parseDeliveries("nope", CTX)).toEqual([]);
  });

  it("skips non-object rows inside the array", () => {
    const rows = parseDeliveries([null, 5, { net: 200 }], CTX);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.netLb).toBe(200);
  });
});
