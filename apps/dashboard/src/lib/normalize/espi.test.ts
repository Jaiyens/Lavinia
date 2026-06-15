import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGreenButton } from "@/lib/greenbutton/parse";
import { normalizeEspi } from "./espi";

function loadFixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/greenbutton/${name}`, import.meta.url)),
    "utf8",
  );
}

function only<T>(items: T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error("expected at least one item");
  return head;
}

describe("normalizeEspi", () => {
  const xml = loadFixture("single-meter.xml");
  const meters = normalizeEspi(xml);

  it("widens each UsagePoint to the normalized shape with electric defaults", () => {
    expect(meters).toHaveLength(1);
    const m = only(meters);
    expect(m.serviceId).toBe("8590312009");
    expect(m.fuel).toBe("electric");
    // The standard ESPI feed carries neither a physical serial nor an account number.
    expect(m.meterSerial).toBeNull();
    expect(m.accountNumber).toBeNull();
    expect(m.tariff).toBe("AG-B");
  });

  it("passes the parsed usage through unchanged (intervals + summaries)", () => {
    const up = only(parseGreenButton(xml));
    const m = only(meters);
    expect(m.intervals).toEqual(up.intervals);
    expect(m.summaries).toEqual(up.summaries);
    expect(m.address).toEqual(up.address);
  });
});
