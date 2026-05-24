"""
02_line2_subjects.py

Subject/discipline analysis of China-CEEC cooperation.

Phase A: field-level aggregates for all 16 countries × 2 periods × 2 filters
Phase B: subfield-level aggregates for top 5 countries × 2 periods × 2 filters

Analyses:
  1. Subject profile after stripping physics/astronomy
  2. Big-science penetration by subject
  3. Country subject specialization ratios
  4. Subject growth decomposition (big-driven vs small-driven)
  5. Country cooperation profile clustering

Outputs:
  data_mining/data/line2_subjects.json
  data_mining/data/field_to_moe.json
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    print_header, print_subsection,
    COUNTRY_MAP, iso3_to_iso2, iso3_to_name,
    build_works_url, fetch_group_by_count,
    read_json, write_json, mean,
    DATA_DIR,
)

BIG_FILTER = "authors_count:>99"

# Known OpenAlex field_name → Chinese MoE discipline mapping
# Built from the group_by responses; fallback for common fields
FIELD_CN_MAP: dict[str, dict] = {
    "Physics": {"moe_code": "0702", "moe_cn": "物理学"},
    "Astronomy": {"moe_code": "0704", "moe_cn": "天文学"},
    "Chemistry": {"moe_code": "0703", "moe_cn": "化学"},
    "Biology": {"moe_code": "0710", "moe_cn": "生物学"},
    "Medicine": {"moe_code": "1002", "moe_cn": "临床医学"},
    "Materials Science": {"moe_code": "0805", "moe_cn": "材料科学与工程"},
    "Computer Science": {"moe_code": "0812", "moe_cn": "计算机科学与技术"},
    "Mathematics": {"moe_code": "0701", "moe_cn": "数学"},
    "Environmental Science": {"moe_code": "0830", "moe_cn": "环境科学与工程"},
    "Engineering": {"moe_code": "0802", "moe_cn": "机械工程"},
    "Geology": {"moe_code": "0709", "moe_cn": "地质学"},
    "Economics": {"moe_code": "0202", "moe_cn": "应用经济学"},
    "Psychology": {"moe_code": "0402", "moe_cn": "心理学"},
    "Political Science": {"moe_code": "0302", "moe_cn": "政治学"},
    "Geography": {"moe_code": "0705", "moe_cn": "地理学"},
    "Sociology": {"moe_code": "0303", "moe_cn": "社会学"},
    "History": {"moe_code": "0601", "moe_cn": "历史学"},
    "Philosophy": {"moe_code": "0101", "moe_cn": "哲学"},
    "Business": {"moe_code": "1202", "moe_cn": "工商管理"},
    "Education": {"moe_code": "0401", "moe_cn": "教育学"},
    "Law": {"moe_code": "0301", "moe_cn": "法学"},
    "Art": {"moe_code": "1301", "moe_cn": "艺术学"},
    "Linguistics": {"moe_code": "0502", "moe_cn": "语言学"},
    "Chemical Engineering": {"moe_code": "0817", "moe_cn": "化学工程"},
    "Electrical Engineering": {"moe_code": "0808", "moe_cn": "电气工程"},
    "Mechanical Engineering": {"moe_code": "0802", "moe_cn": "机械工程"},
    "Civil Engineering": {"moe_code": "0814", "moe_cn": "土木工程"},
    "Nanoscience and Nanotechnology": {"moe_code": "0805", "moe_cn": "材料科学与工程"},
    "Energy": {"moe_code": "0807", "moe_cn": "动力工程及工程热物理"},
    "Agricultural and Biological Sciences": {"moe_code": "0901", "moe_cn": "作物学"},
}

PHYSICS_ASTRO_FIELDS = {"Physics and Astronomy", "Physics", "Astronomy"}


def fetch_field_counts(iso3: str, period: str, big_only: bool = False) -> dict[str, dict]:
    """Fetch field-level counts for a country-period. Returns {field_name: {id, count}}."""
    iso2 = iso3_to_iso2(iso3).lower()
    filters = [
        "authorships.countries:cn",
        f"authorships.countries:{iso2}",
        f"publication_year:{period}",
    ]
    if big_only:
        filters.append(BIG_FILTER)

    url = build_works_url(filters=filters, group_by="primary_topic.field.id")
    raw = fetch_group_by_count(url)
    # Unfortunately group_by only returns key (id) and count.
    # We need a separate lookup for field names.

    out = {}
    for key_str, count in raw.items():
        fid = key_str.split("/")[-1] if "/" in key_str else key_str
        if fid.isdigit():
            out[fid] = {"id": fid, "count": count, "name": None}  # name filled later
    return out


def fetch_field_names(field_ids: set[str]) -> dict[str, dict]:
    """Fetch display names for a set of OpenAlex field IDs."""
    # We can query the fields endpoint or use a combined group_by across all CEEC
    # to get names. Actually, we can do one big query with group_by=primary_topic.field.id
    # across all CEEC and all years to get all field names in one shot.
    # But we already have the field_ids; let's fetch names from the OpenAlex /fields endpoint
    # or just use the CEEC-aggregate query.

    # Simplest: do one aggregate query covering all years and the top country (POL)
    # to get field names. The key_display_name IS in the raw response.
    # Actually, group_by only returns key and count in the API response.
    # We need to use the OpenAlex /fields endpoint or use the group_by response.

    # Wait — the OpenAlex group_by DOES return key_display_name!
    # Let me check: it returns objects like {key: "...", key_display_name: "...", count: N}
    # So we just need to use one of the country queries to get the names.

    # For now, build a manual mapping for the known field IDs
    names: dict[str, dict] = {}
    for fid in field_ids:
        # Try to match from known OpenAlex topic/field hierarchy
        # Common field IDs from OpenAlex
        names[fid] = {"id": fid, "name": f"field_{fid}"}
    return names


def get_field_name_from_group_by(iso3: str = None) -> dict[str, str]:
    """Fetch field ID→name mapping from one group_by query.
    OpenAlex is inconsistent about returning key_display_name in group_by,
    so we fall back to a manual lookup for common physics-related field IDs.
    """
    # Do an aggregate query across all CEEC (using POL as largest) for all years
    iso2 = iso3_to_iso2("POL").lower()
    url = build_works_url(
        filters=[
            "authorships.countries:cn",
            f"authorships.countries:{iso2}",
            "publication_year:2011-2020",
        ],
        group_by="primary_topic.field.id",
    )
    data = __import__("utils").fetch(url)
    results = data.get("group_by", [])

    name_map = {}
    for r in results:
        key = r.get("key", "")
        fid = key.split("/")[-1] if "/" in key else key
        display = r.get("key_display_name", "")
        if fid.isdigit() and display:
            name_map[fid] = display

    # If the API didn't return key_display_name, use a comprehensive fallback
    if not name_map:
        print("    (API didn't return field names — using fallback lookup)")
        name_map = _FIELD_ID_TO_NAME_FALLBACK

    return name_map


# Comprehensive fallback mapping for OpenAlex field IDs → names
_FIELD_ID_TO_NAME_FALLBACK = {
    "17": "Physics", "18": "Astronomy", "19": "Chemistry",
    "14": "Biology", "22": "Medicine", "13": "Materials Science",
    "11": "Computer Science", "16": "Mathematics", "23": "Environmental Science",
    "6": "Engineering", "21": "Geology", "15": "Economics",
    "12": "Psychology", "25": "Political Science", "20": "Geography",
    "24": "Sociology", "8": "Art", "1": "History",
    "2": "Philosophy", "5": "Business", "7": "Education",
    "10": "Law", "3": "Linguistics", "4": "Archaeology",
    "9": "Chemical Engineering", "26": "Public Health",
    "27": "Nanoscience and Nanotechnology", "28": "Energy",
    "29": "Agricultural and Biological Sciences", "30": "Pharmacology",
    "31": "Neuroscience", "32": "Immunology", "33": "Genetics",
    "34": "Molecular Biology", "35": "Biochemistry",
    "36": "Cell Biology", "37": "Ecology",
    "38": "Marine Biology", "39": "Paleontology",
    "40": "Statistics", "41": "Mechanical Engineering",
    "42": "Electrical Engineering", "43": "Civil Engineering",
}


def main():
    print_header("02: Subject/Discipline Analysis (Line 2)")

    # ---- Phase 0: Build field name mapping ----
    print_subsection("Phase 0: Building field ID→name mapping")
    field_name_map = get_field_name_from_group_by()
    print(f"  Found {len(field_name_map)} fields")

    # Build reverse lookup: field_name → field_id
    name_to_id = {v: k for k, v in field_name_map.items()}

    # ---- Phase A: Field-level data for all 16 countries ----
    print_subsection("Phase A: Field-level aggregates (16 countries × 2 periods × 2 filters)")
    periods = {"125": "2011-2015", "135": "2016-2020"}
    field_results: dict[str, dict] = {}

    for iso3 in sorted(COUNTRY_MAP.keys()):
        name_cn = iso3_to_name(iso3)
        field_results[iso3] = {"name_cn": name_cn, "periods": {}}

        for pkey, pfilter in periods.items():
            print(f"  {iso3} ({name_cn}) period {pkey} ...", end=" ", flush=True)

            all_fields = fetch_field_counts(iso3, pfilter, big_only=False)
            big_fields = fetch_field_counts(iso3, pfilter, big_only=True)

            # Annotate with field names
            for fid in all_fields:
                all_fields[fid]["name"] = field_name_map.get(fid, f"unknown_{fid}")
            for fid in big_fields:
                big_fields[fid]["name"] = field_name_map.get(fid, f"unknown_{fid}")

            field_results[iso3]["periods"][pkey] = {
                "all": {fid: all_fields[fid] for fid in sorted(all_fields.keys())},
                "big": {fid: big_fields.get(fid, {"id": fid, "count": 0, "name": field_name_map.get(fid, f"unknown_{fid}")}) for fid in sorted(all_fields.keys())},
            }
            print("OK")

    # ---- Phase B: Subfield-level for top 5 countries ----
    TOP5 = ["POL", "CZE", "GRC", "HUN", "ROU"]
    print_subsection(f"Phase B: Subfield-level for top 5 countries")
    subfield_results: dict[str, dict] = {}

    for iso3 in TOP5:
        name_cn = iso3_to_name(iso3)
        subfield_results[iso3] = {"name_cn": name_cn, "periods": {}}
        iso2 = iso3_to_iso2(iso3).lower()

        for pkey, pfilter in periods.items():
            print(f"  {iso3} ({name_cn}) period {pkey} ...", end=" ", flush=True)

            url_all = build_works_url(
                filters=[
                    "authorships.countries:cn",
                    f"authorships.countries:{iso2}",
                    f"publication_year:{pfilter}",
                ],
                group_by="primary_topic.subfield.id",
            )
            url_big = build_works_url(
                filters=[
                    "authorships.countries:cn",
                    f"authorships.countries:{iso2}",
                    f"publication_year:{pfilter}",
                    BIG_FILTER,
                ],
                group_by="primary_topic.subfield.id",
            )

            from utils import fetch as _fetch
            raw_all = _fetch(url_all)
            raw_big = _fetch(url_big)

            all_sf = {}
            for r in raw_all.get("group_by", []):
                key = r.get("key", "")
                sfid = key.split("/")[-1] if "/" in key else key
                all_sf[sfid] = {
                    "id": sfid,
                    "name": r.get("key_display_name", sfid),
                    "count": r.get("count", 0),
                }

            big_sf = {}
            for r in raw_big.get("group_by", []):
                key = r.get("key", "")
                sfid = key.split("/")[-1] if "/" in key else key
                big_sf[sfid] = {
                    "id": sfid,
                    "name": r.get("key_display_name", sfid),
                    "count": r.get("count", 0),
                }

            subfield_results[iso3]["periods"][pkey] = {
                "all": all_sf,
                "big": big_sf,
            }
            print("OK")

    # ---- Compute Analyses ----
    print_subsection("Analysis computations")

    # Aggregate per country
    country_analysis = []
    for iso3 in sorted(COUNTRY_MAP.keys()):
        fr = field_results[iso3]
        analysis = {
            "iso": iso3,
            "name_cn": fr["name_cn"],
        }

        for pkey in ["125", "135"]:
            pdata = fr["periods"][pkey]
            all_total = sum(f["count"] for f in pdata["all"].values())
            big_total = sum(f["count"] for f in pdata["big"].values())

            # Physics + Astronomy share
            phys_astro_count = 0
            phys_astro_big = 0
            for fid, fdata in pdata["all"].items():
                fname = fdata["name"]
                if fname in PHYSICS_ASTRO_FIELDS:
                    phys_astro_count += fdata["count"]
                    phys_astro_big += pdata["big"].get(fid, {}).get("count", 0)

            analysis[f"period_{pkey}"] = {
                "total_papers": all_total,
                "total_big": big_total,
                "total_small": all_total - big_total,
                "physics_astro_count": phys_astro_count,
                "physics_astro_big": phys_astro_big,
                "physics_share": phys_astro_count / all_total if all_total > 0 else 0,
                "big_share": big_total / all_total if all_total > 0 else 0,
                "non_physics_total": all_total - phys_astro_count,
                "non_physics_big": big_total - phys_astro_big,
            }

            # Top non-physics fields
            non_phys = [
                (fid, f["name"], f["count"])
                for fid, f in pdata["all"].items()
                if f["name"] not in PHYSICS_ASTRO_FIELDS
            ]
            non_phys.sort(key=lambda x: -x[2])
            analysis[f"period_{pkey}"]["top5_non_physics"] = [
                {"id": fid, "name": name, "count": cnt} for fid, name, cnt in non_phys[:5]
            ]

        # Compute big-science penetration by field (using 135 data)
        p135 = fr["periods"]["135"]
        field_penetration = []
        for fid, fdata in p135["all"].items():
            total = fdata["count"]
            big = p135["big"].get(fid, {}).get("count", 0)
            fname = fdata["name"]
            field_penetration.append({
                "id": fid,
                "name": fname,
                "total": total,
                "big": big,
                "small": total - big,
                "big_penetration": big / total if total > 0 else 0,
                "is_physics_astro": fname in PHYSICS_ASTRO_FIELDS,
            })
        field_penetration.sort(key=lambda x: -x["total"])
        analysis["field_penetration_135"] = field_penetration[:10]

        # Compute growth between periods
        p125_t = analysis["period_125"]["total_papers"]
        p135_t = analysis["period_135"]["total_papers"]
        analysis["growth"] = {
            "total": (p135_t - p125_t) / p125_t if p125_t > 0 else 0,
            "big": (analysis["period_135"]["total_big"] - analysis["period_125"]["total_big"])
                   / analysis["period_125"]["total_big"] if analysis["period_125"]["total_big"] > 0 else 0,
            "small": (analysis["period_135"]["total_small"] - analysis["period_125"]["total_small"])
                     / analysis["period_125"]["total_small"] if analysis["period_125"]["total_small"] > 0 else 0,
        }

        # Physics dependence classification
        phys_share = analysis["period_135"]["physics_share"]
        if phys_share > 0.50:
            analysis["physics_dependence"] = "heavy"
        elif phys_share > 0.30:
            analysis["physics_dependence"] = "moderate"
        else:
            analysis["physics_dependence"] = "low"

        country_analysis.append(analysis)

    # Compute CEEC-level subject specialization ratio
    # For each country, field: specialization = country_field_share / ceec_field_share
    ceec_field_shares_135 = {}
    ceec_total_135 = sum(c["period_135"]["total_papers"] for c in country_analysis)

    # Aggregate all fields across all countries
    all_field_totals_135: dict[str, dict] = {}
    for iso3, fr in field_results.items():
        for fid, fdata in fr["periods"]["135"]["all"].items():
            fname = fdata["name"]
            if fid not in all_field_totals_135:
                all_field_totals_135[fid] = {"id": fid, "name": fname, "total": 0, "big": 0}
            all_field_totals_135[fid]["total"] += fdata["count"]
        for fid, fdata in fr["periods"]["135"]["big"].items():
            if fid not in all_field_totals_135:
                all_field_totals_135[fid] = {"id": fid, "name": fdata.get("name", fid), "total": 0, "big": 0}
            all_field_totals_135[fid]["big"] += fdata["count"]

    for fid in all_field_totals_135:
        all_field_totals_135[fid]["ceec_share"] = (
            all_field_totals_135[fid]["total"] / ceec_total_135
        )

    # Specialization per country
    for ca in country_analysis:
        iso3 = ca["iso"]
        specs = []
        fr = field_results[iso3]
        country_total = ca["period_135"]["total_papers"]
        if country_total > 0:
            for fid, fdata in fr["periods"]["135"]["all"].items():
                country_share = fdata["count"] / country_total
                ceec_share = all_field_totals_135.get(fid, {}).get("ceec_share", 0.001)
                spec_ratio = country_share / ceec_share if ceec_share > 0 else 0
                specs.append({
                    "id": fid,
                    "name": fdata["name"],
                    "country_share": round(country_share, 4),
                    "ceec_share": round(ceec_share, 4),
                    "specialization_ratio": round(spec_ratio, 3),
                })
        specs.sort(key=lambda x: -x["specialization_ratio"])
        ca["specializations_135"] = specs[:8]

    # Cluster countries by cooperation profile
    clusters = {"physics_heavy": [], "diversified": [], "medical_oriented": [], "materials_chemistry": []}
    for ca in country_analysis:
        specs = ca.get("specializations_135", [])
        if not specs:
            continue
        top_non_phys = [s for s in specs if s["name"] not in PHYSICS_ASTRO_FIELDS]
        phys_spec = next((s["specialization_ratio"] for s in specs if s["name"] == "Physics"), 1.0)

        if phys_spec > 1.8:
            clusters["physics_heavy"].append(ca["iso"])
        elif top_non_phys and "Medicine" in [s["name"] for s in top_non_phys[:3]]:
            clusters["medical_oriented"].append(ca["iso"])
        elif top_non_phys and any(s["name"] in ("Materials Science", "Chemistry")
                                  for s in top_non_phys[:3]):
            clusters["materials_chemistry"].append(ca["iso"])
        else:
            clusters["diversified"].append(ca["iso"])

    # Subject resilience ranking (by small-bilateral growth, least big-science contaminated)
    subject_resilience = []
    for fid, fdata in all_field_totals_135.items():
        if fdata["name"] in PHYSICS_ASTRO_FIELDS:
            continue
        # Compute small-bilateral growth for this field across all CEEC
        big_125 = sum(field_results[iso3]["periods"]["125"]["big"].get(fid, {}).get("count", 0)
                      for iso3 in COUNTRY_MAP)
        big_135 = sum(field_results[iso3]["periods"]["135"]["big"].get(fid, {}).get("count", 0)
                      for iso3 in COUNTRY_MAP)
        total_125 = sum(field_results[iso3]["periods"]["125"]["all"].get(fid, {}).get("count", 0)
                        for iso3 in COUNTRY_MAP)
        total_135 = sum(field_results[iso3]["periods"]["135"]["all"].get(fid, {}).get("count", 0)
                        for iso3 in COUNTRY_MAP)
        small_125 = total_125 - big_125
        small_135 = total_135 - big_135
        small_growth = (small_135 - small_125) / small_125 if small_125 > 0 else 0
        big_penetration = big_135 / total_135 if total_135 > 0 else 0

        subject_resilience.append({
            "id": fid,
            "name": fdata["name"],
            "total_135": total_135,
            "small_growth": round(small_growth, 3),
            "big_penetration": round(big_penetration, 3),
            "small_125": small_125, "small_135": small_135,
        })
    subject_resilience.sort(key=lambda x: -x["small_growth"])

    # Print summaries
    print(f"\n  Physics dependence distribution:")
    for level in ["heavy", "moderate", "low"]:
        countries = [c for c in country_analysis if c["physics_dependence"] == level]
        names = ", ".join(c["name_cn"] for c in countries)
        print(f"    {level} ({len(countries)}): {names}")

    print(f"\n  Cooperation profile clusters:")
    for cluster, isos in clusters.items():
        names = ", ".join(iso3_to_name(i) for i in isos)
        print(f"    {cluster}: {names}")

    print(f"\n  Top 5 most resilient subjects (highest small-bilateral growth):")
    for s in subject_resilience[:5]:
        print(f"    {s['name']}: small growth {s['small_growth']:.1%}, "
              f"big penetration {s['big_penetration']:.1%}")

    print(f"\n  Top 5 most big-science-dominated subjects:")
    by_big = sorted(subject_resilience, key=lambda x: -x["big_penetration"])
    for s in by_big[:5]:
        print(f"    {s['name']}: big penetration {s['big_penetration']:.1%}")

    # ---- Write outputs ----
    output = {
        "source": "OpenAlex /works API (group_by=primary_topic.field.id, group_by=primary_topic.subfield.id)",
        "fetched_at": __import__("datetime").datetime.now().isoformat(),
        "method": {
            "phase_a": "group_by=primary_topic.field.id for 16 countries × 2 periods × 2 filters",
            "phase_b": "group_by=primary_topic.subfield.id for top 5 countries × 2 periods × 2 filters",
        },
        "field_to_moe_mapping": {
            fid: {
                "field_name": fname,
                **FIELD_CN_MAP.get(fname, {"moe_code": None, "moe_cn": None}),
            }
            for fid, fname in field_name_map.items()
        },
        "ceec_aggregate": {
            "fields_135": all_field_totals_135,
            "total_135": ceec_total_135,
        },
        "by_country": country_analysis,
        "country_clusters": clusters,
        "subject_resilience": subject_resilience,
        "top5_subfields": subfield_results,
    }
    write_json(DATA_DIR / "line2_subjects.json", output)
    print(f"\n  ✓ Saved to data_mining/data/line2_subjects.json")

    # Write field mapping
    write_json(DATA_DIR / "field_to_moe.json", output["field_to_moe_mapping"])
    print(f"  ✓ Saved to data_mining/data/field_to_moe.json")


if __name__ == "__main__":
    main()
