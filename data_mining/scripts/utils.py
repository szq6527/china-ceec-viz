"""
Shared utilities for data mining scripts.

- fetch(url): HTTP GET with caching, retries, exponential backoff
- COUNTRY_MAP: 16 CEEC countries with iso3, iso2, name_cn, geopolitical_group
- GEOPOLITICAL_GROUPS: country iso3 → group name
- Rate limiting and polite-pool identification
"""

import json
import hashlib
import time
import urllib.request
import urllib.error
import os
from pathlib import Path

# ---- Paths ----
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / ".cache"
PUBLIC_DATA = Path(__file__).resolve().parents[2] / "public" / "data"

# ---- OpenAlex polite pool ----
MAILTO = "sunzhengqi2024@gmail.com"
USER_AGENT = "ceec-viz/0.3"
BASE_URL = "https://api.openalex.org/works"

# ---- Rate limiting ----
RATE_LIMIT = 0.15  # seconds between API calls
_last_call = 0.0


def rate_limit():
    global _last_call
    now = time.time()
    wait = _last_call + RATE_LIMIT - now
    if wait > 0:
        time.sleep(wait)
    _last_call = time.time()


# ---- Caching ----
def _cache_path(url: str) -> Path:
    h = hashlib.md5(url.encode()).hexdigest()
    return CACHE_DIR / f"{h}.json"


def _read_cache(url: str):
    p = _cache_path(url)
    if p.exists():
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _write_cache(url: str, data):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(_cache_path(url), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


# ---- HTTP fetch with retry ----
def fetch(url: str, retries: int = 3, timeout: int = 45) -> dict:
    """Fetch JSON from a URL with caching, rate limiting, and exponential backoff."""
    cached = _read_cache(url)
    if cached is not None:
        return cached

    last_err = None
    for attempt in range(retries):
        rate_limit()
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", USER_AGENT)
            req.add_header("mailto", MAILTO)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                _write_cache(url, data)
                return data
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            last_err = e
            if attempt < retries - 1:
                wait = (2 ** attempt) * 1.5
                print(f"  [retry {attempt + 1}/{retries}] {e} — waiting {wait:.1f}s")
                time.sleep(wait)
    raise RuntimeError(f"Failed after {retries} retries: {url}\n{last_err}")


# ---- Country data ----
# Mapping: iso3 → (iso2, name_cn, geopolitical_group)
COUNTRY_MAP = {
    "POL": ("PL", "波兰", "eu_non_eurozone"),
    "CZE": ("CZ", "捷克", "eu_non_eurozone"),
    "GRC": ("GR", "希腊", "eurozone_special"),
    "HUN": ("HU", "匈牙利", "eu_non_eurozone"),
    "ROU": ("RO", "罗马尼亚", "eu_non_eurozone"),
    "SRB": ("RS", "塞尔维亚", "eu_candidate"),
    "BGR": ("BG", "保加利亚", "eu_non_eurozone"),
    "SVK": ("SK", "斯洛伐克", "eurozone_core"),
    "HRV": ("HR", "克罗地亚", "eu_non_eurozone"),
    "SVN": ("SI", "斯洛文尼亚", "eurozone_core"),
    "EST": ("EE", "爱沙尼亚", "eu_non_eurozone"),
    "LVA": ("LV", "拉脱维亚", "eu_non_eurozone"),
    "LTU": ("LT", "立陶宛", "eu_non_eurozone"),
    "ALB": ("AL", "阿尔巴尼亚", "eu_candidate"),
    "MNE": ("ME", "黑山", "eu_candidate"),
    "MKD": ("MK", "北马其顿", "eu_candidate"),
}

GEOPOLITICAL_GROUPS = {
    "eurozone_core": {
        "label": "欧元区核心",
        "countries": ["SVK", "SVN"],
        "description": "欧元区成员国,深度融入欧盟科研体系",
    },
    "eurozone_special": {
        "label": "希腊(欧元区·债务危机)",
        "countries": ["GRC"],
        "description": "欧元区成员国,但受债务危机(2010-2018)严重影响",
    },
    "eu_non_eurozone": {
        "label": "欧盟·非欧元区",
        "countries": ["POL", "CZE", "HUN", "ROU", "BGR", "HRV", "EST", "LVA", "LTU"],
        "description": "欧盟成员国但非欧元区,科研体系融入度不一",
    },
    "eu_candidate": {
        "label": "欧盟候选/潜在候选国",
        "countries": ["SRB", "MNE", "ALB", "MKD"],
        "description": "在入盟进程中或潜在候选国,欧盟框架参与受限",
    },
}


def iso3_to_iso2(iso3: str) -> str:
    return COUNTRY_MAP[iso3][0]


def iso3_to_name(iso3: str) -> str:
    return COUNTRY_MAP[iso3][1]


def iso3_to_group(iso3: str) -> str:
    return COUNTRY_MAP[iso3][2]


# ---- OpenAlex API helpers ----
def build_works_url(filters: list[str], group_by: str = None, per_page: int = 200,
                    sort: str = None, cursor: str = None, select: str = None) -> str:
    """Build an OpenAlex /works API URL."""
    params = []
    if filters:
        params.append("filter=" + ",".join(filters))
    if group_by:
        params.append(f"group_by={group_by}")
    if per_page:
        params.append(f"per_page={per_page}")
    if sort:
        params.append(f"sort={sort}")
    if cursor:
        params.append(f"cursor={cursor}")
    if select:
        params.append(f"select={select}")
    qs = "&".join(params)
    return f"{BASE_URL}?{qs}" if qs else BASE_URL


def fetch_group_by_count(url: str) -> dict[str, int]:
    """Fetch a group_by query and return {key: count} dict."""
    data = fetch(url)
    results = data.get("group_by", [])
    return {str(r["key"]): r["count"] for r in results}


def fetch_all_pages(base_url: str, max_pages: int = None) -> list[dict]:
    """Fetch all pages of a cursor-paginated resultset. Returns list of result objects."""
    all_results = []
    cursor = "*"
    pages = 0
    while cursor:
        url = base_url + (f"&cursor={cursor}" if "?" in base_url else f"?cursor={cursor}")
        data = fetch(url)
        results = data.get("results", [])
        all_results.extend(results)
        pages += 1
        cursor = data.get("meta", {}).get("next_cursor")
        if cursor is None and len(results) < 200:
            break  # no more pages
        if max_pages and pages >= max_pages:
            break
    return all_results


def extract_yearly(group_by_result: dict[str, int]) -> dict[int, int]:
    """Convert {'2011': 524, ...} to {2011: 524, ...}."""
    return {int(k): v for k, v in group_by_result.items() if k.isdigit()}


# ---- Helpers ----
def read_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stddev(values: list[float], ddof: int = 1) -> float:
    m = mean(values)
    n = len(values)
    if n <= ddof:
        return 0.0
    return (sum((v - m) ** 2 for v in values) / (n - ddof)) ** 0.5


# ---- Print helpers ----
def print_header(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def print_subsection(title: str):
    print(f"\n  --- {title} ---")


# ---- ISO2 country code mapping for API queries ----
ISO2_TO_ISO3 = {v[0]: k for k, v in COUNTRY_MAP.items()}
