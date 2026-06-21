#!/usr/bin/env python3
"""Build the "UtilityAPI-pretty" unified dataset and split it for downstream agents.

Inputs (the two normalized extracts):
  normalized/inventory.json  - 183 meters, the master Excel inventory (identity, address,
                               lat/lng, tariff, NEM, gpm, crop, ranch, status, entity, solar).
  normalized/billing.json    - 46 billed SAs off account 4699664587-8 (cycles + NEM true-up).

Outputs:
  normalized/meters.json            - NormalizedMeter[] for ALL 183 (sibling `meta` block).
  normalized/manifest.json          - ordered [{idx, serviceId, pumpId, account, entity,
                                       ranch, billed}] for all 183 (idx 0..182).
  normalized/by-meter/<sid>.json    - per-meter inventory+billing merge (183 + 3 billed orphans).
  ../../fixtures/batth-real-meters.json - the engine-compatible 183-meter NormalizedMeter[]
                                       (preserves the prior shape analyze-batth-real.ts reads;
                                       billed meters carry the EXISTING fixture's tested meta).

Ground truth honored (do not contradict): solar arrays total 1,932 kW (840 + 1,092). The bill
account 4699664587-8 covers ~46 SAs; the inventory covers 183 meters / ~57 accounts / ~6 entities.
The $62,795.65 VINES 75HP (P031) true-up is a real zero-credit anomaly, recovery $0-$57k CONTINGENT
(never banked). Bill summaries carry no kWh, so intervals are empty everywhere and rate-opt no-ops.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NORM = os.path.join(HERE, "normalized")
FIXTURE = os.path.normpath(os.path.join(HERE, "..", "..", "fixtures", "batth-real-meters.json"))
BYMETER = os.path.join(NORM, "by-meter")

ACCOUNT = "4699664587-8"
FARM = "Batth Farms"
TIMEZONE = "America/Los_Angeles"


def load(p):
    with open(p) as f:
        return json.load(f)


def dump(p, obj):
    with open(p, "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def latest_non_trueup_cycle(bm):
    """The latest (by start) non-true-up billing cycle: the demo summary the engine reads."""
    cycles = [c for c in bm.get("cycles", []) if not c.get("isTrueUpCycle")]
    if not cycles:
        cycles = bm.get("cycles", [])
    if not cycles:
        return None
    return sorted(cycles, key=lambda c: c.get("start") or "")[-1]


def summary_from_cycle(c):
    """Map a billing.json cycle -> a NormalizedSummary (float USD)."""
    demand = c.get("demandChargeUsd_structured")
    demand_charges = []
    if demand is not None and demand != 0:
        demand_charges = [{"note": "Maximum Demand", "usd": demand}]
    return {
        "start": c.get("start"),
        "close": c.get("close"),
        "tariff": c.get("tariff"),
        "demandCharges": demand_charges,
        "demandChargeUsd": demand if demand is not None else None,
        "totalBillUsd": c.get("printedTotalUsd"),
    }


def main():
    inventory = load(os.path.join(NORM, "inventory.json"))
    billing = load(os.path.join(NORM, "billing.json"))
    bill_meters = {m["serviceId"]: m for m in billing["meters"]}
    bill_rollup = billing["rollup"]

    # The PRIOR fixture is already the engine-tested join (its 46 billed entries carry the
    # correct, hand-reconciled meta.annualCostUsd / peakKw / nem / flags). Reuse those billed
    # entries verbatim so we do not regress the numbers analyze-batth-real.ts depends on, and
    # rebuild only the metadata-only entries from the canonical inventory.
    prior = load(FIXTURE)
    prior_by_id = {m["serviceId"]: m for m in prior["meters"]}
    prior_billed = {sid: m for sid, m in prior_by_id.items() if m.get("summaries")}

    assert len(inventory) == 183, f"expected 183 inventory meters, got {len(inventory)}"
    assert set(prior_billed) == set(bill_meters), "prior fixture billed set != billing.json set"

    os.makedirs(BYMETER, exist_ok=True)

    meters_out = []      # NormalizedMeter[] + sibling meta, for ALL 183 inventory meters
    manifest = []        # ordered identity rows, idx 0..182
    fixture_meters = []  # engine-compatible: 183 inventory + 3 billed orphans (no dropped $)

    for idx, row in enumerate(inventory):
        sid = row["serviceId"]
        bm = bill_meters.get(sid)
        billed = bm is not None
        entity = row.get("billingName")
        ranch = row.get("ranch")
        pump_id = row.get("growerPumpId")
        tariff = row.get("rateSchedule")

        # --- manifest row (ordered) ---
        manifest.append({
            "idx": idx,
            "serviceId": sid,
            "pumpId": pump_id,
            "account": row.get("account"),
            "entity": entity,
            "ranch": ranch,
            "billed": billed,
        })

        # --- summaries[] from the latest non-true-up cycle, for billed meters ---
        summaries = []
        cycle = None
        if billed:
            cycle = latest_non_trueup_cycle(bm)
            if cycle is not None:
                summaries = [summary_from_cycle(cycle)]

        # --- peakKw / nem / annualCost: take the prior fixture's tested meta when billed ---
        prior_meta = (prior_by_id.get(sid) or {}).get("meta") or {}
        if billed:
            peak_kw = prior_meta.get("peakKw")
            annual_cost = prior_meta.get("annualCostUsd")
            nem_block = prior_meta.get("nem")
            flags = prior_meta.get("flags")
            descriptor = bm.get("saIdDescriptor") or prior_meta.get("saIdDescriptor")
        else:
            peak_kw = None
            annual_cost = None
            nem_block = None
            flags = None
            descriptor = row.get("descriptor")

        # NormalizedMeter address: prefer prior fixture's (built from bill descriptor for billed
        # meters); else compose from the inventory descriptor / pump id.
        address = (prior_by_id.get(sid) or {}).get("address")
        if not address:
            parts = [p for p in [descriptor, ranch, pump_id] if p]
            address = ", ".join(dict.fromkeys(parts)) if parts else None

        meter = {
            "serviceId": sid,
            "meterSerial": row.get("meterSerial"),
            "accountNumber": row.get("account"),
            "fuel": "electric",
            "tariff": tariff,
            "address": address,
            "intervals": [],
            "summaries": summaries,
            "meta": {
                "growerPumpId": pump_id,
                "saIdDescriptor": descriptor,
                "rateSchedule": tariff,
                "legacy": row.get("legacy"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "hasCoordinates": row.get("hasCoordinates"),
                "ranch": ranch,
                "entity": entity,
                "actualOwner": row.get("actualOwner"),
                "status": row.get("status"),
                "gpm": row.get("gpm"),
                "crop": row.get("crop"),
                "irrigation": row.get("irrigation"),
                "installedOn": row.get("installedOn"),
                "contiguous": row.get("contiguous"),
                "nemType": row.get("nemType"),
                "trueUpMonth": row.get("trueUpMonth"),
                "solarFlag": row.get("solarFlag"),
                "solarGroupLabel": row.get("solarGroupLabel"),
                "solarKw": row.get("solarKw"),
                "solarNotes": row.get("solarNotes"),
                "peakKw": peak_kw,
                "annualCostUsd": annual_cost,
                "billed": billed,
                "flags": flags,
                "nem": nem_block,
                "rowNumber": row.get("rowNumber"),
                "idx": idx,
            },
        }
        meters_out.append(meter)

        # --- engine-compatible fixture entry ---
        # Billed meters: reuse the prior, tested fixture entry verbatim (no number regression).
        # Metadata-only: the freshly built inventory entry above.
        if billed and sid in prior_by_id:
            fixture_meters.append(prior_by_id[sid])
        else:
            fixture_meters.append(meter)

        # --- per-meter merge file (inventory facts + billing facts) ---
        per = {
            "serviceId": sid,
            "idx": idx,
            "billed": billed,
            "inventory": row,
            "billing": bm,           # full billing.json meter record, or null
            "summaries": summaries,  # the engine-facing demo summary slice
            "nem": (bm or {}).get("nem"),
        }
        dump(os.path.join(BYMETER, f"{sid}.json"), per)

    # The 3 billed-but-not-inventoried orphans (PUMP 73 / K-87 / unlabeled). Keep their real
    # dollars in the fixture (so the demo rollup loses nothing) and write their by-meter files,
    # but they are NOT part of the canonical 183 (not in meters.json / manifest.json).
    inv_ids = {r["serviceId"] for r in inventory}
    orphans = [sid for sid in bill_meters if sid not in inv_ids]
    for sid in orphans:
        if sid in prior_by_id:
            fixture_meters.append(prior_by_id[sid])
        bm = bill_meters[sid]
        per = {
            "serviceId": sid,
            "idx": None,
            "billed": True,
            "orphan": True,
            "note": "Billed on account 4699664587-8 but not present in the 183-meter master inventory.",
            "inventory": None,
            "billing": bm,
            "summaries": [summary_from_cycle(c) for c in [latest_non_trueup_cycle(bm)] if c],
            "nem": bm.get("nem"),
        }
        dump(os.path.join(BYMETER, f"{sid}.json"), per)

    # --- write meters.json ---
    dump(os.path.join(NORM, "meters.json"), meters_out)

    # --- write manifest.json ---
    dump(os.path.join(NORM, "manifest.json"), manifest)

    # --- refresh the fixture (preserve the prior top-level shape) ---
    fixture_out = {
        "$comment": prior.get("$comment"),
        "account": ACCOUNT,
        "farm": FARM,
        "timezone": TIMEZONE,
        "meters": fixture_meters,
    }
    dump(FIXTURE, fixture_out)

    # --- report ---
    billed_count = sum(1 for m in manifest if m["billed"])
    metadata_only = sum(1 for m in manifest if not m["billed"])
    report = {
        "metersJson": len(meters_out),
        "manifestLen": len(manifest),
        "billed": billed_count,
        "metadataOnly": metadata_only,
        "fixtureMeters": len(fixture_meters),
        "fixtureBilled": sum(1 for m in fixture_meters if m.get("summaries")),
        "orphansKeptInFixture": len(orphans),
        "byMeterFiles": len(os.listdir(BYMETER)),
        "distinctAccounts": len({r["account"] for r in inventory}),
        "distinctEntities": len({r["billingName"] for r in inventory}),
        "solarKwTotal": "1932 (840 + 1092)",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
