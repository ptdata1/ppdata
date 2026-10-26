"""Add annual supplier spend (and the base rate) to paytau-benchmark.json for the CPB estimate.

Usage: python3 -I add_cpb_spend.py <paytau-benchmark.json> <Paytau_Master_Companies_V3.xlsx> <out.json> [base_rate] [base_rate_date]

- Adds field "sp" = annual supplier spend in GBP thousands (2 x the reported six-month spend).
- Spend is only attached when the master file's report period end matches the JSON's, so the
  spend and the late-payment share always come from the same report.
- Spend is left empty when missing, zero, or above GBP 5bn a year (mostly financial or intra-group flows).
- Adds meta.cpb = {baseRate, baseRateDate}. Change the rate here, not in the component.
Safe to re-run: an existing "sp" field is replaced.
"""
import json, sys
import pandas as pd

src, xlsx, out = sys.argv[1:4]
base_rate = float(sys.argv[4]) if len(sys.argv) > 4 else 3.75
base_date = sys.argv[5] if len(sys.argv) > 5 else "2026-07"
CAP_GBP = 5_000_000_000

d = json.load(open(src))
f = d["fields"]
v = pd.read_excel(xlsx, sheet_name="Master Companies", dtype={"Company Number": str})
v["n"] = v["Company Number"].str.strip()
v["re"] = pd.to_datetime(v["Report End"], errors="coerce").dt.strftime("%Y-%m-%d")
v["s6"] = pd.to_numeric(v["6m Supplier Spend"], errors="coerce")
spend = {r.n: (r.re, r.s6) for r in v.itertuples() if pd.notna(r.s6)}

if "sp" in f:
    k = f.index("sp")
    for r in d["companies"]:
        r.pop(k)
    f.pop(k)
f.append("sp")
iN, iE = f.index("num"), f.index("end")
stats = dict(rows=0, attached=0, mismatch=0, missing=0, zero=0, capped=0)
for r in d["companies"]:
    stats["rows"] += 1
    sp = None
    hit = spend.get(r[iN])
    if hit is None:
        stats["missing"] += 1
    elif hit[0] != r[iE]:
        stats["mismatch"] += 1
    elif hit[1] <= 0:
        stats["zero"] += 1
    elif hit[1] * 2 > CAP_GBP:
        stats["capped"] += 1
    else:
        sp = int(round(hit[1] * 2 / 1000))
        stats["attached"] += 1
    r.append(sp)
d["meta"]["cpb"] = {"baseRate": base_rate, "baseRateDate": base_date}
json.dump(d, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print(stats)
