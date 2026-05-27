import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════
   SceneCountryTypology — Scene 9 (新增)
   "四种合作命运"

   Shows 16 CEEC countries as an interactive scatter plot:
   X = EU6 cooperation intensity
   Y = China Internal RCA
   Colored by 4-cluster typology.
   Click/hover to explore each country's detail.
══════════════════════════════════════════════════════════ */

interface TopSpec {
  field: string;
  count: number;
}

interface TypeCountry {
  iso: string;
  name_cn: string;
  geopolitical_group: string;
  eu6_intensity: number;
  eu6_china_ratio: number;
  china_rca: number;
  china_internal_rca: number;
  rca_trend: "increasing" | "decreasing";
  total_output: number;
  china_portfolio_rank: number;
  big_science_share_135: number;
  big_contribution_to_growth: number;
  physics_share: number;
  non_physics_total: number;
  top_specializations: TopSpec[];
}

interface Cluster {
  label: string;
  subtitle: string;
  color: string;
  description: string;
  insight: string;
  countries: TypeCountry[];
}

interface TypologyData {
  typology: Record<string, Cluster>;
}

interface Props {
  active: boolean;
}

const FIELD_SHORT: Record<string, string> = {
  "Physics and Astronomy": "物理与天文",
  "Engineering": "工程学",
  "Medicine": "医学",
  "Materials Science": "材料科学",
  "Agricultural and Biological Sciences": "农业与生物",
  "Environmental Science": "环境科学",
  "Biochemistry, Genetics and Molecular Biology": "生化与分子生物",
  "Computer Science": "计算机科学",
  "Chemistry": "化学",
  "Mathematics": "数学",
  "Social Sciences": "社会科学",
  "Neuroscience": "神经科学",
  "Psychology": "心理学",
  "Earth and Planetary Sciences": "地球与行星科学",
  "Economics, Econometrics and Finance": "经济与金融",
};

// Chart constants
const W = 1440;
const H = 900;
const SCATTER_L = 340;
const SCATTER_R = 200;
const SCATTER_T = 110;
const SCATTER_B = 90;
const PLOT_W = W - SCATTER_L - SCATTER_R;
const PLOT_H = H - SCATTER_T - SCATTER_B;
const X_MAX = 0.68;
const Y_MAX = 4.0;

function xS(eu6: number) {
  return SCATTER_L + (eu6 / X_MAX) * PLOT_W;
}
function yS(rca: number) {
  return SCATTER_T + (1 - Math.min(rca, Y_MAX) / Y_MAX) * PLOT_H;
}

const CLUSTER_ORDER = ["dual_super_connector", "big_science_driven", "self_sufficient", "catch_up_small"] as const;

export function SceneCountryTypology({ active }: Props) {
  const [data, setData] = useState<TypologyData | null>(null);
  const [phase, setPhase] = useState<"enter" | "settle" | "annotate">("enter");
  const [animProgress, setAnimProgress] = useState(0);
  const [selected, setSelected] = useState<{ country: TypeCountry; clusterKey: string } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("./data/viz/viz_country_typology.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) {
      setAnimProgress(0);
      setPhase("enter");
      setSelected(null);
      setHovered(null);
      return;
    }
    const DURATION = 2200;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      const e = 1 - Math.pow(1 - t, 3);
      setAnimProgress(e);
      if (t < 0.4) setPhase("enter");
      else if (t < 0.75) setPhase("settle");
      else setPhase("annotate");
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  const handleDotClick = useCallback(
    (country: TypeCountry, clusterKey: string) => {
      setSelected((prev) =>
        prev?.country.iso === country.iso ? null : { country, clusterKey }
      );
    },
    []
  );

  if (!data) return null;

  const allCountries: { country: TypeCountry; clusterKey: string }[] = [];
  for (const key of CLUSTER_ORDER) {
    const cluster = data.typology[key];
    if (!cluster) continue;
    cluster.countries.forEach((c) => allCountries.push({ country: c, clusterKey: key }));
  }

  // Average EU6 intensity for reference line
  const avgEu6 = allCountries.reduce((s, { country }) => s + country.eu6_intensity, 0) / allCountries.length;

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}>

      {/* ── Left narrative panel ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: SCATTER_L,
        padding: "40px 28px 36px",
        display: "flex", flexDirection: "column",
        borderRight: "1px solid rgba(201,194,173,0.07)",
        zIndex: 10,
        background: "rgba(5,8,16,0.85)",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 14 }}>
          SCENE 10 · 类型视角
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 900, fontSize: 28, lineHeight: 1.2, margin: 0 }}>
          同一时代，<br />走向<span style={{ color: "#7ea8a4" }}>四种</span><br />不同命运
        </h1>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", marginTop: 16 }}>
          综合 EU6 合作强度（横轴）与中国内部 RCA（纵轴），
          16 个中东欧国家清晰地聚成四种类型。
          <strong style={{ color: "var(--ink-1)" }}> 点击国家圆点</strong>查看详细画像。
        </p>

        <div style={{ height: 1, background: "rgba(201,194,173,0.08)", margin: "20px 0" }} />

        {/* Cluster legend cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: phase === "annotate" ? 1 : 0, transition: "opacity 600ms" }}>
          {CLUSTER_ORDER.map((key) => {
            const cluster = data.typology[key];
            if (!cluster) return null;
            return (
              <div key={key} style={{
                padding: "9px 12px",
                background: `${cluster.color}0a`,
                border: `1px solid ${cluster.color}30`,
                borderRadius: 8,
                borderLeft: `3px solid ${cluster.color}`,
              }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: cluster.color, marginBottom: 3 }}>
                  {cluster.label}
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 11, color: "var(--ink-2)", lineHeight: 1.4 }}>
                  {cluster.subtitle}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-2)", marginTop: 4 }}>
                  {cluster.countries.map((c) => c.name_cn).join("、")}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          fontSize: 12, fontFamily: "var(--serif)", color: "var(--ink-2)", lineHeight: 1.6,
          opacity: phase === "annotate" ? 1 : 0, transition: "opacity 600ms",
        }}>
          横轴：EU6 合作强度（该国与六大欧盟强国的论文比例）<br />
          纵轴：中国内部 RCA（对华合作相对集中度）
        </div>
      </div>

      {/* ── SVG Scatter Plot ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="100%"
        style={{ position: "absolute", inset: 0, zIndex: 2 }}
      >
        {/* Grid */}
        {[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5].map((v) => (
          <g key={v}>
            <line x1={SCATTER_L} x2={W - SCATTER_R} y1={yS(v)} y2={yS(v)}
              stroke="rgba(201,194,173,0.05)" strokeWidth={1} />
            <text x={SCATTER_L - 8} y={yS(v) + 3} textAnchor="end"
              fill="rgba(201,194,173,0.25)" fontFamily="var(--mono)" fontSize={9}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((v) => (
          <g key={v}>
            <line x1={xS(v)} x2={xS(v)} y1={SCATTER_T} y2={SCATTER_T + PLOT_H}
              stroke="rgba(201,194,173,0.05)" strokeWidth={1} />
            <text x={xS(v)} y={SCATTER_T + PLOT_H + 18} textAnchor="middle"
              fill="rgba(201,194,173,0.25)" fontFamily="var(--mono)" fontSize={9}>
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* RCA=1 reference line */}
        <line x1={SCATTER_L} x2={W - SCATTER_R} y1={yS(1)} y2={yS(1)}
          stroke="rgba(126,168,164,0.25)" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={W - SCATTER_R + 6} y={yS(1) + 4}
          fill="rgba(126,168,164,0.45)" fontFamily="var(--mono)" fontSize={9}>RCA=1</text>

        {/* Average EU6 intensity line */}
        <line x1={xS(avgEu6)} x2={xS(avgEu6)} y1={SCATTER_T} y2={SCATTER_T + PLOT_H}
          stroke="rgba(201,168,124,0.2)" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={xS(avgEu6)} y={SCATTER_T - 10} textAnchor="middle"
          fill="rgba(201,168,124,0.4)" fontFamily="var(--mono)" fontSize={9}>CEEC均值 EU6</text>

        {/* Quadrant labels */}
        {phase === "annotate" && (
          <>
            <text x={xS(0.5)} y={yS(3.1)} textAnchor="middle"
              fill="rgba(126,168,164,0.18)" fontFamily="var(--serif)" fontSize={22} fontWeight="900">
              双超连接
            </text>
            <text x={xS(0.18)} y={yS(0.45)} textAnchor="middle"
              fill="rgba(201,168,124,0.18)" fontFamily="var(--serif)" fontSize={22} fontWeight="900">
              自给自足
            </text>
            <text x={xS(0.51)} y={yS(0.45)} textAnchor="middle"
              fill="rgba(201,194,173,0.12)" fontFamily="var(--serif)" fontSize={18} fontWeight="900">
              高强度合作
            </text>
          </>
        )}

        {/* Axis labels */}
        <text x={SCATTER_L + PLOT_W / 2} y={SCATTER_T + PLOT_H + 40} textAnchor="middle"
          fill="rgba(201,194,173,0.3)" fontFamily="var(--mono)" fontSize={10} letterSpacing="0.16em">
          EU6 合作强度 →
        </text>
        <text x={SCATTER_L - 46} y={SCATTER_T + PLOT_H / 2} textAnchor="middle"
          fill="rgba(201,194,173,0.3)" fontFamily="var(--mono)" fontSize={10} letterSpacing="0.16em"
          transform={`rotate(-90, ${SCATTER_L - 46}, ${SCATTER_T + PLOT_H / 2})`}>
          中国内部 RCA ↑
        </text>

        {/* Country dots */}
        {allCountries.map(({ country, clusterKey }, idx) => {
          const cluster = data.typology[clusterKey];
          if (!cluster) return null;

          const cx = xS(country.eu6_intensity);
          const cy = yS(country.china_internal_rca);
          const r = Math.max(10, Math.min(22, Math.sqrt(country.total_output / 5000) * 8));
          const isSelected = selected?.country.iso === country.iso;
          const isHovered = hovered === country.iso;
          const isBlurred = (selected || hovered) && !isSelected && !isHovered;

          // Entrance animation: dots fly from center
          const enterProgress = Math.min(1, Math.max(0, animProgress * 1.5 - idx * 0.03));
          const enterScale = 1 - Math.pow(1 - enterProgress, 3);
          const originX = W / 2;
          const originY = H / 2;
          const animCx = originX + (cx - originX) * enterScale;
          const animCy = originY + (cy - originY) * enterScale;

          return (
            <g key={country.iso}
              style={{ cursor: "pointer" }}
              onClick={() => handleDotClick(country, clusterKey)}
              onMouseEnter={() => setHovered(country.iso)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Glow ring for selected/hovered */}
              {(isSelected || isHovered) && (
                <circle cx={animCx} cy={animCy} r={r + 8}
                  fill="none" stroke={cluster.color} strokeWidth={2}
                  opacity={0.5}
                />
              )}
              {/* Main dot */}
              <circle
                cx={animCx} cy={animCy} r={r}
                fill={cluster.color}
                opacity={isBlurred ? 0.12 : isSelected ? 1 : isHovered ? 0.9 : 0.72}
                style={{ transition: "opacity 200ms, r 200ms" }}
              />
              {/* ISO label */}
              {enterProgress > 0.85 && (
                <text x={animCx} y={animCy + 3.5} textAnchor="middle"
                  fill={isBlurred ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.75)"}
                  fontFamily="var(--mono)" fontSize={r > 13 ? 9 : 7.5} fontWeight="bold"
                  style={{ pointerEvents: "none", transition: "fill 200ms" }}>
                  {country.iso}
                </text>
              )}
              {/* Country name label on hover */}
              {(isHovered || isSelected) && (
                <text
                  x={animCx + r + 6}
                  y={animCy - 4}
                  fill={cluster.color}
                  fontFamily="var(--serif)"
                  fontSize={12}
                  fontWeight="700"
                  style={{ pointerEvents: "none" }}
                >
                  {country.name_cn}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Right: Detail Card (when a country is selected) ── */}
      {selected && (
        <DetailCard
          country={selected.country}
          cluster={data.typology[selected.clusterKey]}
          onClose={() => setSelected(null)}
        />
      )}


    </div>
  );
}

/* ── Detail Card ── */
function DetailCard({
  country, cluster, onClose,
}: {
  country: TypeCountry;
  cluster: Cluster;
  onClose: () => void;
}) {
  const isRising = country.rca_trend === "increasing";

  return (
    <div style={{
      position: "absolute",
      right: 20, top: "50%",
      transform: "translateY(-50%)",
      width: 200,
      zIndex: 20,
      animation: "cardIn 200ms ease both",
    }}>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(calc(-50% + 10px))}to{opacity:1;transform:translateY(-50%)}}`}</style>
      <div style={{
        background: "rgba(6,5,18,0.98)",
        border: `1px solid ${cluster.color}44`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 40px ${cluster.color}15`,
        backdropFilter: "blur(20px)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px 12px",
          background: `linear-gradient(135deg, ${cluster.color}15 0%, transparent 100%)`,
          borderBottom: `1px solid ${cluster.color}22`,
          position: "relative",
        }}>
          <button onClick={onClose} style={{
            position: "absolute", top: 10, right: 12,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-2)", fontSize: 16, lineHeight: 1, padding: 0,
          }}>×</button>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: cluster.color, marginBottom: 4 }}>
            {cluster.label}
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 800, color: "var(--ink-0)" }}>
            {country.name_cn}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)", marginTop: 2 }}>
            {country.iso} · {country.geopolitical_group.replace(/_/g, " ")}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <MiniCard label="China 内部RCA" value={country.china_internal_rca.toFixed(2)} color={cluster.color} />
            <MiniCard label="EU6 强度" value={`${(country.eu6_intensity * 100).toFixed(0)}%`} color={cluster.color} />
            <MiniCard label="RCA 趋势" value={isRising ? "↑ 上升" : "↓ 下降"} color={isRising ? "#8fb8b0" : "#d4a090"} />
            <MiniCard label="全球合作排名" value={`#${country.china_portfolio_rank}`} color="var(--ink-1)" />
          </div>

          {/* Top specializations */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>
              前 3 专业领域
            </div>
            {country.top_specializations.slice(0, 3).map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 5,
              }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 11, color: "var(--ink-1)", flex: 1 }}>
                  {FIELD_SHORT[s.field] || s.field}
                </div>
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                  color: cluster.color, marginLeft: 8,
                }}>
                  {s.count}
                </div>
              </div>
            ))}
          </div>

          {/* Big science impact */}
          <div style={{
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 8,
            borderLeft: `2px solid ${cluster.color}55`,
          }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-2)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              大科学论文占比
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: cluster.color }}>
              {(country.big_science_share_135 * 100).toFixed(1)}%
            </div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 10, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.4 }}>
              {cluster.insight}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "7px 9px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}
