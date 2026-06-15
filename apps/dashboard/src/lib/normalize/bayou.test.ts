import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeBayou, type BayouResponses } from "./bayou";

function loadJson(name: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../fixtures/bayou/${name}`, import.meta.url)),
      "utf8",
    ),
  );
}

const pull: BayouResponses = {
  customer: loadJson("customer.json"),
  bills: loadJson("bills.json"),
  intervals: loadJson("intervals.json"),
};

describe("normalizeBayou, real Speculoos pull (customer 271489)", () => {
  const meters = normalizeBayou(pull);
  const electric = meters.find((m) => m.fuel === "electric");
  const gas = meters.find((m) => m.fuel === "gas");

  it("returns one normalized meter per account meter (one electric, one gas)", () => {
    expect(meters).toHaveLength(2);
    expect(electric).toBeDefined();
    expect(gas).toBeDefined();
  });

  it("keys identity on the SA ID, not the churnable meter serial", () => {
    // service_number is the stable service point; meters[].id is the meter serial.
    expect(electric?.serviceId).toBe("8003663029");
    expect(electric?.meterSerial).toBe("E4490291");
    expect(electric?.serviceId).not.toBe(electric?.meterSerial);
  });

  it("resolves the account number and tariff from the customer record", () => {
    expect(electric?.accountNumber).toBe("498154477303083");
    expect(electric?.tariff).toBe("Residential - Electric");
    expect(gas?.accountNumber).toBe("498154477303083");
  });

  it("builds the electric kWh interval series (Wh -> kWh, 15-min)", () => {
    expect(electric?.intervals).toHaveLength(960);
    for (const r of electric?.intervals ?? []) {
      expect(r.durationSec).toBe(900);
      expect(r.start).toMatch(/Z$/); // normalized to a full ISO instant
    }
    // Series is sorted ascending by start.
    const starts = (electric?.intervals ?? []).map((r) => r.start);
    expect([...starts].sort()).toEqual(starts);
  });

  it("carries the gas meter but gives it no kWh series", () => {
    expect(gas?.serviceId).toBe("3990978695");
    expect(gas?.meterSerial).toBe("G3048593");
    expect(gas?.intervals).toHaveLength(0);
  });

  it("normalizes money to USD (cents -> dollars), per commodity", () => {
    expect(electric?.summaries).toHaveLength(12);
    expect(gas?.summaries).toHaveLength(12);
    const lastElec = electric?.summaries.at(-1); // sorted ascending; newest is last
    expect(lastElec?.start).toBe("2026-05-01T00:00:00.000Z");
    expect(lastElec?.close).toBe("2026-05-31T00:00:00.000Z");
    expect(lastElec?.totalBillUsd).toBe(52); // electricity_amount 5200 cents
    expect(lastElec?.demandChargeUsd).toBeNull(); // residential: no demand charge
    expect(gas?.summaries.at(-1)?.totalBillUsd).toBe(80); // gas_amount 8000 cents
  });
});
