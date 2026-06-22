#!/usr/bin/env python3
import csv, sys, re
from collections import Counter, defaultdict

CSV = sys.argv[1] if len(sys.argv) > 1 else "Historical_20260304-20260331.csv"

# column indices from the confirmed header
H = "Account ID,Service Agreement ID,Service UUID,Service Point ID,Meter Badge Number,Service Descriptor,Rate Code,Interval Billed,Date,Time,Usage Hour,Interval Number,Interval Length,TOU Code,Daylight Savings Flag,Direction of Energy,Unit of Measure,Usage Value,Estimate Flag".split(",")
ci = {name: i for i, name in enumerate(H)}

def f(name): return ci[name]

rate_codes = Counter()
tou_codes = Counter()
# For HAGC import: TOU code by local hour (Time column is interval END wall clock)
hagc_tou_by_hour = defaultdict(Counter)   # hour -> Counter(tou)
hagc_sas = set()
# energy buckets for HAGC import
hagc_total = 0.0
hagc_by_tou = Counter()         # tou -> kwh
hagc_1621_kwh = 0.0             # 16:00-21:00 wall clock (peak.ts isInPeakWindow)
hagc_1720_kwh = 0.0            # 17:00-20:00 RATE_PEAK_WINDOW
hagc_wpk_kwh = 0.0
n = 0

with open(CSV, newline="", encoding="utf-8-sig", errors="replace") as fh:
    rd = csv.reader(fh)
    header = next(rd)
    assert len(header) == 19, len(header)
    for row in rd:
        if not row or len(row) < 18:
            continue
        n += 1
        rate = row[f("Rate Code")].strip()
        tou = row[f("TOU Code")].strip()
        direction = row[f("Direction of Energy")].strip().upper()
        rate_codes[rate] += 1
        tou_codes[tou if tou else "(empty)"] += 1
        if rate == "HAGC" and direction == "D":
            sa = row[f("Service Agreement ID")].strip()
            hagc_sas.add(sa)
            usage = float(row[f("Usage Value")] or 0)
            # local hour of interval END from Time col "YYYY-MM-DD HH:MM"
            t = row[f("Time")].strip()
            m = re.search(r"(\d{2}):(\d{2})$", t)
            hh = int(m.group(1)) if m else -1
            mm = int(m.group(2)) if m else 0
            # interval START hour: end - interval length
            ilen = int(row[f("Interval Length")] or 15)
            # start minute = end - ilen
            start_total = hh*60 + mm - ilen
            if start_total < 0:
                start_total += 24*60
            start_hh = (start_total // 60) % 24
            hagc_tou_by_hour[start_hh][tou if tou else "(empty)"] += 1
            hagc_total += usage
            hagc_by_tou[tou if tou else "(empty)"] += usage
            # peak.ts isInPeakWindow uses interval START local hour in [16,21)
            if 16 <= start_hh < 21:
                hagc_1621_kwh += usage
            if 17 <= start_hh < 20:
                hagc_1720_kwh += usage
            if tou == "WPK":
                hagc_wpk_kwh += usage

print(f"rows read: {n}")
print(f"distinct rate codes: {len(rate_codes)}")
print(f"TOU codes (all): {dict(tou_codes)}")
print(f"\nHAGC import SAs: {len(hagc_sas)}")
print(f"HAGC import total kWh: {hagc_total:.1f}")
print(f"  by TOU code:")
for k, v in sorted(hagc_by_tou.items(), key=lambda x: -x[1]):
    print(f"    {k:10s} {v:14.1f}  ({100*v/hagc_total:.2f}%)")
print(f"\n  peak by export WPK        = {hagc_wpk_kwh:14.1f}  ({100*hagc_wpk_kwh/hagc_total:.2f}%)")
print(f"  peak by 16-21 wallclock   = {hagc_1621_kwh:14.1f}  ({100*hagc_1621_kwh/hagc_total:.2f}%)  vs WPK {100*(hagc_1621_kwh-hagc_wpk_kwh)/hagc_wpk_kwh:+.1f}%")
print(f"  peak by 17-20 wallclock   = {hagc_1720_kwh:14.1f}  ({100*hagc_1720_kwh/hagc_total:.2f}%)  vs WPK {100*(hagc_1720_kwh-hagc_wpk_kwh)/hagc_wpk_kwh:+.1f}%")

print(f"\nHAGC import: TOU code distribution by interval-START local hour:")
for hh in range(24):
    c = hagc_tou_by_hour.get(hh)
    if c:
        tot = sum(c.values())
        dist = ", ".join(f"{k}:{v}({100*v//tot}%)" for k, v in c.most_common())
        print(f"  {hh:02d}:00  n={tot:7d}  {dist}")
