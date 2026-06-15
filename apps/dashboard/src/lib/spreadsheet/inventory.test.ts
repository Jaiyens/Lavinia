import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveIsLegacy, deriveIsSolar, parseInventory, toPumpStatus } from "./inventory";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sampleCsv = readFileSync(
  resolve(repoRoot, "fixtures/spreadsheet/sample-batth.csv"),
  "utf8",
);

describe("parseInventory, real-world header spellings", () => {
  const { rows, mappedColumns, unmappedColumns } = parseInventory(sampleCsv);

  it("reads every meter row", () => {
    expect(rows).toHaveLength(6);
  });

  it("maps forgiving header names (Legal Entity, Acct #, SA ID, ...)", () => {
    expect(unmappedColumns).toEqual([]);
    expect(mappedColumns).toContain("Legal Entity");
    expect(mappedColumns).toContain("SA ID");
    expect(mappedColumns).toContain("Pump ID");
  });

  it("keeps the SA ID as the identity and reads the metered fields", () => {
    const well = rows[0]!;
    expect(well.serviceId).toBe("1007066742");
    expect(well.meterSerial).toBe("M-8841");
    expect(well.growerPumpId).toBe("P001");
    expect(well.name).toBe("Home Ranch Well 1");
    expect(well.entityName).toBe("Batth Farms LLC");
    expect(well.accountNumber).toBe("07302408880");
    expect(well.rateSchedule).toBe("AG-C");
    expect(well.serialCode).toBe("3-07");
    expect(well.blockName).toBe("Home Ranch");
  });

  it("coerces numbers, stripping thousands separators", () => {
    expect(rows[0]!.gpm).toBe(1200);
    expect(rows[0]!.horsepower).toBe(75);
    expect(rows[0]!.latitude).toBeCloseTo(36.539);
    expect(rows[0]!.longitude).toBeCloseTo(-119.83);
  });

  it("reads the solar / NEM meter and a month name as a true-up month", () => {
    const solar = rows[1]!;
    expect(solar.nemType).toBe("nem2");
    expect(solar.solarKw).toBe(840);
    expect(solar.trueUpMonth).toBe(4); // "April"
    expect(solar.isSolar).toBe(true); // derived from solarKw/nemType
    expect(solar.kind).toBe("non_pump");
  });

  it("reads Status as pump health (FR-17), distinct from kind", () => {
    // Status now carries GOOD/BAD/NEW WELL/OLD; the Kind column carries pump/non_pump.
    expect(rows.map((r) => r.status)).toEqual([
      "GOOD",
      "GOOD",
      "BAD",
      "GOOD",
      "NEW WELL",
      "OLD",
    ]);
    expect(rows.filter((r) => r.kind === "pump")).toHaveLength(4);
    expect(rows.filter((r) => r.kind === "non_pump")).toHaveLength(2);
  });

  it("flags legacy AG-4/AG-5 meters from the verbatim rate, leaving the rate as-read", () => {
    const legacy = rows[3]!; // Avenue 7 Well B, AG-5B
    expect(legacy.rateSchedule).toBe("AG-5B"); // stored verbatim, never rewritten
    expect(legacy.isLegacy).toBe(true);
    expect(rows[0]!.isLegacy).toBe(false); // AG-C is current
  });
});

describe("parseInventory, edge handling", () => {
  it("returns nothing for empty input", () => {
    expect(parseInventory("")).toEqual({ rows: [], mappedColumns: [], unmappedColumns: [] });
  });

  it("surfaces unrecognized columns instead of failing", () => {
    const { rows, unmappedColumns } = parseInventory("SA ID,Mystery\n123,foo");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.serviceId).toBe("123");
    expect(unmappedColumns).toEqual(["Mystery"]);
  });

  it("skips rows with no identifier at all", () => {
    const { rows } = parseInventory("SA ID,Rate\n,\n555,AG-C");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.serviceId).toBe("555");
  });

  it("defaults kind to pump and status to null when those columns are absent", () => {
    const { rows } = parseInventory("SA ID\n999");
    expect(rows[0]!.kind).toBe("pump");
    expect(rows[0]!.status).toBeNull();
  });
});

describe("toPumpStatus, coercion to the PumpStatus union", () => {
  it("maps recognized values case- and separator-insensitively", () => {
    expect(toPumpStatus("good")).toBe("GOOD");
    expect(toPumpStatus(" BAD ")).toBe("BAD");
    expect(toPumpStatus("new_well")).toBe("NEW WELL");
    expect(toPumpStatus("New Well")).toBe("NEW WELL");
    expect(toPumpStatus("OLD")).toBe("OLD");
  });

  it("returns null for unknown or empty status (never fabricates)", () => {
    expect(toPumpStatus("retired")).toBeNull();
    expect(toPumpStatus("")).toBeNull();
    expect(toPumpStatus(undefined)).toBeNull();
  });
});

describe("deriveIsLegacy, explicit column wins, else derived from the rate", () => {
  it("derives true from AG-4 / AG-5 family rates", () => {
    expect(deriveIsLegacy("AG-5B", undefined)).toBe(true);
    expect(deriveIsLegacy("AG4A", undefined)).toBe(true);
    expect(deriveIsLegacy("AG-C", undefined)).toBe(false);
    expect(deriveIsLegacy(null, undefined)).toBe(false);
  });

  it("honors an explicit Legacy column over the rate", () => {
    expect(deriveIsLegacy("AG-C", "yes")).toBe(true); // explicit overrides current rate
    expect(deriveIsLegacy("AG-5B", "no")).toBe(false); // explicit overrides legacy rate
  });
});

describe("deriveIsSolar, explicit column wins, else any solar/NEM signal", () => {
  it("is true when solarKw, nemType, or a NEMA code is present", () => {
    expect(deriveIsSolar(undefined, { solarKw: 840, nemType: null, nemaCode: null })).toBe(true);
    expect(deriveIsSolar(undefined, { solarKw: null, nemType: "nem2", nemaCode: null })).toBe(true);
    expect(deriveIsSolar(undefined, { solarKw: null, nemType: null, nemaCode: "AGG-A" })).toBe(true);
  });

  it("is false with no signal, and honors an explicit flag", () => {
    expect(deriveIsSolar(undefined, { solarKw: null, nemType: null, nemaCode: null })).toBe(false);
    expect(deriveIsSolar("no", { solarKw: 840, nemType: null, nemaCode: null })).toBe(false);
  });
});
