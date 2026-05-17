"""Build a China-CEEC institution collaboration network from OpenAlex.

Queries OpenAlex for China-CEEC co-authored works (2011-2015 / 2016-2020),
extracts institution pairs from authorships, and builds a bipartite network:

  public/data/institution_network.json

Sampling strategy (v2):
  - Per-country, per-period quota: proportional to total available papers
  - Minimum 300 papers per country (when available), maximum 2000
  - Target ~30% sampling rate, adjusted by min/max caps
  - Works sorted by cited_by_count:desc → prioritise impactful collaborations
    (within a 5-year window, citation bias is limited)

Institution quality control:
  - Blacklist: known misattributed OpenAlex institution IDs
    (e.g. generic government entities wrongly assigned to small countries)
  - Heuristic: flag government-type institutions that dominate small countries
    and have no geographic qualifier in their name

Nodes: institutions with metadata (name, country, type, paper counts per period)
Edges: institution-institution co-authorship links with weights and top concepts
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "institution_network.json"

# 16 CEEC countries: (ISO alpha-3, ISO alpha-2 for OpenAlex, Chinese name)
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
    ("LTU", "LT", "立陶宛"),
    ("ALB", "AL", "阿尔巴尼亚"),
    ("MNE", "ME", "黑山"),
    ("MKD", "MK", "北马其顿"),
]

PERIODS = [
    ("125", 2011, 2015),
    ("135", 2016, 2020),
]

PER_PAGE = 200
SAMPLE_RATE = 0.30       # target: sample 30% of available papers
MIN_PAPERS = 300          # floor per country per period
MAX_PAPERS = 2000         # ceiling per country per period
MAILTO = "sunzhengqi2024@gmail.com"

# ---------------------------------------------------------------------------
# Known misattributed institution IDs in OpenAlex.
# These institutions have a country_code that does NOT match their actual
# location (verified via ROR registry and manual inspection).
# e.g. Chinese government ministries incorrectly tagged as Montenegro (ME).
# ---------------------------------------------------------------------------
BLACKLIST_INST_IDS: set[str] = {
    # Ministry of Education — ROR 01xexqx38, geo=Podgorica but
    # ~200k citations / 2800 works, collaborates across all disciplines
    # with Chinese universities. Almost certainly Chinese MoE mis-tagged.
    "https://openalex.org/I4210110997",
    # Ministry of Science — ROR 023ktd084, same pattern: 44k citations,
    # broad Chinese collaboration, implausible for Montenegro (pop 620k).
    "https://openalex.org/I4210115539",
    # Ministry of Justice — same country, tiny output but same root cause.
    "https://openalex.org/I4210086141",
    # Ministry of Agriculture (Latvia) — generic name, 243 papers heavily
    # skewed toward Chinese collaboration. Likely Chinese MoA.
    "https://openalex.org/I4210107258",
}

# Government institution names that are too generic to be reliably geo-located.
# If these appear in a country with <10 total institutions AND account for
# >40% of that country's papers, they are removed.
GENERIC_GOVT_NAMES: set[str] = {
    "Ministry of Education",
    "Ministry of Science",
    "Ministry of Agriculture",
    "Ministry of Justice",
    "Ministry of Health",
    "Ministry of Economy",
    "Ministry of Finance",
    "Ministry of Defence",
    "Ministry of Defense",
    "Ministry of Foreign Affairs",
    "Ministry of Culture",
    "Ministry of Transport",
    "Government of the Republic",
}


def fetch(url: str, retries: int = 3) -> dict:
    """Fetch with exponential backoff for transient network errors."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ceec-viz/0.3"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, ConnectionError, TimeoutError,
                json.JSONDecodeError, OSError) as e:
            last_err = e
            if attempt < retries - 1:
                wait = 2 ** attempt * 1.5
                time.sleep(wait)
    raise last_err  # type: ignore[misc]


def pages_for(total_available: int) -> int:
    """Compute how many pages to fetch based on proportional sampling.

    Target: SAMPLE_RATE of total, clamped to [MIN_PAPERS, MAX_PAPERS].
    """
    target = max(MIN_PAPERS, min(MAX_PAPERS, int(total_available * SAMPLE_RATE)))
    # Never request more than what's actually available
    target = min(target, total_available)
    pages = max(1, (target + PER_PAGE - 1) // PER_PAGE)  # ceil division
    return pages


def query_country_period(iso2: str, year_start: int, year_end: int):
    """Fetch sampled works for one CEEC country in one period.

    Uses sort=cited_by_count:desc so the most impactful collaborations
    are sampled first (within a 5-year window citation bias is limited).

    Returns:
        papers: list of work dicts (id, year, authorships, concepts, venue)
        total_available: total count from meta
    """
    cursor = "*"
    pages_fetched = 0
    papers: list[dict] = []
    total_available = 0
    max_pages: int | None = None  # determined after first response

    while cursor and (max_pages is None or pages_fetched < max_pages):
        params = {
            "filter": (
                f"authorships.institutions.country_code:cn,"
                f"authorships.institutions.country_code:{iso2.lower()},"
                f"publication_year:{year_start}-{year_end}"
            ),
            "sort": "cited_by_count:desc",
            "per-page": str(PER_PAGE),
            "cursor": cursor,
            "select": "id,publication_year,authorships,concepts,primary_location",
            "mailto": MAILTO,
        }
        url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
        try:
            r = fetch(url)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"\n      fetch error (page {pages_fetched+1}): {e}")
            # If we already have some data, stop gracefully
            if pages_fetched > 0:
                print(f"      (stopping after {pages_fetched} pages, "
                      f"{len(papers)} papers collected)")
                break
            # On first page, retry once more before giving up
            print("      retrying …")
            time.sleep(3)
            try:
                r = fetch(url)
            except Exception as e2:
                print(f"      retry also failed: {e2}")
                break

        results = r.get("results") or []
        if pages_fetched == 0:
            total_available = (r.get("meta") or {}).get("count", 0)
            max_pages = pages_for(total_available)

        if not results:
            break

        for w in results:
            papers.append({
                "id": w.get("id", ""),
                "year": w.get("publication_year"),
                "authorships": w.get("authorships") or [],
                "concepts": w.get("concepts") or [],
                "venue": ((w.get("primary_location") or {}).get("source") or {}).get("display_name", ""),
            })

        cursor = r.get("meta", {}).get("next_cursor")
        pages_fetched += 1
        time.sleep(0.12)

    return papers, total_available


def extract_institution_pairs(papers: list[dict], iso2: str):
    """From a list of works, extract (CN_inst, CEEC_inst) pairs per paper.

    Filters out blacklisted institutions during extraction.
    """
    edges: Counter[tuple[str, str]] = Counter()
    cn_insts: dict[str, dict] = {}
    ceec_insts: dict[str, dict] = {}
    edge_concepts: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)

    for w in papers:
        cn_ids: set[str] = set()
        ceec_ids: set[str] = set()

        for auth in w.get("authorships", []):
            insts = auth.get("institutions") or []
            for inst in insts:
                inst_id = inst.get("id", "")
                if not inst_id or inst_id in BLACKLIST_INST_IDS:
                    continue
                cc = (inst.get("country_code") or "").upper()
                if cc == "CN":
                    cn_ids.add(inst_id)
                    if inst_id not in cn_insts:
                        cn_insts[inst_id] = {
                            "id": inst_id,
                            "name": inst.get("display_name", ""),
                            "country": cc,
                            "type": inst.get("type", ""),
                            "paper_ids": set(),
                        }
                    cn_insts[inst_id]["paper_ids"].add(w["id"])
                elif cc == iso2.upper():
                    ceec_ids.add(inst_id)
                    if inst_id not in ceec_insts:
                        ceec_insts[inst_id] = {
                            "id": inst_id,
                            "name": inst.get("display_name", ""),
                            "country": cc,
                            "type": inst.get("type", ""),
                            "paper_ids": set(),
                        }
                    ceec_insts[inst_id]["paper_ids"].add(w["id"])

        for cn_id in cn_ids:
            for ceec_id in ceec_ids:
                edges[(cn_id, ceec_id)] += 1
                for c in w.get("concepts", []):
                    name = c.get("display_name", "")
                    if name:
                        edge_concepts[(cn_id, ceec_id)][name] += 1

    return edges, cn_insts, ceec_insts, edge_concepts


def validate_ceec_institutions(
    all_ceec_insts: dict[str, dict],
    all_cn_insts: dict[str, dict],
) -> tuple[set[str], set[str]]:
    """Post-hoc quality check on CEEC institutions.

    Returns (insts_to_remove, edges_to_remove).
    """
    insts_to_remove: set[str] = set()

    # Count per-country stats
    country_insts: dict[str, list[tuple[str, int, str, str]]] = defaultdict(list)
    # country -> [(inst_id, paper_count, name, type)]

    for inst_id, info in all_ceec_insts.items():
        cc = info["country"]
        total = info.get("paper_count_125", 0) + info.get("paper_count_135", 0)
        country_insts[cc].append((inst_id, total, info["name"], info["type"]))

    for cc, insts in country_insts.items():
        insts.sort(key=lambda x: -x[1])
        total_papers = sum(i[1] for i in insts)
        n_insts = len(insts)

        for inst_id, paper_count, name, itype in insts:
            # Heuristic: government institution with generic name dominating
            # a country that has very few institutions → likely misattributed
            if (
                itype == "government"
                and name in GENERIC_GOVT_NAMES
                and n_insts < 10
                and paper_count / total_papers > 0.4
            ):
                insts_to_remove.add(inst_id)
                print(f"    [QC REMOVE] {name} ({cc}) — "
                      f"govt generic name, {paper_count}/{total_papers} "
                      f"papers ({paper_count/total_papers*100:.0f}%), "
                      f"country has only {n_insts} institutions")

    return insts_to_remove


def main():
    print("=" * 60)
    print("Building China-CEEC Institution Collaboration Network  v2")
    print(f"Sampling: {SAMPLE_RATE*100:.0f}% rate, "
          f"min {MIN_PAPERS}, max {MAX_PAPERS} papers per country/period")
    print(f"Sort: cited_by_count:desc")
    print(f"Blacklist: {len(BLACKLIST_INST_IDS)} institutions")
    print("=" * 60)

    all_cn_insts: dict[str, dict] = {}
    all_ceec_insts: dict[str, dict] = {}
    all_edges: dict[str, dict] = {}
    period_meta: dict[str, dict] = {}
    removed_insts: set[str] = set()

    for period_key, y_start, y_end in PERIODS:
        print(f"\n{'─' * 50}")
        print(f"Period: {period_key} ({y_start}–{y_end})")
        print(f"{'─' * 50}")

        period_total_papers = 0
        period_total_available = 0

        for iso3, iso2, name_cn in PARTNERS:
            print(f"  {name_cn} ({iso2}) …", end=" ", flush=True)
            try:
                papers, total = query_country_period(iso2, y_start, y_end)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(f"FAILED: {e}")
                continue

            if not papers:
                print("0 papers")
                continue

            edges, cn_insts, ceec_insts, edge_concepts = extract_institution_pairs(
                papers, iso2
            )

            # Merge CN institutions
            for inst_id, info in cn_insts.items():
                if inst_id not in all_cn_insts:
                    all_cn_insts[inst_id] = {
                        "id": info["id"],
                        "name": info["name"],
                        "country": info["country"],
                        "type": info["type"],
                        "paper_count_125": 0,
                        "paper_count_135": 0,
                    }
                all_cn_insts[inst_id][f"paper_count_{period_key}"] += len(
                    info["paper_ids"]
                )

            # Merge CEEC institutions
            for inst_id, info in ceec_insts.items():
                if inst_id not in all_ceec_insts:
                    all_ceec_insts[inst_id] = {
                        "id": info["id"],
                        "name": info["name"],
                        "country": info["country"],
                        "type": info["type"],
                        "paper_count_125": 0,
                        "paper_count_135": 0,
                    }
                all_ceec_insts[inst_id][f"paper_count_{period_key}"] += len(
                    info["paper_ids"]
                )

            # Merge edges
            for (cn_id, ceec_id), weight in edges.items():
                key = f"{cn_id}||{ceec_id}"
                if key not in all_edges:
                    all_edges[key] = {
                        "source": cn_id,
                        "target": ceec_id,
                        "weight_125": 0,
                        "weight_135": 0,
                    }
                all_edges[key][f"weight_{period_key}"] += weight

            # Store edge concepts
            for (cn_id, ceec_id), conc_counter in edge_concepts.items():
                key = f"{cn_id}||{ceec_id}"
                if key not in all_edges:
                    all_edges[key] = {
                        "source": cn_id,
                        "target": ceec_id,
                        "weight_125": 0,
                        "weight_135": 0,
                    }
                if "_concepts" not in all_edges[key]:
                    all_edges[key]["_concepts"] = Counter()
                all_edges[key]["_concepts"].update(conc_counter)

            period_papers = len(papers)
            period_total_papers += period_papers
            period_total_available += total
            requested = pages_for(total) * PER_PAGE
            print(f"{period_papers} papers (avail: {total}, target: ~{min(requested, total)})")

        period_meta[period_key] = {
            "papers_sampled": period_total_papers,
            "papers_available": period_total_available,
        }
        print(f"  Period {period_key} total: {period_total_papers} papers "
              f"(out of {period_total_available} available)")

    # ------------------------------------------------------------------
    # Post-processing
    # ------------------------------------------------------------------

    # De-duplicate: CN institutions that leaked into CEEC list
    cn_ids_set = set(all_cn_insts.keys())
    ceec_ids_set = set(all_ceec_insts.keys()) - cn_ids_set
    all_ceec_insts = {k: v for k, v in all_ceec_insts.items() if k in ceec_ids_set}

    # Run institution quality validation
    print(f"\n{'─' * 50}")
    print("Institution quality check …")
    removed = validate_ceec_institutions(all_ceec_insts, all_cn_insts)
    print(f"  Removed {len(removed)} misattributed institutions")

    # Apply removals
    for inst_id in removed:
        all_ceec_insts.pop(inst_id, None)

    # Also clean edges that reference removed institutions
    all_valid_ids = set(all_cn_insts.keys()) | set(all_ceec_insts.keys())
    edges_to_remove = []
    for key, edge in all_edges.items():
        if edge["source"] not in all_valid_ids or edge["target"] not in all_valid_ids:
            edges_to_remove.append(key)
    for key in edges_to_remove:
        del all_edges[key]
    print(f"  Removed {len(edges_to_remove)} edges referencing removed institutions")

    # Build final node list
    nodes: list[dict] = []
    for inst_id, info in all_cn_insts.items():
        nodes.append({
            "id": info["id"],
            "name": info["name"],
            "country": "CN",
            "ceec_country": None,
            "side": "cn",
            "type": info["type"],
            "paper_count_125": info["paper_count_125"],
            "paper_count_135": info["paper_count_135"],
        })
    for inst_id, info in all_ceec_insts.items():
        nodes.append({
            "id": info["id"],
            "name": info["name"],
            "country": info["country"],
            "ceec_country": info["country"],
            "side": "ceec",
            "type": info["type"],
            "paper_count_125": info["paper_count_125"],
            "paper_count_135": info["paper_count_135"],
        })

    node_ids = {n["id"] for n in nodes}

    # Build final edge list
    edges_out: list[dict] = []
    for key, edge in all_edges.items():
        if edge["source"] not in node_ids or edge["target"] not in node_ids:
            continue
        total_weight = edge["weight_125"] + edge["weight_135"]
        if total_weight <= 0:
            continue
        conc_counter = edge.pop("_concepts", Counter())
        top_concepts = [name for name, _ in conc_counter.most_common(5)]
        edges_out.append({
            "source": edge["source"],
            "target": edge["target"],
            "weight_125": edge["weight_125"],
            "weight_135": edge["weight_135"],
            "total_weight": total_weight,
            "top_concepts": top_concepts,
        })

    # Sort for determinism
    nodes.sort(key=lambda n: -(n["paper_count_125"] + n["paper_count_135"]))
    edges_out.sort(key=lambda e: -(e["total_weight"]))

    # Stats
    cn_node_count = sum(1 for n in nodes if n["side"] == "cn")
    ceec_node_count = sum(1 for n in nodes if n["side"] == "ceec")
    total_papers_all = (
        period_meta["125"]["papers_sampled"] + period_meta["135"]["papers_sampled"]
    )

    out = {
        "source": "OpenAlex /works API",
        "fetched_at": "2026-05-17",
        "method": {
            "sampling": f"proportional, {SAMPLE_RATE*100:.0f}% rate, "
                        f"min {MIN_PAPERS}, max {MAX_PAPERS} per country/period",
            "sort": "cited_by_count:desc",
            "blacklist_count": len(BLACKLIST_INST_IDS),
            "removed_institutions": sorted(removed),
        },
        "periods": {
            "125": {"label": "2011–2015", **period_meta.get("125", {})},
            "135": {"label": "2016–2020", **period_meta.get("135", {})},
        },
        "nodes": nodes,
        "edges": edges_out,
        "stats": {
            "total_nodes": len(nodes),
            "cn_nodes": cn_node_count,
            "ceec_nodes": ceec_node_count,
            "total_edges": len(edges_out),
            "total_papers_sampled": total_papers_all,
        },
    }

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{'=' * 60}")
    print(f"Saved → {OUT}  ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"Nodes: {len(nodes)} ({cn_node_count} CN + {ceec_node_count} CEEC)")
    print(f"Edges: {len(edges_out)}")
    print(f"Papers sampled: {total_papers_all}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
