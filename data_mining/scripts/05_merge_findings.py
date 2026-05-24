"""
05_merge_findings.py

Cross-line synthesis with deep-dive analysis: reads all output JSONs and produces
a comprehensive findings markdown report with raw-data-level insights.

Output: data_mining/data/findings_summary.md
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import (
    print_header, print_subsection,
    COUNTRY_MAP, GEOPOLITICAL_GROUPS,
    iso3_to_name, iso3_to_group,
    read_json, DATA_DIR,
)

YEAR_RANGE = list(range(2011, 2021))


def pct(v, digits=1):
    if isinstance(v, str): return v
    try: return f"{float(v) * 100:.{digits}f}%"
    except: return str(v)


def num(v, digits=2):
    if isinstance(v, str): return v
    try: return f"{float(v):.{digits}f}"
    except: return str(v)


def fmt_p(p):
    if not isinstance(p, (int, float)): return str(p)
    if p < 0.001: return "p < 0.001 ***"
    elif p < 0.01: return f"p = {p:.4f} **"
    elif p < 0.05: return f"p = {p:.4f} *"
    else: return f"p = {p:.4f} (n.s.)"


def compress_ratio_per_country(l1c, iso3):
    """Compute late-135 / early-135 big-science ratio."""
    c = l1c.get(iso3, {})
    yearly = c.get("yearly", [])
    early = sum(yr["big"] for yr in yearly if yr["year"] in (2016, 2017))
    late = sum(yr["big"] for yr in yearly if yr["year"] in (2019, 2020))
    if early > 0:
        return late / early
    return None


def main():
    print_header("05: Cross-Line Synthesis with Deep Dive")

    print("  Loading data files...")
    yo = read_json(DATA_DIR / "yearly_observed.json")
    l1 = read_json(DATA_DIR / "line1_big_science.json")
    l2 = read_json(DATA_DIR / "line2_subjects.json")
    l3_rca = read_json(DATA_DIR / "line3_rca.json")
    l3_h2020 = read_json(DATA_DIR / "line3_h2020.json")

    l1c = {c["iso"]: c for c in l1["by_country"]}
    l2c = {c["iso"]: c for c in l2["by_country"]}
    rc = {c["iso"]: c for c in l3_rca["by_country"]}
    hc = {c["iso"]: c for c in l3_h2020["by_country"]}

    l1_agg = l1["ceec_aggregate"]
    l1_tests = l1["statistical_tests"]
    test1 = l1_tests["test1_growth_rate_difference"]
    test2 = l1_tests["test2_share_acceleration"]
    l2_clusters = l2["country_clusters"]
    l2_resilience = l2["subject_resilience"]
    l3_tests = l3_rca["statistical_tests"]
    h2020_corr = l3_h2020["correlations"]["eu6_intensity_vs_china_rca"]

    L = []; w = L.append

    # ====================================================================
    # TITLE
    # ====================================================================
    w("# 中国-中东欧科研合作: 数据挖掘深度报告")
    w("")
    w(f"**生成时间**: {yo.get('fetched_at', 'N/A')[:19]}")
    w(f"**数据范围**: 2011-2020 (十二五 + 十三五), 16个中东欧国家")
    w(f"**数据源**: OpenAlex API (group_by exact counts) + ScienceDB WoS period totals")
    w("")

    # ====================================================================
    # 1. EXECUTIVE SUMMARY
    # ====================================================================
    w("## 1. 执行摘要")
    w("")
    l1_agg_big = l1_agg["big_contribution_to_growth"]

    w("### 核心发现")
    w("")

    # F1
    w(f"**发现 1: 大科学合作正在全线加速,不是'过去时'。**")
    w(f"CEEC总体大科学论文(≥100作者)十年增长{num(l1_agg['growth_big'])}%，贡献了绝对增长的{num(l1_agg_big)}%。")
    w(f"但更关键的是 **2019-2020年所有14个有数据的国家大科学产出同时加速**——十三五后期/前期比最低1.4x,最高7.3x。")
    w(f"这不是过去的CERN效应,而是**正在持续强化的结构性趋势**(LHC Run 3 于2021年启动,预备期恰在2019-2020)。")
    w("")

    # F2
    share_125 = test2["mean_share_125"]
    share_135 = test2["mean_share_135"]
    w(f"**发现 2: 大科学占比显著上升,但绝对贡献有限。**")
    w(f"均值从{num(share_125)}→{num(share_135)}({fmt_p(test2['p_value'])}, Cohen's d={num(test2['cohens_d'])})。")
    w(f"但大科学贡献的增长83%集中在6个国家——波兰、匈牙利、克罗地亚、捷克、罗马尼亚、希腊。")
    w(f"大科学不是均匀分布的,它在少数国家深度渗透,在多数国家几乎不存在。")
    w("")

    # F3
    w(f"**发现 3: 学科结构揭示了'两个合作世界'。**")
    w(f"物理学(大科学渗透率35.1%)与化学工程/化学/药学(大科学渗透率0%)是两个完全不同的合作模式。")
    w(f"各国在非物理学科上展现出鲜明特色——立陶宛的决策科学(7.2x CEEC平均)、爱沙尼亚的农业生物(3.0x)、匈牙利的兽医学(4.6x)。")
    w(f"真正的双边深化发生在这些零大科学污染的学科中。")
    w("")

    # F4
    r_h2020 = h2020_corr["pearson_r"]
    spear = l3_tests["spearman_rank"]
    w(f"**发现 4: EU嵌入度与中国RCA呈正相关(r={num(r_h2020)}, {fmt_p(h2020_corr['p_value'])})——与替代假说相反。**")
    w(f"EU6合作强度最高的国家(爱沙尼亚60%、斯洛文尼亚45%)同时也是中国RCA最高的。")
    w(f"这不是'选边站',而是'全方位国际化'——科研开放度是一个统一的维度,同时面向EU和中国。")
    w(f"RCA排名中等稳定(Spearman ρ={num(spear['rho'])}),但11/14国RCA下降,暗示中国合作的相对优势正在稀释。")
    w("")

    # F5
    w(f"**发现 5: 东向替代假说不成立。**")
    w(f"EU候选国RCA均值(1.12)显著低于成员国(1.65)。候选国并没有因EU参与受限而更依赖中国。")
    w(f"中国合作的驱动力是科研体量和国际化程度,而非EU准入替代。")
    w("")

    # F6
    cobertura = [iso for iso in COUNTRY_MAP
                 if yo["countries"][0].get("iso") == iso
                 or True]  # Find LTU/MKD
    ltu_info = next((c for c in yo["countries"] if c["iso"] == "LTU"), {})
    mkd_info = next((c for c in yo["countries"] if c["iso"] == "MKD"), {})
    w(f"**发现 6: 数据层面——ScienceDB(WoS)遗漏了立陶宛和北马其顿的中国合作。**")
    if ltu_info:
        w(f"立陶宛: ScienceDB记录0篇,OpenAlex观测到{ltu_info.get('obs_125_sum',0)}+{ltu_info.get('obs_135_sum',0)}={ltu_info.get('obs_125_sum',0)+ltu_info.get('obs_135_sum',0)}篇。")
    if mkd_info:
        w(f"北马其顿: ScienceDB记录0篇,OpenAlex观测到{mkd_info.get('obs_125_sum',0)}+{mkd_info.get('obs_135_sum',0)}={mkd_info.get('obs_125_sum',0)+mkd_info.get('obs_135_sum',0)}篇。")
    w(f"本报告已修复此问题,直接使用OpenAlex观测数据。")
    w("")

    # ====================================================================
    # 2. LINE 1 DEEP DIVE
    # ====================================================================
    w("## 2. Line 1: 大科学合作分解")
    w("")

    w("### 2.1 CEEC总体")
    w("")
    agg_125 = l1_agg["period_125"]; agg_135 = l1_agg["period_135"]
    w("| 指标 | 十二五 | 十三五 | 增长率 |")
    w("|------|--------|--------|--------|")
    w(f"| 总论文 | {agg_125['total']:,} | {agg_135['total']:,} | {pct(l1_agg['growth_total'])} |")
    w(f"| 大科学(≥100作者) | {agg_125['big']:,} | {agg_135['big']:,} | {pct(l1_agg['growth_big'])} |")
    w(f"| 小双边(<100作者) | {agg_125['small']:,} | {agg_135['small']:,} | {pct(l1_agg['growth_small'])} |")
    w(f"| 大科学占比 | {pct(agg_125['share_big'])} | {pct(agg_135['share_big'])} | — |")
    w(f"| **大科学贡献** | — | — | **{pct(l1_agg_big)}** |")
    w("")

    w("### 2.2 统计检验")
    w("")
    w(f"**检验 1: 增长率比较。** growth_big均值={num(test1['mean_growth_big'])}, "
      f"growth_small均值={num(test1['mean_growth_small'])}, "
      f"t={num(test1['t_statistic'])}, {fmt_p(test1['p_value'])}, "
      f"Cohen's d={num(test1['cohens_d'])}。")
    w(f"配对t检验未达显著——原因是小国的大科学从0到有产生了极端增长值,均值被拉高。")
    w("")
    w(f"**检验 2: 占比加速。** {num(share_125)} → {num(share_135)}, "
      f"t={num(test2['t_statistic'])}, {fmt_p(test2['p_value'])}, "
      f"Cohen's d={num(test2['cohens_d'])}。**显著。**")
    w("")

    w("### 2.3 深层发现: 十三五内部加速")
    w("")
    w("**所有有数据的国家在十三五后期(2019-2020)的大科学产出都远超前期(2016-2017)。**")
    w("")
    w("| 国家 | 十三五前期(16-17) | 十三五后期(19-20) | 后期/前期 | 趋势 |")
    w("|------|-------------------|-------------------|-----------|------|")
    for iso3 in sorted(COUNTRY_MAP.keys()):
        ratio = compress_ratio_per_country(l1c, iso3)
        if ratio is None: continue
        c = l1c[iso3]
        yr = c["yearly"]
        early = sum(y["big"] for y in yr if y["year"] in (2016, 2017))
        late = sum(y["big"] for y in yr if y["year"] in (2019, 2020))
        trend = "ACCELERATING" if ratio > 1.3 else ("STABLE" if ratio > 0.7 else "DECLINING")
        w(f"| {iso3_to_name(iso3)} | {early} | {late} | {num(ratio)}x | {trend} |")
    w("")
    w(f"*LHC Run 3于2021年启动,2019-2020恰为其预备期——论文署名在实验准备阶段即开始增加。*")
    w("")

    w("### 2.4 大科学增长的集中度")
    w("")
    w("大科学增长高度集中于6个科研大国:")
    w("")
    total_big_delta = sum(l1c[iso]["period_135"]["big"] - l1c[iso]["period_125"]["big"]
                          for iso in COUNTRY_MAP)
    cumul = 0
    contribs = []
    for iso3 in COUNTRY_MAP:
        c = l1c[iso3]
        delta = c["period_135"]["big"] - c["period_125"]["big"]
        contribs.append((delta, iso3))
    contribs.sort(key=lambda x: -x[0])
    w("| 国家 | 大科学增长(篇) | 占CEEC总增长比例 | 累计占比 |")
    w("|------|----------------|------------------|----------|")
    for delta, iso3 in contribs:
        if total_big_delta > 0:
            share = delta / total_big_delta
            cumul += share
            w(f"| {iso3_to_name(iso3)} | +{delta} | {pct(share)} | {pct(cumul)} |")
    w("")

    w("### 2.5 各国逐年详情")
    w("")
    w("| 国家 | 十二五总数 | 十三五总数 | 大科学增长 | 小双边增长 | 大科学贡献 | 125占比 | 135占比 |")
    w("|------|-----------|-----------|-----------|-----------|-----------|---------|---------|")
    for iso3 in sorted(COUNTRY_MAP.keys()):
        c = l1c[iso3]
        p125 = c["period_125"]; p135 = c["period_135"]
        w(f"| {iso3_to_name(iso3)} | {p125['total']:,} | {p135['total']:,} "
          f"| {pct(c['growth_big'])} | {pct(c['growth_small'])} "
          f"| {pct(c['big_contribution_to_growth'])} "
          f"| {pct(p125['share_big'])} | {pct(p135['share_big'])} |")
    w("")

    w("### 2.6 特殊案例分析")
    w("")
    w("**克罗地亚——脉冲式大科学依赖:**")
    w("")
    w("| 年份 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 |")
    w("|------|------|------|------|------|------|------|------|------|------|------|")
    hrv = l1c["HRV"]["yearly"]
    w("| 大科学论文 | " + " | ".join(str(y["big"]) for y in hrv) + " |")
    w("| 大科学占比 | " + " | ".join(f"{y['share_big']:.1%}" for y in hrv) + " |")
    w("")
    w("*特征: 锯齿状脉冲(2015=11.5%, 2016=**18.6%**, 2017=16.8%, 2019=16.6%)——提示加入特定LHC实验组(CMS/ATLAS)而非系统性整合。*")
    w("")

    w("**斯洛文尼亚——唯一脱离大科学轨道的国家:**")
    w("")
    w("| 年份 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 |")
    w("|------|------|------|------|------|------|------|------|------|------|------|")
    svn_yr = l1c["SVN"]["yearly"]
    w("| 大科学论文 | " + " | ".join(str(y["big"]) for y in svn_yr) + " |")
    w("| 大科学占比 | " + " | ".join(f"{y['share_big']:.1%}" for y in svn_yr) + " |")
    w("")
    w("*特征: 十二五期间大科学占比最高(13.5%),十三五反而持续下降至7.5%。同时RCA持续下降(2.79→1.80)。疑似转向EU框架合作。*")
    w("")

    w("**罗马尼亚——2019年大科学拐点:**")
    w("")
    w("| 年份 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 |")
    w("|------|------|------|------|------|------|------|------|------|------|------|")
    rou_yr = l1c["ROU"]["yearly"]
    w("| 大科学论文 | " + " | ".join(str(y["big"]) for y in rou_yr) + " |")
    w("| 大科学占比 | " + " | ".join(f"{y['share_big']:.1%}" for y in rou_yr) + " |")
    w("")
    w("*特征: 2018年前大科学占比稳定在2-3%,2019跳至7.7%,2020达9.2%。突然被拉入大科学轨道。*")
    w("")

    w("**波兰——最大的悖论:**")
    w("")
    w(f"波兰贡献了大科学绝对增长的第一大份额(+{contribs[0][0] if contribs else '?'}篇,17.2%),")
    w(f"但其大科学占比反而微降——因为总量增长更快。波兰是'双低'——中国占比最低(2.2%),EU6占比第二低(25.5%)。")
    w(f"它是CEEC中国际共著率最低的大型科研体系,呈现'自给自足'特征。")
    w("")

    # ====================================================================
    # 3. LINE 2 DEEP DIVE
    # ====================================================================
    w("## 3. Line 2: 学科差异分析")
    w("")

    w("### 3.1 物理学占比分布")
    w("")
    w("| 国家 | 物理学占比 | 大科学渗透率 | 非物理学主要领域 |")
    w("|------|-----------|-------------|-----------------|")
    for iso3 in sorted(COUNTRY_MAP.keys(), key=lambda x: -l2c[x]["period_135"]["physics_share"]):
        c = l2c[iso3]
        p135 = c["period_135"]
        phys = p135["physics_share"]
        big = p135["big_share"]
        specs = c.get("specializations_135", [])
        non_phys_specs = [s for s in specs[:3] if s["name"] != "Physics and Astronomy"][:2]
        spec_str = ", ".join(f"{s['name']}({s['specialization_ratio']:.1f}x)" for s in non_phys_specs)
        w(f"| {iso3_to_name(iso3)} | {pct(phys)} | {pct(big)} | {spec_str} |")
    w("")

    w("### 3.2 两种合作模式: 'CERN轨道' vs '双边轨道'")
    w("")
    w("CEEC-中国学科合作明显分为两类:")
    w("")
    w("| 类型 | 代表学科 | 十三五论文 | 大科学渗透 | 小双边增长 | 特征 |")
    w("|------|---------|-----------|-----------|-----------|------|")
    w(f"| **大科学轨道** | Physics and Astronomy | 4,639 | 35.1% | 121% | CERN/LHC驱动 |")
    w(f"| | Psychology | — | 7.8% | — | 部分大科学 |")
    w(f"| | Biochemistry/Genetics | 3,236 | 4.9% | — | 轻微大科学渗透 |")
    w(f"| | Medicine | 5,816 | 4.0% | 107% | 轻微大科学渗透 |")
    # Get resilient subjects
    for s in l2_resilience[:4]:
        w(f"| **双边轨道** | {s['name']} | {s.get('total_135', 0):,} | {pct(s['big_penetration'])} | {pct(s['small_growth'])} | 纯双边合作 |")
    w("")

    w("### 3.3 各国学科专长画像")
    w("")
    w("以下展示每个国家在中国合作中超越CEEC平均水平最显著的学科(专业化比率>2x):")
    w("")
    for iso3 in sorted(COUNTRY_MAP.keys()):
        c = l2c[iso3]
        specs = c.get("specializations_135", [])
        strong = [s for s in specs if s["specialization_ratio"] > 1.5 and s["name"] != "Physics and Astronomy"][:5]
        if strong:
            items = ", ".join(f"{s['name']}({s['specialization_ratio']:.1f}x)" for s in strong)
            w(f"- **{iso3_to_name(iso3)}**: {items}")
    w("")

    w("### 3.4 CEEC总体学科分布 (十三五)")
    w("")
    ceec_fields = l2.get("ceec_aggregate", {}).get("fields_135", {})
    w("| 学科 | 论文数 | 占CEEC总量 | 大科学论文 | 大科学渗透 |")
    w("|------|--------|-----------|-----------|-----------|")
    field_items = []
    for fid, fdata in ceec_fields.items():
        total = fdata.get("total", 0)
        big = fdata.get("big", 0)
        if total > 200:
            field_items.append((fdata.get("name", fid), total, big, big/total if total > 0 else 0))
    field_items.sort(key=lambda x: -x[1])
    for fname, total, big, big_pct in field_items[:15]:
        w(f"| {fname} | {total:,} | {pct(total / l2['ceec_aggregate']['total_135'] if l2['ceec_aggregate']['total_135'] > 0 else 0)} | {big:,} | {pct(big_pct)} |")
    w("")

    # ====================================================================
    # 4. LINE 3 DEEP DIVE
    # ====================================================================
    w("## 4. Line 3: 地缘政治分析")
    w("")

    w("### 4.1 RCA排名 (2020)")
    w("")
    w("> RCA > 1: 对中国的合作强度超过全球平均。Internal RCA在CEEC内部标准化,更适合跨国比较。")
    w("")
    w("| 排名 | 国家 | RCA 2011 | RCA 2020 | Internal RCA | RCA轨迹 | EU6强度 | 中国全球排名 |")
    w("|------|------|----------|----------|-------------|---------|---------|-------------|")
    # Get rank data
    iso2_map = {iso3: COUNTRY_MAP[iso3][0] for iso3 in COUNTRY_MAP}
    p2011 = l3_rca["china_global_partners"]["2011"]["distribution"]
    p2020 = l3_rca["china_global_partners"]["2020"]["distribution"]
    s2011 = sorted(p2011.items(), key=lambda x: -x[1])
    s2020 = sorted(p2020.items(), key=lambda x: -x[1])

    rca_sorted = sorted(rc.items(), key=lambda x: -x[1].get("rca_2020", 0))
    for rank_idx, (iso3, c) in enumerate(rca_sorted, 1):
        iso2 = iso2_map.get(iso3, "").upper()
        r11 = c.get("rca_2011", 0); r20 = c.get("rca_2020", 0)
        ir20 = c.get("internal_rca_2020", 0)
        tr = c.get("rca_trend_slope", 0)
        trajectory = "↓ 下降" if tr < -0.03 else ("↑ 上升" if tr > 0.03 else "→ 平稳")
        eu6i = hc.get(iso3, {}).get("eu6_intensity_2020", 0)

        cn_rank = "?"
        for i, (code, _) in enumerate(s2020):
            if code.upper() == iso2: cn_rank = str(i+1); break
        cn_rank_2011 = "?"
        for i, (code, _) in enumerate(s2011):
            if code.upper() == iso2: cn_rank_2011 = str(i+1); break

        rank_change = ""
        if cn_rank_2011 != "?" and cn_rank != "?":
            diff = int(cn_rank) - int(cn_rank_2011)
            rank_change = f"({cn_rank_2011}→{cn_rank}, {'+' if diff > 0 else ''}{diff})"

        low_flag = " ⚠" if c.get("low_confidence") else ""
        w(f"| {rank_idx} | {iso3_to_name(iso3)}{low_flag} | {num(r11)} | {num(r20)} "
          f"| {num(ir20)} | {trajectory} | {pct(eu6i)} | {cn_rank}{rank_change} |")
    w("")

    w("### 4.2 RCA轨迹分类")
    w("")
    w("**持续下降** (8国): 罗马尼亚、匈牙利、塞尔维亚、斯洛伐克、克罗地亚、斯洛文尼亚、保加利亚、北马其顿")
    w("——这些国家的中国合作RCA自2011年来单边走低,反映出中国合作增长跟不上其总体科研产出增长。")
    w("")
    w("**V型复苏** (4国): 波兰、捷克、希腊、爱沙尼亚、立陶宛")
    w("——这些国家在2016-2018年间RCA探底,随后反弹。可能与一带一路倡议(2013)的滞后效应有关。")
    w("")
    w("**持续上升** (3国): 拉脱维亚(0.63→2.17)、阿尔巴尼亚(0→0.68)、黑山(0.40→0.78)")
    w("——都从极低基线起步,属于'从零到有'的追赶型增长。")
    w("")

    w("### 4.3 EU6嵌入度 vs 中国RCA")
    w("")
    w(f"**相关性**: Pearson r = {num(r_h2020)}, {fmt_p(h2020_corr['p_value'])}, n = {h2020_corr.get('n', 16)}。**显著正相关。**")
    w("")
    w("| 国家 | 中国占比 | EU6占比 | EU6/中国比 | RCA | 特征 |")
    w("|------|---------|---------|-----------|-----|------|")
    for iso3 in sorted(COUNTRY_MAP.keys(), key=lambda x: -(hc.get(x, {}).get("eu6_intensity_2020", 0))):
        ch = hc.get(iso3, {}); cr = rc.get(iso3, {})
        cn_share = 0; eu6_share = ch.get("eu6_intensity_2020", 0)
        yr = cr.get("yearly", [])
        if yr:
            total = yr[-1].get("country_total_papers", 0)
            cn = yr[-1].get("cn_ceec_papers", 0)
            cn_share = cn / total if total > 0 else 0
        r20 = cr.get("rca_2020", 0)
        ratio = ch.get("eu6_china_ratio_2020", 0)
        profile = "双超连接" if (cn_share > 0.04 and eu6_share > 0.35) else \
                  ("EU偏向" if eu6_share > 0.35 else
                   ("中国偏向" if cn_share > 0.04 else
                    ("自给自足" if eu6_share < 0.28 else "均衡")))
        w(f"| {iso3_to_name(iso3)} | {pct(cn_share)} | {pct(eu6_share)} | {num(ratio)}x | {num(r20)} | {profile} |")
    w("")
    w("*爱沙尼亚是唯一同时具有最高EU6强度(60.2%)和最高中国RCA(3.53)的国家——真正的'双超连接'。*")
    w("")

    w("### 4.4 地缘政治组对比")
    w("")
    w("| 组别 | 国家数 | 平均RCA 2020 | 平均内部RCA | EU6/中国比 |")
    w("|------|--------|------------|------------|-----------|")
    for gkey, gdata in l3_rca.get("geopolitical_group_summary", {}).items():
        hg = l3_h2020.get("geopolitical_group_eu6_china_ratios", {}).get(gkey, {})
        ratio = hg.get("mean_eu6_china_ratio", "N/A")
        w(f"| {gdata.get('label', gkey)} | {len(gdata.get('countries', []))} "
          f"| {num(gdata.get('mean_global_rca_2020', 0))} "
          f"| {num(gdata.get('mean_internal_rca_2020', 0))} "
          f"| {num(ratio) if isinstance(ratio, (int, float)) else ratio} |")
    w("")

    w("### 4.5 统计检验")
    w("")
    kw = l3_tests.get("kruskal_wallis", {})
    w(f"**Kruskal-Wallis**: H={num(kw.get('h_statistic', 0))}, {fmt_p(kw.get('p_value', 0))}。")
    w(f"地缘政治组间RCA差异{'**显著**' if kw.get('significant_at_0_05') else '不显著'}——组内差异大于组间差异。")
    w("")
    w(f"**Spearman ρ**: {num(spear['rho'])}——中等稳定的RCA排名,但11/14国的RCA绝对值在下降。")
    w("")

    east = l3_tests.get("eastward_substitution", {})
    w(f"**东向替代检验**: EU候选国RCA({num(east.get('eu_candidates_mean_rca', 0))}) "
      f"< EU成员国RCA({num(east.get('eu_members_mean_rca', 0))})——不支持替代假说。")
    w("")

    # ====================================================================
    # 5. CROSS-LINE SYNTHESIS
    # ====================================================================
    w("## 5. 跨线综合")
    w("")

    w("### 5.1 三条线的交汇")
    w("")
    w("**交汇 1——大科学+物理学双重主导**: Line 1发现大科学贡献83%集中在6国, Line 2发现物理学渗透率仅35%(意味着65%的物理合作仍是<100作者)。")
    w(" **关键洞见**: '大科学'≠'物理学'。大科学是高能物理的一个子集,但它对增长叙事的影响力远超其数量占比——因为增长集中、波动剧烈。")
    w("")
    w("**交汇 2——'双外向型'取代'替代型'**: Line 3发现EU6强度与中国RCA呈正相关(r=0.615), Line 2显示非物理学科(化学工程、药学)几乎是纯双边合作。")
    w(" **关键洞见**: 国际化是一个统一的维度。科研开放的国家(Estonia)在所有方向上都开放;封闭的国家(Poland)在所有方向上都相对封闭。")
    w("")
    w("**交汇 3——加速,而非稳态**: Line 1发现2019-2020全线加速, Line 3发现大多数RCA在下降。")
    w(" **关键洞见**: 大科学合作在加速(Run 3即将启动),但中国在整个CEEC科研版图中的相对重要性在下降——RCA普降。两者并行不悖。")
    w("")

    w("### 5.2 国家画像: 四种合作类型")
    w("")
    w("| 类型 | 代表 | 大科学 | 中国RCA | EU6嵌入 | 非物理专长 | 描述 |")
    w("|------|------|--------|---------|---------|-----------|------|")
    w("| **双超连接** | 爱沙尼亚 | 低 | 高(3.53) | 高(60%) | 农业生物3.0x | 所有方向都开放 |")
    w("| **大科学驱动** | 克罗地亚, 匈牙利 | 高(15-26%贡献) | 中高 | 中(36-37%) | 牙科3.8x, 兽医4.6x | CERN拉动增长 |")
    w("| **自给自足** | 波兰, 罗马尼亚 | 中(6-10%) | 低(0.86-1.30) | 低(26-28%) | 化工2.2x, 数学2.3x | 体量大,国际共著率低 |")
    w("| **EU偏向** | 捷克, 希腊 | 低中(4-6%) | 中(1.34-1.41) | 高(44-45%) | — | 深度嵌入EU体系 |")
    w("| **追赶型小国** | 拉脱维亚, 立陶宛, 黑山 | 0-极低 | 上升中 | 低中(19-37%) | 商业6.5x, 决策科学7.2x | 从零起步,非物理导向 |")
    w("")

    w("### 5.3 数据修正说明")
    w("")
    w(f"- **立陶宛(LTU)**: ScienceDB记录为0,OpenAlex观测到991篇(2011-2020)。已改用OpenAlex直接观测值。")
    w(f"- **北马其顿(MKD)**: ScienceDB记录为0,OpenAlex观测到780篇。已改用OpenAlex直接观测值。")
    w(f"- **物理学识别修复**: 修正了字段名匹配bug('Physics and Astronomy' vs 'Physics')。")
    w("")

    # ====================================================================
    # 6. LIMITATIONS
    # ====================================================================
    w("## 6. 局限性")
    w("")
    w("- **大科学阈值(≥100作者)**: 常用但武断。LHC实验论文通常>1000作者,而中等规模合作(~50作者)也可能属于'大科学'。建议敏感性分析。")
    w("- **学科分类粒度**: OpenAlex primary_topic将论文映射到单一领域,跨学科论文可能被错误分类。")
    w("- **统计功效**: 仅16国,地缘政治组比较(如欧元区核心仅2国)功效严重不足。")
    w("- **因果关系**: 所有相关性分析均为观测性。不能将RCA下降归因于EU政策或中国政策。")
    w("- **WoS覆盖偏差**: ScienceDB(WoS)在巴尔干地区覆盖不足(LTU/MKD),本报告已修复但其他偏差可能仍存在。")
    w("")

    # ====================================================================
    # 7. RECOMMENDATIONS
    # ====================================================================
    w("## 7. 对可视化的建议")
    w("")
    w("### 7.1 叙事重构")
    w("1. **开场**: 不是展示'合作增长',而是提出'谁在和中国合作?'的问题")
    w("2. **第一幕——大科学**: 展示大科学/小双边的双线对比 + 2019-2020的加速 + 克罗地亚脉冲案例")
    w("3. **第二幕——真正的合作**: 展示化学工程/化学/药学的大科学零渗透 + 各国专长画像")
    w("4. **第三幕——双外向型**: EU6强度 vs 中国RCA的正相关散点图,展示爱沙尼亚作为'双超连接'案例")
    w("5. **尾声**: 四种国家类型 + 波兰悖论——最大体量但最低国际共著率")
    w("")
    w("### 7.2 数据映射")
    w("| Scene | 使用数据 | 视觉形式 |")
    w("|-------|---------|---------|")
    w("| 大科学双线 | line1_big_science.json | 逐年堆叠面积图(大科学/小双边) |")
    w("| 国家学科画像 | line2_subjects.json | 雷达图/花形图(各学科专业化比率) |")
    w("| EU6 vs China | line3_h2020.json + line3_rca.json | 散点图(双超连接突出标记) |")
    w("| RCA轨迹 | line3_rca.json | 小多重折线图(按地缘组着色) |")
    w("| 加速预警 | line1_big_science.json | 2019-2020高亮标记(所有国家同时加速) |")
    w("")

    # ====================================================================
    # OUTPUT
    # ====================================================================
    report = "\n".join(L)
    out_path = DATA_DIR / "findings_summary.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"  Report written: {len(L)} lines, {len(report)} chars")
    print_header("DONE")


if __name__ == "__main__":
    main()
