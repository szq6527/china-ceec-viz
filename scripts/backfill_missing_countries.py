"""Backfill Lithuania (LT) and N. Macedonia (MK) into per_country.json.

The ScienceDB raw data was missing them. We fetch period counts from OpenAlex
(meta.count for the filter is fast and accurate enough). Rank fields are
estimated by interpolating against existing per_country counts.

Also extends per_country_yearly.json by distributing each new country's period
totals across years using the global yearly trajectory (same method as
build_data.py).
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "data"
PER_COUNTRY = ROOT / "per_country.json"
PER_COUNTRY_YEARLY = ROOT / "per_country_yearly.json"
YEARLY = ROOT / "yearly.json"

MAILTO = "sunzhengqi2024@gmail.com"

MISSING = [
    ("LTU", "lt", "立陶宛"),
    ("MKD", "mk", "北马其顿"),
]


def count_for(iso2: str, y_from: int, y_to: int) -> int:
    params = {
        "filter": f"authorships.countries:cn,authorships.countries:{iso2},publication_year:{y_from}-{y_to}",
        "per-page": "1",
        "mailto": MAILTO,
    }
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "ceec-viz/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read())
    return int(j.get("meta", {}).get("count") or 0)


def interp_rank(count: int, existing: list[tuple[int, int]]) -> int:
    """Estimate a global rank given existing (count, rank) pairs."""
    if not existing:
        return 200
    # higher count → smaller rank (better). Find bracket.
    s = sorted(existing, key=lambda p: -p[0])
    for i, (c, r) in enumerate(s):
        if count >= c:
            return r + (1 if i == 0 else 0)
    # smaller than smallest → extend
    last_c, last_r = s[-1]
    if last_c <= 0:
        return last_r + 5
    return last_r + max(1, int((last_c - count) / max(1, last_c) * 30))


def main():
    per_country = json.loads(PER_COUNTRY.read_text())
    yearly = json.loads(YEARLY.read_text())
    per_country_yearly = json.loads(PER_COUNTRY_YEARLY.read_text())

    existing_by_iso = {r["iso"] for r in per_country}

    # Build pairs for interpolation
    pairs_125 = [(r["count_125"], r["rank_125"]) for r in per_country]
    pairs_135 = [(r["count_135"], r["rank_135"]) for r in per_country]

    by_year = {r["year"]: r["ceec"] for r in yearly}
    sum_125 = sum(by_year[y] for y in range(2011, 2016))
    sum_135 = sum(by_year[y] for y in range(2016, 2021))

    print("Fetching OpenAlex …")
    for iso, iso2, cn in MISSING:
        if iso in existing_by_iso:
            print(f"  {cn}: already present, skipping")
            continue
        c125 = count_for(iso2, 2011, 2015)
        time.sleep(0.2)
        c135 = count_for(iso2, 2016, 2020)
        time.sleep(0.2)
        rank_125 = interp_rank(c125, pairs_125)
        rank_135 = interp_rank(c135, pairs_135)
        growth = (c135 / c125 - 1) if c125 else 0
        ratio_135 = c135 / (sum_135) if sum_135 else 0  # share of CEEC group
        rank_change = rank_125 - rank_135  # positive = rose

        new_row = {
            "name_cn": cn,
            "iso": iso,
            "count_135": c135,
            "count_125": c125,
            "ratio_135": ratio_135,
            "rank_135": rank_135,
            "rank_125": rank_125,
            "growth": growth,
            "rank_change": rank_change,
            "_source": "OpenAlex 2026-05-09 (backfilled; ranks estimated by interpolation)",
        }
        per_country.append(new_row)
        print(f"  {cn} ({iso2}): 125={c125}  135={c135}  rank≈{rank_125}→{rank_135}  growth={growth:+.0%}")

        # extend per_country_yearly using the global trajectory
        series = []
        for y in range(2011, 2016):
            v = c125 * by_year[y] / sum_125 if sum_125 else 0
            series.append({"year": y, "count": int(round(v))})
        for y in range(2016, 2021):
            v = c135 * by_year[y] / sum_135 if sum_135 else 0
            series.append({"year": y, "count": int(round(v))})
        per_country_yearly.append({
            "iso": iso,
            "name_cn": cn,
            "total": c125 + c135,
            "growth": growth,
            "yearly": series,
        })

    # Re-sort per_country by count_135 desc
    per_country.sort(key=lambda r: -r["count_135"])
    per_country_yearly.sort(key=lambda r: -r["total"])

    PER_COUNTRY.write_text(json.dumps(per_country, ensure_ascii=False, indent=2))
    PER_COUNTRY_YEARLY.write_text(json.dumps(per_country_yearly, ensure_ascii=False, indent=2))

    print(f"\nWrote {PER_COUNTRY.name} ({PER_COUNTRY.stat().st_size/1024:.1f} KB) — {len(per_country)} countries")
    print(f"Wrote {PER_COUNTRY_YEARLY.name} ({PER_COUNTRY_YEARLY.stat().st_size/1024:.1f} KB) — {len(per_country_yearly)} countries")


if __name__ == "__main__":
    main()
