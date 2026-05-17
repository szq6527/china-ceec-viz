import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";

/* ============================================================
 * Data types (matches institution_network.json)
 * ============================================================ */
interface NetworkNode {
  id: string;
  name: string;
  country: string;
  ceec_country: string | null;
  side: "cn" | "ceec";
  type: string;
  paper_count_125: number;
  paper_count_135: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight_125: number;
  weight_135: number;
  total_weight: number;
  top_concepts: string[];
}

interface NetworkData {
  source: string;
  fetched_at: string;
  method?: Record<string, unknown>;
  periods: {
    "125": { label: string; papers_sampled: number; papers_available: number };
    "135": { label: string; papers_sampled: number; papers_available: number };
  };
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  stats: { total_nodes: number; cn_nodes: number; ceec_nodes: number; total_edges: number; total_papers_sampled: number };
}

/* ============================================================
 * Simulation node / edge (the single graph covering ALL 4 views)
 * ============================================================ */
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  side: "cn" | "ceec";
  country: string;
  ceec_country: string | null;
  type: string;
  radius: number;           // initial fallback — dynamically overridden
  weight_125: number;
  weight_135: number;
  nonPhysWeight125: number; // sum of non-physics edge weights (125)
  nonPhysWeight135: number; // sum of non-physics edge weights (135)
  maxWeight: number;
  targetY: number;
  showLabel: boolean;
  x: number;
  y: number;
}

interface SimEdge {
  source: string;            // stored as ID so selections can be rebuilt
  target: string;
  weight_125: number;
  weight_135: number;
  total_weight: number;      // used for consistent stroke-width
  top_concepts: string[];
  is_physics: boolean;       // true when physics concepts dominate
}

/* ============================================================
 * Map view types
 * ============================================================ */
interface InstitutionCoord {
  name: string;
  city: string;
  lat: number;
  lon: number;
  isBeijing: boolean;
}

/** CN city node (aggregated from all institutions in that city) */
interface MapNodeCN {
  city: string;              // city name (e.g. "北京")
  lat: number;
  lon: number;
  weight_125: number;        // total papers across all institutions in this city
  weight_135: number;
  nonPhysWeight125: number;
  nonPhysWeight135: number;
  maxWeight: number;
  radius: number;
  institutions: string[];    // institution names in this city (sorted by paper count)
  institutionCount: number;
}

interface MapNodeCEEC {
  iso: string;
  name_cn: string;
  lat: number;
  lon: number;
  weight_125: number;
  weight_135: number;
  nonPhysWeight125: number;
  nonPhysWeight135: number;
  maxWeight: number;
  radius: number;
  institutionCount: number;
}

interface MapEdge {
  cnCity: string;            // city name (matches MapNodeCN.city)
  ceecIso: string;
  weight_125: number;
  weight_135: number;
  total_weight: number;
  is_physics: boolean;
}

/** Tooltip data when hovering a map node */
interface MapTooltip {
  label: string;             // "北京" or "波兰"
  subtitle: string;          // "7 所机构" or "首都 · 32 所机构"
  topInstitutions: string[]; // top institution names (CN cities) or empty (CEEC)
  topPartners: { name: string; weight: number }[]; // top 3 collaboration partners
  weight_125: number;
  weight_135: number;
}

/* ============================================================
 * Constants
 * ============================================================ */
const PHYSICS_CONCEPTS = new Set([
  "Physics", "Astronomy", "Nuclear physics", "Particle physics",
  "High energy physics", "Nuclear and high energy physics",
  "Astrophysics", "Quantum mechanics", "Theoretical physics",
  "Mathematical physics", "Atomic physics", "Nuclear engineering",
]);

const CEEC_COLORS: Record<string, string> = {
  PL: "#f5b14a", CZ: "#80ed99", GR: "#4cc9f0", HU: "#c77dff",
  RO: "#ff8366", RS: "#ff4d3d", BG: "#8ae3ff", SK: "#f5b14a",
  HR: "#80ed99", SI: "#4cc9f0", EE: "#c77dff", LV: "#ff8366",
  LT: "#f5b14a", AL: "#80ed99", ME: "#4cc9f0", MK: "#c77dff",
};

const INST_TYPE_SHORT: Record<string, string> = {
  education: "大学", facility: "研究机构", government: "政府机构",
  healthcare: "医疗机构", company: "企业", nonprofit: "非营利组织", other: "其他",
};

const COUNTRY_CN: Record<string, string> = {
  CN: "中国大陆", PL: "波兰", CZ: "捷克", GR: "希腊", HU: "匈牙利",
  RO: "罗马尼亚", RS: "塞尔维亚", BG: "保加利亚", SK: "斯洛伐克",
  HR: "克罗地亚", SI: "斯洛文尼亚", EE: "爱沙尼亚", LV: "拉脱维亚",
  LT: "立陶宛", AL: "阿尔巴尼亚", ME: "黑山", MK: "北马其顿",
};

/* ---- CEEC capital coordinates ---- */
const CEEC_COORDS: Record<string, { name_cn: string; lat: number; lon: number }> = {
  PL: { name_cn: "波兰", lat: 52.2297, lon: 21.0122 },
  CZ: { name_cn: "捷克", lat: 50.0755, lon: 14.4378 },
  GR: { name_cn: "希腊", lat: 37.9838, lon: 23.7275 },
  HU: { name_cn: "匈牙利", lat: 47.4979, lon: 19.0402 },
  RO: { name_cn: "罗马尼亚", lat: 44.4268, lon: 26.1025 },
  RS: { name_cn: "塞尔维亚", lat: 44.7866, lon: 20.4489 },
  BG: { name_cn: "保加利亚", lat: 42.6977, lon: 23.3219 },
  SK: { name_cn: "斯洛伐克", lat: 48.1486, lon: 17.1077 },
  HR: { name_cn: "克罗地亚", lat: 45.8150, lon: 15.9819 },
  SI: { name_cn: "斯洛文尼亚", lat: 46.0569, lon: 14.5058 },
  EE: { name_cn: "爱沙尼亚", lat: 59.4370, lon: 24.7536 },
  LV: { name_cn: "拉脱维亚", lat: 56.9496, lon: 24.1052 },
  LT: { name_cn: "立陶宛", lat: 54.6872, lon: 25.2797 },
  AL: { name_cn: "阿尔巴尼亚", lat: 41.3275, lon: 19.8187 },
  ME: { name_cn: "黑山", lat: 42.4304, lon: 19.2594 },
  MK: { name_cn: "北马其顿", lat: 41.9973, lon: 21.4280 },
};

/* ---- CN institution coordinate lookup ---- */
const CN_COORD_LOOKUP: Record<string, InstitutionCoord> = {
  "Chinese Academy of Sciences": { name: "Chinese Academy of Sciences", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Peking University": { name: "Peking University", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Tsinghua University": { name: "Tsinghua University", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "University of Chinese Academy of Sciences": { name: "University of Chinese Academy of Sciences", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Beijing Normal University": { name: "Beijing Normal University", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Capital Medical University": { name: "Capital Medical University", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Chinese Academy of Medical Sciences & Peking Union Medical College": { name: "Chinese Academy of Medical Sciences & Peking Union Medical College", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Institute of High Energy Physics": { name: "Institute of High Energy Physics", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Institute of Physics": { name: "Institute of Physics", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Chinese Academy of Agricultural Sciences": { name: "Chinese Academy of Agricultural Sciences", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Fudan University": { name: "Fudan University", city: "上海", lat: 31.2304, lon: 121.4737, isBeijing: false },
  "Shanghai Jiao Tong University": { name: "Shanghai Jiao Tong University", city: "上海", lat: 31.2304, lon: 121.4737, isBeijing: false },
  "East China Normal University": { name: "East China Normal University", city: "上海", lat: 31.2304, lon: 121.4737, isBeijing: false },
  "Zhejiang University": { name: "Zhejiang University", city: "杭州", lat: 30.2741, lon: 120.1551, isBeijing: false },
  "Sun Yat-sen University": { name: "Sun Yat-sen University", city: "广州", lat: 23.1291, lon: 113.2644, isBeijing: false },
  "South China University of Technology": { name: "South China University of Technology", city: "广州", lat: 23.1291, lon: 113.2644, isBeijing: false },
  "Nanjing University": { name: "Nanjing University", city: "南京", lat: 32.0603, lon: 118.7969, isBeijing: false },
  "Southeast University": { name: "Southeast University", city: "南京", lat: 32.0603, lon: 118.7969, isBeijing: false },
  "Shandong University": { name: "Shandong University", city: "济南", lat: 36.6512, lon: 116.9974, isBeijing: false },
  "University of Science and Technology of China": { name: "University of Science and Technology of China", city: "合肥", lat: 31.8206, lon: 117.2272, isBeijing: false },
  "Huazhong University of Science and Technology": { name: "Huazhong University of Science and Technology", city: "武汉", lat: 30.5928, lon: 114.3055, isBeijing: false },
  "Wuhan University": { name: "Wuhan University", city: "武汉", lat: 30.5928, lon: 114.3055, isBeijing: false },
  "Central China Normal University": { name: "Central China Normal University", city: "武汉", lat: 30.5928, lon: 114.3055, isBeijing: false },
  "Sichuan University": { name: "Sichuan University", city: "成都", lat: 30.5728, lon: 104.0668, isBeijing: false },
  "Xi'an Jiaotong University": { name: "Xi'an Jiaotong University", city: "西安", lat: 34.3416, lon: 108.9398, isBeijing: false },
  "Lanzhou University": { name: "Lanzhou University", city: "兰州", lat: 36.0611, lon: 103.8343, isBeijing: false },
  "Institute of Modern Physics": { name: "Institute of Modern Physics", city: "兰州", lat: 36.0611, lon: 103.8343, isBeijing: false },
  "Nankai University": { name: "Nankai University", city: "天津", lat: 39.3434, lon: 117.3616, isBeijing: false },
  "Soochow University": { name: "Soochow University", city: "苏州", lat: 31.2990, lon: 120.5853, isBeijing: false },
  "Beihang University": { name: "Beihang University", city: "北京", lat: 39.9042, lon: 116.4074, isBeijing: true },
  "Harbin Institute of Technology": { name: "Harbin Institute of Technology", city: "哈尔滨", lat: 45.8038, lon: 126.5350, isBeijing: false },
};

function applyBeijingOffset(index: number, total: number): { lat: number; lon: number } {
  const BEIJING_LAT = 39.9042;
  const BEIJING_LON = 116.4074;
  if (total <= 1) return { lat: BEIJING_LAT, lon: BEIJING_LON };
  const angle = (index / total) * Math.PI * 2;
  const radiusDeg = index < 6 ? 0.28 : 0.52;
  const lat = BEIJING_LAT + radiusDeg * Math.cos(angle);
  const lonScale = Math.cos((BEIJING_LAT * Math.PI) / 180);
  const lon = BEIJING_LON + (radiusDeg * Math.sin(angle)) / lonScale;
  return { lat, lon };
}

/* ---- Natural Earth name → ISO3 mapping (for TopoJSON country lookup) ---- */
const NAME_TO_ISO: Record<string, string> = {
  Poland: "POL", Czechia: "CZE", Hungary: "HUN", Romania: "ROU",
  Bulgaria: "BGR", Slovakia: "SVK", Croatia: "HRV", Slovenia: "SVN",
  Serbia: "SRB", Greece: "GRC", Albania: "ALB", Latvia: "LVA",
  Lithuania: "LTU", Estonia: "EST", Montenegro: "MNE",
  "North Macedonia": "MKD", Macedonia: "MKD", China: "CHN",
};

const W = 1200;
const H = 750;
const CN_TOP = 100;
const CEEC_TOP = 80;
const DEFAULT_LABELS = 8;
const H_SPREAD = 320;
const MIN_EDGE_WEIGHT = 3;

interface Props {
  active: boolean;
}

/* ============================================================
 * Scene 7 — 合作机构网络  (stable-layout v2)
 *
 * One combined graph is built covering all 4 views:
 *   {125, 135} × {all, no‑physics}
 *
 * D3 force runs ONCE.  Switching period / physics filter only
 * changes opacity — node positions, sizes, and edge thicknesses
 * stay identical across views so the reader can compare directly.
 * ============================================================ */
export function Scene7InstitutionNetwork({ active }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<NetworkData | null>(null);
  const [period, setPeriod] = useState<"125" | "135">("135");
  const [filterPhysics, setFilterPhysics] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [viewMode, setViewMode] = useState<"network" | "map">("network");
  const [topoFeatures, setTopoFeatures] = useState<any[] | null>(null);
  const [mapTooltip, setMapTooltip] = useState<MapTooltip | null>(null);

  // Refs to D3 selections so the view-update effect can change opacity
  const edgeSelRef = useRef<d3.Selection<SVGLineElement, SimEdge, SVGGElement, unknown> | null>(null);
  const nodeSelRef = useRef<d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown> | null>(null);
  const labelSelRef = useRef<d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null>(null);
  const graphRef = useRef<{ nodes: SimNode[]; edges: SimEdge[]; nodeMap: Map<string, SimNode> } | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  // Latest view state so D3 event handlers always read current values
  const periodRef = useRef(period);
  periodRef.current = period;
  const filterRef = useRef(filterPhysics);
  filterRef.current = filterPhysics;

  // ---- map-specific refs ------------------------------------------------
  const mapSvgRef = useRef<SVGSVGElement>(null);
  const mapGRef = useRef<SVGGElement | null>(null);
  const mapEdgeSelRef = useRef<d3.Selection<SVGLineElement, MapEdge, SVGGElement, unknown> | null>(null);
  const mapCnSelRef = useRef<d3.Selection<SVGCircleElement, MapNodeCN, SVGGElement, unknown> | null>(null);
  const mapCeecSelRef = useRef<d3.Selection<SVGCircleElement, MapNodeCEEC, SVGGElement, unknown> | null>(null);
  const mapLabelSelRef = useRef<d3.Selection<SVGTextElement, MapNodeCN | MapNodeCEEC, SVGGElement, unknown> | null>(null);
  const mapDataRef = useRef<{ cnNodes: MapNodeCN[]; ceecNodes: MapNodeCEEC[]; edges: MapEdge[] } | null>(null);

  // ---- load raw data -------------------------------------------------
  useEffect(() => {
    fetch("./data/institution_network.json")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error("Failed to load institution network:", e));
  }, []);

  // ---- load TopoJSON for map view ------------------------------------
  useEffect(() => {
    if (!active || topoFeatures) return;
    fetch("./data/world-110m.json")
      .then((r) => r.json())
      .then((topo: any) => {
        const obj = topo.objects.countries ?? topo.objects[Object.keys(topo.objects)[0]];
        const fc = topojsonFeature(topo, obj) as any;
        setTopoFeatures(fc.features);
      })
      .catch(() => setTopoFeatures([]));
  }, [active, topoFeatures]);

  // ---- build the combined graph (stable — depends only on `data`) ----
  const combinedGraph = useMemo(() => {
    if (!data) return null;

    // 1. Score every node by max(p125, p135)
    const maxCount = (n: NetworkNode) => Math.max(n.paper_count_125, n.paper_count_135);

    // 2. Collect nodes that have at least one edge with total_weight >= MIN_EDGE_WEIGHT
    const edgeNodeIds = new Set<string>();
    for (const e of data.edges) {
      if (e.total_weight >= MIN_EDGE_WEIGHT) {
        edgeNodeIds.add(e.source);
        edgeNodeIds.add(e.target);
      }
    }

    // 3. Take top N per side (union across both periods)
    const cnCandidates = data.nodes
      .filter((n) => n.side === "cn" && edgeNodeIds.has(n.id))
      .sort((a, b) => maxCount(b) - maxCount(a));
    const ceecCandidates = data.nodes
      .filter((n) => n.side === "ceec" && edgeNodeIds.has(n.id))
      .sort((a, b) => maxCount(b) - maxCount(a));

    const cnTop = cnCandidates.slice(0, CN_TOP);
    const ceecTop = ceecCandidates.slice(0, CEEC_TOP);
    const combinedNodeIds = new Set([
      ...cnTop.map((n) => n.id),
      ...ceecTop.map((n) => n.id),
    ]);

    // 4. Filter edges: both ends must be in the combined node set
    const combinedEdgesRaw = data.edges.filter(
      (e) =>
        e.total_weight >= MIN_EDGE_WEIGHT &&
        combinedNodeIds.has(e.source) &&
        combinedNodeIds.has(e.target),
    );

    // 5. Label set (top DEFAULT_LABELS per side by maxWeight)
    const labelIds = new Set([
      ...cnTop.slice(0, DEFAULT_LABELS).map((n) => n.id),
      ...ceecTop.slice(0, DEFAULT_LABELS).map((n) => n.id),
    ]);

    // 6. Build SimNode array with consistent sizing
    const cnSorted = [...cnTop].sort((a, b) => maxCount(b) - maxCount(a));
    const ceecSorted = [...ceecTop].sort((a, b) => maxCount(b) - maxCount(a));
    const cnTargetY = new Map(cnSorted.map((n, i) => [n.id, ((i / Math.max(cnSorted.length - 1, 1)) - 0.5) * H_SPREAD]));
    const ceecTargetY = new Map(ceecSorted.map((n, i) => [n.id, ((i / Math.max(ceecSorted.length - 1, 1)) - 0.5) * H_SPREAD]));

    const simNodes: SimNode[] = [];
    const nodeMap = new Map<string, SimNode>();

    for (const n of [...cnTop, ...ceecTop]) {
      const sn: SimNode = {
        id: n.id,
        name: n.name,
        side: n.side,
        country: n.country,
        ceec_country: n.ceec_country,
        type: n.type,
        radius: Math.max(3, Math.sqrt(maxCount(n)) * 0.6),
        weight_125: n.paper_count_125,
        weight_135: n.paper_count_135,
        nonPhysWeight125: 0,
        nonPhysWeight135: 0,
        maxWeight: maxCount(n),
        targetY: n.side === "cn" ? (cnTargetY.get(n.id) ?? 0) : (ceecTargetY.get(n.id) ?? 0),
        showLabel: labelIds.has(n.id),
        x: 0,
        y: 0,
      };
      simNodes.push(sn);
      nodeMap.set(n.id, sn);
    }

    // 7. Build SimEdge array with consistent weight (total_weight)
    const simEdges: SimEdge[] = [];
    for (const e of combinedEdgesRaw) {
      const physCount = e.top_concepts.filter((c) => PHYSICS_CONCEPTS.has(c)).length;
      simEdges.push({
        source: e.source,
        target: e.target,
        weight_125: e.weight_125,
        weight_135: e.weight_135,
        total_weight: e.total_weight,
        top_concepts: e.top_concepts,
        is_physics: physCount >= e.top_concepts.length * 0.5 && physCount > 0,
      });
    }

    // 8. Accumulate non-physics edge weights per node (for filterPhysics sizing)
    for (const e of simEdges) {
      if (e.is_physics) continue;
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (src) {
        src.nonPhysWeight125 += e.weight_125;
        src.nonPhysWeight135 += e.weight_135;
      }
      if (tgt) {
        tgt.nonPhysWeight125 += e.weight_125;
        tgt.nonPhysWeight135 += e.weight_135;
      }
    }

    return { nodes: simNodes, edges: simEdges, nodeMap };
  }, [data]);

  // ---- map data: CN cities + aggregated CEEC countries ----------------
  const mapData = useMemo(() => {
    if (!data) return null;

    const maxCount = (n: NetworkNode) => Math.max(n.paper_count_125, n.paper_count_135);

    // Map CN institution ID → city name
    const cnIdToCity = new Map<string, string>();
    for (const n of data.nodes) {
      if (n.side === "cn" && CN_COORD_LOOKUP[n.name]) {
        cnIdToCity.set(n.id, CN_COORD_LOOKUP[n.name].city);
      }
    }

    // CN side: aggregate all mapped institutions by city, take top 15 cities
    const cityAgg = new Map<string, {
      weight_125: number; weight_135: number;
      institutions: { name: string; weight: number }[];
    }>();
    for (const n of data.nodes) {
      if (n.side !== "cn") continue;
      const coord = CN_COORD_LOOKUP[n.name];
      if (!coord) continue;
      let entry = cityAgg.get(coord.city);
      if (!entry) {
        entry = { weight_125: 0, weight_135: 0, institutions: [] };
        cityAgg.set(coord.city, entry);
      }
      entry.weight_125 += n.paper_count_125;
      entry.weight_135 += n.paper_count_135;
      entry.institutions.push({ name: n.name, weight: maxCount(n) });
    }

    // Sort cities by max weight, take top 15
    const topCities = Array.from(cityAgg.entries())
      .sort((a, b) => Math.max(b[1].weight_125, b[1].weight_135) - Math.max(a[1].weight_125, a[1].weight_135))
      .slice(0, 15);

    // Build city coordinate lookup (use the most-weighted institution's coord for each city)
    const cityCoord = new Map<string, { lat: number; lon: number; isBeijing: boolean }>();
    for (const n of data.nodes) {
      if (n.side !== "cn") continue;
      const coord = CN_COORD_LOOKUP[n.name];
      if (!coord || cityCoord.has(coord.city)) continue;
      cityCoord.set(coord.city, { lat: coord.lat, lon: coord.lon, isBeijing: coord.isBeijing });
    }

    // Apply Beijing offset for Beijing city (single point, no offset needed for ONE city)
    // But if other nearby cities exist (Tianjin), just use exact coords

    const cnNodes: MapNodeCN[] = topCities.map(([city, agg], i) => {
      const coord = cityCoord.get(city) ?? { lat: 35, lon: 115, isBeijing: false };
      const mw = Math.max(agg.weight_125, agg.weight_135);
      // Sort institutions by weight desc
      agg.institutions.sort((a, b) => b.weight - a.weight);
      return {
        city,
        lat: coord.lat,
        lon: coord.lon,
        weight_125: agg.weight_125,
        weight_135: agg.weight_135,
        nonPhysWeight125: 0,
        nonPhysWeight135: 0,
        maxWeight: mw,
        radius: Math.max(2.2, Math.sqrt(mw) * 0.38),
        institutions: agg.institutions.map((x) => x.name),
        institutionCount: agg.institutions.length,
      };
    });

    // CEEC side: aggregate by ceec_country
    const ceecAgg = new Map<string, { iso: string; weight_125: number; weight_135: number; count: number }>();
    for (const n of data.nodes) {
      if (n.side !== "ceec" || !n.ceec_country) continue;
      if (!CEEC_COORDS[n.ceec_country]) continue;
      let entry = ceecAgg.get(n.ceec_country);
      if (!entry) {
        entry = { iso: n.ceec_country, weight_125: 0, weight_135: 0, count: 0 };
        ceecAgg.set(n.ceec_country, entry);
      }
      entry.weight_125 += n.paper_count_125;
      entry.weight_135 += n.paper_count_135;
      entry.count++;
    }

    const ceecNodes: MapNodeCEEC[] = Array.from(ceecAgg.values()).map((agg) => {
      const coord = CEEC_COORDS[agg.iso];
      const mw = Math.max(agg.weight_125, agg.weight_135);
      return {
        iso: agg.iso, name_cn: coord.name_cn,
        lat: coord.lat, lon: coord.lon,
        weight_125: agg.weight_125, weight_135: agg.weight_135,
        nonPhysWeight125: 0, nonPhysWeight135: 0,
        maxWeight: mw,
        radius: Math.max(2.2, Math.sqrt(mw) * 0.38),
        institutionCount: agg.count,
      };
    });

    // Map CEEC institution ID → country ISO
    const ceecIdToCountry = new Map<string, string>();
    for (const n of data.nodes) {
      if (n.side === "ceec" && n.ceec_country) ceecIdToCountry.set(n.id, n.ceec_country);
    }

    // Aggregate edges: CN city → CEEC country
    const ceecCountrySet = new Set(ceecNodes.map((n) => n.iso));
    const cnCitySet = new Set(cnNodes.map((n) => n.city));
    const edgeAgg = new Map<string, MapEdge>();
    for (const e of data.edges) {
      // Determine which side is CN and which is CEEC
      let cnId: string, ceecId: string;
      if (cnIdToCity.has(e.source) && ceecIdToCountry.has(e.target)) {
        cnId = e.source; ceecId = e.target;
      } else if (cnIdToCity.has(e.target) && ceecIdToCountry.has(e.source)) {
        cnId = e.target; ceecId = e.source;
      } else continue;

      const cnCity = cnIdToCity.get(cnId)!;
      const ceecIso = ceecIdToCountry.get(ceecId)!;
      if (!cnCitySet.has(cnCity) || !ceecCountrySet.has(ceecIso)) continue;

      const key = `${cnCity}|${ceecIso}`;
      let existing = edgeAgg.get(key);
      if (!existing) {
        const physCount = e.top_concepts.filter((c) => PHYSICS_CONCEPTS.has(c)).length;
        existing = {
          cnCity, ceecIso,
          weight_125: 0, weight_135: 0, total_weight: 0,
          is_physics: physCount >= e.top_concepts.length * 0.5 && physCount > 0,
        };
        edgeAgg.set(key, existing);
      }
      existing.weight_125 += e.weight_125;
      existing.weight_135 += e.weight_135;
      existing.total_weight += e.total_weight;
    }

    const mapEdges = Array.from(edgeAgg.values());

    // Accumulate non-physics edge weights per node
    const cnNonPhys125 = new Map<string, number>();
    const cnNonPhys135 = new Map<string, number>();
    const ceecNonPhys125 = new Map<string, number>();
    const ceecNonPhys135 = new Map<string, number>();
    for (const e of mapEdges) {
      if (e.is_physics) continue;
      cnNonPhys125.set(e.cnCity, (cnNonPhys125.get(e.cnCity) ?? 0) + e.weight_125);
      cnNonPhys135.set(e.cnCity, (cnNonPhys135.get(e.cnCity) ?? 0) + e.weight_135);
      ceecNonPhys125.set(e.ceecIso, (ceecNonPhys125.get(e.ceecIso) ?? 0) + e.weight_125);
      ceecNonPhys135.set(e.ceecIso, (ceecNonPhys135.get(e.ceecIso) ?? 0) + e.weight_135);
    }
    for (const n of cnNodes) {
      n.nonPhysWeight125 = cnNonPhys125.get(n.city) ?? 0;
      n.nonPhysWeight135 = cnNonPhys135.get(n.city) ?? 0;
    }
    for (const n of ceecNodes) {
      n.nonPhysWeight125 = ceecNonPhys125.get(n.iso) ?? 0;
      n.nonPhysWeight135 = ceecNonPhys135.get(n.iso) ?? 0;
    }

    return { cnNodes, ceecNodes, edges: mapEdges };
  }, [data]);

  // ---- map projection + path generator ---------------------------------
  const MAP_PROJECTION = useMemo(
    () => geoEquirectangular()
      .rotate([-60, -42])
      .scale(470)
      .translate([600, 375]),
    [],
  );
  const MAP_PATH = useMemo(() => geoPath(MAP_PROJECTION), [MAP_PROJECTION]);

  // ---- map visibility helpers -------------------------------------------
  const isMapEdgeVisible = useCallback(
    (e: MapEdge) => {
      const w = period === "125" ? e.weight_125 : e.weight_135;
      if (w < 1) return false;
      if (filterPhysics && e.is_physics) return false;
      return true;
    },
    [period, filterPhysics],
  );

  // ---- visibility helpers ---------------------------------------------
  const isNodeVisible = useCallback(
    (n: SimNode) => {
      const count = period === "125" ? n.weight_125 : n.weight_135;
      if (count <= 0) return false;
      // A node is visible if it has at least one visible edge in this view
      const g = graphRef.current;
      if (!g) return count > 0;
      for (const e of g.edges) {
        const w = period === "125" ? e.weight_125 : e.weight_135;
        if (w < MIN_EDGE_WEIGHT) continue;
        if (filterPhysics && e.is_physics) continue;
        if (e.source === n.id || e.target === n.id) return true;
      }
      return false;
    },
    [period, filterPhysics],
  );

  const isEdgeVisible = useCallback(
    (e: SimEdge) => {
      const w = period === "125" ? e.weight_125 : e.weight_135;
      if (w < MIN_EDGE_WEIGHT) return false;
      if (filterPhysics && e.is_physics) return false;
      return true;
    },
    [period, filterPhysics],
  );

  // ---- D3 simulation + render (runs ONCE per data load) ---------------
  useEffect(() => {
    if (!combinedGraph || !svgRef.current || !active) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("class", "network-root");
    gRef.current = g;

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => { g.attr("transform", event.transform.toString()); });
    svg.call(zoom);
    zoomRef.current = zoom;

    const { nodes, edges, nodeMap } = combinedGraph;
    graphRef.current = combinedGraph;

    // Compute per-edge weight for force distance (use total_weight for layout)
    const edgeForLayout = edges.map((e) => ({
      source: nodeMap.get(e.source)!,
      target: nodeMap.get(e.target)!,
      weight: e.total_weight,
    }));

    // Force simulation
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, typeof edgeForLayout[number]>(edgeForLayout)
        .id((d) => d.id)
        .distance((d) => 80 / Math.sqrt((d as typeof edgeForLayout[number]).weight + 1) + 40))
      .force("x", d3.forceX<SimNode>((d) => (d.side === "cn" ? -W * 0.28 : W * 0.28)).strength(0.45))
      .force("y", d3.forceY<SimNode>((d) => d.targetY).strength(0.12))
      .force("charge", d3.forceManyBody<SimNode>().strength(-50))
      .force("collide", d3.forceCollide<SimNode>((d) => d.radius + 2).iterations(2))
      .alphaDecay(0.018)
      .stop();

    // Run to convergence
    const iterations = nodes.length > 300 ? 300 : 200;
    for (let i = 0; i < iterations; i++) sim.tick();
    sim.stop();

    // ---- Draw edges (all of them — visibility controlled by opacity) ----
    const edgeGroup = g.append("g").attr("class", "edges");
    const edgeLines = edgeGroup
      .selectAll<SVGLineElement, SimEdge>("line")
      .data(edges)
      .join("line")
      .attr("x1", (d) => nodeMap.get(d.source)!.x)
      .attr("y1", (d) => nodeMap.get(d.source)!.y)
      .attr("x2", (d) => nodeMap.get(d.target)!.x)
      .attr("y2", (d) => nodeMap.get(d.target)!.y)
      .attr("stroke", "rgba(201,194,173,0.12)")
      .attr("stroke-width", (d) => Math.max(0.3, Math.pow(d.total_weight, 0.55) * 0.28));
    edgeSelRef.current = edgeLines;

    // ---- Draw nodes ----
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodeCircles = nodeGroup
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.side === "cn" ? "var(--accent-cn)" : (CEEC_COLORS[d.ceec_country || ""] || "var(--accent-eu)"))
      .attr("fill-opacity", 0.82)
      .attr("stroke", (d) => d.side === "cn" ? "var(--accent-cn-glow)" : "var(--accent-eu-glow)")
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("mouseenter", function (_, d) {
        setHoveredNode(d);
        const p = periodRef.current;
        const f = filterRef.current;
        const getR = (nd: SimNode) => {
          const raw = p === "125"
            ? (f ? nd.nonPhysWeight125 : nd.weight_125)
            : (f ? nd.nonPhysWeight135 : nd.weight_135);
          return Math.max(2, Math.sqrt(Math.max(0, raw)) * 0.6);
        };
        const getEW = (ed: SimEdge) => {
          const w = p === "125" ? ed.weight_125 : ed.weight_135;
          return Math.max(0.3, Math.pow(Math.max(0, w), 0.55) * 0.28);
        };
        const neighborIds = new Set<string>();
        // Highlight edges
        edgeLines
          .attr("stroke", (ed) => {
            if (ed.source === d.id || ed.target === d.id) {
              neighborIds.add(ed.source === d.id ? ed.target : ed.source);
              return "rgba(246,241,224,0.55)";
            }
            return "rgba(201,194,173,0.04)";
          })
          .attr("stroke-width", (ed) => {
            if (ed.source === d.id || ed.target === d.id) return getEW(ed) * 1.6;
            return Math.max(0.18, getEW(ed) * 0.25);
          });
        // Highlight nodes — scale from current dynamic radius
        nodeCircles
          .attr("fill-opacity", (nd) => nd.id === d.id || neighborIds.has(nd.id) ? 1 : 0.2)
          .attr("r", (nd) => {
            const baseR = getR(nd);
            if (nd.id === d.id) return baseR * 1.4;
            if (neighborIds.has(nd.id)) return baseR * 1.15;
            return baseR;
          });
        // Show only hovered node + top-8 connected labels
        const topNeighborIds = new Set(
          edges
            .filter((e) => e.source === d.id || e.target === d.id)
            .sort((a, b) => b.total_weight - a.total_weight)
            .slice(0, 8)
            .map((e) => (e.source === d.id ? e.target : e.source)),
        );
        labelSelRef.current?.attr("opacity", (nd) =>
          nd.id === d.id || topNeighborIds.has(nd.id) ? 0.9 : 0,
        );
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
        applyVisibilityRef.current();
      });
    nodeSelRef.current = nodeCircles;

    // ---- Labels (all nodes, visibility via opacity) ----
    const labelGroup = g.append("g").attr("class", "labels");
    const labelTexts = labelGroup
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .attr("x", (d) => d.x + (d.side === "cn" ? -d.radius - 3 : d.radius + 3))
      .attr("y", (d) => d.y)
      .attr("text-anchor", (d) => (d.side === "cn" ? "end" : "start"))
      .attr("dy", "0.32em")
      .attr("fill", "var(--ink-1)")
      .attr("font-family", "var(--mono)")
      .attr("font-size", (d) => Math.max(7, Math.min(10, d.radius * 0.7)))
      .attr("letter-spacing", "0.04em")
      .attr("opacity", (d) => (d.showLabel ? 0.9 : 0))
      .text((d) => (d.name.length > 42 ? d.name.slice(0, 40) + "…" : d.name));
    labelSelRef.current = labelTexts;

    // ---- Static decor: divider + side labels ----
    g.append("line")
      .attr("x1", 0).attr("y1", -H * 0.42).attr("x2", 0).attr("y2", H * 0.42)
      .attr("stroke", "rgba(201,194,173,0.08)").attr("stroke-width", 1).attr("stroke-dasharray", "4 8");
    g.append("text")
      .attr("x", -W * 0.28).attr("y", -H * 0.44).attr("text-anchor", "middle")
      .attr("fill", "var(--accent-cn)").attr("font-family", "var(--serif)")
      .attr("font-size", 14).attr("font-weight", 700).text("中国大陆机构");
    g.append("text")
      .attr("x", W * 0.28).attr("y", -H * 0.44).attr("text-anchor", "middle")
      .attr("fill", "var(--accent-eu)").attr("font-family", "var(--serif)")
      .attr("font-size", 14).attr("font-weight", 700).text("中东欧机构");

    // Initial zoom to fit
    const bounds = g.node()?.getBBox();
    if (bounds) {
      const scale = 0.85 / Math.max(bounds.width / W, bounds.height / H);
      const tx = W / 2 - scale * (bounds.x + bounds.width / 2);
      const ty = H / 2 - scale * (bounds.y + bounds.height / 2);
      svg.transition().duration(800)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // Apply initial visibility based on current view state
    applyVisibility();

    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedGraph, active]);

  // ---- Apply visibility based on current period / physics filter ------
  const applyVisibility = useCallback(() => {
    if (!edgeSelRef.current || !nodeSelRef.current || !labelSelRef.current || !graphRef.current) return;

    const { nodes, edges } = graphRef.current;

    // Dynamic helpers — size depends on current period + physics filter
    const nodeR = (n: SimNode) => {
      const raw = period === "125"
        ? (filterPhysics ? n.nonPhysWeight125 : n.weight_125)
        : (filterPhysics ? n.nonPhysWeight135 : n.weight_135);
      return Math.max(2, Math.sqrt(Math.max(0, raw)) * 0.6);
    };
    const edgeW = (e: SimEdge) => {
      const w = period === "125" ? e.weight_125 : e.weight_135;
      return Math.max(0.3, Math.pow(Math.max(0, w), 0.55) * 0.28);
    };

    // Visible node set for this view
    const visibleNodeIds = new Set<string>();
    for (const e of edges) {
      if (isEdgeVisible(e)) {
        visibleNodeIds.add(e.source);
        visibleNodeIds.add(e.target);
      }
    }
    for (const n of nodes) {
      const count = period === "125" ? n.weight_125 : n.weight_135;
      if (count > 0) visibleNodeIds.add(n.id);
    }

    // Edges: opacity + dynamic width
    edgeSelRef.current
      .attr("opacity", (e) => isEdgeVisible(e) ? 1 : 0)
      .attr("stroke-width", (e) => isEdgeVisible(e) ? edgeW(e) : 0.15)
      .style("pointer-events", (e) => isEdgeVisible(e) ? "auto" : "none");

    // Nodes: opacity + dynamic radius
    nodeSelRef.current
      .attr("opacity", (n) => visibleNodeIds.has(n.id) ? 1 : 0.08)
      .attr("r", (n) => visibleNodeIds.has(n.id) ? nodeR(n) : 1.5)
      .style("pointer-events", (n) => visibleNodeIds.has(n.id) ? "auto" : "none");

    // Labels: position tracks dynamic radius + font-size
    labelSelRef.current
      .attr("x", (d) => d.x + (d.side === "cn" ? -nodeR(d) - 3 : nodeR(d) + 3))
      .attr("font-size", (d) => Math.max(7, Math.min(10, nodeR(d) * 0.7)))
      .attr("opacity", (n) =>
        n.showLabel && visibleNodeIds.has(n.id) ? 0.9 : 0,
      );
  }, [isEdgeVisible, isNodeVisible, period, filterPhysics]);

  // Keep latest applyVisibility in a ref so stale D3 handlers can call it
  const applyVisibilityRef = useRef(applyVisibility);
  applyVisibilityRef.current = applyVisibility;

  // ---- Run visibility update when view changes ------------------------
  useEffect(() => {
    applyVisibility();
  }, [applyVisibility]);

  // ---- Map visibility update -------------------------------------------
  const applyMapVisibility = useCallback(() => {
    if (!mapEdgeSelRef.current || !mapCnSelRef.current || !mapCeecSelRef.current || !mapLabelSelRef.current || !mapDataRef.current) return;

    const { cnNodes, ceecNodes, edges } = mapDataRef.current;
    const nodeR = (w: number) => Math.max(1.8, Math.sqrt(Math.max(0, w)) * 0.35);
    const edgeW = (w: number) => Math.max(0.2, Math.pow(Math.max(0, w), 0.58) * 0.22);

    // Visible node sets
    const visCn = new Set<string>();
    const visCeec = new Set<string>();
    for (const e of edges) {
      if (isMapEdgeVisible(e)) {
        visCn.add(e.cnCity);
        visCeec.add(e.ceecIso);
      }
    }

    // Edges: dramatic thickness variation
    mapEdgeSelRef.current
      .attr("opacity", (e) => isMapEdgeVisible(e) ? 0.5 : 0)
      .attr("stroke-width", (e) => isMapEdgeVisible(e) ? edgeW(period === "125" ? e.weight_125 : e.weight_135) : 0.08)
      .style("pointer-events", (e) => isMapEdgeVisible(e) ? "auto" : "none");

    // CN city nodes: smaller, compact
    mapCnSelRef.current
      .attr("opacity", (n) => visCn.has(n.city) ? 0.88 : 0.10)
      .attr("r", (n) => {
        const w = period === "125"
          ? (filterPhysics ? n.nonPhysWeight125 : n.weight_125)
          : (filterPhysics ? n.nonPhysWeight135 : n.weight_135);
        return nodeR(w);
      })
      .style("pointer-events", (n) => visCn.has(n.city) ? "auto" : "none");

    // CEEC nodes
    mapCeecSelRef.current
      .attr("opacity", (n) => visCeec.has(n.iso) ? 0.88 : 0.10)
      .attr("r", (n) => {
        const w = period === "125"
          ? (filterPhysics ? n.nonPhysWeight125 : n.weight_125)
          : (filterPhysics ? n.nonPhysWeight135 : n.weight_135);
        return nodeR(w);
      })
      .style("pointer-events", (n) => visCeec.has(n.iso) ? "auto" : "none");

    // Labels
    mapLabelSelRef.current.attr("opacity", 0);
    setMapTooltip(null);
  }, [isMapEdgeVisible, period, filterPhysics]);

  const applyMapVisibilityRef = useRef(applyMapVisibility);
  applyMapVisibilityRef.current = applyMapVisibility;

  useEffect(() => {
    if (viewMode === "map") applyMapVisibility();
  }, [applyMapVisibility, viewMode]);

  // ---- Map rendering effect --------------------------------------------
  useEffect(() => {
    if (!active || viewMode !== "map" || !mapData || !topoFeatures || !mapSvgRef.current) return;

    const svg = d3.select(mapSvgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("class", "map-root");
    mapGRef.current = g.node();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 5])
      .on("zoom", (event) => { g.attr("transform", event.transform.toString()); });
    svg.call(zoom);

    const { cnNodes, ceecNodes, edges } = mapData;
    mapDataRef.current = mapData;

    // Layer 1: country polygons
    const countryGroup = g.append("g").attr("class", "countries");
    const ceecIsoSet = new Set(ceecNodes.map((n) => n.iso));
    countryGroup.selectAll("path")
      .data(topoFeatures)
      .join("path")
      .attr("d", MAP_PATH as any)
      .attr("fill", (f: any) => {
        const name = f.properties?.name ?? "";
        const iso3 = NAME_TO_ISO[name] ?? "";
        if (iso3 === "CHN" || name === "China") return "rgba(255,77,61,0.14)";
        if (ceecIsoSet.has(iso3)) return "rgba(76,201,240,0.12)";
        return "rgba(201,194,173,0.03)";
      })
      .attr("stroke", (f: any) => {
        const name = f.properties?.name ?? "";
        const iso3 = NAME_TO_ISO[name] ?? "";
        if (iso3 === "CHN" || name === "China") return "rgba(255,77,61,0.25)";
        if (ceecIsoSet.has(iso3)) return "rgba(76,201,240,0.25)";
        return "rgba(201,194,173,0.06)";
      })
      .attr("stroke-width", 0.5);

    // Layer 2: edges (city → CEEC country)
    const cnByCity = new Map(cnNodes.map((n) => [n.city, n]));
    const ceecByIso = new Map(ceecNodes.map((n) => [n.iso, n]));
    const edgeGroup = g.append("g").attr("class", "map-edges");
    const edgeLines = edgeGroup.selectAll<SVGLineElement, MapEdge>("line")
      .data(edges)
      .join("line")
      .attr("x1", (d) => MAP_PROJECTION([cnByCity.get(d.cnCity)!.lon, cnByCity.get(d.cnCity)!.lat])![0])
      .attr("y1", (d) => MAP_PROJECTION([cnByCity.get(d.cnCity)!.lon, cnByCity.get(d.cnCity)!.lat])![1])
      .attr("x2", (d) => MAP_PROJECTION([ceecByIso.get(d.ceecIso)!.lon, ceecByIso.get(d.ceecIso)!.lat])![0])
      .attr("y2", (d) => MAP_PROJECTION([ceecByIso.get(d.ceecIso)!.lon, ceecByIso.get(d.ceecIso)!.lat])![1])
      .attr("stroke", "rgba(201,194,173,0.16)")
      .attr("stroke-width", 0.5);
    mapEdgeSelRef.current = edgeLines;

    // Helper: compute dynamic radius for hover scale
    const getHoverR = (nd: MapNodeCN | MapNodeCEEC) => {
      const p = periodRef.current;
      const f = filterRef.current;
      const w = p === "125"
        ? (f ? nd.nonPhysWeight125 : nd.weight_125)
        : (f ? nd.nonPhysWeight135 : nd.weight_135);
      return Math.max(1.8, Math.sqrt(Math.max(0, w)) * 0.35);
    };

    // Helper: build tooltip for CN city
    const buildCnTooltip = (cn: MapNodeCN): MapTooltip => {
      const p = periodRef.current;
      const ceecList = edges
        .filter((e) => e.cnCity === cn.city)
        .map((e) => ({
          name: ceecByIso.get(e.ceecIso)?.name_cn ?? e.ceecIso,
          weight: p === "125" ? e.weight_125 : e.weight_135,
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      return {
        label: cn.city,
        subtitle: `${cn.institutionCount} 所机构`,
        topInstitutions: cn.institutions.slice(0, 5),
        topPartners: ceecList,
        weight_125: cn.weight_125,
        weight_135: cn.weight_135,
      };
    };

    // Helper: build tooltip for CEEC country
    const buildCeecTooltip = (ceec: MapNodeCEEC): MapTooltip => {
      const p = periodRef.current;
      const cnList = edges
        .filter((e) => e.ceecIso === ceec.iso)
        .map((e) => ({
          name: cnByCity.get(e.cnCity)?.city ?? e.cnCity,
          weight: p === "125" ? e.weight_125 : e.weight_135,
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      return {
        label: ceec.name_cn,
        subtitle: `首都 · ${ceec.institutionCount} 所机构`,
        topInstitutions: [],
        topPartners: cnList,
        weight_125: ceec.weight_125,
        weight_135: ceec.weight_135,
      };
    };

    // Layer 3: CN city nodes
    const cnGroup = g.append("g").attr("class", "map-cn-nodes");
    const cnCircles = cnGroup.selectAll<SVGCircleElement, MapNodeCN>("circle")
      .data(cnNodes)
      .join("circle")
      .attr("cx", (d) => MAP_PROJECTION([d.lon, d.lat])![0])
      .attr("cy", (d) => MAP_PROJECTION([d.lon, d.lat])![1])
      .attr("r", (d) => d.radius)
      .attr("fill", "var(--accent-cn)")
      .attr("fill-opacity", 0.82)
      .attr("stroke", "var(--accent-cn-glow)")
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("mouseenter", function (_, d) {
        setMapTooltip(buildCnTooltip(d));
        const neighborCeec = new Set<string>();
        edgeLines
          .attr("stroke", (ed) => {
            if (ed.cnCity === d.city) { neighborCeec.add(ed.ceecIso); return "rgba(246,241,224,0.7)"; }
            return "rgba(201,194,173,0.015)";
          })
          .attr("stroke-width", (ed) => {
            if (ed.cnCity !== d.city) return 0.08;
            const w = periodRef.current === "125" ? ed.weight_125 : ed.weight_135;
            return Math.pow(Math.max(0, w), 0.58) * 0.22 * 2.5;
          });
        cnCircles
          .attr("fill-opacity", (nd) => nd.city === d.city ? 1 : 0.12)
          .attr("r", (nd) => nd.city === d.city ? getHoverR(nd) * 1.6 : getHoverR(nd) * 0.5);
        ceecCircles
          .attr("fill-opacity", (nd) => neighborCeec.has(nd.iso) ? 1 : 0.12)
          .attr("r", (nd) => neighborCeec.has(nd.iso) ? getHoverR(nd) * 1.4 : getHoverR(nd) * 0.5);
        mapLabelSelRef.current
          ?.attr("opacity", (nd: any) => nd.city === d.city || neighborCeec.has(nd.iso) ? 0.9 : 0);
      })
      .on("mouseleave", () => applyMapVisibilityRef.current());
    mapCnSelRef.current = cnCircles;

    // Layer 4: CEEC country nodes
    const ceecGroup = g.append("g").attr("class", "map-ceec-nodes");
    const ceecCircles = ceecGroup.selectAll<SVGCircleElement, MapNodeCEEC>("circle")
      .data(ceecNodes)
      .join("circle")
      .attr("cx", (d) => MAP_PROJECTION([d.lon, d.lat])![0])
      .attr("cy", (d) => MAP_PROJECTION([d.lon, d.lat])![1])
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => CEEC_COLORS[d.iso] || "var(--accent-eu)")
      .attr("fill-opacity", 0.82)
      .attr("stroke", "var(--accent-eu-glow)")
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("mouseenter", function (_, d) {
        setMapTooltip(buildCeecTooltip(d));
        const neighborCn = new Set<string>();
        edgeLines
          .attr("stroke", (ed) => {
            if (ed.ceecIso === d.iso) { neighborCn.add(ed.cnCity); return "rgba(246,241,224,0.7)"; }
            return "rgba(201,194,173,0.015)";
          })
          .attr("stroke-width", (ed) => {
            if (ed.ceecIso !== d.iso) return 0.08;
            const w = periodRef.current === "125" ? ed.weight_125 : ed.weight_135;
            return Math.pow(Math.max(0, w), 0.58) * 0.22 * 2.5;
          });
        ceecCircles
          .attr("fill-opacity", (nd) => nd.iso === d.iso ? 1 : 0.12)
          .attr("r", (nd) => nd.iso === d.iso ? getHoverR(nd) * 1.6 : getHoverR(nd) * 0.5);
        cnCircles
          .attr("fill-opacity", (nd) => neighborCn.has(nd.city) ? 1 : 0.12)
          .attr("r", (nd) => neighborCn.has(nd.city) ? getHoverR(nd) * 1.4 : getHoverR(nd) * 0.5);
        mapLabelSelRef.current
          ?.attr("opacity", (nd: any) => nd.iso === d.iso || neighborCn.has(nd.city) ? 0.9 : 0);
      })
      .on("mouseleave", () => applyMapVisibilityRef.current());
    mapCeecSelRef.current = ceecCircles;

    // Layer 5: labels (hidden by default)
    const allMapNodes: (MapNodeCN | MapNodeCEEC)[] = [...cnNodes, ...ceecNodes];
    const labelGroup = g.append("g").attr("class", "map-labels");
    const labelTexts = labelGroup.selectAll<SVGTextElement, MapNodeCN | MapNodeCEEC>("text")
      .data(allMapNodes)
      .join("text")
      .attr("x", (d) => MAP_PROJECTION([d.lon, d.lat])![0])
      .attr("y", (d) => MAP_PROJECTION([d.lon, d.lat])![1] - ("iso" in d ? (d as MapNodeCEEC).radius + 5 : (d as MapNodeCN).radius + 4))
      .attr("text-anchor", "middle")
      .attr("fill", "var(--ink-0)")
      .attr("font-family", "var(--mono)")
      .attr("font-size", 7.5)
      .attr("letter-spacing", "0.04em")
      .attr("opacity", 0)
      .text((d) => "iso" in d ? (d as MapNodeCEEC).name_cn : (d as MapNodeCN).city);
    mapLabelSelRef.current = labelTexts as any;

    // Initial zoom to fit
    const bounds = g.node()?.getBBox();
    if (bounds) {
      const scale = 0.88 / Math.max(bounds.width / W, bounds.height / H);
      const tx = W / 2 - scale * (bounds.x + bounds.width / 2);
      const ty = H / 2 - scale * (bounds.y + bounds.height / 2);
      svg.transition().duration(800).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // Apply initial visibility
    applyMapVisibility();

    return () => { svg.on(".zoom", null); };
  }, [active, viewMode, mapData, topoFeatures]);

  // ---- Map stats overlay -----------------------------------------------
  const mapStatsText = useMemo(() => {
    if (!mapData) return "";
    const { cnNodes, ceecNodes, edges } = mapData;
    let edgeCount = 0, totalW = 0;
    for (const e of edges) {
      if (isMapEdgeVisible(e)) {
        edgeCount++;
        totalW += period === "125" ? e.weight_125 : e.weight_135;
      }
    }
    return `${cnNodes.length} 所中国大陆机构 · ${ceecNodes.length} 个中东欧国家 · ${edgeCount} 条合作连线 · ${totalW} 次机构共现`;
  }, [mapData, period, filterPhysics, isMapEdgeVisible]);

  // ---- Network stats overlay ------------------------------------------
  const networkStatsText = useMemo(() => {
    if (!graphRef.current) return "";
    const g = graphRef.current;
    let cnCount = 0, ceecCount = 0, edgeCount = 0, totalW = 0;
    const vis = new Set<string>();
    for (const e of g.edges) {
      if (!isEdgeVisible(e)) continue;
      edgeCount++;
      totalW += period === "125" ? e.weight_125 : e.weight_135;
      vis.add(e.source);
      vis.add(e.target);
    }
    for (const n of g.nodes) {
      if (!vis.has(n.id)) continue;
      if (n.side === "cn") cnCount++;
      else ceecCount++;
    }
    return `${cnCount} 所中国大陆机构 · ${ceecCount} 所中东欧机构 · ${edgeCount} 条合作边 · ${totalW} 次机构共现`;
  }, [period, filterPhysics, isEdgeVisible]);

  // ---- Render ---------------------------------------------------------
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", display: "flex", flexDirection: "column" }}>
      {/* Network SVG */}
      <svg
        ref={svgRef}
        viewBox="0 0 1200 750"
        preserveAspectRatio="xMidYMid meet"
        style={{ flex: 1, width: "100%", height: "100%", cursor: "grab", display: viewMode === "network" ? "block" : "none" }}
      />
      {/* Map SVG */}
      <svg
        ref={mapSvgRef}
        viewBox="0 0 1200 750"
        preserveAspectRatio="xMidYMid meet"
        style={{ flex: 1, width: "100%", height: "100%", cursor: "grab", display: viewMode === "map" ? "block" : "none", background: "#080d18" }}
      />

      {/* Top‑left: period label */}
      <div style={{ position: "absolute", top: 28, left: 36, zIndex: 2, pointerEvents: "none" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>
          {viewMode === "map" ? "合作机构地理分布" : "合作机构网络"}
        </div>
        <div style={{ fontSize: 42, fontWeight: 700, color: "var(--ink-0)", fontFamily: "var(--serif)", lineHeight: 1.1 }}>
          {period === "135" ? "2016–2020" : "2011–2015"}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)", marginTop: 4, letterSpacing: "0.08em" }}>
          {viewMode === "map" ? mapStatsText : networkStatsText}
        </div>
      </div>

      {/* Hover tooltip (network view) */}
      {/* Network hover tooltip */}
      {viewMode === "network" && hoveredNode && (
        <div style={{ position: "absolute", right: 36, top: 28, zIndex: 4, maxWidth: 280, background: "rgba(10,15,28,0.94)", border: "1px solid rgba(201,194,173,0.15)", borderRadius: 6, padding: "14px 18px", pointerEvents: "none" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: hoveredNode.side === "cn" ? "var(--accent-cn)" : "var(--accent-eu)", marginBottom: 4 }}>
            {hoveredNode.side === "cn" ? "中国大陆" : COUNTRY_CN[hoveredNode.ceec_country || ""] || hoveredNode.country}
            {" · "}{INST_TYPE_SHORT[hoveredNode.type] || hoveredNode.type}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-0)", lineHeight: 1.3, marginBottom: 6 }}>
            {hoveredNode.name}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)", lineHeight: 1.5 }}>
            <span>2011–2015: {hoveredNode.weight_125} 篇</span>
            <span style={{ marginLeft: 12 }}>2016–2020: {hoveredNode.weight_135} 篇</span>
          </div>
        </div>
      )}

      {/* Map hover tooltip */}
      {viewMode === "map" && mapTooltip && (
        <div style={{ position: "absolute", right: 36, top: 28, zIndex: 4, maxWidth: 300, background: "rgba(10,15,28,0.95)", border: "1px solid rgba(201,194,173,0.15)", borderRadius: 6, padding: "14px 18px", pointerEvents: "none" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 4 }}>
            {mapTooltip.subtitle}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-0)", lineHeight: 1.2, marginBottom: 8 }}>
            {mapTooltip.label}
          </div>
          {mapTooltip.topInstitutions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--ink-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
                主要机构
              </div>
              {mapTooltip.topInstitutions.map((inst, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.5, fontFamily: "var(--mono)" }}>
                  {inst}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--ink-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
              合作最紧密
            </div>
            {mapTooltip.topPartners.map((p, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--ink-1)", lineHeight: 1.6, display: "flex", justifyContent: "space-between", gap: 24 }}>
                <span>{p.name}</span>
                <span style={{ color: "var(--ink-2)", fontFamily: "var(--mono)" }}>{p.weight} 次</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-2)", lineHeight: 1.5, borderTop: "1px solid rgba(201,194,173,0.08)", paddingTop: 6 }}>
            2011–2015: {mapTooltip.weight_125} 篇 · 2016–2020: {mapTooltip.weight_135} 篇
          </div>
        </div>
      )}

      {/* Bottom‑right controls */}
      <div style={{ position: "absolute", right: 36, bottom: 36, zIndex: 3, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        {/* View mode toggle */}
        <button onClick={() => setViewMode((v) => v === "network" ? "map" : "network")}
          style={{
            background: viewMode === "map" ? "rgba(76,201,240,0.15)" : "transparent",
            border: `1px solid ${viewMode === "map" ? "rgba(76,201,240,0.35)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 4, color: viewMode === "map" ? "var(--accent-eu)" : "var(--ink-2)",
            fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", padding: "7px 14px", cursor: "pointer",
            marginBottom: 2,
          }}
        >
          {viewMode === "map" ? "✓ 地理视图" : "▸ 地理视图"}
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          {(["125", "135"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                background: period === p ? "rgba(255,255,255,0.12)" : "transparent",
                border: `1px solid ${period === p ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 4, color: period === p ? "var(--ink-0)" : "var(--ink-2)",
                fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", padding: "7px 14px", cursor: "pointer",
              }}
            >
              {p === "125" ? "2011–2015" : "2016–2020"}
            </button>
          ))}
        </div>
        <button onClick={() => setFilterPhysics((f) => !f)}
          style={{
            background: filterPhysics ? "rgba(199,125,255,0.18)" : "transparent",
            border: `1px solid ${filterPhysics ? "rgba(199,125,255,0.35)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 4, color: filterPhysics ? "var(--accent-physics)" : "var(--ink-2)",
            fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", padding: "7px 14px", cursor: "pointer",
          }}
        >
          {filterPhysics ? "✓ 已剥离物理合作" : "剥离物理领域合作"}
        </button>
      </div>

      {/* Bottom‑left narrative */}
      <div style={{ position: "absolute", left: 36, bottom: 48, zIndex: 2, maxWidth: 460, pointerEvents: "none" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 6 }}>
          {viewMode === "map"
            ? (filterPhysics ? "地理视角 · 剥离物理后" : "地理视角")
            : (filterPhysics ? "剥离物理后" : "全景网络 · 位置固定，大小动态")}
        </div>
        <div style={{ fontSize: 15, color: "var(--ink-1)", lineHeight: 1.5, fontWeight: 400 }}>
          {viewMode === "map"
            ? (filterPhysics
              ? "剥离大型物理实验合作后，地理格局变得更加多元。非物理领域的合作——材料、医学、化学——分布更广，不再仅由少数巨型研究机构主导，地方大学与学科特色院校崭露头角。"
              : "科研合作的版图由少数城市主导。北京集中了前十五所中方机构中的近半数，形成了以首都为枢纽的合作放射结构。中东欧各国的科研资源则高度集中于首都城市，一条条连线勾勒出两个地区之间十余年的机构级协作网络。")
            : (filterPhysics
              ? "剥离大型物理合作项目后，机构网络显著缩小。剩余的合作更多集中在材料科学、医学和化学领域，由大学主导的双边关系构成。"
              : "节点位置在四种视图间保持一致，大小与边粗细随所选时期动态变化，以便读者在不同视角间直接对比网络结构。")}
        </div>
      </div>

      {/* Footnote */}
      <div style={{ position: "absolute", left: 36, bottom: 14, zIndex: 2, fontFamily: "var(--mono)", fontSize: 8, color: "var(--ink-2)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6, pointerEvents: "none" }}>
        数据来源: OpenAlex /works API · 比例抽样 cite-sort · 机构黑名单去伪 · 中国机构坐标基于名称硬编码查表 · CEEC 按国家首都聚合
      </div>
    </div>
  );
}
