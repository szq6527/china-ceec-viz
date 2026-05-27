import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { AppData } from "../data/useData";

// Numeric TopoJSON IDs → ISO codes
const TOPO_ID_TO_ISO: Record<string, string> = {
  "616": "POL", "348": "HUN", "642": "ROU", "440": "LTU",
  "428": "LVA", "233": "EST", "100": "BGR", "300": "GRC",
  "008": "ALB", "191": "HRV", "705": "SVN", "703": "SVK",
  "203": "CZE", "688": "SRB", "499": "MNE", "807": "MKD",
};

const TOPO_URL = "./data/world-110m.json";

const HEAT_MAX = 1500;

interface Props {
  data: AppData;
  cursorCounts: { iso: string; name: string; value: number; total: number }[];
  currentYear: number;
  max: number;
}

export function Scene2HeatMap({ data, cursorCounts, currentYear, max: _max }: Props) {
  const [topo, setTopo] = useState<any>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  // Top 5 by total — computed once per cursorCounts snapshot
  const top5ByTotal = useMemo(() => {
    return [...cursorCounts]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((c) => c.iso);
  }, [cursorCounts]);

  // Click-to-toggle visible labels; initially just top 5
  const [visibleLabels, setVisibleLabels] = useState<Set<string>>(() => new Set(top5ByTotal));

  // Sync initial top5 when cursorCounts first arrives (or changes radically)
  useEffect(() => {
    setVisibleLabels((prev) => {
      if (prev.size === 0) return new Set(top5ByTotal);
      return prev;
    });
  }, [top5ByTotal]);

  useEffect(() => {
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then(setTopo)
      .catch(() => setTopo(null));
  }, []);

  const valueByIso = useMemo(() => {
    const m = new Map<string, number>();
    cursorCounts.forEach((c) => m.set(c.iso, c.value));
    return m;
  }, [cursorCounts]);

  const projection = useMemo(
    () =>
      geoEquirectangular()
        .rotate([-21, -48])
        .scale(1050)
        .translate([440, 370]),
    []
  );

  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const features = useMemo(() => {
    if (!topo) return [] as any[];
    const obj = topo.objects.countries ?? topo.objects[Object.keys(topo.objects)[0]];
    const fc = feature(topo, obj) as any;
    return fc.features;
  }, [topo]);

  // Continuous heat spectrum: dark teal (0) → cyan → gold → coral → hot red (1500+)
  // Low end deliberately uses a visible dark-blue hue so small countries don't sink
  // into the black background.
  const ANCHORS: [number, [number, number, number]][] = [
    [0.00, [8,   76,  106]], // deep teal — visible against black
    [0.20, [20,  145, 165]], // cyan
    [0.45, [201, 168, 124]],  // gold (var(--accent-warn))
    [0.70, [212, 160, 144]], // coral (var(--accent-cn-glow) at 50%)
    [1.00, [196, 121, 110]],  // hot red
  ];

  const lerp = (a: number, b: number, f: number) => Math.round(a + (b - a) * f);

  const heatColor = useMemo(() => (v: number) => {
    if (v <= 0) {
      const c = ANCHORS[0][1];
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    const t = Math.min(v / HEAT_MAX, 1);
    // Find bracket
    let i0 = 0;
    for (let i = ANCHORS.length - 2; i >= 0; i--) {
      if (t >= ANCHORS[i][0]) { i0 = i; break; }
    }
    const [t0, c0] = ANCHORS[i0];
    const [t1, c1] = ANCHORS[i0 + 1];
    const f = (t - t0) / (t1 - t0);
    return `rgb(${lerp(c0[0], c1[0], f)},${lerp(c0[1], c1[1], f)},${lerp(c0[2], c1[2], f)})`;
  }, []);

  const yearlyAgg = data.yearly.find((y) => y.year === currentYear) ?? data.yearly[0];

  const ranked = useMemo(
    () => [...cursorCounts].sort((a, b) => b.value - a.value),
    [cursorCounts]
  );
  const top = ranked[0];
  const top5Sum = ranked.slice(0, 5).reduce((a, b) => a + b.value, 0);
  const allSum = ranked.reduce((a, b) => a + b.value, 0);
  const top5Share = allSum > 0 ? top5Sum / allSum : 0;

  const callout = useMemo(() => {
    const y = currentYear;
    if (y <= 2012) return "16 国挤在同一起跑线，差距还能用一只手数清。";
    if (y <= 2014) return "波兰开始与捷克、希腊拉开数量级差距。";
    if (y <= 2016) return `前 5 国合计占整体合作量的 ${(top5Share * 100).toFixed(0)}%，梯队成形。`;
    if (y <= 2018) return "十三五加速期：波兰单年首次破千，领跑优势持续扩大。";
    return "十年赛跑终点：合作版图已从扁平走向悬殊。";
  }, [currentYear, top5Share]);

  // Native pan/zoom state — avoids d3-zoom / React reconciliation conflicts
  const INITIAL_TRANSFORM = useMemo(() => ({ x: -100, y: -55, k: 1.35 }), []);
  const [viewTransform, setViewTransform] = useState(INITIAL_TRANSFORM);
  const [grabbing, setGrabbing] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const isPanning = useRef(false);

  const clampTransform = useCallback((t: { x: number; y: number; k: number }) => {
    const k = Math.min(6, Math.max(0.7, t.k));
    const x = Math.min(1200, Math.max(-800, t.x));
    const y = Math.min(900, Math.max(-600, t.y));
    return { x, y, k };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left-click on the SVG background (not on country paths) triggers pan
    if (e.button !== 0) return;
    isPanning.current = true;
    setGrabbing(true);
    panStart.current = { x: e.clientX, y: e.clientY, tx: viewTransform.x, ty: viewTransform.y };
  }, [viewTransform]);

  // Zoom buttons — zoom toward the viewport center
  const ZOOM_STEP = 1.3;
  const zoomIn = useCallback(() => {
    setViewTransform((prev) => {
      const newK = prev.k * ZOOM_STEP;
      const newX = 720 - (720 - prev.x) * (newK / prev.k);
      const newY = 450 - (450 - prev.y) * (newK / prev.k);
      return clampTransform({ x: newX, y: newY, k: newK });
    });
  }, [clampTransform]);
  const zoomOut = useCallback(() => {
    setViewTransform((prev) => {
      const newK = prev.k / ZOOM_STEP;
      const newX = 720 - (720 - prev.x) * (newK / prev.k);
      const newY = 450 - (450 - prev.y) * (newK / prev.k);
      return clampTransform({ x: newX, y: newY, k: newK });
    });
  }, [clampTransform]);
  const resetZoom = useCallback(() => setViewTransform(INITIAL_TRANSFORM), [INITIAL_TRANSFORM]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setViewTransform(clampTransform({
        x: panStart.current.tx + dx,
        y: panStart.current.ty + dy,
        k: viewTransform.k,
      }));
    };
    const onUp = () => { isPanning.current = false; setGrabbing(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [clampTransform, viewTransform.k]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden", pointerEvents: "auto" }}>
      {/* Map — base layer; overlays above with pointer-events:none pass events through */}
      <svg
        ref={svgRef}
        style={{ position: "absolute", inset: 0, cursor: grabbing ? "grabbing" : "grab", pointerEvents: "all", zIndex: 1 }}
        viewBox="0 0 1440 900"
        width="100%"
        height="100%"
        onMouseDown={onMouseDown}
      >
        {/* Transparent catch-all: guarantees the SVG viewport always captures pointer events */}
          <rect width="100%" height="100%" fill="transparent" pointerEvents="all" />
          <g ref={gRef} transform={`translate(${viewTransform.x},${viewTransform.y}) scale(${viewTransform.k})`}>
          {/* Background countries (non-CEEC) */}
          {features.map((f: any) => {
            const iso = TOPO_ID_TO_ISO[String(f.id)] ?? null;
            if (iso) return null;
            const d = pathGen(f);
            if (!d) return null;
            return (
              <path
                key={f.id ?? f.properties?.name}
                d={d}
                fill="rgba(255,255,255,0.015)"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth={0.3}
              />
            );
          })}

          {/* CEEC countries — colored by heatmap, clickable */}
          {features.map((f: any) => {
            const iso = TOPO_ID_TO_ISO[String(f.id)] ?? null;
            if (!iso) return null;
            const v = valueByIso.get(iso) ?? 0;
            const d = pathGen(f);
            if (!d) return null;
            const selected = visibleLabels.has(iso);
            return (
              <path
                key={f.id ?? f.properties?.name}
                d={d}
                fill={heatColor(v)}
                stroke={selected ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)"}
                strokeWidth={selected ? 1.5 : 0.7}
                style={{ transition: "fill 400ms ease, stroke 300ms ease, stroke-width 300ms ease", cursor: "pointer" }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setVisibleLabels((prev) => {
                    const next = new Set(prev);
                    if (next.has(iso)) next.delete(iso);
                    else next.add(iso);
                    return next;
                  });
                }}
              />
            );
          })}

          {/* Interactive labels — name + interpolated count */}
          {features.map((f: any) => {
            const iso = TOPO_ID_TO_ISO[String(f.id)] ?? null;
            if (!iso || !visibleLabels.has(iso)) return null;
            const v = valueByIso.get(iso) ?? 0;
            const centroid = pathGen.centroid(f);
            if (!centroid || isNaN(centroid[0])) return null;
            const name = data.perCountryYearly.find((c) => c.iso === iso)?.name_cn ?? iso;
            return (
              <g key={`label-${iso}`} style={{ pointerEvents: "none" }}>
                <text
                  x={centroid[0]}
                  y={centroid[1] - 6}
                  textAnchor="middle"
                  fill="var(--ink-0)"
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="var(--serif)"
                  style={{ textShadow: "0 0 10px rgba(0,0,0,0.9)" }}
                >
                  {name}
                </text>
                <text
                  x={centroid[0]}
                  y={centroid[1] + 14}
                  textAnchor="middle"
                  fill="var(--ink-1)"
                  fontSize={11}
                  fontWeight={400}
                  fontFamily="var(--mono)"
                  style={{ textShadow: "0 0 8px rgba(0,0,0,0.85)" }}
                >
                  {Math.round(v).toLocaleString()}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Header */}
      <div style={{ position: "absolute", top: 56, left: 48, zIndex: 5, pointerEvents: "none" }}>
        <div className="kicker">SCENE 02 · 但有人被甩开了</div>
        <h1 style={{ marginTop: 4, fontSize: "clamp(26px, 3.2vw, 44px)" }}>
          十年赛跑 —— 地缘热力
        </h1>
      </div>

      {/* Year ticker */}
      <div
        style={{
          position: "absolute", top: 60, right: 64, textAlign: "right",
          zIndex: 5, pointerEvents: "none", fontFamily: "var(--mono)", color: "var(--ink-0)",
        }}
      >
        <div style={{ fontSize: 96, lineHeight: 1, fontWeight: 700 }}>{currentYear}</div>
        <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ink-2)", marginTop: 6 }}>
          当年合作论文 · {yearlyAgg.ceec.toLocaleString()}
        </div>
      </div>

      {/* Color legend */}
      <div style={{ position: "absolute", bottom: 80, left: 64, zIndex: 5, pointerEvents: "none", fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)" }}>
        <div style={{ marginBottom: 4, letterSpacing: "0.1em" }}>合作论文数</div>
        <svg width={180} height={22}>
          <defs>
            <linearGradient id="heatLegend">
              <stop offset="0%" stopColor={heatColor(0)} />
              <stop offset="25%" stopColor={heatColor(375)} />
              <stop offset="50%" stopColor={heatColor(750)} />
              <stop offset="75%" stopColor={heatColor(1125)} />
              <stop offset="100%" stopColor={heatColor(1500)} />
            </linearGradient>
          </defs>
          <rect x={0} y={6} width={120} height={10} rx={2} fill="url(#heatLegend)" />
          <text x={0} y={22} fill="var(--ink-2)" fontSize={9}>0</text>
          <text x={60} y={22} fill="var(--ink-2)" fontSize={9} textAnchor="middle">750</text>
          <text x={120} y={22} fill="var(--ink-2)" fontSize={9} textAnchor="end">1500</text>
        </svg>
      </div>

      {/* Zoom controls */}
      <div style={{ position: "absolute", bottom: 80, left: 260, zIndex: 5, display: "flex", gap: 4, pointerEvents: "auto" }}>
        {[
          { label: "−", action: zoomOut, title: "缩小" },
          { label: "1×", action: resetZoom, title: "重置" },
          { label: "＋", action: zoomIn, title: "放大" },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.action}
            title={btn.title}
            style={{
              width: 30,
              height: 24,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 4,
              color: "var(--ink-1)",
              fontFamily: "var(--mono)",
              fontSize: 13,
              lineHeight: 1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color = "var(--ink-0)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "var(--ink-1)";
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Right side: dynamic annotations */}
      <div
        style={{
          position: "absolute",
          right: 64,
          top: 240,
          width: 280,
          zIndex: 4,
          pointerEvents: "none",
          fontFamily: "var(--serif)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--accent-warn)",
            marginBottom: 10,
          }}
        >
          实时解读
        </div>
        <div
          style={{
            fontSize: 17,
            lineHeight: 1.45,
            color: "var(--ink-0)",
            fontWeight: 700,
            marginBottom: 22,
          }}
        >
          {callout}
        </div>
        {top && (
          <>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                marginBottom: 6,
              }}
            >
              当年领跑
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 18, color: "var(--ink-0)", fontWeight: 700 }}>
                {top.name}
              </span>
              <span
                className="mono tabular"
                style={{ fontSize: 22, color: "var(--accent-cn-glow)", fontWeight: 700 }}
              >
                {Math.round(top.value).toLocaleString()}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                marginBottom: 6,
              }}
            >
              前 5 国集中度
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                className="mono tabular"
                style={{ fontSize: 28, color: "var(--ink-0)", fontWeight: 700 }}
              >
                {(top5Share * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {ranked.length - 5} 国共享其余 {((1 - top5Share) * 100).toFixed(0)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
