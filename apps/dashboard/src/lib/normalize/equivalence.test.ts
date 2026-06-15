// The contract test. The whole point of the normalizer is that every source maps
// into ONE internal shape, so the Bayou mapper and the ESPI mapper must produce the
// identical NormalizedMeter from equivalent inputs. The two real fixtures (Speculoos
// residential vs PG&E ag) can't be value-equal, so we feed each mapper a minimal
// input built from one shared spec (same service point, same one interval, same one
// billing cycle) and assert the source-independent contract matches exactly.
//
// meterSerial and accountNumber are excluded from the contract: the standard ESPI
// feed structurally cannot carry them (Bayou can), so they are asserted separately
// as the documented superset.

import { describe, expect, it } from "vitest";
import { normalizeBayou } from "./bayou";
import { normalizeEspi } from "./espi";
import type { NormalizedMeter } from "./types";

const SERVICE_ID = "EQ-SP-1"; // SA ID, shared by both encodings
const TARIFF = "AG-C";
const ADDRESS_PARTS = {
  number: "20",
  street: "West 34th Street",
  city: "New York",
  state: "NY",
  zip: "10118",
};
const KWH = 12;
const TOTAL_BILL_USD = 52;

const intervalStartEpoch = Date.parse("2026-05-01T00:00:00Z") / 1000;
const cycleStartEpoch = intervalStartEpoch;
const cycleDurationSec =
  (Date.parse("2026-06-01T00:00:00Z") - Date.parse("2026-05-01T00:00:00Z")) / 1000;

function only<T>(items: T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error("expected at least one item");
  return head;
}

/** The source-independent fields both feeds can populate. */
function contract(m: NormalizedMeter) {
  return {
    serviceId: m.serviceId,
    fuel: m.fuel,
    tariff: m.tariff,
    address: m.address,
    intervals: m.intervals,
    summaries: m.summaries,
  };
}

function buildEspiXml(): string {
  // ESPI native units: energy in Wh (uom 72, mult 0), money in 1/100,000 USD.
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:espi="http://naesb.org/espi">
  <entry>
    <link rel="self" href="/espi/1_1/resource/UsagePoint/${SERVICE_ID}"/>
    <content><espi:UsagePoint><espi:ServiceCategory><espi:kind>0</espi:kind></espi:ServiceCategory></espi:UsagePoint></content>
  </entry>
  <entry>
    <link rel="self" href="/espi/1_1/resource/UsagePoint/${SERVICE_ID}/ServiceLocation/01"/>
    <content><espi:ServiceLocation><espi:mainAddress>
      <espi:streetDetail><espi:number>${ADDRESS_PARTS.number}</espi:number><espi:name>${ADDRESS_PARTS.street}</espi:name></espi:streetDetail>
      <espi:townDetail><espi:name>${ADDRESS_PARTS.city}</espi:name><espi:stateOrProvince>${ADDRESS_PARTS.state}</espi:stateOrProvince></espi:townDetail>
      <espi:postalCode>${ADDRESS_PARTS.zip}</espi:postalCode>
    </espi:mainAddress></espi:ServiceLocation></content>
  </entry>
  <entry>
    <link rel="self" href="/espi/1_1/resource/UsagePoint/${SERVICE_ID}/MeterReading/01/ReadingType/01"/>
    <content><espi:ReadingType><espi:powerOfTenMultiplier>0</espi:powerOfTenMultiplier><espi:uom>72</espi:uom></espi:ReadingType></content>
  </entry>
  <entry>
    <link rel="self" href="/espi/1_1/resource/UsagePoint/${SERVICE_ID}/MeterReading/01/IntervalBlock/01"/>
    <content><espi:IntervalBlock>
      <espi:IntervalReading>
        <espi:timePeriod><espi:duration>900</espi:duration><espi:start>${intervalStartEpoch}</espi:start></espi:timePeriod>
        <espi:value>${KWH * 1000}</espi:value>
      </espi:IntervalReading>
    </espi:IntervalBlock></content>
  </entry>
  <entry>
    <link rel="self" href="/espi/1_1/resource/UsagePoint/${SERVICE_ID}/UsageSummary/01"/>
    <content><espi:UsageSummary>
      <espi:billingPeriod><espi:duration>${cycleDurationSec}</espi:duration><espi:start>${cycleStartEpoch}</espi:start></espi:billingPeriod>
      <espi:billLastPeriod>${TOTAL_BILL_USD * 100_000}</espi:billLastPeriod>
      <espi:tariffProfile>${TARIFF}</espi:tariffProfile>
    </espi:UsageSummary></content>
  </entry>
</feed>`;
}

function buildBayouPull() {
  // Bayou native units: energy in Wh, money in integer cents.
  const address = {
    line_1: `${ADDRESS_PARTS.number} ${ADDRESS_PARTS.street}`,
    line_2: null,
    city: ADDRESS_PARTS.city,
    state: ADDRESS_PARTS.state,
    postal_code: ADDRESS_PARTS.zip,
  };
  return {
    customer: {
      account_numbers: [
        {
          id: "EQ-ACCT-1",
          meters: [
            {
              id: "EQ-MTR-1",
              type: "electric",
              tariffs: [{ tariff: TARIFF }],
              address,
              additional_attributes: { service_number: SERVICE_ID },
            },
          ],
        },
      ],
    },
    bills: [
      {
        account_number: "EQ-ACCT-1",
        billing_period_from: "2026-05-01",
        billing_period_to: "2026-06-01",
        electricity_amount: TOTAL_BILL_USD * 100,
        meters: [
          {
            id: "EQ-MTR-1",
            type: "electric",
            tariff: TARIFF,
            billing_period_from: "2026-05-01",
            billing_period_to: "2026-06-01",
          },
        ],
      },
    ],
    intervals: {
      meters: [
        {
          id: "EQ-MTR-1",
          intervals: [
            {
              start: "2026-05-01T00:00:00Z",
              end: "2026-05-01T00:15:00Z",
              electricity_consumption: KWH * 1000,
            },
          ],
        },
      ],
    },
  };
}

describe("normalizer contract: Bayou and ESPI agree on equivalent inputs", () => {
  const espi = normalizeEspi(buildEspiXml());
  const bayou = normalizeBayou(buildBayouPull());

  it("each mapper yields exactly one meter", () => {
    expect(espi).toHaveLength(1);
    expect(bayou).toHaveLength(1);
  });

  it("produces the identical internal shape on the source-independent contract", () => {
    expect(contract(only(bayou))).toEqual(contract(only(espi)));
  });

  it("agrees on the normalized values explicitly", () => {
    const m = only(espi);
    expect(m.serviceId).toBe(SERVICE_ID);
    expect(m.fuel).toBe("electric");
    expect(m.tariff).toBe(TARIFF);
    expect(m.intervals).toEqual([
      { start: "2026-05-01T00:00:00.000Z", durationSec: 900, kWh: KWH },
    ]);
    expect(m.summaries).toEqual([
      {
        start: "2026-05-01T00:00:00.000Z",
        close: "2026-06-01T00:00:00.000Z",
        tariff: TARIFF,
        demandCharges: [],
        demandChargeUsd: null,
        totalBillUsd: TOTAL_BILL_USD,
      },
    ]);
  });

  it("documents the superset: Bayou carries serial + account, ESPI does not", () => {
    expect(only(espi).meterSerial).toBeNull();
    expect(only(espi).accountNumber).toBeNull();
    expect(only(bayou).meterSerial).toBe("EQ-MTR-1");
    expect(only(bayou).accountNumber).toBe("EQ-ACCT-1");
  });
});
