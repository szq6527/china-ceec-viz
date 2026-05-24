"""
06_prepare_viz_data.py

Generate visualization-ready JSON files from the data mining outputs.
Output files go to data_mining/data/viz/ for consumption by new frontend scenes.

Outputs:
  viz_eu6_china_scatter.json   — EU6 intensity vs China RCA per country
  viz_rca_trajectories.json    — Yearly RCA trajectories + typology
  viz_subject_specialization.json — Country specialization ratios
  viz_country_typology.json    — Four-fold country typology
  viz_big_science_timeline.json — Big vs small bilateral yearly totals
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import read_json, write_json, DATA_DIR

VIZ_DIR = DATA_DIR / "viz"


def prepare_eu6_china_scatter():
    """
    Scene: "双外向型" — EU6 intensity vs China RCA scatter plot.

    Core narrative: EU6 cooperation intensity is POSITIVELY correlated with
    China RCA (r=0.64, p=0.008). Countries that collaborate more with EU6
    also collaborate more with China — "dual-outward", not "choosing sides".

    Visual design:
    - X-axis: EU6 cooperation intensity (eu6_papers / total_output)
    - Y-axis: Internal RCA (self-consistent, preferred for comparison)
    - Each dot: one CEEC country, size = total scientific output
    - Color: geopolitical group
    - Reference line: RCA = 1
    - Highlight annotations: Estonia ("双超连接"), Poland ("自给自足悖论")
    """
    h2020 = read_json(DATA_DIR / "line3_h2020.json")
    rca = read_json(DATA_DIR / "line3_rca.json")

    rca_by_iso = {}
    for c in rca["by_country"]:
        rca_by_iso[c["iso"]] = c

    countries = []
    for c in h2020["by_country"]:
        iso = c["iso"]
        rc = rca_by_iso.get(iso, {})
        countries.append({
            "iso": iso,
            "name_cn": c["name_cn"],
            "geopolitical_group": c["geopolitical_group"],
            "eu6_intensity_2020": c["eu6_intensity_2020"],
            "eu6_papers_2020": c["eu6_papers_2020"],
            "china_papers_2020": c["china_papers_2020"],
            "eu6_china_ratio": c["eu6_china_ratio_2020"],
            "china_rca_2020": rc.get("rca_2020"),
            "china_internal_rca_2020": rc.get("internal_rca_2020"),
            "china_portfolio_rank_2020": rc.get("china_portfolio_rank_2020"),
            "total_output": rc.get("total_output_2011_2020", 0),
            "is_small_country": rc.get("is_small_country", False),
            "rca_trend": rc.get("rca_trend", "stable"),
        })

    output = {
        "source": "OpenAlex + ScienceDB",
        "description": "EU6 cooperation intensity vs China Revealed Comparative Advantage",
        "correlation": h2020.get("correlations", {}),
        "geopolitical_groups": {
            "eurozone_core": {"label": "欧元区核心", "color": "#4cc9f0"},
            "eurozone_special": {"label": "希腊(欧元区·债务危机)", "color": "#f5b14a"},
            "eu_non_eurozone": {"label": "欧盟·非欧元区", "color": "#c77dff"},
            "eu_candidate": {"label": "欧盟候选/潜在候选国", "color": "#80ed99"},
        },
        "annotation_lines": {
            "rca_1": {"value": 1.0, "label": "RCA = 1 (全球平均)", "dash": "4 4"},
        },
        "highlights": [
            {
                "iso": "EST",
                "reason": "双超连接: EU6强度最高(60.2%) + 中国RCA最高(3.53)",
                "position": "top-right",
            },
            {
                "iso": "POL",
                "reason": "自给自足悖论: 最大科研体量 + 最低国际共著率 + RCA<1",
                "position": "bottom-left",
            },
        ],
        "countries": countries,
    }

    write_json(VIZ_DIR / "viz_eu6_china_scatter.json", output)
    print(f"  viz_eu6_china_scatter.json: {len(countries)} countries")


def prepare_rca_trajectories():
    """
    Scene: "RCA十年沉浮" — RCA trajectory small multiples (4x4 grid).

    Core narrative: 11 of 14 countries with data saw RCA decline.
    Three trajectory types: continuous decline, V-shaped recovery, rising.
    Four-fold typology emerges from combining RCA + EU6 + big-science.

    Visual design:
    - 16 small line charts in a grid
    - Each chart: year (x) vs internal_rca (y), 2011-2020
    - Background reference: CEEC average RCA line
    - Color by trajectory class: red=declining, blue=V-shape, green=rising
    - Grouped into 4 quadrants matching the typology
    - Small-country badge on MNE, ALB, MKD
    """
    rca = read_json(DATA_DIR / "line3_rca.json")
    h2020 = read_json(DATA_DIR / "line3_h2020.json")
    big_sci = read_json(DATA_DIR / "line1_big_science.json")

    # Build lookup: iso -> eu6_intensity
    eu6_by_iso = {}
    for c in h2020["by_country"]:
        eu6_by_iso[c["iso"]] = {
            "eu6_intensity": c["eu6_intensity_2020"],
            "eu6_china_ratio": c["eu6_china_ratio_2020"],
        }

    # Build lookup: iso -> big-science share (135 period)
    big_by_iso = {}
    for c in big_sci["by_country"]:
        big_by_iso[c["iso"]] = {
            "period_125": c["period_125"],
            "period_135": c["period_135"],
        }

    # Compute CEEC average internal_rca per year
    ceec_avg_rca = {}
    for year in range(2011, 2021):
        vals = []
        for c in rca["by_country"]:
            yd = c["yearly"][year - 2011]
            if yd["internal_rca"] > 0:
                vals.append(yd["internal_rca"])
        if vals:
            ceec_avg_rca[year] = sum(vals) / len(vals)

    countries = []
    for c in rca["by_country"]:
        iso = c["iso"]
        eu6 = eu6_by_iso.get(iso, {})
        big = big_by_iso.get(iso, {})

        yearly = []
        for yd in c["yearly"]:
            yearly.append({
                "year": yd["year"],
                "internal_rca": round(yd["internal_rca"], 4),
                "global_rca": round(yd["global_rca"], 4),
                "cn_ceec_papers": yd["cn_ceec_papers"],
                "country_total_papers": yd["country_total_papers"],
            })

        countries.append({
            "iso": iso,
            "name_cn": c["name_cn"],
            "geopolitical_group": c["geopolitical_group"],
            "is_small_country": c.get("is_small_country", False),
            "rca_2011": c.get("rca_2011"),
            "rca_2020": c.get("rca_2020"),
            "internal_rca_2011": c.get("internal_rca_2011"),
            "internal_rca_2020": c.get("internal_rca_2020"),
            "rca_trend": c.get("rca_trend", "stable"),
            "china_portfolio_rank_2011": c.get("china_portfolio_rank_2011"),
            "china_portfolio_rank_2020": c.get("china_portfolio_rank_2020"),
            "eu6_intensity": eu6.get("eu6_intensity"),
            "eu6_china_ratio": eu6.get("eu6_china_ratio"),
            "big_science_share_125": big.get("period_125", {}).get("share_big"),
            "big_science_share_135": big.get("period_135", {}).get("share_big"),
            "yearly": yearly,
        })

    output = {
        "source": "OpenAlex group_by queries",
        "description": "Yearly RCA (Revealed Comparative Advantage) for China-CEEC cooperation",
        "ceec_avg_internal_rca": ceec_avg_rca,
        "countries": countries,
    }

    write_json(VIZ_DIR / "viz_rca_trajectories.json", output)
    print(f"  viz_rca_trajectories.json: {len(countries)} countries, 2011-2020")


def prepare_subject_specialization():
    """
    Scene: "真正的双边" enhancement — subject specialization ratios.

    Core narrative: Each country has a unique "cooperation fingerprint" in
    non-physics subjects. Specialization ratio = (country_subject_share /
    ceec_subject_share). Ratio > 1 means the country specializes in that
    subject relative to the CEEC average.

    Visual design:
    - Horizontal stacked bar chart (existing Scene 5 style)
    - Toggle: all subjects / non-physics only
    - Side panel: top 3 specialization fields per country
    - "Big-science penetration" indicator per field
    """
    subjects = read_json(DATA_DIR / "line2_subjects.json")

    # Build CEEC aggregate field distribution (135 period, all papers)
    ceec_field_totals = {}
    ceec_total = 0
    fields_135 = subjects.get("ceec_aggregate", {}).get("fields_135", {})
    for fid, fdata in fields_135.items():
        if isinstance(fdata, dict):
            count = fdata.get("total", 0)
            ceec_field_totals[fid] = count
            ceec_total += count

    # Field metadata
    field_meta = subjects.get("field_to_moe_mapping", {})

    countries = []
    for c in subjects.get("by_country", []):
        iso = c["iso"]
        p135 = c.get("period_135", {})

        # Compute specialization ratios for each field in period_135
        # field_penetration_135 is at country level, a list of {id, name, total, big, small, big_penetration, is_physics_astro}
        all_fields = {}
        big_fields = {}
        for fobj in c.get("field_penetration_135", []):
            fid = fobj.get("id", "")
            if fid:
                all_fields[fid] = fobj.get("total", 0)
                big_fields[fid] = fobj.get("big", 0)

        country_total = p135.get("total_papers", sum(all_fields.values()))

        specializations = []
        for fid, count in all_fields.items():
            if count > 0 and ceec_field_totals.get(fid, 0) > 0 and ceec_total > 0:
                country_share = count / country_total if country_total > 0 else 0
                ceec_share = ceec_field_totals[fid] / ceec_total
                ratio = country_share / ceec_share if ceec_share > 0 else 0
                big_count = big_fields.get(fid, 0)
                meta = field_meta.get(fid, {})
                specializations.append({
                    "field_id": fid,
                    "field_name": meta.get("field_name", all_fields.get(fid, fid)),
                    "count": count,
                    "big_count": big_count,
                    "big_penetration": round(big_count / count, 4) if count > 0 else 0,
                    "specialization_ratio": round(ratio, 2),
                })

        specializations.sort(key=lambda x: x["specialization_ratio"], reverse=True)

        countries.append({
            "iso": iso,
            "name_cn": c.get("name_cn", iso),
            "period_135_total": country_total,
            "physics_share": p135.get("physics_share", 0),
            "big_science_share": p135.get("big_share", 0),
            "physics_count": p135.get("physics_astro_count", 0),
            "physics_big_count": p135.get("physics_astro_big", 0),
            "non_physics_total": p135.get("non_physics_total", 0),
            "top5_non_physics": p135.get("top5_non_physics", []),
            "specializations": specializations,
        })

    output = {
        "source": "OpenAlex group_by=primary_topic.field.id",
        "description": "Country-level subject specialization ratios for China-CEEC cooperation (2016-2020)",
        "field_metadata": {fid: {"name": m.get("field_name", fid),
                                  "moe_code": m.get("moe_code"),
                                  "moe_cn": m.get("moe_cn")}
                           for fid, m in field_meta.items()},
        "ceec_field_distribution": ceec_field_totals,
        "ceec_total_135": ceec_total,
        "countries": countries,
    }

    write_json(VIZ_DIR / "viz_subject_specialization.json", output)
    print(f"  viz_subject_specialization.json: {len(countries)} countries")


def prepare_country_typology():
    """
    Scene: "四种合作面孔" — closing synthesis with four-fold typology.

    Type 1: 双超连接 (Dual Super-Connectors)
        - High EU6 intensity + high China RCA
        - Estonia, Slovenia, Hungary
        - "All directions open" — internationalization as a unified dimension

    Type 2: 大科学驱动 (Big-Science Driven)
        - High big-science contribution to growth (>10%)
        - Croatia, (Hungary also fits here)
        - "CERN pulls the numbers" — pulsed, not systematic

    Type 3: 自给自足 (Self-Sufficient)
        - Large research system + low international co-authorship rate
        - Poland, Romania, Serbia
        - "Large volume, inward-looking" — the Poland paradox

    Type 4: 追赶型小国 (Catch-Up Small Countries)
        - Small research systems, rising RCA from low base
        - Latvia, Lithuania, Montenegro, Albania, North Macedonia
        - "From zero to small" — non-physics oriented growth

    Visual design:
    - Four "cards" in a 2x2 grid
    - Each card: country flags, key stats, specialization tags
    - Animated entrance: cards flip in sequence
    """
    h2020 = read_json(DATA_DIR / "line3_h2020.json")
    rca = read_json(DATA_DIR / "line3_rca.json")
    big_sci = read_json(DATA_DIR / "line1_big_science.json")
    subjects = read_json(DATA_DIR / "line2_subjects.json")

    # Build per-country lookup
    h2020_by_iso = {}
    for c in h2020["by_country"]:
        h2020_by_iso[c["iso"]] = c

    rca_by_iso = {}
    for c in rca["by_country"]:
        rca_by_iso[c["iso"]] = c

    big_by_iso = {}
    for c in big_sci["by_country"]:
        big_by_iso[c["iso"]] = c

    subj_by_iso = {}
    for c in subjects.get("by_country", []):
        subj_by_iso[c["iso"]] = c

    # Classify each country into one of 4 types
    # Uses a priority order: dual_super > big_science > self_sufficient > catch_up
    def classify(iso):
        h = h2020_by_iso.get(iso, {})
        r = rca_by_iso.get(iso, {})
        b = big_by_iso.get(iso, {})

        eu6_intensity = h.get("eu6_intensity_2020", 0)
        internal_rca = r.get("internal_rca_2020", 0)
        big_contribution = b.get("big_contribution_to_growth", 0) or 0
        total_output = r.get("total_output_2011_2020", 0)

        # Type 1: Dual super-connector — high EU6 (>35%) + high China RCA (>1.3)
        if eu6_intensity > 0.33 and internal_rca > 1.3:
            return "dual_super_connector"

        # Type 2: Big-science driven — big contribution > 8%
        # Croatia=25.9%, Hungary=11.8%, Romania=9.6%
        if big_contribution > 0.08:
            return "big_science_driven"

        # Type 3: Self-sufficient — large output (>50000 papers) + low RCA (<1.1)
        if total_output > 50000 and internal_rca < 1.1:
            return "self_sufficient"

        # Type 4: Catch-up small countries
        return "catch_up_small"

    typology = {
        "dual_super_connector": {
            "label": "双超连接",
            "subtitle": "EU和中国两个方向都高度开放",
            "color": "#4cc9f0",
            "description": "科研国际化是一个统一的维度。这些国家在所有方向上都开放——EU6嵌入度最高,同时中国RCA也最高。它们是真正的'桥梁国家'。",
            "insight": "国际化不是零和博弈。爱沙尼亚对EU6的合作强度(60.2%)和对中国的RCA(3.53)同时位居第一。",
            "countries": [],
        },
        "big_science_driven": {
            "label": "大科学驱动",
            "subtitle": "CERN合作拉动了增长数字",
            "color": "#c77dff",
            "description": "大科学论文(≥100作者)贡献了超过10%的绝对增长。物理合作占比高,但非物理领域也有独特专长。",
            "insight": "大科学是脉冲式的(克罗地亚2016年大科学占比暴增至18.6%),而非系统性整合。剥离CERN后,这些国家的真实双边合作图景有所不同。",
            "countries": [],
        },
        "self_sufficient": {
            "label": "自给自足",
            "subtitle": "体量大,国际共著率低",
            "color": "#f5b14a",
            "description": "科研体量在CEEC中领先,但国际共著率偏低——无论是对EU6还是对中国,合作强度都低于平均水平。",
            "insight": "波兰悖论:贡献了最大份额的大科学绝对增长(+219篇),但中国RCA仅0.86(低于全球平均)。总量大的同时,国际化程度最低。",
            "countries": [],
        },
        "catch_up_small": {
            "label": "追赶型小国",
            "subtitle": "从零起步,非物理导向",
            "color": "#80ed99",
            "description": "科研体量小,RCA从极低基线快速上升。合作以非物理学科为主导——商业管理、决策科学、农业生物。",
            "insight": "这些小国的中国合作不是'大科学泡沫'——拉脱维亚的物理学占比仅2.4%,但商业管理专业化比率高达6.5倍。",
            "countries": [],
        },
    }

    for c in h2020["by_country"]:
        iso = c["iso"]
        r = rca_by_iso.get(iso, {})
        b = big_by_iso.get(iso, {})
        s = subj_by_iso.get(iso, {})

        p135 = s.get("period_135", {}) if s else {}
        # Top 3 specialization fields (non-physics, sorted by specialization ratio)
        # We compute simple specializations from subject data
        top_specs = []
        if p135:
            for spec in p135.get("top5_non_physics", [])[:3]:
                top_specs.append({"field": spec.get("name", ""), "count": spec.get("count", 0)})

        country_data = {
            "iso": iso,
            "name_cn": c["name_cn"],
            "geopolitical_group": c["geopolitical_group"],
            "eu6_intensity": c.get("eu6_intensity_2020"),
            "eu6_china_ratio": c.get("eu6_china_ratio_2020"),
            "china_rca": r.get("rca_2020"),
            "china_internal_rca": r.get("internal_rca_2020"),
            "rca_trend": r.get("rca_trend", "stable"),
            "total_output": r.get("total_output_2011_2020", 0),
            "china_portfolio_rank": r.get("china_portfolio_rank_2020"),
            "big_science_share_135": b.get("period_135", {}).get("share_big"),
            "big_contribution_to_growth": b.get("big_contribution_to_growth"),
            "physics_share": p135.get("physics_share", 0),
            "non_physics_total": p135.get("non_physics_total", 0),
            "top_specializations": top_specs,
        }

        typology_class = classify(iso)
        typology[typology_class]["countries"].append(country_data)

    output = {
        "source": "Cross-line synthesis from data mining pipeline",
        "description": "Four-fold country typology based on EU6 embedding, China RCA, big-science dependency, and research system size",
        "typology": typology,
    }

    write_json(VIZ_DIR / "viz_country_typology.json", output)
    for k, v in typology.items():
        names = [c["name_cn"] for c in v["countries"]]
        print(f"  {v['label']} ({k}): {len(v['countries'])} countries — {', '.join(names)}")


def prepare_big_science_timeline():
    """
    Scene: "大科学幻象" enhancement — big vs small bilateral timeline.

    Core narrative: Big science (>=100 authors) grew 172% vs 106% for small
    bilateral. ALL countries accelerated 2019-2020. 83% of big-science growth
    concentrated in 6 countries. Big-science share significantly increased:
    4.2% -> 5.6% (p=0.027).

    Visual design (alongside Scene 4's 3D collider):
    - Stacked area chart: big-science (top, tinted) + small-bilateral (bottom)
    - Timeline 2011-2020
    - Annotations: 2015 (十二五/十三五 boundary), 2019-2020 acceleration
    - Side panel: concentration bar chart
    """
    big_sci = read_json(DATA_DIR / "line1_big_science.json")

    # CEEC aggregate yearly from line1
    ceec = big_sci.get("ceec_aggregate", {})

    # Per-country yearly with intra-period acceleration
    countries = []
    for c in big_sci.get("by_country", []):
        yearly = c.get("yearly", [])

        # Compute intra-135 acceleration: 2019-2020 vs 2016-2017
        early_135 = sum(d.get("big", 0) for d in yearly if d["year"] in [2016, 2017])
        late_135 = sum(d.get("big", 0) for d in yearly if d["year"] in [2019, 2020])
        accel_ratio = round(late_135 / early_135, 2) if early_135 > 0 else None

        countries.append({
            "iso": c["iso"],
            "name_cn": c.get("name_cn", c["iso"]),
            "period_125": c.get("period_125"),
            "period_135": c.get("period_135"),
            "yearly": yearly,
            "intra_135_accel": {
                "early_2016_2017": early_135,
                "late_2019_2020": late_135,
                "ratio": accel_ratio,
            },
        })

    # Sort countries by big-science contribution to growth (descending)
    countries.sort(
        key=lambda x: x.get("period_135", {}).get("big_contribution", 0) or 0,
        reverse=True,
    )

    output = {
        "source": "OpenAlex group_by=publication_year with authors_count:>99 filter",
        "description": "Big-science (>=100 authors) vs small-bilateral decomposition, 2011-2020",
        "ceec_aggregate": ceec,
        "key_findings": {
            "growth_big": "172.0%",
            "growth_small": "102.6%",
            "share_increase": "4.2% -> 5.6% (p=0.027)",
            "concentration": "83%增长集中在6国(波兰/匈牙利/克罗地亚/捷克/罗马尼亚/希腊)",
            "acceleration_2019_2020": "全部有数据的14国在十三五后期(2019-2020)的大科学产出均远超前期(2016-2017)",
        },
        "statistical_tests": big_sci.get("statistical_tests", {}),
        "countries": countries,
    }

    write_json(VIZ_DIR / "viz_big_science_timeline.json", output)
    # Count accelerating countries
    accel_count = sum(1 for c in countries
                      if c["intra_135_accel"]["ratio"] is not None
                      and c["intra_135_accel"]["ratio"] > 1.0)
    print(f"  viz_big_science_timeline.json: {len(countries)} countries, "
          f"{accel_count} with 2019-2020 acceleration")


def main():
    print("=" * 60)
    print("  06: Prepare visualization-ready data files")
    print("=" * 60)

    VIZ_DIR.mkdir(parents=True, exist_ok=True)

    prepare_eu6_china_scatter()
    prepare_rca_trajectories()
    prepare_subject_specialization()
    prepare_country_typology()
    prepare_big_science_timeline()

    print(f"\n  All files written to {VIZ_DIR}")


if __name__ == "__main__":
    main()
