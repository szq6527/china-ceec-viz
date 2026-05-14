"""Re-distribute per-country yearly estimates using updated yearly proportions from original_0512.csv.

The original build_data.py allocates each country's period totals (125 / 135) to
individual years proportionally to the *aggregate* CEEC-wide yearly trajectory.

This script replaces those estimates with country-specific yearly proportions
derived from the updated CSV, while preserving the original period totals
(count_125, count_135) and all other data unchanged.

Run after build_data.py has already generated per_country_yearly.json.
"""
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data_raw" / "extracted" / "数据（1119更新）" / "original_0512.csv"
PER_COUNTRY_PATH = Path(__file__).resolve().parents[1] / "public" / "data" / "per_country.json"
YEARLY_PATH = Path(__file__).resolve().parents[1] / "public" / "data" / "per_country_yearly.json"

# Map CSV country names → ISO codes used in per_country_yearly.json
NAME_TO_ISO = {
    "POLAND": "POL",
    "CZECH REPUBLIC": "CZE",
    "GREECE": "GRC",
    "HUNGARY": "HUN",
    "ROMANIA": "ROU",
    "SERBIA": "SRB",
    "SLOVENIA": "SVN",
    "SLOVAKIA": "SVK",
    "CROATIA": "HRV",
    "BULGARIA": "BGR",
    "ESTONIA": "EST",
    "LATVIA": "LVA",
    "MACEDONIA": "MKD",
    "MONTENEGRO": "MNE",
    "ALBANIA": "ALB",
    "LITHUANIA": "LTU",
    "BOSNIA & HERZEGOVINA": None,  # not in CEEC_16
}

PERIOD_125 = list(range(2011, 2016))
PERIOD_135 = list(range(2016, 2021))


def read_json(path):
    for enc in ["utf-8", "gb18030"]:
        try:
            with open(path, "r", encoding=enc) as f:
                return json.load(f)
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise RuntimeError(f"Could not read {path}")


def load_csv(path):
    for enc in ["utf-8-sig", "utf-8", "gb18030"]:
        try:
            df = pd.read_csv(path, encoding=enc)
            break
        except Exception:
            continue
    else:
        raise RuntimeError(f"Could not read {path}")
    df.columns = [str(c).strip().replace("﻿", "") for c in df.columns]
    return df


def main():
    df = load_csv(CSV_PATH)
    print(f"Loaded CSV: {df.shape[0]} rows, columns: {df.columns.tolist()}")

    # Build lookup: iso → {year: count, ...}
    csv_yearly = {}
    for _, row in df.iterrows():
        country = str(row["Country"]).strip().upper()
        iso = NAME_TO_ISO.get(country)
        if iso is None:
            print(f"  Skipping (not in CEEC_16): {row['Country']}")
            continue
        csv_yearly[iso] = {y: int(row[str(y)]) for y in range(2011, 2021)}

    # Load per_country.json for authoritative period totals
    per_country = {c["iso"]: c for c in read_json(PER_COUNTRY_PATH)}
    print(f"Loaded {len(per_country)} countries from per_country.json")

    # Load current per_country_yearly.json
    yearly_data = read_json(YEARLY_PATH)
    print(f"Loaded {len(yearly_data)} countries from per_country_yearly.json")

    updated = 0
    skipped = 0
    for entry in yearly_data:
        iso = entry["iso"]
        if iso not in csv_yearly:
            print(f"  Skipping {iso} ({entry['name_cn']}): no CSV data")
            skipped += 1
            continue

        csv_vals = csv_yearly[iso]
        csv_sum_125 = sum(csv_vals[y] for y in PERIOD_125)
        csv_sum_135 = sum(csv_vals[y] for y in PERIOD_135)

        pc = per_country[iso]
        orig_125 = pc["count_125"]
        orig_135 = pc["count_135"]

        new_total = 0
        for item in entry["yearly"]:
            y = item["year"]
            if y in PERIOD_125 and csv_sum_125 > 0:
                item["count"] = int(round(orig_125 * csv_vals[y] / csv_sum_125))
            elif y in PERIOD_135 and csv_sum_135 > 0:
                item["count"] = int(round(orig_135 * csv_vals[y] / csv_sum_135))
            new_total += item["count"]

        # Correct rounding drift: adjust the last year of each period
        def fix_drift(items, years, target):
            actual = sum(item["count"] for item in items if item["year"] in years)
            drift = target - actual
            if drift != 0:
                last = max((item for item in items if item["year"] in years), key=lambda x: x["year"])
                last["count"] += drift

        fix_drift(entry["yearly"], PERIOD_125, orig_125)
        fix_drift(entry["yearly"], PERIOD_135, orig_135)

        entry["total"] = sum(item["count"] for item in entry["yearly"])
        updated += 1

    with open(YEARLY_PATH, "w", encoding="utf-8") as f:
        json.dump(yearly_data, f, ensure_ascii=False, indent=2)

    print(f"Updated {updated} countries, {skipped} skipped (no CSV match)")
    print(f"Written: {YEARLY_PATH}")


if __name__ == "__main__":
    main()
