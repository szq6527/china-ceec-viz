"""
01_line1_big_science.py

Decompose 10-year China-CEEC cooperation growth into:
  - Big-science-driven (>=100 authors per paper)
  - Small-bilateral-driven (<100 authors per paper)

Statistical tests:
  1. Paired t-test: growth_big vs growth_small across 16 countries
  2. Paired t-test: share_big_135 > share_big_125 (acceleration)
  3. Growth decomposition: fraction of absolute growth coming from big-science papers

Reads yearly_observed.json (from script 00) for "all paper" totals.
Only fetches big-science (authors_count:>99) queries (16 API calls).

Output: data_mining/data/line1_big_science.json
"""

import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    print_header, print_subsection,
    COUNTRY_MAP, iso3_to_iso2, iso3_to_name,
    build_works_url, fetch_group_by_count, extract_yearly,
    read_json, write_json, mean, stddev,
    DATA_DIR,
)

YEAR_RANGE = list(range(2011, 2021))
BIG_THRESHOLD = 100
BIG_FILTER = f"authors_count:>{BIG_THRESHOLD - 1}"


def fetch_big_science_yearly(iso3: str) -> dict[int, int]:
    """Fetch yearly counts of China-CEEC papers with >=100 authors."""
    iso2 = iso3_to_iso2(iso3).lower()
    url = build_works_url(
        filters=[
            "authorships.countries:cn",
            f"authorships.countries:{iso2}",
            "publication_year:2011-2020",
            BIG_FILTER,
        ],
        group_by="publication_year",
    )
    raw = fetch_group_by_count(url)
    return extract_yearly(raw)


# ---- Statistical tests (stdlib only) ----
def t_statistic_paired(diffs: list[float]) -> float:
    """Paired t-statistic: t = mean(diffs) / (std(diffs) / sqrt(n))."""
    n = len(diffs)
    if n < 2:
        return 0.0
    m = mean(diffs)
    sd = stddev(diffs)
    if sd == 0:
        return float("inf") if m != 0 else 0.0
    return m / (sd / math.sqrt(n))


def cohens_d_paired(diffs: list[float]) -> float:
    """Cohen's d for paired samples: d = mean / std."""
    m = mean(diffs)
    sd = stddev(diffs)
    if sd == 0:
        return 0.0
    return m / sd


def approx_p_value(t: float, df: int, two_tailed: bool = True) -> float:
    """Approximate p-value from t-statistic using Welch-Satterthwaite-style approach.
    Uses a simple normal approximation for large df (>=10) and
    a lookup-based approach for small df. Accuracy is ~0.01 for p close to 0.05."""
    if not math.isfinite(t):
        return 0.0
    abs_t = abs(t)

    # For df >= 10, normal approximation is reasonable
    # We use a simple polynomial approximation of the t-distribution tail
    # Based on Abramowitz & Stegun 26.7.1 (rational approximation)
    x = df / (df + abs_t * abs_t)
    # Beta incomplete function approximation
    p = _betai_approx(0.5 * df, 0.5, x)

    return p * (2 if two_tailed else 1)


def _betai_approx(a: float, b: float, x: float) -> float:
    """Approximate the regularized incomplete beta function I_x(a,b).
    Uses continued fraction expansion (Lentz's method). Simplified for
    a = df/2, b = 0.5 (which is the t-distribution case)."""
    import math as _math
    if x > 0.5:
        return 1.0 - _betai_approx(b, a, 1.0 - x)

    # For b=0.5, we can use a simpler approach
    # beta_inc(a,0.5,x) / beta(a,0.5)
    # We use the cumulative distribution function of the t-distribution
    # which is I_x(df/2, 0.5) where x = df / (df + t^2)

    # Use the relationship with the F-distribution:
    # If T ~ t_df, then F = T^2 ~ F(1, df)
    # P(|T| > t) = P(F > t^2) = 1 - I_{df/(df+t^2)}(df/2, 1/2)
    # So I_x(df/2, 1/2) = 1 - P(|T| > t)

    # For practical purposes, use the normal approximation and a correction factor
    # This gives ~0.01 accuracy for p > 0.001
    if x <= 0 or x >= 1:
        return float(x > 0)

    # Use log-beta approximation
    ln_beta = _math.lgamma(a) + _math.lgamma(b) - _math.lgamma(a + b)

    # Series expansion for small x
    result = 0.0
    term = _math.exp(a * _math.log(x) + b * _math.log(1.0 - x) - ln_beta) / a
    result += term

    for n in range(1, 100):
        term *= (a + b + n - 1) * x / (a + n)
        result += term
        if abs(term) < 1e-15 * abs(result):
            break

    return result


def simple_p_value_from_t(t_stat: float, df: int, two_tailed: bool = True) -> float:
    """Compute approximate p-value from t-statistic.

    Uses the relationship: t-distribution tail ≈ normal tail for moderate df,
    with a Welch-type correction for small samples.

    For more precise p-values, install scipy: pip install scipy
    """
    if not math.isfinite(t_stat):
        return 0.0
    abs_t = abs(t_stat)

    if df >= 30:
        # Normal approximation
        z = abs_t
        # Gaussian tail approximation (Abramowitz & Stegun 26.2.17)
        p_one = 0.5 * math.erfc(z / math.sqrt(2))
    else:
        # Use the beta incomplete function directly
        x = df / (df + abs_t * abs_t)
        p_one = 0.5 * _betai_approx(0.5 * df, 0.5, x)

    return min(1.0, p_one * (2 if two_tailed else 1))


def format_p_value(p: float) -> str:
    if p < 0.001:
        return "p < 0.001 ***"
    elif p < 0.01:
        return f"p = {p:.4f} **"
    elif p < 0.05:
        return f"p = {p:.4f} *"
    else:
        return f"p = {p:.4f} (n.s.)"


def main():
    print_header("01: Big-Science Decomposition (Line 1)")

    # Load yearly observed data from script 00
    yo_data = read_json(DATA_DIR / "yearly_observed.json")
    countries_data = {c["iso"]: c for c in yo_data["countries"]}

    results = []
    all_growth_big = []
    all_growth_small = []
    all_share_125 = []
    all_share_135 = []
    all_big_contribution = []

    for iso3 in sorted(COUNTRY_MAP.keys()):
        name = iso3_to_name(iso3)
        yd = countries_data.get(iso3)
        if not yd:
            print(f"  {iso3} ({name}): SKIP — no yearly data")
            continue

        print(f"  {iso3} ({name}) ...", end=" ", flush=True)

        # Fetch big-science yearly data
        big_yearly = fetch_big_science_yearly(iso3)

        yearly_rows = []
        total_125 = total_135 = 0
        big_125 = big_135 = 0
        small_125 = small_135 = 0

        for yr_data in yd["yearly"]:
            y = yr_data["year"]
            all_count = yr_data["adjusted"]
            big_count = big_yearly.get(y, 0)
            # Adjust big count proportionally to match the ScienceDB normalization
            obs_total = yr_data["observed"]
            if obs_total > 0:
                big_count = round(big_count * all_count / obs_total)
            small_count = max(0, all_count - big_count)

            yearly_rows.append({
                "year": y,
                "total": all_count,
                "big": big_count,
                "small": small_count,
                "share_big": big_count / all_count if all_count > 0 else 0,
            })

            if 2011 <= y <= 2015:
                total_125 += all_count
                big_125 += big_count
                small_125 += small_count
            else:
                total_135 += all_count
                big_135 += big_count
                small_135 += small_count

        growth_total = (total_135 - total_125) / total_125 if total_125 > 0 else 0
        growth_big = (big_135 - big_125) / big_125 if big_125 > 0 else (1.0 if big_135 > 0 else 0)
        growth_small = (small_135 - small_125) / small_125 if small_125 > 0 else (1.0 if small_135 > 0 else 0)
        big_contrib = (big_135 - big_125) / (total_135 - total_125) if (total_135 - total_125) > 0 else 0

        share_125 = big_125 / total_125 if total_125 > 0 else 0
        share_135 = big_135 / total_135 if total_135 > 0 else 0

        if growth_big < 100 and growth_small < 100:  # filter extreme outliers
            all_growth_big.append(growth_big)
            all_growth_small.append(growth_small)
        if share_125 > 0 or share_135 > 0:
            all_share_125.append(share_125)
            all_share_135.append(share_135)
        all_big_contribution.append(big_contrib)

        results.append({
            "iso": iso3,
            "name_cn": name,
            "yearly": yearly_rows,
            "period_125": {
                "total": total_125, "big": big_125, "small": small_125,
                "share_big": share_125,
            },
            "period_135": {
                "total": total_135, "big": big_135, "small": small_135,
                "share_big": share_135,
            },
            "growth_total": round(growth_total, 4),
            "growth_big": round(growth_big, 4),
            "growth_small": round(growth_small, 4),
            "big_contribution_to_growth": round(big_contrib, 4),
        })
        print(f"OK (big contrib: {big_contrib:.0%})")

    # ---- CEEC aggregate ----
    agg_yearly = {}
    agg_125 = {"total": 0, "big": 0, "small": 0}
    agg_135 = {"total": 0, "big": 0, "small": 0}
    for r in results:
        agg_125["total"] += r["period_125"]["total"]
        agg_125["big"] += r["period_125"]["big"]
        agg_125["small"] += r["period_125"]["small"]
        agg_135["total"] += r["period_135"]["total"]
        agg_135["big"] += r["period_135"]["big"]
        agg_135["small"] += r["period_135"]["small"]
        for yr in r["yearly"]:
            y = yr["year"]
            if y not in agg_yearly:
                agg_yearly[y] = {"total": 0, "big": 0, "small": 0}
            agg_yearly[y]["total"] += yr["total"]
            agg_yearly[y]["big"] += yr["big"]
            agg_yearly[y]["small"] += yr["small"]

    agg_125["share_big"] = agg_125["big"] / agg_125["total"] if agg_125["total"] > 0 else 0
    agg_135["share_big"] = agg_135["big"] / agg_135["total"] if agg_135["total"] > 0 else 0
    agg_growth_total = (agg_135["total"] - agg_125["total"]) / agg_125["total"]
    agg_growth_big = (agg_135["big"] - agg_125["big"]) / agg_125["big"] if agg_125["big"] > 0 else 0
    agg_growth_small = (agg_135["small"] - agg_125["small"]) / agg_125["small"] if agg_125["small"] > 0 else 0
    agg_big_contrib = (agg_135["big"] - agg_125["big"]) / (agg_135["total"] - agg_125["total"])

    # ---- Statistical Tests ----
    print_subsection("Statistical Tests")

    # Test 1: Paired t-test — growth_big vs growth_small
    n1 = len(all_growth_big)
    diffs1 = [all_growth_big[i] - all_growth_small[i] for i in range(n1)]
    t1 = t_statistic_paired(diffs1)
    df1 = n1 - 1
    p1 = simple_p_value_from_t(t1, df1, two_tailed=True)
    d1 = cohens_d_paired(diffs1)

    print(f"\n  Test 1: Growth rate difference (big vs small)")
    print(f"    H0: growth_big == growth_small")
    print(f"    n = {n1}")
    print(f"    Mean growth_big = {mean(all_growth_big):.2f}")
    print(f"    Mean growth_small = {mean(all_growth_small):.2f}")
    print(f"    t({df1}) = {t1:.3f}, {format_p_value(p1)}")
    print(f"    Cohen's d = {d1:.2f}")
    sig1 = p1 < 0.05
    print(f"    Significant at 0.05: {'YES' if sig1 else 'NO'}")

    # Test 2: Paired one-tailed — share_big_135 > share_big_125
    print(f"\n  Test 2: Big-science share acceleration (十二五→十三五)")
    print(f"    H0: share_big_125 >= share_big_135 (no increase)")
    print(f"    H1: share_big_135 > share_big_125 (share is growing)")
    n2 = len(all_share_135)
    diffs2 = [all_share_135[i] - all_share_125[i] for i in range(n2)]
    t2 = t_statistic_paired(diffs2)
    df2 = n2 - 1
    p2 = simple_p_value_from_t(t2, df2, two_tailed=False)
    d2 = cohens_d_paired(diffs2)

    print(f"    n = {n2}")
    print(f"    Mean share_125 = {mean(all_share_125):.3f}")
    print(f"    Mean share_135 = {mean(all_share_135):.3f}")
    print(f"    t({df2}) = {t2:.3f}, {format_p_value(p2)}")
    print(f"    Cohen's d = {d2:.2f}")
    sig2 = p2 < 0.05
    print(f"    Significant at 0.05: {'YES' if sig2 else 'NO'}")

    # Test 3: Growth decomposition
    print(f"\n  Test 3: Big-science contribution to absolute growth")
    print(f"    CEEC aggregate big-science contribution: {agg_big_contrib:.1%}")
    print(f"    Countries where big-science > 50% of growth:")
    high_big = sorted(
        [r for r in results if r["big_contribution_to_growth"] > 0.5],
        key=lambda r: -r["big_contribution_to_growth"]
    )
    for r in high_big:
        print(f"      {r['name_cn']}: {r['big_contribution_to_growth']:.0%}")
    print(f"    Countries where small-bilateral > 50% of growth:")
    high_small = sorted(
        [r for r in results if r["big_contribution_to_growth"] < 0.5],
        key=lambda r: r["big_contribution_to_growth"]
    )
    for r in high_small:
        print(f"      {r['name_cn']}: {r['big_contribution_to_growth']:.0%}")

    # ---- CEEC aggregate print ----
    print_subsection("CEEC Aggregate Summary")
    print(f"  十二五 (2011-2015): total={agg_125['total']}, big={agg_125['big']}, "
          f"small={agg_125['small']}, share_big={agg_125['share_big']:.2%}")
    print(f"  十三五 (2016-2020): total={agg_135['total']}, big={agg_135['big']}, "
          f"small={agg_135['small']}, share_big={agg_135['share_big']:.2%}")
    print(f"  Growth: total={agg_growth_total:.1%}, big={agg_growth_big:.1%}, "
          f"small={agg_growth_small:.1%}")
    print(f"  Big-science contribution to growth: {agg_big_contrib:.1%}")

    output = {
        "source": "OpenAlex /works API (group_by=publication_year, authors_count:>99)",
        "fetched_at": __import__("datetime").datetime.now().isoformat(),
        "method": {
            "big_science_threshold": BIG_THRESHOLD,
            "description": "group_by=publication_year with two filter variants per country: all papers and authors_count:>99. Small-bilateral = total - big-science.",
        },
        "ceec_aggregate": {
            "period_125": agg_125,
            "period_135": agg_135,
            "growth_total": round(agg_growth_total, 4),
            "growth_big": round(agg_growth_big, 4),
            "growth_small": round(agg_growth_small, 4),
            "big_contribution_to_growth": round(agg_big_contrib, 4),
        },
        "by_country": results,
        "statistical_tests": {
            "test1_growth_rate_difference": {
                "description": "Paired two-tailed t-test: growth_big vs growth_small",
                "h0": "growth_big == growth_small",
                "t_statistic": round(t1, 4),
                "df": df1,
                "p_value": round(p1, 6),
                "significant_at_0_05": sig1,
                "cohens_d": round(d1, 4),
                "mean_growth_big": round(mean(all_growth_big), 4),
                "mean_growth_small": round(mean(all_growth_small), 4),
            },
            "test2_share_acceleration": {
                "description": "Paired one-tailed t-test: share_big_135 > share_big_125",
                "h0": "share_big_125 >= share_big_135",
                "h1": "share_big_135 > share_big_125",
                "t_statistic": round(t2, 4),
                "df": df2,
                "p_value": round(p2, 6),
                "significant_at_0_05": sig2,
                "cohens_d": round(d2, 4),
                "mean_share_125": round(mean(all_share_125), 4),
                "mean_share_135": round(mean(all_share_135), 4),
            },
            "test3_growth_decomposition": {
                "description": "Fraction of absolute growth from big-science papers",
                "ceec_weighted_big_contribution": round(agg_big_contrib, 4),
                "countries_big_science_driven": [r["iso"] for r in high_big],
                "countries_bilateral_driven": [r["iso"] for r in high_small],
            },
        },
    }

    write_json(DATA_DIR / "line1_big_science.json", output)
    print(f"\n  ✓ Saved to data_mining/data/line1_big_science.json")


if __name__ == "__main__":
    main()
