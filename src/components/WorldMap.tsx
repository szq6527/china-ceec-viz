import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, geoInterpolate } from "d3-geo";
import * as topojson from "topojson-client";
import type { Country } from "../types";

// Lightweight TopoJSON of world countries (~110m). Stored locally so dev works offline.
const WORLD_TOPO_URL = "./data/world-110m.json";

interface ArcSpec {
  iso: string;
  weight: number;       // 0..1 visual weight (line thickness, opacity)
  delay: number;        // appear delay (s)
  highlight?: boolean;
  rank?: number;        // 1-based rank by count_135 (1 = largest)
}

// Manual label offsets so the 6 biggest CEEC countries don't pile on top of each other.
// dx, dy are SVG pixel nudges from country centroid; anchor controls text-anchor.
// Manual label offsets for the very few labels we render on the map.
// Top 3 only — push them well clear of the arc bundle.
const LABEL_OFFSET: Record<string, { dx: number; dy: number; anchor: "start" | "end" | "middle" }> = {
  POL: { dx: -12, dy: -28, anchor: "end" },     // 波兰 — up-left, away from arcs
  CZE: { dx: -38, dy: 4,   anchor: "end" },     // 捷克 — far left
  GRC: { dx: -16, dy: 36,  anchor: "end" },     // 希腊 — down-left
};

interface Props {
  beijing: { lat: number; lon: number };
  countries: Country[];
  arcs: ArcSpec[];
  width: number;
  height: number;
  /** 0..1 progress used to draw arcs incrementally (1 = fully drawn) */
  progress: number;
}

interface WorldFeature {
  type: "Feature";
  properties: { name?: string };
  geometry: any;
}

export function WorldMap({ beijing, countries, arcs, width, height, progress }: Props) {
  const [features, setFeatures] = useState<WorldFeature[] | null>(null);

  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then((r) => r.json())
      .then((topo: any) => {
        const obj = topo.objects.countries ?? topo.objects[Object.keys(topo.objects)[0]];
        const fc = topojson.feature(topo, obj) as any;
        setFeatures(fc.features as WorldFeature[]);
      })
      .catch(() => setFeatures([]));
  }, []);

  // Center the projection between Beijing and central Europe so arcs feel natural.
  // Rotation -68 puts ~longitude 68 (Caspian Sea) at center, giving Europe and China balanced air.
  // Scale anchors on the smaller of width/height so it stays sane on tall viewports.
  const projection = useMemo(() => {
    const base = Math.min(width, height * 1.6);
    return geoNaturalEarth1()
      .rotate([-68, -8])
      .scale(base * 0.26)
      .translate([width / 2, height / 2 + 40]);
  }, [width, height]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const beijingPx = projection([beijing.lon, beijing.lat])!;

  const ceecByIso = useMemo(() => {
    const m = new Map<string, Country>();
    countries.forEach((c) => m.set(c.iso, c));
    return m;
  }, [countries]);

  // Build all arc paths. Arc = great-circle samples bent into a quadratic curve above the surface.
  const arcPaths = useMemo(() => {
    const out: { iso: string; d: string; total: number; spec: ArcSpec }[] = [];
    for (const spec of arcs) {
      const c = ceecByIso.get(spec.iso);
      if (!c) continue;
      const p1 = projection([beijing.lon, beijing.lat])!;
      const p2 = projection([c.lon, c.lat])!;
      // Use geoInterpolate to get midpoint on the sphere, then lift it for a curved arc.
      const interp = geoInterpolate([beijing.lon, beijing.lat], [c.lon, c.lat]);
      const mid = projection(interp(0.5))!;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const dist = Math.hypot(dx, dy);
      const lift = Math.min(160, dist * 0.35);
      // Lift control point upward (negative y)
      const cx = mid[0];
      const cy = mid[1] - lift;
      const d = `M ${p1[0]},${p1[1]} Q ${cx},${cy} ${p2[0]},${p2[1]}`;
      out.push({ iso: c.iso, d, total: dist + lift, spec });
    }
    return out;
  }, [arcs, ceecByIso, projection, beijing.lat, beijing.lon]);

  // Per-arc draw progress: each arc starts at its delay and finishes within `arcDuration` seconds.
  // We map global progress 0..1 over a 4-second sequence.
  const totalDuration = 4.0;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="cn-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-cn-glow)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--accent-cn)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="eu-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-eu-glow)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--accent-eu)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--accent-cn)" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#ffd9c2" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--accent-eu)" stopOpacity="0.95" />
        </linearGradient>
        <filter id="arc-blur">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {/* Graticule-like ambient grid */}
      <g opacity={0.18}>
        {Array.from({ length: 13 }).map((_, i) => {
          const lon = -180 + i * 30;
          const pts: [number, number][] = [];
          for (let lat = -80; lat <= 80; lat += 5) pts.push([lon, lat]);
          const d = pts
            .map((p) => projection(p as [number, number])!)
            .map((px, idx) => (idx === 0 ? `M ${px[0]},${px[1]}` : `L ${px[0]},${px[1]}`))
            .join(" ");
          return <path key={`mer-${i}`} d={d} stroke="var(--grid)" fill="none" />;
        })}
        {Array.from({ length: 7 }).map((_, i) => {
          const lat = -60 + i * 20;
          const pts: [number, number][] = [];
          for (let lon = -180; lon <= 180; lon += 5) pts.push([lon, lat]);
          const d = pts
            .map((p) => projection(p as [number, number])!)
            .map((px, idx) => (idx === 0 ? `M ${px[0]},${px[1]}` : `L ${px[0]},${px[1]}`))
            .join(" ");
          return <path key={`par-${i}`} d={d} stroke="var(--grid)" fill="none" />;
        })}
      </g>

      {/* Country shapes */}
      <g>
        {features?.map((f, i) => {
          const isCN = f.properties?.name === "China";
          const isTW = f.properties?.name === "Taiwan";
          const isCEEC = !!ceecByIso.get(isoFromName(f.properties?.name));
          const fill = isCN || isTW
            ? "rgba(255, 77, 61, 0.16)"
            : isCEEC
              ? "rgba(76, 201, 240, 0.17)"
              : "rgba(201, 194, 173, 0.05)";
          const stroke = isCN || isTW
            ? "rgba(255, 77, 61, 0.55)"
            : isCEEC
              ? "rgba(76, 201, 240, 0.6)"
              : "rgba(201, 194, 173, 0.18)";
          return (
            <path
              key={i}
              d={path(f as any) || ""}
              fill={fill}
              stroke={stroke}
              strokeWidth={isCN || isCEEC ? 0.8 : 0.4}
            />
          );
        })}
      </g>

      {/* Arcs */}
      <g>
        {arcPaths.map(({ iso, d, spec }) => {
          // local progress 0..1 for this arc
          const localStart = spec.delay / totalDuration;
          const localEnd = Math.min(1, localStart + 0.55);
          const localT =
            progress <= localStart ? 0 : progress >= localEnd ? 1 : (progress - localStart) / (localEnd - localStart);
          const dashLen = 2000;
          const offset = dashLen * (1 - localT);
          const opacity = 0.25 + 0.75 * spec.weight;
          const strokeWidth = 0.8 + spec.weight * 2.4;
          return (
            <g key={iso}>
              {/* glow */}
              <path
                d={d}
                fill="none"
                stroke="url(#arc-grad)"
                strokeWidth={strokeWidth + 4}
                strokeOpacity={opacity * 0.35}
                strokeDasharray={dashLen}
                strokeDashoffset={offset}
                filter="url(#arc-blur)"
                strokeLinecap="round"
              />
              {/* core */}
              <path
                d={d}
                fill="none"
                stroke="url(#arc-grad)"
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeDasharray={dashLen}
                strokeDashoffset={offset}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </g>

      {/* Beijing pulsing node */}
      <g transform={`translate(${beijingPx[0]},${beijingPx[1]})`}>
        <circle r="22" fill="url(#cn-glow)" opacity={0.6}>
          <animate attributeName="r" values="14;28;14" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle r="4" fill="var(--accent-cn-glow)" />
        <text x={10} y={-10} fontSize="11" fontFamily="var(--mono)" fill="var(--ink-0)" letterSpacing="0.1em">
          BEIJING
        </text>
      </g>

      {/* CEEC nodes */}
      {countries.map((c) => {
        const px = projection([c.lon, c.lat]);
        if (!px) return null;
        const arc = arcs.find((a) => a.iso === c.iso);
        if (!arc) return null;
        const localStart = arc.delay / totalDuration;
        const visible = progress > localStart + 0.05;
        const rank = arc.rank ?? 99;
        const showLabel = rank <= 3; // only label top-3 on map; rest go in side panel
        const off = LABEL_OFFSET[c.iso] ?? { dx: 10, dy: -8, anchor: "start" as const };
        return (
          <g
            key={c.iso}
            transform={`translate(${px[0]},${px[1]})`}
            opacity={visible ? 1 : 0}
            style={{ transition: "opacity 400ms ease" }}
          >
            <circle r={3 + arc.weight * 4} fill="var(--accent-eu-glow)" />
            <circle r={9 + arc.weight * 6} fill="url(#eu-glow)" opacity={0.55} />
            {showLabel && (
              <>
                {/* small leader stub */}
                <line
                  x1={0}
                  y1={0}
                  x2={off.dx * 0.75}
                  y2={off.dy * 0.75}
                  stroke="rgba(138, 227, 255, 0.35)"
                  strokeWidth="0.6"
                />
                <text
                  x={off.dx}
                  y={off.dy}
                  textAnchor={off.anchor}
                  fontSize={rank <= 3 ? 13 : 11}
                  fontFamily="var(--serif)"
                  fontWeight={rank <= 3 ? 700 : 400}
                  fill="var(--ink-0)"
                  opacity={0.95}
                  style={{ paintOrder: "stroke", stroke: "var(--bg-0)", strokeWidth: 3 }}
                >
                  {c.cn}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Map Natural Earth country names to our ISO codes (we only need CEEC ones)
const NAME_TO_ISO: Record<string, string> = {
  Poland: "POL",
  Czechia: "CZE",
  "Czech Rep.": "CZE",
  "Czech Republic": "CZE",
  Hungary: "HUN",
  Romania: "ROU",
  Bulgaria: "BGR",
  Slovakia: "SVK",
  Croatia: "HRV",
  Slovenia: "SVN",
  Serbia: "SRB",
  Greece: "GRC",
  Albania: "ALB",
  Latvia: "LVA",
  Lithuania: "LTU",
  Estonia: "EST",
  Montenegro: "MNE",
  "North Macedonia": "MKD",
  Macedonia: "MKD",
};

function isoFromName(name?: string): string {
  if (!name) return "";
  return NAME_TO_ISO[name] ?? "";
}
