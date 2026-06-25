#!/usr/bin/env python3
"""Independent accuracy cross-check for the vision-extracted Batth bills (read-only).

For every PDF in BatthData/NewPDFS it runs the deterministic Python regex extractor
(batth-ingestion/work/extract.py) and diffs it against the Claude-vision fixture written by
extract-bills-batch.ts (batth-ingestion/extracted/bills/<stem>.json) on:
  - per (canonical saId, start, close) printedTotalCents  [Tier B]
  - the per-PDF set of service-agreement ids                [Tier B]
  - account printedTotalCents                               [Tier B]
  - sum(per-SA period totals) vs account total per file     [Tier C sanity]
Two independent extractors agreeing to the cent is strong accuracy evidence; every
disagreement is surfaced for a human spot-check. The vision extract is source of truth on
disagreement (richer line-item capture); this script only reports, it changes nothing.

Run from apps/dashboard:  python3 scripts/crosscheck-bills.py
Requires the local (gitignored) regex engine at batth-ingestion/work/ and pypdf.
"""
import json
import os
import sys

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
WORK = os.path.join(ROOT, "batth-ingestion", "work")
PDF_DIR = os.path.join(ROOT, "BatthData", "NewPDFS")
BILLS_DIR = os.path.join(ROOT, "batth-ingestion", "extracted", "bills")

sys.path.insert(0, WORK)
try:
    import extract  # the deterministic regex engine (build(path) -> canonical dict)
except Exception as e:  # noqa: BLE001
    print(f"[crosscheck] cannot import the regex engine at {WORK}: {e}")
    sys.exit(1)


def canon(sa):
    """Mirror canonSaId: leading token, leading zeros stripped."""
    s = str(sa or "").strip().split()[0] if sa else ""
    t = s.lstrip("0")
    return t if t else s


def periods_of(doc):
    """{(canonSa, start, close): printedTotalCents} over a canonical bill doc."""
    out = {}
    for bill in doc.get("bills", []) or []:
        sa = canon(bill.get("saId"))
        for p in bill.get("periods", []) or []:
            out[(sa, p.get("start"), p.get("close"))] = p.get("printedTotalCents")
    return out


def main():
    pdfs = sorted(f for f in os.listdir(PDF_DIR) if f.lower().endswith(".pdf"))
    agree = disagree = py_only = vi_only = 0
    disagreements = []
    missing_vision = []
    acct_total_mismatch = []
    acct_sum_sanity = []
    largest = []  # (cents, stem, sa, start, close) reconciled, for the Tier-D spot list

    for f in pdfs:
        stem = f[:-4]
        vpath = os.path.join(BILLS_DIR, stem + ".json")
        if not os.path.exists(vpath):
            missing_vision.append(stem)
            continue
        with open(vpath) as fh:
            vision = json.load(fh)
        try:
            py = extract.build(os.path.join(PDF_DIR, f))
        except Exception as e:  # noqa: BLE001
            disagreements.append({"stem": stem, "error": f"regex engine failed: {e}"})
            continue

        vp, pp = periods_of(vision), periods_of(py)
        for key, vc in vp.items():
            if key in pp:
                pc = pp[key]
                if vc is None or pc is None or abs(int(vc) - int(pc)) > 1:
                    disagree += 1
                    disagreements.append({"stem": stem, "key": key, "vision": vc, "regex": pc})
                else:
                    agree += 1
                    largest.append((int(vc), stem, key[0], key[1], key[2]))
            else:
                vi_only += 1
        for key in pp:
            if key not in vp:
                py_only += 1
                disagreements.append({"stem": stem, "key": key, "vision": None, "regex": pp[key]})

        # account-total agreement (Tier B) + sum-of-SAs sanity (Tier C)
        va = (vision.get("account") or {}).get("printedTotalCents")
        pa = (py.get("account") or {}).get("printedTotalCents")
        if va is not None and pa is not None and abs(int(va) - int(pa)) > 1:
            acct_total_mismatch.append({"stem": stem, "vision": va, "regex": pa})
        if va is not None:
            sasum = sum(int(c) for c in vp.values() if c is not None)
            # only meaningful for single-statement files; report only sizable gaps
            if abs(sasum - int(va)) > 100 and len(vp) > 1:
                acct_sum_sanity.append({"stem": stem, "sumOfSAs": sasum, "accountTotal": va,
                                        "deltaCents": sasum - int(va)})

    largest.sort(reverse=True)
    report = {
        "pdfs": len(pdfs),
        "periodsAgree": agree,
        "periodsDisagree": disagree,
        "visionOnlyPeriods": vi_only,
        "regexOnlyPeriods": py_only,
        "accountTotalMismatches": acct_total_mismatch,
        "accountSumSanityGaps": acct_sum_sanity,
        "missingVisionFixtures": missing_vision,
        "disagreements": disagreements[:200],
        "largestReconciledPeriods": [
            {"cents": c, "usd": round(c / 100, 2), "stem": s, "sa": sa, "start": st, "close": cl}
            for c, s, sa, st, cl in largest[:10]
        ],
    }
    out = os.path.join(ROOT, "batth-ingestion", "reports", "crosscheck_report.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fh:
        json.dump(report, fh, indent=2)

    print("[crosscheck] === DUAL-ENGINE ACCURACY ===")
    print(f"  PDFs: {len(pdfs)}  (missing vision fixture: {len(missing_vision)})")
    print(f"  period totals AGREE to <=1c : {agree}")
    print(f"  period totals DISAGREE      : {disagree}")
    print(f"  vision-only periods         : {vi_only}  (regex missed - expected on odd layouts)")
    print(f"  regex-only periods          : {py_only}  (vision missed - INVESTIGATE if >0)")
    print(f"  account-total mismatches    : {len(acct_total_mismatch)}")
    print(f"  account sum-of-SA gaps      : {len(acct_sum_sanity)}")
    if disagreements:
        print("  first disagreements:")
        for d in disagreements[:12]:
            print(f"    {d}")
    print(f"  report -> {out}")


if __name__ == "__main__":
    main()
