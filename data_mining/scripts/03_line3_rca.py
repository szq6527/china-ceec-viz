"""
03_line3_rca.py

Revealed Comparative Advantage (RCA) analysis for China-CEEC cooperation.

Computes two RCA variants per country per year:
  1. Global RCA: (CN-CEEC_i / CN-World) / (CEEC_i_total / World_total)
     — Measures if country cooperates with China more than expected by its global output share.
  2. CEEC-internal RCA: (CN-CEEC_i / CEEC_i_total) / (CN-CEEC_all / CEEC_all_total)
     — Measures if country cooperates with China more than CEEC average, given its output.

Also fetches China's global cooperation distribution (all partner countries per year)
for context and future reference.

Analyses:
  1. RCA time series per country (2011-2020)
  2. RCA by geopolitical group (Eurozone/EU-non-Eurozone/EU-candidate)
  3. Rank stability (Spearman correlation 2011 vs 2020)
  4. Kruskal-Wallis test for group differences

Output: data_mining/data/line3_rca.json
"""

import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    print_header, print_subsection,
    COUNTRY_MAP, GEOPOLITICAL_GROUPS,
    iso3_to_iso2, iso3_to_name, iso3_to_group,
    build_works_url, fetch_group_by_count, extract_yearly,
    read_json, write_json, mean, stddev,
    PUBLIC_DATA, DATA_DIR,
)

YEAR_RANGE = list(range(2011, 2021))
APPROX_WORLD_TOTAL = 6_000_000  # Approximate OpenAlex papers per year (~6M)


def fetch_country_total_yearly(iso3: str) -> dict[int, int]:
    """Fetch total scientific output (domestic + international) for a country."""
    iso2 = iso3_to_iso2(iso3).lower()
    url = build_works_url(
        filters=[
            f"authorships.countries:{iso2}",
            "publication_year:2011-2020",
        ],
        group_by="publication_year",
    )
    raw = fetch_group_by_count(url)
    return extract_yearly(raw)


def fetch_china_global_partners(year: int) -> dict[str, int]:
    """Fetch China's cooperation distribution across ALL partner countries in a year."""
    url = build_works_url(
        filters=[
            "authorships.countries:cn",
            f"publication_year:{year}",
        ],
        group_by="authorships.countries",
    )
    raw = fetch_group_by_count(url)
    # Clean country codes (OpenAlex returns full URLs for country IDs sometimes)
    out = {}
    for k, v in raw.items():
        code = k.split("/")[-1] if "/" in k else k
        if len(code) <= 3 and code.isalpha():
            out[code.upper()] = v
    return out


def spearman_rho(x: list[float], y: list[float]) -> float:
    """Compute Spearman rank correlation coefficient."""
    n = len(x)
    if n < 2:
        return 0.0

    def rank(data):
        indexed = sorted(enumerate(data), key=lambda p: p[1])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j < n and indexed[j][1] == indexed[i][1]:
                j += 1
            avg_rank = (i + j - 1) / 2.0 + 1
            for k in range(i, j):
                ranks[indexed[k][0]] = avg_rank
            i = j
        return ranks

    rx = rank(x)
    ry = rank(y)
    mr = mean(rx)
    num = sum((a - mr) * (b - mr) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mr) ** 2 for a in rx) * sum((b - mr) ** 2 for b in ry))
    return num / den if den > 0 else 0.0


def kruskal_wallis(groups: list[list[float]]) -> tuple[float, float]:
    """Kruskal-Wallis H-test (non-parametric one-way ANOVA).
    Returns (H_statistic, approximate_p_value)."""
    all_vals = [v for g in groups for v in g]
    n = len(all_vals)

    # Rank all values
    indexed = sorted(enumerate(all_vals), key=lambda p: p[1])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j < n and indexed[j][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j - 1) / 2.0 + 1
        for k in range(i, j):
            ranks[indexed[k][0]] = avg_rank
        i = j

    # Compute H statistic
    idx = 0
    h = 0.0
    for group in groups:
        ng = len(group)
        if ng == 0:
            continue
        rg = sum(ranks[idx:idx + ng])
        h += rg * rg / ng
        idx += ng

    h = (12.0 / (n * (n + 1))) * h - 3.0 * (n + 1.0)

    # Chi-square approximation for p-value
    df = len(groups) - 1
    # Use chi-square CDF approximation
    p = _chi2_survival(h, df)

    return h, p


def _chi2_survival(x: float, df: int) -> float:
    """Approximate chi-square survival function (upper tail probability).
    Uses Wilson-Hilferty normal approximation for df > 0."""
    if x <= 0:
        return 1.0
    if df <= 0:
        return 1.0
    # Wilson-Hilferty: (X/df)^(1/3) ~ N(1 - 2/(9df), 2/(9df))
    z = (math.pow(x / df, 1.0 / 3.0) - (1.0 - 2.0 / (9.0 * df))) / math.sqrt(2.0 / (9.0 * df))
    # Normal survival
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def main():
    print_header("03: RCA & Geopolitical Analysis (Line 3)")

    # Load yearly observed data for CN-CEEC counts per country
    yo = read_json(DATA_DIR / "yearly_observed.json")
    cn_ceec_by_country = {c["iso"]: c for c in yo["countries"]}

    # Also load China world totals from ScienceDB
    yearly_data = read_json(PUBLIC_DATA / "yearly.json")
    china_world_yearly = {d["year"]: d["china_total"] for d in yearly_data}

    # ---- Part A: Fetch China global partner distribution per year ----
    print_subsection("Part A: China's global cooperation distribution")
    china_partners = {}

    for y in YEAR_RANGE:
        print(f"  Year {y} ...", end=" ", flush=True)
        partners = fetch_china_global_partners(y)
        china_partners[str(y)] = partners
        # Get top 10 for context
        top10 = sorted(partners.items(), key=lambda x: -x[1])[:10]
        top_str = ", ".join(f"{c}({n})" for c, n in top10)
        print(f"({len(partners)} countries, top: {top_str})")

    # Summarize: rank of each CEEC country in China's partner list per year
    ceec_ranks_in_china_portfolio = {}
    for iso3 in COUNTRY_MAP:
        iso2 = iso3_to_iso2(iso3)
        ranks = {}
        for y in YEAR_RANGE:
            partners = china_partners.get(str(y), {})
            ceec_count = partners.get(iso2, 0)
            # Count how many countries have more papers than this CEEC country
            rank = sum(1 for c, n in partners.items() if n > ceec_count and c != iso2) + 1
            ranks[y] = rank
        ceec_ranks_in_china_portfolio[iso3] = ranks

    # ---- Part B: Fetch CEEC country total outputs ----
    print_subsection("Part B: CEEC country total scientific output")
    country_totals = {}

    for iso3 in sorted(COUNTRY_MAP.keys()):
        name = iso3_to_name(iso3)
        print(f"  {iso3} ({name}) ...", end=" ", flush=True)
        totals = fetch_country_total_yearly(iso3)
        country_totals[iso3] = totals
        total_sum = sum(totals.values())
        print(f"(total: {total_sum:,})")

    # ---- Compute RCA ----
    print_subsection("RCA Computation")

    # Compute CEEC-wide totals per year
    ceec_total_yearly = {y: sum(country_totals[iso3].get(y, 0) for iso3 in COUNTRY_MAP)
                         for y in YEAR_RANGE}
    ceec_cn_total_yearly = {y: sum(cn_ceec_by_country[iso3]["yearly"][i]["adjusted"]
                                   for iso3 in COUNTRY_MAP
                                   if iso3 in cn_ceec_by_country)
                            for i, y in enumerate(YEAR_RANGE)}

    country_rca = []
    for iso3 in sorted(COUNTRY_MAP.keys()):
        name = iso3_to_name(iso3)
        group = iso3_to_group(iso3)
        totals = country_totals[iso3]
        cn_data = cn_ceec_by_country.get(iso3, {}).get("yearly", [])

        yearly_rcas = []
        global_rca_vals = []
        internal_rca_vals = []

        for i, y in enumerate(YEAR_RANGE):
            cn_ceec = cn_data[i]["adjusted"] if i < len(cn_data) else 0
            cn_world = china_world_yearly.get(y, 1)
            country_total = totals.get(y, 0)

            # Global RCA
            global_rca = 0.0
            if cn_world > 0 and country_total > 0:
                ceec_share_of_china = cn_ceec / cn_world
                country_share_of_world = country_total / APPROX_WORLD_TOTAL
                global_rca = ceec_share_of_china / country_share_of_world if country_share_of_world > 0 else 0

            # CEEC-internal RCA
            cn_ceec_all = ceec_cn_total_yearly.get(y, 1)
            ceec_total = ceec_total_yearly.get(y, 1)
            internal_rca = 0.0
            if cn_ceec_all > 0 and ceec_total > 0 and country_total > 0:
                internal_rca = (cn_ceec / country_total) / (cn_ceec_all / ceec_total)

            global_rca_vals.append(global_rca)
            internal_rca_vals.append(internal_rca)

            yearly_rcas.append({
                "year": y,
                "cn_ceec_papers": cn_ceec,
                "china_world_papers": cn_world,
                "country_total_papers": country_total,
                "global_rca": round(global_rca, 4),
                "internal_rca": round(internal_rca, 4),
            })

        # RCA trend (linear slope on global RCA)
        xs = list(range(len(YEAR_RANGE)))
        ys = global_rca_vals
        n = len(xs)
        slope = 0.0
        if n > 1 and sum((x - mean(xs)) ** 2 for x in xs) > 0:
            m_x = mean(xs)
            m_y = mean(ys)
            slope = sum((x - m_x) * (y - m_y) for x, y in zip(xs, ys)) / sum((x - m_x) ** 2 for x in xs)

        cinfo = next((c for c in yo["countries"] if c["iso"] == iso3), None)

        country_rca.append({
            "iso": iso3,
            "name_cn": name,
            "geopolitical_group": group,
            "total_output_2011_2020": sum(totals.get(y, 0) for y in YEAR_RANGE),
            "yearly": yearly_rcas,
            "rca_2011": round(global_rca_vals[0], 4),
            "rca_2020": round(global_rca_vals[-1], 4),
            "rca_trend_slope": round(slope, 6),
            "rca_trend": "increasing" if slope > 0.0005 else "decreasing" if slope < -0.0005 else "stable",
            "internal_rca_2011": round(internal_rca_vals[0], 4),
            "internal_rca_2020": round(internal_rca_vals[-1], 4),
            "china_portfolio_rank_2011": ceec_ranks_in_china_portfolio[iso3].get(2011, 999),
            "china_portfolio_rank_2020": ceec_ranks_in_china_portfolio[iso3].get(2020, 999),
            "is_small_country": cinfo["period_125_total_sciencedb"] < 200 if cinfo else False,
        })

    # ---- RCA Rankings ----
    by_rca_2020 = sorted(country_rca, key=lambda x: -x["rca_2020"])
    print("\n  RCA 2020 rankings (Global RCA):")
    for i, c in enumerate(by_rca_2020):
        flag = " ⚠ low confidence" if c["is_small_country"] else ""
        print(f"    {i+1:2d}. {c['name_cn']:6s}  RCA={c['rca_2020']:.2f}  "
              f"(trend: {c['rca_trend']}, rank in CN portfolio: {c['china_portfolio_rank_2020']}){flag}")

    # ---- Geopolitical Group Analysis ----
    print_subsection("Geopolitical Group Analysis")
    for gkey, ginfo in GEOPOLITICAL_GROUPS.items():
        g_countries = [c for c in country_rca if c["geopolitical_group"] == gkey
                       and not c["is_small_country"]]
        if not g_countries:
            g_countries = [c for c in country_rca if c["geopolitical_group"] == gkey]

        mean_rca_2011 = mean([c["rca_2011"] for c in g_countries])
        mean_rca_2020 = mean([c["rca_2020"] for c in g_countries])
        mean_internal_2011 = mean([c["internal_rca_2011"] for c in g_countries])
        mean_internal_2020 = mean([c["internal_rca_2020"] for c in g_countries])

        print(f"\n  {ginfo['label']} ({len(g_countries)} countries)")
        print(f"    Mean Global RCA: 2011={mean_rca_2011:.2f} → 2020={mean_rca_2020:.2f}")
        print(f"    Mean Internal RCA: 2011={mean_internal_2011:.2f} → 2020={mean_internal_2020:.2f}")
        names = ", ".join(c["name_cn"] for c in g_countries)
        print(f"    Countries: {names}")

    # ---- Kruskal-Wallis Test ----
    print_subsection("Statistical Test: Kruskal-Wallis (group differences)")
    groups_data = {}
    for gkey in ["eurozone_core", "eu_non_eurozone", "eu_candidate"]:
        g_countries = [c for c in country_rca if c["geopolitical_group"] == gkey]
        groups_data[gkey] = [c["rca_2020"] for c in g_countries]

    # Combine eurozone_core with eurozone_special for test (small n)
    groups_for_test = [
        [c["rca_2020"] for c in country_rca if c["geopolitical_group"] in ("eurozone_core", "eurozone_special")],
        [c["rca_2020"] for c in country_rca if c["geopolitical_group"] == "eu_non_eurozone"],
        [c["rca_2020"] for c in country_rca if c["geopolitical_group"] == "eu_candidate"],
    ]
    groups_for_test = [g for g in groups_for_test if len(g) >= 2]
    h_stat, kw_p = kruskal_wallis(groups_for_test) if len(groups_for_test) >= 2 else (0, 1)

    print(f"\n  Groups: Eurozone, EU-non-Eurozone, EU-candidates")
    print(f"  Group means: {[round(mean(g), 2) for g in groups_for_test]}")
    print(f"  H-statistic = {h_stat:.3f}, p = {kw_p:.4f}")
    sig = kw_p < 0.05
    print(f"  Significant at 0.05: {'YES' if sig else 'NO'}")

    # ---- Spearman Rank Correlation ----
    print_subsection("Rank stability (Spearman correlation)")
    valid = [c for c in country_rca if not c["is_small_country"]]
    rcas_2011 = [c["rca_2011"] for c in valid]
    rcas_2020 = [c["rca_2020"] for c in valid]
    rho = spearman_rho(rcas_2011, rcas_2020)
    print(f"\n  Spearman's rho (2011 rank vs 2020 rank) = {rho:.3f}")
    print(f"  Interpretation: {'High' if rho > 0.7 else 'Moderate' if rho > 0.4 else 'Low'} rank stability")

    # ---- Eastward substitution indicator ----
    print_subsection("Eastward substitution indicator")
    eu_members_rca = mean([
        c["rca_2020"] for c in country_rca
        if c["geopolitical_group"] in ("eurozone_core", "eurozone_special", "eu_non_eurozone")
    ])
    eu_candidates_rca = mean([
        c["rca_2020"] for c in country_rca
        if c["geopolitical_group"] == "eu_candidate"
    ])
    ratio = eu_candidates_rca / eu_members_rca if eu_members_rca > 0 else 0
    print(f"\n  EU candidates mean RCA 2020: {eu_candidates_rca:.2f}")
    print(f"  EU members mean RCA 2020:   {eu_members_rca:.2f}")
    print(f"  Ratio (candidates/members):  {ratio:.2f}x")
    print(f"  Interpretation: EU candidate countries cooperate with China at "
          f"{ratio:.1f}x the relative intensity of EU members.")

    # ---- Output ----
    output = {
        "source": "OpenAlex /works API (group_by=authorships.countries, group_by=publication_year)",
        "fetched_at": __import__("datetime").datetime.now().isoformat(),
        "method": {
            "global_rca_formula": "(CN-CEEC_i / CN_world) / (CEEC_i_total / ~6M yearly world total)",
            "internal_rca_formula": "(CN-CEEC_i / CEEC_i_total) / (CN-CEEC_all / CEEC_all_total)",
            "notes": "Global RCA uses approximate world total (6M papers/year). Internal RCA is fully self-consistent and preferred for cross-country comparison. Small countries (MNE, ALB, MKD) flagged as low confidence.",
        },
        "china_global_partners": {
            str(y): {"total_partners": len(china_partners.get(str(y), {})),
                     "distribution": china_partners.get(str(y), {})}
            for y in YEAR_RANGE
        },
        "ceec_ranks_in_china_portfolio": ceec_ranks_in_china_portfolio,
        "by_country": country_rca,
        "geopolitical_group_summary": {
            gkey: {
                "label": ginfo["label"],
                "countries": ginfo["countries"],
                "mean_global_rca_2011": round(mean([c["rca_2011"] for c in country_rca if c["geopolitical_group"] == gkey]), 4),
                "mean_global_rca_2020": round(mean([c["rca_2020"] for c in country_rca if c["geopolitical_group"] == gkey]), 4),
                "mean_internal_rca_2011": round(mean([c["internal_rca_2011"] for c in country_rca if c["geopolitical_group"] == gkey]), 4),
                "mean_internal_rca_2020": round(mean([c["internal_rca_2020"] for c in country_rca if c["geopolitical_group"] == gkey]), 4),
            }
            for gkey, ginfo in GEOPOLITICAL_GROUPS.items()
        },
        "statistical_tests": {
            "kruskal_wallis": {
                "description": "Kruskal-Wallis H-test for RCA differences between geopolitical groups",
                "h_statistic": round(h_stat, 4),
                "p_value": round(kw_p, 6),
                "significant_at_0_05": sig,
            },
            "spearman_rank": {
                "description": "Spearman rank correlation between 2011 and 2020 RCA rankings",
                "rho": round(rho, 4),
                "interpretation": "High (>0.7) means stable rankings across decade",
            },
            "eastward_substitution": {
                "eu_candidates_mean_rca": round(eu_candidates_rca, 4),
                "eu_members_mean_rca": round(eu_members_rca, 4),
                "ratio": round(ratio, 4),
            },
        },
    }

    write_json(DATA_DIR / "line3_rca.json", output)
    print(f"\n  ✓ Saved to data_mining/data/line3_rca.json")


if __name__ == "__main__":
    main()
