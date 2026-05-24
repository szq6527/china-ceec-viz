"""
04_line3_h2020.py

EU research embeddeness vs China cooperation correlation analysis.

Primary analysis (OpenAlex-based, internally consistent):
  For each CEEC country, fetch cooperation volume with the "EU6" major research nations
  (DE, FR, GB, IT, ES, NL). This yields an "EU cooperation intensity" metric directly
  comparable to China cooperation — same data source, same granularity.

  H1: EU cooperation intensity is negatively correlated with China cooperation RCA.
  H2: Non-EU Balkan countries show higher China/EU cooperation ratios (eastward substitution).

Supplementary (H2020 CSV, if available):
  Download CORDIS H2020 project data and compute per-country participation counts.
  Correlate with China RCA as an external validation.

Output: data_mining/data/line3_h2020.json
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
    DATA_DIR, PUBLIC_DATA,
)

YEAR_RANGE = list(range(2011, 2021))
EU6 = ["DE", "FR", "GB", "IT", "ES", "NL"]
EU6_NAMES = {"DE": "德国", "FR": "法国", "GB": "英国", "IT": "意大利", "ES": "西班牙", "NL": "荷兰"}


def fetch_ceec_eu6_coop(iso3: str) -> dict[int, dict[str, int]]:
    """Fetch CEEC country's cooperation with each EU6 country by year.
    Returns {year: {EU6_code: count, ...}, ...}."""
    ceec_iso2 = iso3_to_iso2(iso3).lower()
    result = {y: {} for y in YEAR_RANGE}

    for eu6_code in EU6:
        eu6_iso2 = eu6_code.lower()
        url = build_works_url(
            filters=[
                f"authorships.countries:{ceec_iso2}",
                f"authorships.countries:{eu6_iso2}",
                "publication_year:2011-2020",
            ],
            group_by="publication_year",
        )
        raw = fetch_group_by_count(url)
        yearly = extract_yearly(raw)
        for y in YEAR_RANGE:
            result[y][eu6_code] = yearly.get(y, 0)

    return result


def pearson_r(x: list[float], y: list[float]) -> tuple[float, float]:
    """Pearson correlation coefficient and p-value (t-test based)."""
    n = len(x)
    if n < 3:
        return 0.0, 1.0
    mx, my = mean(x), mean(y)
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    den = math.sqrt(sum((xi - mx) ** 2 for xi in x) * sum((yi - my) ** 2 for yi in y))
    r = num / den if den > 0 else 0.0

    # t-test for correlation
    if abs(r) >= 1.0:
        return r, 0.0
    t = r * math.sqrt((n - 2) / (1 - r * r))
    # Approximate p from t-distribution with n-2 df (normal approx for n>=10)
    p = 2.0 * _t_survival(abs(t), n - 2)
    return r, p


def _t_survival(t: float, df: int) -> float:
    """Approximate t-distribution survival function."""
    if df < 1:
        return 0.5 * math.erfc(t / math.sqrt(2))
    x = df / (df + t * t)
    # Use beta incomplete approximation (simplified)
    return 0.5 * _betai_approx(0.5 * df, 0.5, x)


def _betai_approx(a: float, b: float, x: float) -> float:
    """Approximate regularized incomplete beta function."""
    import math as _math
    if x > 0.5:
        return 1.0 - _betai_approx(b, a, 1.0 - x)
    ln_beta = _math.lgamma(a) + _math.lgamma(b) - _math.lgamma(a + b)
    result = 0.0
    term = _math.exp(a * _math.log(x) + b * _math.log(1.0 - x) - ln_beta) / a
    result += term
    for n in range(1, 200):
        term *= (a + b + n - 1) * x / (a + n)
        result += term
        if abs(term) < 1e-15 * abs(result):
            break
    return result


def main():
    print_header("04: EU Embeddeness vs China Cooperation (Line 3)")

    # Load RCA data from script 03
    rca_data = read_json(DATA_DIR / "line3_rca.json")
    country_rca = {c["iso"]: c for c in rca_data["by_country"]}

    # ---- Part A: Fetch CEEC-EU6 cooperation data ----
    print_subsection("Part A: CEEC-EU6 cooperation data")
    eu6_data = {}

    for iso3 in sorted(COUNTRY_MAP.keys()):
        name = iso3_to_name(iso3)
        print(f"  {iso3} ({name}) ...", end=" ", flush=True)
        coop = fetch_ceec_eu6_coop(iso3)
        eu6_total_2020 = sum(coop.get(2020, {}).values())
        print(f"(EU6 2020: {eu6_total_2020:,})")
        eu6_data[iso3] = coop

    # Compute total EU6 papers per CEEC country per year
    eu6_yearly_totals = {}
    for iso3, coop in eu6_data.items():
        eu6_yearly_totals[iso3] = {
            y: sum(coop[y].values()) for y in YEAR_RANGE
        }

    # ---- Part B: Correlation Analysis ----
    print_subsection("Part B: Correlation Analysis")

    # Metric 1: EU6 cooperation intensity for 2020
    #   = EU6 papers in 2020 / country total papers in 2020
    # Metric 2: China cooperation RCA 2020 (from script 03)

    eu6_intensity = []
    china_rca_vals = []
    country_labels = []
    for iso3 in sorted(COUNTRY_MAP.keys()):
        crca = country_rca.get(iso3)
        if not crca:
            continue
        eu6_total = eu6_yearly_totals.get(iso3, {}).get(2020, 0)
        country_total = crca["yearly"][-1]["country_total_papers"]
        intensity = eu6_total / country_total if country_total > 0 else 0

        eu6_intensity.append(intensity)
        china_rca_vals.append(crca["rca_2020"])
        country_labels.append(iso3)

    n = len(eu6_intensity)

    # Test 1: EU6 intensity vs China RCA
    r1, p1 = pearson_r(eu6_intensity, china_rca_vals)
    print(f"\n  Test 1: EU6 cooperation intensity vs China RCA (2020)")
    print(f"    n = {n}")
    print(f"    Pearson r = {r1:.3f}, p = {p1:.4f}")
    print(f"    {'Significant' if p1 < 0.05 else 'Not significant'} at 0.05")
    print(f"    Interpretation: {'Negative correlation: countries with stronger EU ties cooperate less with China' if r1 < -0.2 else 'Weak correlation' if abs(r1) < 0.2 else 'Positive correlation'}")

    # Test 2: EU6/China cooperation ratio by geopolitical group
    print(f"\n  Test 2: EU6/China cooperation ratio by geopolitical group")
    groups_ratios = {}
    for gkey, ginfo in GEOPOLITICAL_GROUPS.items():
        g_ratios = []
        for iso3 in ginfo["countries"]:
            eu6_2020 = eu6_yearly_totals.get(iso3, {}).get(2020, 0)
            crca = country_rca.get(iso3)
            if not crca:
                continue
            china_2020 = crca["yearly"][-1]["cn_ceec_papers"]
            if china_2020 > 0:
                g_ratios.append(eu6_2020 / china_2020)
        if g_ratios:
            groups_ratios[gkey] = {
                "label": ginfo["label"],
                "mean_eu6_china_ratio": round(mean(g_ratios), 2),
                "countries": ginfo["countries"],
                "individual_ratios": [round(r, 2) for r in g_ratios],
            }
            print(f"    {ginfo['label']}: EU6/China ratio = {mean(g_ratios):.1f}")

    # Test 3: Eastward substitution
    print(f"\n  Test 3: Eastward substitution hypothesis")
    # EU members
    eu_member_isos = []
    for gkey in ["eurozone_core", "eurozone_special", "eu_non_eurozone"]:
        eu_member_isos.extend(GEOPOLITICAL_GROUPS[gkey]["countries"])
    eu_candidate_isos = GEOPOLITICAL_GROUPS["eu_candidate"]["countries"]

    member_ratios = []
    for iso3 in eu_member_isos:
        eu6_2020 = eu6_yearly_totals.get(iso3, {}).get(2020, 0)
        crca = country_rca.get(iso3)
        if not crca:
            continue
        china_2020 = crca["yearly"][-1]["cn_ceec_papers"]
        if china_2020 > 0:
            member_ratios.append(eu6_2020 / china_2020)

    candidate_ratios = []
    for iso3 in eu_candidate_isos:
        eu6_2020 = eu6_yearly_totals.get(iso3, {}).get(2020, 0)
        crca = country_rca.get(iso3)
        if not crca:
            continue
        china_2020 = crca["yearly"][-1]["cn_ceec_papers"]
        if china_2020 > 0:
            candidate_ratios.append(eu6_2020 / china_2020)

    mean_member = mean(member_ratios)
    mean_candidate = mean(candidate_ratios)
    print(f"    EU members:      EU6/China = {mean_member:.1f} (higher = more EU-oriented)")
    print(f"    EU candidates:   EU6/China = {mean_candidate:.1f}")
    print(f"    Ratio:           members have {mean_member/mean_candidate:.1f}x the EU6/China ratio" if mean_candidate > 0 else "")

    # Also compute: China share of total international cooperation vs EU6 share
    # for each group
    print(f"\n  Comparative cooperation shares (2020):")
    for label, isos in [("EU members", eu_member_isos), ("EU candidates", eu_candidate_isos)]:
        total_china = 0
        total_eu6 = 0
        total_all = 0
        for iso3 in isos:
            crca = country_rca.get(iso3)
            if not crca:
                continue
            total_china += crca["yearly"][-1]["cn_ceec_papers"]
            total_eu6 += eu6_yearly_totals.get(iso3, {}).get(2020, 0)
            total_all += crca["yearly"][-1]["country_total_papers"]

        if total_all > 0:
            china_share = total_china / total_all
            eu6_share = total_eu6 / total_all
            print(f"    {label}: China={china_share:.1%}, EU6={eu6_share:.1%}, "
                  f"EU6/China ratio={eu6_share/china_share:.1f}x" if china_share > 0 else "")

    # ---- Part C: Try H2020 CSV download ----
    print_subsection("Part C: Horizon 2020 data (supplementary)")
    h2020_by_country = {}
    h2020_csv_available = False

    try:
        import urllib.request
        import csv
        import io

        h2020_url = "https://cordis.europa.eu/data/cordis-h2020projects.csv"
        print(f"  Attempting download: {h2020_url}")

        req = urllib.request.Request(h2020_url)
        req.add_header("User-Agent", "ceec-viz/0.3 (mailto:sunzhengqi2024@gmail.com)")
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8-sig", errors="replace")

        reader = csv.DictReader(io.StringIO(content))
        project_count = 0
        for row in reader:
            project_count += 1
            participants = row.get("participantCountries", "")
            if not participants:
                continue
            for code in participants.split(";"):
                code = code.strip()
                if code in EU6 or any(iso3_to_iso2(iso3) == code for iso3 in COUNTRY_MAP):
                    h2020_by_country[code] = h2020_by_country.get(code, 0) + 1

        print(f"  Downloaded: {project_count} projects, {len(h2020_by_country)} relevant countries")
        h2020_csv_available = True

        # Map ISO2 → ISO3 for CEEC countries
        iso2_to_iso3 = {iso3_to_iso2(iso3): iso3 for iso3 in COUNTRY_MAP}
        h2020_ceec = {}
        for code, count in h2020_by_country.items():
            iso3 = iso2_to_iso3.get(code)
            if iso3:
                h2020_ceec[iso3] = count
        h2020_by_country = h2020_ceec

        # Correlate H2020 participations with China RCA
        h2020_vals = []
        china_rca_for_h2020 = []
        for iso3 in sorted(COUNTRY_MAP.keys()):
            if iso3 in h2020_by_country:
                h2020_vals.append(h2020_by_country[iso3])
                china_rca_for_h2020.append(country_rca.get(iso3, {}).get("rca_2020", 0))

        if len(h2020_vals) >= 5:
            r_h2020, p_h2020 = pearson_r(h2020_vals, china_rca_for_h2020)
            print(f"\n  H2020 participations vs China RCA:")
            print(f"    n = {len(h2020_vals)}")
            print(f"    Pearson r = {r_h2020:.3f}, p = {p_h2020:.4f}")

    except Exception as e:
        print(f"  H2020 CSV download failed: {e}")
        print(f"  Falling back to EU6-only analysis (internally consistent).")

    # ---- Output ----
    output = {
        "source": "OpenAlex /works API + CORDIS H2020 CSV (if available)",
        "fetched_at": __import__("datetime").datetime.now().isoformat(),
        "method": {
            "primary": "EU6 cooperation intensity from OpenAlex group_by queries per CEEC country per EU6 partner",
            "eu6_countries": EU6,
            "supplementary": "CORDIS H2020 project CSV from cordis.europa.eu",
            "h2020_available": h2020_csv_available,
        },
        "by_country": [
            {
                "iso": iso3,
                "name_cn": iso3_to_name(iso3),
                "geopolitical_group": iso3_to_group(iso3),
                "eu6_papers_2020": eu6_yearly_totals.get(iso3, {}).get(2020, 0),
                "china_papers_2020": country_rca.get(iso3, {}).get("yearly", [{}])[-1].get("cn_ceec_papers", 0),
                "eu6_china_ratio_2020": round(
                    eu6_yearly_totals.get(iso3, {}).get(2020, 0) /
                    max(country_rca.get(iso3, {}).get("yearly", [{}])[-1].get("cn_ceec_papers", 0), 1),
                    2
                ),
                "eu6_intensity_2020": round(
                    eu6_yearly_totals.get(iso3, {}).get(2020, 0) /
                    max(country_rca.get(iso3, {}).get("yearly", [{}])[-1].get("country_total_papers", 0), 1),
                    4
                ),
                "h2020_participations": h2020_by_country.get(iso3, None),
            }
            for iso3 in sorted(COUNTRY_MAP.keys())
        ],
        "correlations": {
            "eu6_intensity_vs_china_rca": {
                "pearson_r": round(r1, 4),
                "p_value": round(p1, 6),
                "n": n,
                "significant_at_0_05": p1 < 0.05,
            },
        },
        "geopolitical_group_eu6_china_ratios": groups_ratios,
        "eastward_substitution": {
            "eu_members_mean_eu6_china_ratio": round(mean_member, 2),
            "eu_candidates_mean_eu6_china_ratio": round(mean_candidate, 2),
            "ratio_members_to_candidates": round(mean_member / mean_candidate, 2) if mean_candidate > 0 else None,
            "interpretation": "Higher EU6/China ratio = more EU-oriented. EU members show stronger EU orientation than candidates.",
        },
    }

    if h2020_csv_available:
        output["h2020_correlations"] = {
            "h2020_vs_china_rca": {
                "pearson_r": round(r_h2020, 4) if 'r_h2020' in dir() else None,
                "p_value": round(p_h2020, 6) if 'p_h2020' in dir() else None,
            }
        }

    write_json(DATA_DIR / "line3_h2020.json", output)
    print(f"\n  ✓ Saved to data_mining/data/line3_h2020.json")


if __name__ == "__main__":
    main()
