# Green Button / ESPI fixtures

Sample PG&E Share My Data (Green Button / ESPI) XML lives here. It lets the app
and the parser (`src/lib/greenbutton/parse.ts`) run and be tested with **zero
external calls**. Green Button is a fixed, published XML standard, so these
samples exercise the real ESPI schema and the parser is unchanged when real
Self-Access data flows later.

## Files

- **`sandhu-multi-meter.xml`**, one account holding **three** service IDs
  (UsagePoints) that match the seeded sample farm: Home Ranch Well `8590312001`
  (AG-C), North Well `8590312002` (AG-C), River Well `8590312003` (AG-B). Each
  spans **two billing cycles**. Importing it updates those pumps in place.
- **`single-meter.xml`**, one service ID `8590312009` that is **not** on the
  farm (exercises the importer's create-a-new-Pump path), AG-B, two cycles, with
  one estimated reading (`ReadingQuality` 8).
- **`onboarding-sample.xml`**, the feed onboarding pulls as the stand-in for a live
  Share My Data pull (`src/lib/onboarding/source.ts`). A fresh account (Olsen Family
  Farms) with **four new service IDs** the seeded farm does not use, so they always
  import as new pumps: three big seasonal **AG** loads (`7720450001` AG-C ~110 kW,
  `7720450002` AG-C ~95 kW, `7720450003` AG-B ~72 kW) **plus one small flat commercial
  load** (`7720450004` B-1 ~6 kW). Auto-classification (`src/lib/energy/classify.ts`)
  separates the three pumps from the non-pump shop. One cycle each, closing 2026-06-12.

A separate `fixtures/onboarding/sample-bill.json` backs the bill-photo vision stub
(`src/lib/onboarding/vision.ts`), the fields a real vision model would read off a
photographed bill, for service ID `7720450050` (not in any feed, so the bill path
creates its own pump).

## ESPI mapping

- `UsagePoint` -> a Pump (service ID, taken from the `/UsagePoint/{id}` href)
- 15-minute `IntervalReading`s (inside `IntervalBlock`) -> usage
- `ReadingType` -> units for those readings (`uom` + `powerOfTenMultiplier`)
- `UsageSummary` -> tariff name + demand charge, one per billing cycle
- `ServiceLocation` -> rough address

Entries are linked by `<link rel="self|up|related">` hrefs under
`.../UsagePoint/{serviceId}/MeterReading/{id}/...` paths; the parser groups
resources by that path hierarchy.

## Encoding conventions (verified against the published ESPI schema)

- **Energy / units.** Interval `<value>` is energy in the ReadingType's `uom`
  (72 = Wh) scaled by `powerOfTenMultiplier`: `kWh = value * 10^mult / 1000`.
  Home Ranch and North use mult `0` (Wh); River uses mult `3` (kWh) so the
  scaler is exercised both ways.
- **Demand (kW).** Not stored directly. The highest 15-minute kW in a cycle
  (`kWh / 0.25h`) is derived by `src/lib/energy/demand.ts`; that max demand sets
  the demand charge.
- **Money.** `billLastPeriod` and LineItem `amount` are in **1/100,000 of the
  currency**: `201600000` = `$2,016.00`.
- **Demand charge.** Read from `costAdditionalDetailLastPeriod` LineItems whose
  `note` matches `/demand/i`. AG-C cycles carry both a *Maximum Demand Charge*
  and a *Summer Peak Demand Charge*; AG-B carries only the *Maximum Demand
  Charge* (AG-C adds the summer peak demand charge). The stored
  `demandChargeUsd` is their sum.
- **Tariff / rate schedule** comes from `<tariffProfile>` (e.g. `AG-C`).
- **Address** is flattened from `ServiceLocation/mainAddress`
  (`{number} {name}, {town}, {state} {postal}`).

## Abbreviated intervals

Each cycle carries a short, representative afternoon cluster of 15-minute readings
with **one engineered peak**, so tests can assert exact kW. A real cycle holds
~2,880 readings; the parser handles any count.

## Known values (asserted by `parse.test.ts` / `import.db.test.ts`)

| Service ID | Tariff | mult | Cycle A peak | Cycle A demand $ | Cycle B peak | Cycle B demand $ |
|---|---|---|---|---|---|---|
| 8590312001 | AG-C | 0 | 112 kW | 2016.00 + 1260.00 = 3276.00 | 138 kW | 2484.00 + 1725.00 = 4209.00 |
| 8590312002 | AG-C | 0 | 96 kW | 1728.00 + 1080.00 = 2808.00 | 104 kW | 1872.00 + 1170.00 = 3042.00 |
| 8590312003 | AG-B | 3 | 72 kW | 1224.00 | 80 kW | 1360.00 |
| 8590312009 | AG-B | 0 | 60 kW | 1020.00 | 68 kW | 1156.00 |
