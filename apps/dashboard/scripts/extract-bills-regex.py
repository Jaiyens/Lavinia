#!/usr/bin/env python3
"""Primary extraction for the new Batth bills: the deterministic regex engine over every PDF.

For each PDF in BatthData/NewPDFS it runs batth-ingestion/work/extract.py's build() (text-layer
parse -> per-SA line items -> reconcile to the cent, the exact engine that produced the existing
committed extracts) and writes the canonical fixture to batth-ingestion/extracted/bills/<stem>.json.
Every period whose line items do not sum to the printed total within 1c is marked needs_review by
the engine itself - never a fabricated billed dollar. PDFs that still carry any needs_review period
are listed in batth-ingestion/reports/fallback_stems.txt for the Claude-vision fallback pass.

Run from apps/dashboard:  python3 scripts/extract-bills-regex.py
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
OUT_DIR = os.path.join(ROOT, "batth-ingestion", "extracted", "bills")
REPORTS = os.path.join(ROOT, "batth-ingestion", "reports")

sys.path.insert(0, WORK)
import extract  # noqa: E402


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(REPORTS, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(PDF_DIR) if f.lower().endswith(".pdf"))

    fallback = []
    accounts, sas = set(), set()
    rec = nr = nem = 0
    dollars = 0
    for i, f in enumerate(pdfs, 1):
        stem = f[:-4]
        doc = extract.build(os.path.join(PDF_DIR, f))
        with open(os.path.join(OUT_DIR, stem + ".json"), "w") as fh:
            json.dump(doc, fh, indent=2)
        if doc["account"]["number"]:
            accounts.add(doc["account"]["number"])
        file_nr = 0
        for b in doc["bills"]:
            sas.add(b["saId"])
            for p in b["periods"]:
                if p["coverageState"] == "reconciled":
                    rec += 1
                    dollars += p["printedTotalCents"] or 0
                else:
                    nr += 1
                    file_nr += 1
        nem += len(doc["nem"])
        if file_nr > 0:
            fallback.append(stem)
        print(f"[regex] ({i}/{len(pdfs)}) {stem} acct={doc['account']['number']} "
              f"reconciled={doc['reconciledCount']} review={file_nr} nem={len(doc['nem'])}")

    with open(os.path.join(REPORTS, "fallback_stems.txt"), "w") as fh:
        fh.write("\n".join(fallback) + ("\n" if fallback else ""))

    print("\n[regex] === PRIMARY PASS ===")
    print(f"  PDFs: {len(pdfs)}  accounts: {len(accounts)}  SAs: {len(sas)}")
    print(f"  periods reconciled: {rec}  needs_review: {nr}  nem tables: {nem}")
    print(f"  reconciled dollars: ${dollars/100:,.2f}")
    print(f"  PDFs needing vision fallback ({len(fallback)}): {', '.join(fallback) or 'none'}")
    print(f"  -> {os.path.join(REPORTS, 'fallback_stems.txt')}")


if __name__ == "__main__":
    main()
