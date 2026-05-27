import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════
   SceneRcaTrajectory — Scene 5 (新增)
   "增长之下，聚焦在衰退"

   Shows yearly China Internal RCA trajectories for 16 CEEC
   countries from 2011 to 2020. Most countries' China-focus
   declined even as absolute paper counts grew — revealing
   that growth was broad, not strategic.
══════════════════════════════════════════════════════════ */

interface YearlyPoint {
  year: number;
  internal_rca: number;
  global_rca: number;
  cn_ceec_papers: number;
  country_total_papers: number;
}

interface CountryRca {
  iso: string;
  name_cn: string;
  geopolitical_group: string;
  is_small_country: boolean;
  rca_2011: number;
  rca_2020: number;
  internal_rca_2011: number;
  internal_rca_2020: number;
  rca_trend: "increasing" | "decreasing";
  china_portfolio_rank_2011: number;
  china_portfolio_rank_2020: number;
  eu6_intensity: number;
  eu6_china_ratio: number;
  big_science_share_125: number;
  big_science_share_135: number;
  yearly: YearlyPoint[];
}

interface RcaData {
  ceec_avg_internal_rca: Record<string, number>;
  countries: CountryRca[];
}

interface Props {
  active: boolean;
}

const YEARS = [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020];

// Chart layout constants
const W = 1440;
const H = 900;
const PAD_LEFT = 340;   // space for narrative panel
const PAD_RIGHT = 80;
const PAD_TOP = 110;
const PAD_BOT = 80;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOT;
const Y_MAX = 4.2;

function xScale(year: number) {
  return PAD_LEFT + ((year - 2011) / 9) * PLOT_W;
}
function yScale(rca: number) {
  return PAD_TOP + (1 - Math.min(rca, Y_MAX) / Y_MAX) * PLOT_H;
}

function buildPath(points: YearlyPoint[], drawFraction: number): string {
  const pts = points
    .map((p, i) => ({ x: xScale(p.year), y: yScale(p.internal_rca), i }));
  if (pts.length === 0) return "";

  // Interpolate the path up to drawFraction * totalLength
  const totalPts = pts.length - 1;
  const upTo = drawFraction * totalPts;
  const fullPts = pts.slice(0, Math.floor(upTo) + 1);
  const frac = upTo - Math.floor(upTo);

  let d = `M ${fullPts[0].x} ${fullPts[0].y}`;
  for (let i = 1; i < fullPts.length; i++) {
    d += ` L ${fullPts[i].x} ${fullPts[i].y}`;
  }

  // Interpolate last segment
  if (frac > 0 && Math.floor(upTo) + 1 < pts.length) {
    const a = pts[Math.floor(upTo)];
    const b = pts[Math.floor(upTo) + 1];
    const ix = a.x + (b.x - a.x) * frac;
    const iy = a.y + (b.y - a.y) * frac;
    d += ` L ${ix} ${iy}`;
  }
  return d;
}

interface TooltipInfo {
  country: CountryRca;
  mouseX: number;
  mouseY: number;
}

export function SceneRcaTrajectory({ active }: Props) {
  const [data, setData] = useState<RcaData | null>(null);
  const [drawProgress, setDrawProgress] = useState(0); // 0→1 for line animation
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const rafRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("./data/viz/viz_rca_trajectories.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) {
      setDrawProgress(0);
      setShowAnnotations(false);
      setHovered(null);
      setTooltip(null);
      return;
    }
    const DURATION = 3800;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      const e = 1 - Math.pow(1 - t, 2.5);
      setDrawProgress(e);
      if (t >= 0.7) setShowAnnotations(true);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, country: CountryRca) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ country, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top });
      setHovered(country.iso);
    },
    []
  );
  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHovered(null);
  }, []);

  if (!data) return null;

  const avgLine = YEARS.map((y) => ({
    year: y,
    rca: data.ceec_avg_internal_rca[String(y)] ?? 0,
  }));

  const rising = data.countries.filter((c) => c.rca_trend === "increasing");
  const falling = data.countries.filter((c) => c.rca_trend === "decreasing");
  const fallingCount = falling.length;

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}>

      {/* ── Left narrative panel ── */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, bottom: 0,
        width: PAD_LEFT,
        padding: "40px 32px 36px",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(201,194,173,0.07)",
        zIndex: 10,
        background: "linear-gradient(180deg, rgba(5,8,16,0.85) 0%, rgba(5,8,16,0.6) 100%)",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 14 }}>
          SCENE 05 · 增长之下
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 900, fontSize: 32, lineHeight: 1.2, margin: 0 }}>
          绝对量在增长，<br />
          但<span style={{ color: "#d4a090" }}>聚焦度</span><br />
          正在衰退
        </h1>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", marginTop: 18 }}>
          <strong style={{ color: "var(--ink-1)" }}>中国内部 RCA</strong>（中东欧国家对华合作的相对集中度）衡量
          一国与中国的合作是否超出其全球平均合作强度。
          RCA &gt; 1 意味着"有意为之"；RCA &lt; 1 意味着随波逐流。
        </p>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", marginTop: 12 }}>
          悬停线条，查看各国十年轨迹详情。
        </p>

        <div style={{ height: 1, background: "rgba(201,194,173,0.1)", margin: "22px 0" }} />

        {/* Key stats */}
        <div style={{
          opacity: showAnnotations ? 1 : 0,
          transform: showAnnotations ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 600ms, transform 600ms",
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          <StatBox value={`${fallingCount} / ${data.countries.length}`} label="国家的对华聚焦度低于 2011 年" color="#d4a090" />
          <StatBox value={`${rising.length} 国`} label="逆势上升（多为从零起步的小国）" color="#8fb8b0" />
          <StatBox value="LVA +1.30" label="涨幅最大 · 拉脱维亚（从边缘到核心）" color="#7ea8a4" />
          <StatBox value="MKD −1.09" label="跌幅最大 · 北马其顿（从高峰回落）" color="#c9a87c" />
        </div>

        <div style={{ flex: 1 }} />

        {/* Legend */}
        <div style={{
          opacity: showAnnotations ? 1 : 0, transition: "opacity 600ms",
          fontFamily: "var(--mono)", fontSize: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 24, height: 2, background: "#8fb8b0", borderRadius: 1 }} />
            <span style={{ color: "var(--ink-2)" }}>对华聚焦度上升</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 24, height: 2, background: "#d4a090", borderRadius: 1 }} />
            <span style={{ color: "var(--ink-2)" }}>对华聚焦度下降</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 24, height: 1, background: "rgba(201,194,173,0.5)", borderRadius: 1, borderTop: "2px dashed rgba(201,194,173,0.5)" }} />
            <span style={{ color: "var(--ink-2)" }}>CEEC 均值</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 1, background: "rgba(126,168,164,0.5)", borderTop: "2px dashed rgba(126,168,164,0.5)" }} />
            <span style={{ color: "var(--ink-2)" }}>RCA = 1 基准线</span>
          </div>
        </div>
      </div>

      {/* ── SVG Chart ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="100%"
        style={{ position: "absolute", inset: 0, zIndex: 2, cursor: hovered ? "crosshair" : "default" }}
        onMouseLeave={handleMouseLeave}
      >
        {/* Background grid */}
        {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((v) => (
          <g key={v}>
            <line
              x1={PAD_LEFT} x2={W - PAD_RIGHT}
              y1={yScale(v)} y2={yScale(v)}
              stroke="rgba(201,194,173,0.06)" strokeWidth={1}
            />
            <text x={PAD_LEFT - 10} y={yScale(v) + 4} textAnchor="end"
              fill="rgba(201,194,173,0.3)" fontFamily="var(--mono)" fontSize={9}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* RCA = 1 reference line (global average) */}
        <line
          x1={PAD_LEFT} x2={W - PAD_RIGHT}
          y1={yScale(1)} y2={yScale(1)}
          stroke="rgba(126,168,164,0.35)" strokeWidth={1.5} strokeDasharray="6 4"
        />
        <text x={W - PAD_RIGHT + 6} y={yScale(1) + 4}
          fill="rgba(126,168,164,0.6)" fontFamily="var(--mono)" fontSize={10} fontWeight="600">
          RCA=1
        </text>

        {/* Year axis */}
        {YEARS.map((y) => (
          <g key={y}>
            <line
              x1={xScale(y)} x2={xScale(y)}
              y1={PAD_TOP} y2={PAD_TOP + PLOT_H + 8}
              stroke="rgba(201,194,173,0.06)" strokeWidth={1}
            />
            <text x={xScale(y)} y={PAD_TOP + PLOT_H + 22} textAnchor="middle"
              fill="rgba(201,194,173,0.4)" fontFamily="var(--mono)" fontSize={10}>
              {y}
            </text>
          </g>
        ))}

        {/* CEEC average line */}
        {drawProgress > 0 && (() => {
          const pts = avgLine.slice(0, Math.ceil(drawProgress * 10));
          let d = "";
          pts.forEach((p, i) => {
            d += i === 0 ? `M ${xScale(p.year)} ${yScale(p.rca)}` : ` L ${xScale(p.year)} ${yScale(p.rca)}`;
          });
          return (
            <path d={d}
              stroke="rgba(201,168,124,0.5)"
              strokeWidth={1.5} strokeDasharray="6 4"
              fill="none"
            />
          );
        })()}

        {/* Country lines (non-hovered first, then hovered on top) */}
        {[...falling, ...rising]
          .filter((c) => c.iso !== hovered)
          .map((country) => {
            const isRising = country.rca_trend === "increasing";
            const color = isRising ? "#8fb8b0" : "#d4a090";
            const path = buildPath(country.yearly, drawProgress);
            const last = country.yearly[country.yearly.length - 1];
            const labelY = yScale(last.internal_rca);
            const isBlurred = hovered !== null;

            return (
              <g key={country.iso}
                style={{ cursor: "crosshair" }}
                onMouseMove={(e) => handleMouseMove(e as any, country)}
              >
                <path d={path}
                  stroke={color}
                  strokeWidth={isBlurred ? 1 : 1.5}
                  fill="none"
                  opacity={isBlurred ? 0.12 : 0.55}
                  style={{ transition: "opacity 200ms" }}
                />
                {/* Wide invisible hit area */}
                <path d={path}
                  stroke="transparent"
                  strokeWidth={12}
                  fill="none"
                />
                {/* Country label at end */}
                {drawProgress > 0.95 && !isBlurred && (
                  <text x={xScale(2020) + 8} y={labelY + 3}
                    fill={color} fontFamily="var(--mono)" fontSize={9}
                    opacity={0.6}>
                    {country.iso}
                  </text>
                )}
              </g>
            );
          })}

        {/* Hovered line — rendered last (on top) */}
        {hovered && (() => {
          const country = data.countries.find((c) => c.iso === hovered);
          if (!country) return null;
          const isRising = country.rca_trend === "increasing";
          const color = isRising ? "#8fb8b0" : "#d4a090";
          const path = buildPath(country.yearly, drawProgress);
          const last = country.yearly[country.yearly.length - 1];

          return (
            <g key={`hovered-${country.iso}`}>
              {/* Glow */}
              <path d={path} stroke={color} strokeWidth={8} fill="none" opacity={0.12} />
              {/* Main line */}
              <path d={path} stroke={color} strokeWidth={2.5} fill="none" opacity={0.95} />
              {/* Dots on each data point */}
              {country.yearly.map((pt) => (
                <circle key={pt.year}
                  cx={xScale(pt.year)} cy={yScale(pt.internal_rca)} r={3.5}
                  fill={color} opacity={0.9}
                />
              ))}
              {/* End label */}
              <text x={xScale(2020) + 10} y={yScale(last.internal_rca) + 4}
                fill={color} fontFamily="var(--mono)" fontSize={11} fontWeight="bold">
                {country.name_cn}
              </text>
            </g>
          );
        })()}

        {/* Axis label */}
        <text x={PAD_LEFT - 40} y={PAD_TOP - 20} textAnchor="start"
          fill="rgba(201,194,173,0.3)" fontFamily="var(--mono)" fontSize={9}
          letterSpacing="0.18em">
          中国内部 RCA ↑
        </text>
      </svg>

      {/* ── Hover Tooltip ── */}
      {tooltip && <RcaTooltip info={tooltip} />}

      {/* ── Bottom insight ── */}
      <div style={{
        position: "absolute", left: PAD_LEFT + 24, right: PAD_RIGHT, bottom: 20,
        display: "flex", alignItems: "center", gap: 32,
        opacity: showAnnotations ? 1 : 0, transition: "opacity 800ms",
        pointerEvents: "none", zIndex: 5,
      }}>
        <div style={{
          padding: "8px 18px",
          background: "rgba(212,160,144,0.08)",
          border: "1px solid rgba(212,160,144,0.2)",
          borderRadius: 8,
          fontFamily: "var(--serif)", fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5,
        }}>
          <span style={{ color: "#d4a090", fontWeight: 700 }}>绝对量增长 ≠ 战略深化</span><br />
          合作论文四年内翻倍，但大多数国家的对华聚焦度（RCA）却在下滑——<br />
          这说明，中欧合作的增长是大环境驱动的，而非政策性战略选择。
        </div>
        <div 
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}
          style={{ marginLeft: "auto", textAlign: "right", pointerEvents: showAnnotations ? "auto" : "none", cursor: showAnnotations ? "pointer" : "default" }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 4 }}>
            下一个问题 →
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", fontFamily: "var(--serif)" }}>
            增长的论文中，有多少是真正的双边合作?
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function StatBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 24, color, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-2)", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function RcaTooltip({ info }: { info: TooltipInfo }) {
  const { country, mouseX, mouseY } = info;
  const isRising = country.rca_trend === "increasing";
  const color = isRising ? "#8fb8b0" : "#d4a090";
  const TW = 260, TH = 240;
  const left = Math.min(mouseX + 16, W - TW - 20);
  const top = Math.max(mouseY - TH - 12, 10);
  const change = country.internal_rca_2020 - country.internal_rca_2011;

  return (
    <div style={{
      position: "absolute", left, top,
      width: TW, zIndex: 50, pointerEvents: "none",
      fontFamily: "var(--mono)",
      animation: "tooltipFadeIn 150ms ease both",
    }}>
      <style>{`@keyframes tooltipFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
      <div style={{
        background: "rgba(6,5,18,0.97)",
        border: `1px solid ${color}44`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 16px 48px rgba(0,0,0,0.7), 0 0 30px ${color}15`,
        backdropFilter: "blur(16px)",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: `1px solid ${color}22`,
          background: `linear-gradient(135deg, ${color}10 0%, transparent 100%)`,
        }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color, marginBottom: 3 }}>
            {country.iso} · {isRising ? "↑ 聚焦上升" : "↓ 聚焦下降"}
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "var(--ink-0)" }}>
            {country.name_cn}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* RCA change */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--ink-2)", textTransform: "uppercase", marginBottom: 2 }}>2011 年</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-1)" }}>{country.internal_rca_2011.toFixed(2)}</div>
              <div style={{ fontSize: 9, color: "var(--ink-2)" }}>内部 RCA</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: 18, color }}>→</div>
            <div style={{ flex: 1, background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--ink-2)", textTransform: "uppercase", marginBottom: 2 }}>2020 年</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{country.internal_rca_2020.toFixed(2)}</div>
              <div style={{ fontSize: 9, color: `${color}99` }}>{change >= 0 ? "+" : ""}{change.toFixed(2)}</div>
            </div>
          </div>

          {/* Additional stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <MiniStat label="中国全球伙伴排名" value={`#${country.china_portfolio_rank_2020}`} note="2020年" />
            <MiniStat label="EU6 合作强度" value={`${(country.eu6_intensity * 100).toFixed(0)}%`} note="vs 中国论文" />
            <MiniStat label="大科学占比" value={`${(country.big_science_share_135 * 100).toFixed(1)}%`} note="2016–2020" />
            <MiniStat label="EU6:中国 比例" value={`${country.eu6_china_ratio.toFixed(1)}:1`} note="2020年" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "6px 8px" }}>
      <div style={{ fontSize: 8, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-0)" }}>{value}</div>
      <div style={{ fontSize: 8, color: "var(--ink-2)" }}>{note}</div>
    </div>
  );
}
