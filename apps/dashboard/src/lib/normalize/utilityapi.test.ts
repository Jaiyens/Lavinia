import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeEspi } from "./espi";
import {
  countUtilityApiMeters,
  normalizeUtilityApi,
  type UtilityApiResponses,
} from "./utilityapi";

// Unit test for the UtilityAPI hybrid normalizer: it runs the proven ESPI parser over
// the Green Button XML and enriches each meter's account number + serial from the native
// /meters JSON, then carries JSON-only meters (the gas meter) with empty usage. Built
// against the committed multi-account sample (fixtures/utilityapi/meters.json reusing the
// onboarding Green Button XML), so it exercises the 3-account, 4-electric + 1-gas case.

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../fixtures/${rel}`, import.meta.url)), "utf8");
}

const metersJson: unknown = JSON.parse(fixture("utilityapi/meters.json"));
const greenButtonXml = fixture("greenbutton/onboarding-sample.xml");
const pull: UtilityApiResponses = { meters: metersJson, greenButtonXml };

describe("normalizeUtilityApi, committed multi-account sample", () => {
  const meters = normalizeUtilityApi(pull);
  const byId = new Map(meters.map((m) => [m.serviceId, m]));

  it("returns one meter per /meters row (four electric, one gas)", () => {
    expect(meters).toHaveLength(5);
    expect(meters.filter((m) => m.fuel === "electric")).toHaveLength(4);
    expect(meters.filter((m) => m.fuel === "gas")).toHaveLength(1);
  });

  it("enriches the Green Button meters with the account number + serial from JSON", () => {
    const m = byId.get("7720450001");
    expect(m?.accountNumber).toBe("3007654001"); // ESPI alone would leave this null
    expect(m?.meterSerial).toBe("1010100001");
    expect(m?.fuel).toBe("electric");
    expect(m?.intervals.length).toBeGreaterThan(0);
    expect(m?.summaries).toHaveLength(1);
  });

  it("spreads meters across their real billing accounts (multi-account)", () => {
    expect(byId.get("7720450001")?.accountNumber).toBe("3007654001");
    expect(byId.get("7720450002")?.accountNumber).toBe("3007654002");
    expect(byId.get("7720450003")?.accountNumber).toBe("3007654002");
    expect(byId.get("7720450004")?.accountNumber).toBe("3007654003");
  });

  it("carries the JSON-only gas meter with identity but no usage", () => {
    const gas = byId.get("7720450090");
    expect(gas?.fuel).toBe("gas");
    expect(gas?.accountNumber).toBe("3007654003");
    expect(gas?.meterSerial).toBe("G010100090");
    expect(gas?.intervals).toHaveLength(0);
    expect(gas?.summaries).toHaveLength(0);
  });

  it("takes intervals + summaries straight from normalizeEspi (no new math)", () => {
    const espi = new Map(normalizeEspi(greenButtonXml).map((m) => [m.serviceId, m]));
    for (const id of ["7720450001", "7720450002", "7720450003", "7720450004"]) {
      const hybrid = byId.get(id);
      const base = espi.get(id);
      expect(base).toBeDefined();
      expect(hybrid?.intervals).toEqual(base?.intervals);
      expect(hybrid?.summaries).toEqual(base?.summaries);
      // The Green Button tariff (tariffProfile) wins over the JSON fallback.
      expect(hybrid?.tariff).toBe(base?.tariff);
    }
  });
});

describe("countUtilityApiMeters, off the native JSON alone (the reveal path)", () => {
  it("counts distinct accounts and meters by fuel before the XML is fetched", () => {
    expect(countUtilityApiMeters(metersJson)).toEqual({
      accounts: 3,
      electricMeters: 4,
      gasMeters: 1,
    });
  });
});
