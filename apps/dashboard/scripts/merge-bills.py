#!/usr/bin/env python3
"""Merge the Claude-vision fallback extracts into the regex primary extracts (read/merge only).

The regex primary (extract-bills-regex.py) writes batth-ingestion/extracted/bills/<stem>.json for all
66 PDFs; the stems it could not fully reconcile are listed in reports/fallback_stems.txt and re-run
through Claude vision into a work dir (batth-ingestion/work/vision-fallback/<stem>.json). This merges,
per (canonical saId, start, close) period, taking whichever engine RECONCILED to the cent:
  - keep the regex period if it reconciled;
  - else swap in the vision period if IT reconciled;
  - else leave it needs_review (renders as REVIEW downstream - never a fabricated billed dollar);
  - additionally union in any vision SA/period that reconciled and the regex engine missed entirely.
The merged doc overwrites extracted/bills/<stem>.json. Account identity stays from the regex doc.

Run from apps/dashboard:  python3 scripts/merge-bills.py
"""
import json
import os

def _find_root(start):
    d = start
    for _ in range(8):
        if os.path.isdir(os.path.join(d, "BatthData")) and os.path.exists(os.path.join(d, "package-lock.json")):
            return d
        p = os.path.dirname(d)
        if p == d:
            break
        d = p
    raise RuntimeError(f"could not locate repo root (BatthData/) from {start}")


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = _find_root(HERE)
BILLS = os.path.join(ROOT, "batth-ingestion", "extracted", "bills")
VDIR = os.path.join(ROOT, "batth-ingestion", "work", "vision-fallback")
REPORTS = os.path.join(ROOT, "batth-ingestion", "reports")


def canon(sa):
    s = str(sa or "").strip().split()[0] if sa else ""
    return s.lstrip("0") or s


def period_index(doc):
    """(canonSa, start, close) -> (bill, period)."""
    idx = {}
    for b in doc.get("bills", []) or []:
        for p in b.get("periods", []) or []:
            idx[(canon(b.get("saId")), p.get("start"), p.get("close"))] = (b, p)
    return idx


def recount(doc):
    rec = nr = 0
    review = []
    for b in doc["bills"]:
        for p in b["periods"]:
            if p.get("coverageState") == "reconciled":
                rec += 1
            else:
                nr += 1
                review.append({"saId": b["saId"], "start": p.get("start"), "end": p.get("close")})
    doc["reconciledCount"] = rec
    doc["escalatedCount"] = nr
    # keep any pre-existing needsReview structure but ensure unreconciled periods are represented
    doc["needsReview"] = review
    return rec, nr


def main():
    fb_file = os.path.join(REPORTS, "fallback_stems.txt")
    stems = []
    if os.path.exists(fb_file):
        stems = [s.strip() for s in open(fb_file).read().splitlines() if s.strip()]
    if not stems:
        print("[merge] no fallback stems; nothing to merge.")
        return

    summary = []
    for stem in stems:
        rpath = os.path.join(BILLS, stem + ".json")
        vpath = os.path.join(VDIR, stem + ".json")
        if not os.path.exists(rpath):
            print(f"[merge] SKIP {stem}: no regex doc"); continue
        regex = json.load(open(rpath))
        before_rec, before_nr = recount(regex)
        if not os.path.exists(vpath):
            print(f"[merge] {stem}: no vision doc (vision skipped/failed) -> left as-is "
                  f"(reconciled={before_rec} review={before_nr})")
            summary.append((stem, before_rec, before_nr, before_rec, before_nr))
            continue
        vision = json.load(open(vpath))
        vidx = period_index(vision)
        ridx = period_index(regex)

        swapped = 0
        # 1) repair regex needs_review periods with a reconciled vision period of the same key
        for key, (rb, rp) in ridx.items():
            if rp.get("coverageState") != "reconciled" and key in vidx:
                _, vp = vidx[key]
                if vp.get("coverageState") == "reconciled":
                    # replace period contents in-place, preserve list position
                    rp.clear()
                    rp.update(vp)
                    swapped += 1
        # 2) union vision reconciled periods/SAs the regex engine missed entirely
        added = 0
        bill_by_sa = {canon(b.get("saId")): b for b in regex["bills"]}
        for key, (vb, vp) in vidx.items():
            if key in ridx:
                continue
            if vp.get("coverageState") != "reconciled":
                continue
            sa = key[0]
            if sa in bill_by_sa:
                bill_by_sa[sa]["periods"].append(vp)
            else:
                regex["bills"].append({
                    "saId": vb.get("saId"), "saIdDescriptor": vb.get("saIdDescriptor"),
                    "meterNumber": vb.get("meterNumber"), "growerPumpId": vb.get("growerPumpId"),
                    "periods": [vp],
                })
                bill_by_sa[sa] = regex["bills"][-1]
            added += 1
        # 3) union vision nem entries for SAs not already present
        rnem = {n.get("generatingSaId") for n in regex.get("nem", []) or []}
        for n in vision.get("nem", []) or []:
            if n.get("generatingSaId") not in rnem:
                regex.setdefault("nem", []).append(n)

        after_rec, after_nr = recount(regex)
        json.dump(regex, open(rpath, "w"), indent=2)
        print(f"[merge] {stem}: swapped={swapped} added={added}  "
              f"reconciled {before_rec}->{after_rec}  review {before_nr}->{after_nr}")
        summary.append((stem, before_rec, before_nr, after_rec, after_nr))

    gained = sum(a - b for _, b, _, a, _ in summary)
    still = sum(nr for *_, nr in summary)
    print(f"\n[merge] fallback stems: {len(summary)}  periods recovered by vision: {gained}  "
          f"periods still needs_review: {still}")


if __name__ == "__main__":
    main()
