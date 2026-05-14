"""Process raw ScienceDB data into clean JSON for the web app.

Outputs to ../public/data/*.json
"""
import json
import re
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data_raw" / "extracted" / "数据（1119更新）"
OUT = Path(__file__).resolve().parents[1] / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


CEEC_16 = [
    # english_name, chinese_name, iso_a3, lat, lon
    ("POLAND",          "波兰",       "POL", 51.9194, 19.1451),
    ("CZECH REPUBLIC",  "捷克",       "CZE", 49.8175, 15.4730),
    ("HUNGARY",         "匈牙利",     "HUN", 47.1625, 19.5033),
    ("ROMANIA",         "罗马尼亚",   "ROU", 45.9432, 24.9668),
    ("BULGARIA",        "保加利亚",   "BGR", 42.7339, 25.4858),
    ("SLOVAKIA",        "斯洛伐克",   "SVK", 48.6690, 19.6990),
    ("CROATIA",         "克罗地亚",   "HRV", 45.1000, 15.2000),
    ("SLOVENIA",        "斯洛文尼亚", "SVN", 46.1512, 14.9955),
    ("SERBIA",          "塞尔维亚",   "SRB", 44.0165, 21.0059),
    ("GREECE",          "希腊",       "GRC", 39.0742, 21.8243),
    ("ALBANIA",         "阿尔巴尼亚", "ALB", 41.1533, 20.1683),
    ("LATVIA",          "拉脱维亚",   "LVA", 56.8796, 24.6032),
    ("LITHUANIA",       "立陶宛",     "LTU", 55.1694, 23.8813),
    ("ESTONIA",         "爱沙尼亚",   "EST", 58.5953, 25.0136),
    ("MONTENEGRO",      "黑山",       "MNE", 42.7087, 19.3744),
    ("NORTH MACEDONIA", "北马其顿",   "MKD", 41.6086, 21.7453),
]

BEIJING = {"name": "中国", "lat": 39.9042, "lon": 116.4074}


def yearly_totals():
    """Sheet1 of 2011-2020.xlsx: per-year CEEC vs China total intl coop count."""
    p = RAW / "1.中东欧群体发文数量" / "2011-2020.xlsx"
    df = pd.read_excel(p, header=None)
    rows = []
    for _, row in df.iterrows():
        try:
            year = int(float(row[0]))
        except (ValueError, TypeError):
            continue
        if 2011 <= year <= 2020:
            ceec = int(row[1])
            china_total = int(row[2])
            ratio = ceec / china_total
            rows.append({"year": year, "ceec": ceec, "china_total": china_total, "ratio": ratio})
    rows.sort(key=lambda r: r["year"])
    return rows


def per_country_two_periods():
    """中东欧各国125与135发文量.xlsx — already clean: country, 135, ratio, rank, 125, rank, growth, rank_change."""
    p = RAW / "2.各国发文量（135-125）" / "中东欧各国125与135发文量.xlsx"
    df = pd.read_excel(p, header=None)
    out = []
    cn_to_iso = {c[1]: c[2] for c in CEEC_16}
    for _, row in df.iterrows():
        cn = str(row[0]).strip()
        if cn not in cn_to_iso:
            continue
        try:
            count_135 = int(row[1])
            ratio = float(row[2])
            rank_135 = int(row[3])
            count_125 = int(row[4])
            rank_125 = int(row[5])
            growth = float(row[6])
            rank_change = int(row[7])
        except (ValueError, TypeError):
            continue
        out.append({
            "name_cn": cn,
            "iso": cn_to_iso[cn],
            "count_135": count_135,
            "count_125": count_125,
            "ratio_135": ratio,
            "rank_135": rank_135,
            "rank_125": rank_125,
            "growth": growth,
            "rank_change": rank_change,
        })
    out.sort(key=lambda r: -r["count_135"])
    return out


def parse_subject_csv(path):
    """The csv files have left-side actual data and right-side category lookup we ignore.
    Real columns: code+EN_name, CN_name, count, [optional %].
    Some have only EN+count (utf-8-sig case).
    """
    encodings = ["gb18030", "utf-8-sig", "utf-8"]
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc, header=None, dtype=str, on_bad_lines="skip")
            break
        except Exception:
            continue
    else:
        return []
    rows = []
    for _, row in df.iterrows():
        cells = [str(c) if pd.notna(c) else "" for c in row.tolist()]
        first = cells[0].strip() if cells else ""
        if not first or first == "名称" or "0101" in first or "0201" in first or "0202" in first or "0301" in first:
            continue
        # discipline code looks like "0702 Physics" or just "0702 Physics"
        m = re.match(r"^(\d{4})\s+(.+)$", first)
        if not m:
            continue
        code = m.group(1)
        en_name = m.group(2).strip()
        cn_name = ""
        count = None
        # find the count: it's the first integer-like cell after the name
        for c in cells[1:]:
            c = c.strip()
            if not c:
                continue
            if c == en_name or c == cn_name:
                continue
            if re.fullmatch(r"-?\d+", c):
                count = int(c)
                break
            if not cn_name and not re.fullmatch(r"[\d.\-]+", c):
                cn_name = c
        if count is None:
            continue
        rows.append({"code": code, "en": en_name, "cn": cn_name, "count": count})
    rows.sort(key=lambda r: -r["count"])
    return rows


def group_subjects():
    base = RAW / "3. 中东欧群体合作领域"
    out = {}
    for label, fn in [("125", "2011-2015 研究方向.csv"), ("135", "2016-2020 研究方向.csv")]:
        out[label] = parse_subject_csv(base / fn)
    return out


def country_subjects():
    base = RAW / "4. 各国合作领域"
    out = {}
    cn_to_iso = {c[1]: c[2] for c in CEEC_16}
    for f in sorted(base.glob("135 *.csv")):
        # filename: "135 波兰 研究方向.csv"
        m = re.match(r"135\s+(\S+)\s+研究方向\.csv$", f.name)
        if not m:
            continue
        cn = m.group(1)
        iso = cn_to_iso.get(cn)
        if not iso:
            continue
        out[iso] = {"name_cn": cn, "subjects": parse_subject_csv(f)[:8]}
    return out


def parse_inst_csv(path, side):
    """Institution rankings. side='cn' or 'ceec'."""
    encodings = ["gb18030", "utf-8-sig", "utf-8"]
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc, header=None, dtype=str, on_bad_lines="skip")
            break
        except Exception:
            continue
    else:
        return []
    rows = []
    for _, row in df.iterrows():
        cells = [str(c) if pd.notna(c) else "" for c in row.tolist()]
        first = cells[0].strip() if cells else ""
        if not first or first == "名称":
            continue
        # find biggest int in row -> count; cn name is the first non-empty Chinese cell
        count = None
        cn_name = ""
        country = ""
        for c in cells[1:]:
            c = c.strip()
            if not c:
                continue
            if re.fullmatch(r"\d+", c):
                v = int(c)
                # rank fields are small (1-50); count fields are big (>=100)
                if v >= 100 and count is None:
                    count = v
                continue
            if c.isupper() or c in {"CHINA MAINLAND"}:
                country = c
                continue
            if not cn_name and re.search(r"[一-鿿]", c):
                cn_name = c
        if count is None:
            continue
        rows.append({"en": first, "cn": cn_name, "country": country, "count": count})
    rows.sort(key=lambda r: -r["count"])
    return rows[:25]


def institutions():
    base = RAW / "5. 合作机构"
    return {
        "cn_125": parse_inst_csv(base / "125中国机构.csv", "cn"),
        "cn_135": parse_inst_csv(base / "135中国机构.csv", "cn"),
        "ceec_125": parse_inst_csv(base / "125中东欧机构.csv", "ceec"),
        "ceec_135": parse_inst_csv(base / "135中东欧机构.csv", "ceec"),
    }


def per_country_yearly():
    """Estimate per-country yearly counts.

    The raw dataset only gives 125 (2011-2015) and 135 (2016-2020) period totals
    per country, plus the *aggregated* yearly CEEC count. We allocate each
    country's period total across the years of that period proportionally to the
    aggregate yearly trajectory. Result:
      - sum across years for a country == that country's period total (exact)
      - sum across countries for a year ≈ aggregate yearly total (countries with
        no data are missing, so this can be a few % low)
    Marked as estimated in the docs.
    """
    yearly = yearly_totals()
    by_year = {r["year"]: r["ceec"] for r in yearly}
    sum_125 = sum(by_year[y] for y in range(2011, 2016))
    sum_135 = sum(by_year[y] for y in range(2016, 2021))
    countries = per_country_two_periods()
    out = []
    for c in countries:
        series = []
        for y in range(2011, 2016):
            v = c["count_125"] * by_year[y] / sum_125
            series.append({"year": y, "count": int(round(v))})
        for y in range(2016, 2021):
            v = c["count_135"] * by_year[y] / sum_135
            series.append({"year": y, "count": int(round(v))})
        out.append({
            "iso": c["iso"],
            "name_cn": c["name_cn"],
            "total": c["count_125"] + c["count_135"],
            "growth": c["growth"],
            "yearly": series,
        })
    out.sort(key=lambda r: -r["total"])
    return out


def write(name, data):
    p = OUT / f"{name}.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → {p.name} ({p.stat().st_size / 1024:.1f} KB)")


def main():
    print("Building data JSON …")
    write("countries", {"beijing": BEIJING,
                        "ceec": [{"en": e, "cn": c, "iso": i, "lat": lat, "lon": lon}
                                  for e, c, i, lat, lon in CEEC_16]})
    write("yearly", yearly_totals())
    write("per_country", per_country_two_periods())
    write("per_country_yearly", per_country_yearly())
    write("group_subjects", group_subjects())
    write("country_subjects", country_subjects())
    write("institutions", institutions())
    print("Done.")


if __name__ == "__main__":
    main()
