"""
00_fetch_yearly_observed.py

Fetch observed per-country yearly China-CEEC co-authorship counts from OpenAlex.
Normalize within each 5-year period to match the authoritative ScienceDB period totals.

Output: data_mining/data/yearly_observed.json
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    print_header, print_subsection,
    COUNTRY_MAP, iso3_to_iso2, iso3_to_name,
    build_works_url, fetch_group_by_count, extract_yearly,
    read_json, write_json, mean,
    PUBLIC_DATA, DATA_DIR,
)

YEAR_RANGE = list(range(2011, 2021))


def fetch_country_yearly(iso3: str) -> dict[int, int]:
    """Fetch observed yearly China-CEEC co-authorship counts for one country."""
    iso2 = iso3_to_iso2(iso3).lower()
    url = build_works_url(
        filters=[
            f"authorships.countries:cn",
            f"authorships.countries:{iso2}",
            "publication_year:2011-2020",
        ],
        group_by="publication_year",
    )
    raw = fetch_group_by_count(url)
    return extract_yearly(raw)


def main():
    print_header("00: Fetch observed yearly counts from OpenAlex")

    # Load authoritative ScienceDB period totals
    per_country = read_json(PUBLIC_DATA / "per_country.json")
    auth = {}
    for c in per_country:
        auth[c["iso"]] = {
            "count_125": c["count_125"],
            "count_135": c["count_135"],
            "name_cn": c["name_cn"],
        }

    yearly_agg = read_json(PUBLIC_DATA / "yearly.json")
    sciencedb_ceec_yearly = {d["year"]: d["ceec"] for d in yearly_agg}

    results = []
    ceec_sum_observed = {y: 0 for y in YEAR_RANGE}
    ceec_sum_adjusted = {y: 0 for y in YEAR_RANGE}
    double_count_ratios = []

    for iso3 in sorted(COUNTRY_MAP.keys()):
        name = iso3_to_name(iso3)
        print(f"\n  {iso3} ({name}) ...", end=" ", flush=True)

        observed = fetch_country_yearly(iso3)

        sa = auth.get(iso3, {"count_125": 0, "count_135": 0})
        total_125_auth = sa["count_125"]
        total_135_auth = sa["count_135"]

        # Sum observed within each period
        obs_125_sum = sum(observed.get(y, 0) for y in range(2011, 2016))
        obs_135_sum = sum(observed.get(y, 0) for y in range(2016, 2021))

        # Normalize within each period: adjusted[y] = observed[y] * (auth_total / obs_sum)
        # When ScienceDB period total is 0 but OpenAlex has observed data,
        # use observed values directly (ScienceDB coverage gap, not genuine zero)
        yearly_adjusted = {}
        data_source_125 = "sciencedb_calibrated"
        data_source_135 = "sciencedb_calibrated"

        if total_125_auth == 0 and obs_125_sum > 0:
            # ScienceDB has no data for this country — use OpenAlex observed directly
            for y in range(2011, 2016):
                yearly_adjusted[y] = observed.get(y, 0)
            data_source_125 = "openalex_direct"
        else:
            for y in range(2011, 2016):
                if obs_125_sum > 0:
                    yearly_adjusted[y] = round(observed.get(y, 0) * total_125_auth / obs_125_sum)
                else:
                    yearly_adjusted[y] = 0
            # Fix rounding drift: adjust last year in each period
            drift_125 = total_125_auth - sum(yearly_adjusted[y] for y in range(2011, 2016))
            yearly_adjusted[2015] += drift_125

        if total_135_auth == 0 and obs_135_sum > 0:
            for y in range(2016, 2021):
                yearly_adjusted[y] = observed.get(y, 0)
            data_source_135 = "openalex_direct"
        else:
            for y in range(2016, 2021):
                if obs_135_sum > 0:
                    yearly_adjusted[y] = round(observed.get(y, 0) * total_135_auth / obs_135_sum)
                else:
                    yearly_adjusted[y] = 0
            drift_135 = total_135_auth - sum(yearly_adjusted[y] for y in range(2016, 2021))
            yearly_adjusted[2020] += drift_135

        for y in YEAR_RANGE:
            ceec_sum_observed[y] += observed.get(y, 0)
            ceec_sum_adjusted[y] += yearly_adjusted.get(y, 0)

        if obs_125_sum + obs_135_sum > 0:
            ratio = (total_125_auth + total_135_auth) / (obs_125_sum + obs_135_sum)
            double_count_ratios.append(ratio)

        results.append({
            "iso": iso3,
            "name_cn": name,
            "period_125_total_sciencedb": total_125_auth,
            "period_135_total_sciencedb": total_135_auth,
            "obs_125_sum": obs_125_sum,
            "obs_135_sum": obs_135_sum,
            "data_source_125": data_source_125,
            "data_source_135": data_source_135,
            "yearly": [
                {
                    "year": y,
                    "observed": observed.get(y, 0),
                    "adjusted": yearly_adjusted.get(y, 0),
                }
                for y in YEAR_RANGE
            ],
        })
        src_note = ""
        if data_source_125 == "openalex_direct" or data_source_135 == "openalex_direct":
            src_note = " [OpenAlex direct — SciDB coverage gap]"
        print(f"OK (125: {obs_125_sum}→{yearly_adjusted.get(2015, 0) if total_125_auth > 0 else obs_125_sum}, "
              f"135: {obs_135_sum}→{yearly_adjusted.get(2020, 0) if total_135_auth > 0 else obs_135_sum}){src_note}")

    # CEEC aggregate comparison
    print_subsection("CEEC Aggregate: OpenAlex sum vs ScienceDB (double-counting analysis)")
    print(f"  {'Year':<6} {'SciDB CEEC':>10} {'OA Sum Obs':>12} {'Ratio':>8}")
    for y in YEAR_RANGE:
        scidb = sciencedb_ceec_yearly.get(y, 0)
        oa = ceec_sum_observed[y]
        ratio = oa / scidb if scidb > 0 else 0
        print(f"  {y:<6} {scidb:>10} {oa:>12} {ratio:>8.2f}")

    avg_dc_ratio = mean(double_count_ratios) if double_count_ratios else 0
    print(f"\n  Average per-country double-count ratio (SciDB / OpenAlex): {avg_dc_ratio:.3f}")
    print(f"  Interpretation: OpenAlex per-country sums are ~{1/avg_dc_ratio:.1f}x the non-double-counted aggregate")
    print(f"  because multi-country papers are counted once per participating country.")

    output = {
        "source": "OpenAlex /works API (group_by=publication_year)",
        "fetched_at": __import__("datetime").datetime.now().isoformat(),
        "method": {
            "description": "Observed yearly counts from OpenAlex group_by=publication_year, normalized within each 5-year period to match authoritative ScienceDB period totals from per_country.json",
            "normalization": "proportional within each period, drift correction on last year",
        },
        "ceec_aggregate": {
            "science_db_yearly": sciencedb_ceec_yearly,
            "openalex_sum_yearly": ceec_sum_observed,
            "adjusted_sum_yearly": ceec_sum_adjusted,
            "double_count_ratio_avg": avg_dc_ratio,
        },
        "countries": results,
    }

    write_json(DATA_DIR / "yearly_observed.json", output)
    print(f"\n  ✓ Saved to data_mining/data/yearly_observed.json")


if __name__ == "__main__":
    main()
