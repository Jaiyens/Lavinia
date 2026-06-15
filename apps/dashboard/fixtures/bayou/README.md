# Bayou fixtures (Speculoos sandbox)

Real, verbatim responses from the Bayou Energy v2 API, pulled against Bayou's
`speculoos_power` test utility for customer **271489** on 2026-06-04. All three
endpoints returned `200`. These are the stable, free Bayou-path fixtures: the
normalizer's `normalizeBayou()` mapper is tested against them so the app runs with
zero external calls. They are committed exactly as the API returned them (raw), so
there is no risk of a hand-built scaffold drifting from the true shape.

The eventual real target is Batth's own PG&E pull, which arrives via Green Button
(ESPI) and the `normalizeEspi()` mapper, not as a replacement for these files. See
`fixtures/greenbutton/` for the ESPI-side fixtures.

| file            | endpoint                                  | what it is                                         |
| --------------- | ----------------------------------------- | -------------------------------------------------- |
| `customer.json` | `GET /api/v2/customers/271489`            | the customer record: account numbers + meter list  |
| `bills.json`    | `GET /api/v2/customers/271489/bills`      | array of billing periods (per-meter breakdown)      |
| `intervals.json`| `GET /api/v2/customers/271489/intervals`  | 15-minute interval series, one block per meter       |

## Shape facts the mapper depends on

**Identity (the important one).** A meter's `id` is the **physical meter serial**
(e.g. `E4490291`), which churns when PG&E swaps the meter. The stable identity of the
service point, the SA ID, is `additional_attributes.service_number` (e.g.
`8003663029`). The normalizer therefore maps `serviceId <- service_number` (stable
key, reconciliation point against the spreadsheet) and `meterSerial <- id`
(churnable, stored but not keyed on).

**Hierarchy.** `customer.account_numbers[]` gives `account_numbers[].id` = the PG&E
account number, each owning a list of `meters[]`. That account number maps to
`Account.number`; legal-entity assignment (the Entity above Account) is not in the
Bayou feed and is filled in later from the grower's master spreadsheet.

**Commodity / fuel.** `meters[].type` is `"electric"` or `"gas"` (e.g. the gas meter
`G3048593`). This is the meter's commodity and maps to `fuel`. Gas meters are carried
through the normalized shape but are **not** promoted to a Pump and are not persisted
in v1 (the engine is electric-only). This is distinct from a pump's `powerSource`
(the motor's prime mover: electric vs diesel).

**Units.** Money is integer **cents** (`total_amount: 15900` = $159.00; the electric
amount is `delivery_charge + supply_charge`). Electricity is **watt-hours**
(`electricity_consumption: 600000` = 600 kWh). Intervals are 15 minutes
(`end - start = 900s`). The mapper normalizes money to USD and energy to kWh, the same
internal units the ESPI mapper produces.

**The intervals join.** `intervals.meters[]` identifies a meter only by `id`, it
carries no `type` and no `service_number`. To resolve fuel and the SA ID for an
interval block, the mapper joins it back to `customer.json` (or `bills.json`) by `id`.

**Speculoos is residential.** The `speculoos_power` test utility bills a residential
tariff ("Residential - Electric"/"Residential - Gas"), so there are **no demand-charge
line items** and `electricity_demand` is null in this sample. That is expected: the
Bayou-vs-ESPI equivalence test asserts a structural contract (same internal shape,
units, and identity mapping), not value-equality with the ag-rate ESPI fixtures.

## Refreshing these files

The pull uses a Bayou API key that lives only in `.env.local` (gitignored) and is
never committed. To refresh:

```sh
set -a; . ./.env.local; set +a
base="https://${BAYOU_DOMAIN}/api/v2/customers/271489"
curl -s -u "${BAYOU_API_KEY}:" "$base"            > fixtures/bayou/customer.json
curl -s -u "${BAYOU_API_KEY}:" "$base/bills"      > fixtures/bayou/bills.json
curl -s -u "${BAYOU_API_KEY}:" "$base/intervals"  > fixtures/bayou/intervals.json
```
