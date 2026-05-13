"""Aggregate-prove the "CERN megapaper dominates" story.

Queries OpenAlex for China-CEEC coauthorship papers in 2016-2020 (sampled with
cursor pagination), bins them by author count, and dumps:

  public/data/megapaper_stats.json

We compute, for each major CEEC partner:
  - papers_sampled, total_authors_seen
  - histogram of author counts in bands: 1-9, 10-49, 50-99, 100-499, 500-999, 1000+
  - share of papers with > 100 authors (proxy for big-collaboration)
  - share of TOTAL AUTHORSHIPS (one paper × N authors) attributable to >100-author papers
    (this is what double-counts in the "中-波合作" count and explains the inflated totals)
  - top venues / collaborations

This lets Scene 4 stop using a single Higgs paper as anecdote and instead say:
  "X% of China-Poland coauthored papers in 2016-2020 had > 100 authors —
   they generate Y% of the total 'cooperation count'."
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "megapaper_stats.json"

# Major CEEC partners (cover ~95% of all China-CEEC papers); ISO alpha-2 for OpenAlex
PARTNERS = [
    ("POL", "PL", "波兰"),
    ("CZE", "CZ", "捷克"),
    ("GRC", "GR", "希腊"),
    ("HUN", "HU", "匈牙利"),
    ("ROU", "RO", "罗马尼亚"),
    ("SRB", "RS", "塞尔维亚"),
    ("BGR", "BG", "保加利亚"),
    ("SVK", "SK", "斯洛伐克"),
    ("HRV", "HR", "克罗地亚"),
    ("SVN", "SI", "斯洛文尼亚"),
    ("EST", "EE", "爱沙尼亚"),
    ("LVA", "LV", "拉脱维亚"),
]

BANDS = [(1, 9), (10, 49), (50, 99), (100, 499), (500, 999), (1000, 999999)]
BAND_LABELS = ["1-9", "10-49", "50-99", "100-499", "500-999", "1000+"]
PER_PAGE = 200
MAX_PAGES_PER_COUNTRY = 8   # 1600 papers per country max
MAILTO = "sunzhengqi2024@gmail.com"  # OpenAlex polite-pool


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "ceec-viz/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def query_country(iso2: str):
    cursor = "*"
    pages = 0
    counts: Counter[str] = Counter()
    bucket_authorships: Counter[str] = Counter()
    total_papers = 0
    total_authorships = 0
    venue_counter: Counter[str] = Counter()
    while cursor and pages < MAX_PAGES_PER_COUNTRY:
        params = {
            "filter": f"authorships.countries:cn,authorships.countries:{iso2.lower()},publication_year:2016-2020",
            "per-page": str(PER_PAGE),
            "cursor": cursor,
            "select": "id,publication_year,authorships,primary_location",
            "mailto": MAILTO,
        }
        url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
        try:
            r = fetch(url)
        except Exception as e:
            print(f"    fetch error: {e}")
            break
        results = r.get("results", [])
        if not results:
            break
        for w in results:
            n = len(w.get("authorships") or [])
            if n <= 0:
                continue
            total_papers += 1
            total_authorships += n
            # find band
            for (lo, hi), label in zip(BANDS, BAND_LABELS):
                if lo <= n <= hi:
                    counts[label] += 1
                    bucket_authorships[label] += n
                    break
            # collaboration / venue
            pl = w.get("primary_location") or {}
            src = (pl.get("source") or {}).get("display_name")
            if src:
                venue_counter[src] += 1
        cursor = r.get("meta", {}).get("next_cursor")
        pages += 1
        time.sleep(0.15)  # be polite
    return {
        "papers_sampled": total_papers,
        "authorships_total": total_authorships,
        "band_papers": dict(counts),
        "band_authorships": dict(bucket_authorships),
        "top_venues": venue_counter.most_common(8),
    }


def main():
    print("Querying OpenAlex …")
    by_country = {}
    for iso, iso2, cn in PARTNERS:
        print(f"  {cn} ({iso2}) …", end=" ", flush=True)
        try:
            d = query_country(iso2)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"FAILED: {e}")
            continue
        d["iso"] = iso
        d["name_cn"] = cn
        # share of papers with >100 authors
        big_papers = sum(d["band_papers"].get(b, 0) for b in ("100-499", "500-999", "1000+"))
        big_authorships = sum(d["band_authorships"].get(b, 0) for b in ("100-499", "500-999", "1000+"))
        d["share_big_papers"] = big_papers / d["papers_sampled"] if d["papers_sampled"] else 0
        d["share_big_authorships"] = big_authorships / d["authorships_total"] if d["authorships_total"] else 0
        by_country[iso] = d
        print(f"papers={d['papers_sampled']}  >100 share: {d['share_big_papers']*100:.0f}%  authorships share: {d['share_big_authorships']*100:.0f}%")

    # Aggregate across all sampled countries
    agg_papers = sum(d["papers_sampled"] for d in by_country.values())
    agg_authorships = sum(d["authorships_total"] for d in by_country.values())
    agg_band_papers = Counter()
    agg_band_authorships = Counter()
    for d in by_country.values():
        for k, v in d["band_papers"].items():
            agg_band_papers[k] += v
        for k, v in d["band_authorships"].items():
            agg_band_authorships[k] += v
    agg_big = sum(agg_band_papers.get(b, 0) for b in ("100-499", "500-999", "1000+"))
    agg_big_auth = sum(agg_band_authorships.get(b, 0) for b in ("100-499", "500-999", "1000+"))
    aggregate = {
        "papers_sampled": agg_papers,
        "authorships_total": agg_authorships,
        "band_papers": dict(agg_band_papers),
        "band_authorships": dict(agg_band_authorships),
        "share_big_papers": agg_big / agg_papers if agg_papers else 0,
        "share_big_authorships": agg_big_auth / agg_authorships if agg_authorships else 0,
    }

    out = {
        "source": "OpenAlex /works API",
        "fetched_at": "2026-05-09",
        "filter": "authorships.countries:cn,authorships.countries:<CEEC>,publication_year:2016-2020",
        "per_country_max_pages": MAX_PAGES_PER_COUNTRY,
        "per_page": PER_PAGE,
        "bands": BAND_LABELS,
        "aggregate": aggregate,
        "by_country": by_country,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\nSaved → {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")
    print(f"\nAcross {agg_papers:,} sampled papers:")
    print(f"  share of papers with >100 authors: {aggregate['share_big_papers']*100:.1f}%")
    print(f"  share of TOTAL authorships from those papers: {aggregate['share_big_authorships']*100:.1f}%")


if __name__ == "__main__":
    main()
