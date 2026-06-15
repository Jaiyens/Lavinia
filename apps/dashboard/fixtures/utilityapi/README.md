# UtilityAPI fixtures

Sample UtilityAPI v2 responses that stand in for a live PG&E pull, so the app and the
normalizer (`src/lib/normalize/utilityapi.ts`) run and are tested with **zero external
calls**. UtilityAPI is the live connect path that replaced Bayou: unlike Bayou (one
account per login), one authorization form returns many authorizations, one per PG&E
account, so this sample is deliberately **multi-account**.

## Files

- **`meters.json`**, the `GET /api/v2/meters` body: five meters across **three** PG&E
  billing accounts (`3007654001`, `3007654002`, `3007654003`), four electric and one
  gas. Each `base` block carries the identity the standard Green Button feed drops:
  `service_identifier` (the SA ID), `meter_numbers`, `billing_account`, `service_class`,
  `service_tariff`, `service_address`. Importing it creates three `Account` rows, the
  multi-account path Bayou could not exercise.

The Green Button (ESPI XML) half of the pull **reuses
`fixtures/greenbutton/onboarding-sample.xml`** (Olsen Family Farms, four service IDs:
`7720450001`/`7720450002` AG-C pumps, `7720450003` AG-B pump, `7720450004` B-1 shop).
The `service_identifier`s in `meters.json` match those four, so the hybrid normalizer
enriches each Green Button meter with its account number + serial. The gas meter
(`7720450090`) is **JSON-only** (no XML), so it exercises the gas-carry path: it is
carried by the normalizer but never persisted as a Pump (the engine is electric-only).

## Mapping (UtilityAPI -> NormalizedMeter)

- `base.service_identifier` -> `serviceId` (stable SA ID, the upsert + reconcile key)
- `base.meter_numbers[0]` -> `meterSerial` (physical meter; churns on swap)
- `base.billing_account` -> `accountNumber` (resolved to a first-class `Account`)
- `base.service_class` -> `fuel` ("gas" if it names gas, else "electric")
- `base.service_tariff` -> `tariff` (fallback; the Green Button `tariffProfile` wins)
- `base.service_address` -> `address` (fallback; the Green Button address wins)
- intervals + billing summaries come from the Green Button XML via `normalizeEspi`

## Live path

With `UTILITYAPI_TOKEN` set, `fetchUtilityApi` (`src/lib/onboarding/source.ts`) pulls
the real `/meters` body and a Green Button export per meter instead of these fixtures;
the normalizer and importer are identical either way. The one detail to smoke-test on a
real account is the per-meter Green Button export URL (see the TODO in
`src/lib/utilityapi/client.ts`).
