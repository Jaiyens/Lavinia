# Huron Well 4 (PUMP 4) — metadata-only dossier

> Source: `normalized/by-meter/98964868.json` (primary), `normalized/inventory.json` row 83, `normalized/manifest.json` idx 82.
> **Billed = false.** This meter is NOT on the single billed account 4699664587-8. The per-meter record carries `billing: null`, `summaries: []`, `nem: null` — there is **no bill, no usage, and no NEM settlement in hand**, only inventory metadata. This is a LIGHT dossier by design.

---

## (a) IDENTITY

| Field | Value |
| --- | --- |
| Grower pump id | **Huron Well 4** |
| Descriptor | PUMP 4 |
| PG&E Service Agreement (SA) ID | **98964868** |
| Meter serial # | **1009970756** |
| Billing entity | **KANWARJIT BATTH & GAGANDIP BATTH** |
| PG&E account # | **0096005793-3** |
| Ranch | not recorded |
| Crop served | not recorded |
| Irrigation source | not recorded |
| Pump capacity (GPM) | not recorded |
| Horsepower | not recorded in the inventory |
| Status (grower flag) | not recorded |
| Installed / drilled | not recorded |
| Latitude / Longitude | **36.276569, -120.139782** |
| Inventory row | 83 |

This SA has **no pump id, crop, ranch, or GPM** recorded — it is most likely a non-pump or service/meter-only agreement, identifiable only by its SA ID, serial, account, and coordinates. Billing entity **KANWARJIT BATTH & GAGANDIP BATTH** on account **0096005793-3**.

---

## (b) RATE SCHEDULE — decoded

**Stored schedule: `AG5B`.** Family: **AG-5** (LEGACY).

- **Plain English.** Legacy AG-5, large size class (B). AG-5 is a retired time-of-use agricultural rate that predates today's AG-A/AG-B/AG-C lineup. The trailing B marks the large (>35 kW connected load) tier. AG-5 carries a summer peak-period demand charge ($/kW) on top of TOU energy and a customer charge.
- **Nearest alternative schedules.** AG-B2 / AG-C2 (current large ag schedules)
- **What the rate lever does here.** Legacy AG-5 is exactly the population the rate-optimization lever exists to re-examine. The lever maps AG5B to {family:'AG-5', sizeClass:'large', realTier:'large', legacy:true} (rate-lever.ts LABEL_TO_PLAN). But it can only quote a switch dollar after a back-test of the meter's OWN billed usage lands within the +/-5% band, which is impossible with no bill in hand.

---

## (c) SOLAR / NEM status + true-up

- **Solar flag:** no (solarFlag=false).
- **Array / group:** No solar group / no per-meter solar kW recorded.
- **NEM arrangement:** No solar flag and no NEM type recorded. Treat as a non-solar load until a bill or generation summary shows otherwise.
- **True-up month:** not recorded on this row.

This meter shows **no solar/NEM tag**, so it is treated as a straight load. If a bill later shows generation, this row would need updating.

---

## (d) WHAT DATA WOULD UNLOCK DOLLAR FINDINGS

**This meter has no bill in hand.** Every savings lever in `src/lib/energy` is a deterministic pure function (no AI), and each one **fails closed** with empty inputs — so today this meter yields **zero defensible dollars**. To change that:

1. **Get the bill.** Either the **account bill PDF for 0096005793-3** (AI vision extraction in `src/lib/extract` turns the PDF into the JSON the levers read) **or a UtilityAPI pull** for SA **98964868**. Either one populates `billing`, `summaries`, and (if solar) `nem`.
2. **Then the rate lever can run.** With billed cycles it can back-test the meter's own usage on the dated card and, only if it lands inside the +/-5% band, quote a legacy AG-5 -> current AG schedule switch dollar. Until then it is silent (or at most a qualitative 'legacy, review me' flag).
3. **For a trustworthy rate dollar, pull 15-minute interval kWh.** Bill summaries carry no interval kWh, and the AG-C<->AG-B deltas the engine can emit from summaries alone are **sign-ambiguous artifacts** — never quote them. Interval data is what makes the load-factor (and therefore the demand-vs-no-demand schedule choice) defensible.
4. **Bill audit needs >=3 same-season billed cycles** before it can flag an anomalous month; one cycle is never enough.

## (e) One-line summary

> "Huron Well 4 runs on **AG5B** under account 0096005793-3, but we hold **only inventory metadata for it** — no bill, usage, or solar settlement — so there are no dollar findings yet. Pull the 0096005793-3 bill PDF or a UtilityAPI feed for SA 98964868 (it is a legacy AG-5 meter worth a rate review) and the levers can run."
