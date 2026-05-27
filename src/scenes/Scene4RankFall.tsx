import { useEffect, useMemo, useState } from "react";
import type { AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

/**
 * Scene 3 ── 「排位在掉」
 *
 * The reveal here: while bilateral cooperation papers grew, China's *global*
 * cooperation pool grew faster — so most CEEC countries actually slipped in
 * China's worldwide partner ranking.
 *
 * X axis = period (left: 2011–2015, right: 2016–2020).
 * Y axis = rank (1 = top, larger = further down). Lower y position = higher rank.
 * Ball size encodes paper count_135.
 * Connecting line = ball's path between periods. Color encodes direction:
 *   red = rank fell (number got bigger), green-ish = rank rose, gold = held.
 */
export function Scene4RankFall({ data, active }: Props) {
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  // Animate "fall" 0..1 over 3.5 s
  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 3500);
      // ease out cubic
      const e = 1 - Math.pow(1 - t, 3);
      setProgress(e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const W = 1440;
  const H = 760;
  const padX = 427;
  const padTop = 200;
  const padBottom = 140;

  // Y: fixed range 15–160. Two-segment scale with 70 as dividing point,
  // so the crowded top half (where most countries cluster) gets more room.
  const yMin = 15;
  const yMax = 160;
  const midRank = 70;
  const plotHeight = H - padTop - padBottom;
  const midY = padTop + plotHeight * 0.7;

  function yScale(rank: number) {
    const r = Math.max(yMin, Math.min(yMax, rank));
    if (r <= midRank) {
      return padTop + ((r - yMin) / (midRank - yMin)) * (midY - padTop);
    }
    return midY + ((r - midRank) / (yMax - midRank)) * (H - padBottom - midY);
  }

  const x125 = padX;
  const x135 = W - padX;

  // Quick narrative anchors
  const fallers = data.perCountry.filter((c) => c.rank_change < 0).length;
  const risers = data.perCountry.filter((c) => c.rank_change > 0).length;
  const holders = data.perCountry.length - fallers - risers;
  const biggestRiser = [...data.perCountry].sort(
    (a, b) => b.rank_change - a.rank_change
  )[0];
  const biggestFaller = [...data.perCountry].sort(
    (a, b) => a.rank_change - b.rank_change
  )[0];

  const sorted = useMemo(() => {
    return [...data.perCountry].sort((a, b) => a.rank_135 - b.rank_135);
  }, [data.perCountry]);

  const radiusFor = (count: number) => {
    const max = Math.max(...data.perCountry.map((c) => c.count_135));
    return 6 + Math.sqrt(count / max) * 16;
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-0)",
        overflow: "hidden",
      }}
    >
      {/* Header — narrowed and lifted so it doesn't crowd the left-side labels */}
      <div
        style={{
          position: "absolute",
          top: 36,
          left: 48,
          maxWidth: 300,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div className="kicker">SCENE 04 · 反转</div>
        <h1
          className="headline"
          style={{
            marginTop: 4,
            fontSize: "clamp(22px, 2.6vw, 36px)",
            lineHeight: 1.2,
          }}
        >
          答案:量在涨,<br />
          <span style={{ color: "var(--accent-cn-glow)" }}>排位却在掉</span>
        </h1>
        <p className="subhead" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
          论文数翻倍,但中国与全世界的合作更猛——
          多数中东欧国家在中国的全球合作伙伴名单里反而下滑。
        </p>
      </div>

      {/* SVG plot */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, zIndex: 2 }}
      >
        <defs>
          <linearGradient id="line-fall" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4a090" stopOpacity="0.0" />
            <stop offset="20%" stopColor="#d4a090" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#c4796e" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="line-rise" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a3c4bf" stopOpacity="0.0" />
            <stop offset="20%" stopColor="#a3c4bf" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7ea8a4" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="line-hold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c9a87c" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#c9a87c" stopOpacity="0.85" />
          </linearGradient>
          <filter id="ball-glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Vertical period axes */}
        <line x1={x125} x2={x125} y1={padTop - 50} y2={H - padBottom + 30} stroke="rgba(201,194,173,0.12)" strokeWidth="1" />
        <line x1={x135} x2={x135} y1={padTop - 50} y2={H - padBottom + 30} stroke="rgba(201,194,173,0.12)" strokeWidth="1" />

        {/* Period labels */}
        <text x={x125} y={padTop - 70} textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="11" letterSpacing="0.22em" >
          十二五 · 2011 — 2015
        </text>
        <text x={x135} y={padTop - 70} textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="11" letterSpacing="0.22em" >
          十三五 · 2016 — 2020
        </text>
        <text x={x125} y={padTop - 50} textAnchor="middle" fill="var(--ink-1)" fontFamily="var(--serif)" fontSize="13" >
          排位 (越小越好)
        </text>

        {/* Reference rank ticks */}
        {[20, 50, 80, 120, 150].map((r) =>
          r >= yMin && r <= yMax ? (
            <g key={r}>
              <line
                x1={x125}
                x2={x135}
                y1={yScale(r)}
                y2={yScale(r)}
                stroke="rgba(201,194,173,0.05)"
                strokeDasharray="4 8"
              />
              <text
                x={x125 - 14}
                y={yScale(r) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--ink-2)"
                fontFamily="var(--mono)"
              >
                #{r}
              </text>
              <text
                x={x135 + 14}
                y={yScale(r) + 4}
                textAnchor="start"
                fontSize="11"
                fill="var(--ink-2)"
                fontFamily="var(--mono)"
              >
                #{r}
              </text>
            </g>
          ) : null
        )}

        {/* Country trajectories */}
        {sorted.map((c, i) => {
          const y1 = yScale(c.rank_125);
          const y2start = y1;
          const y2end = yScale(c.rank_135);
          const y2 = y2start + (y2end - y2start) * progress;
          const cls =
            c.rank_change < 0 ? "fall" : c.rank_change > 0 ? "rise" : "hold";
          const lineFill =
            cls === "fall" ? "url(#line-fall)" : cls === "rise" ? "url(#line-rise)" : "url(#line-hold)";
          const ballColor =
            cls === "fall" ? "#c4796e" : cls === "rise" ? "#7ea8a4" : "#c9a87c";
          const r1 = radiusFor(c.count_125);
          const r2 = radiusFor(c.count_135);
          const r2cur = r1 + (r2 - r1) * progress;
          const isHover = hover === c.iso;
          const isLeft = i % 2 === 0;
          const labelX = isLeft ? x125 - 38 : x135 + 38;
          const labelAnchor = isLeft ? "end" : "start";
          return (
            <g
              key={c.iso}
              opacity={hover && !isHover ? 0.25 : 1}
              style={{ transition: "opacity 200ms" }}
            >
              {/* Trajectory line */}
              <line
                x1={x125}
                y1={y1}
                x2={x125 + (x135 - x125) * progress}
                y2={y2}
                stroke={lineFill}
                strokeWidth={isHover ? 3 : 1.6}
                strokeLinecap="round"
              />
              {/* 125 ball (period-start) */}
              <circle
                cx={x125}
                cy={y1}
                r={r1}
                fill={ballColor}
                opacity={0.18}
              />
              <circle
                cx={x125}
                cy={y1}
                r={r1 * 0.55}
                fill={ballColor}
                opacity={0.95}
              />
              {/* 135 ball (period-end), grows in along progress */}
              {progress > 0.05 && (
                <>
                  <circle
                    cx={x125 + (x135 - x125) * progress}
                    cy={y2}
                    r={r2cur}
                    fill={ballColor}
                    opacity={0.18}
                    filter={isHover ? "url(#ball-glow)" : undefined}
                  />
                  <circle
                    cx={x125 + (x135 - x125) * progress}
                    cy={y2}
                    r={r2cur * 0.55}
                    fill={ballColor}
                    opacity={0.95}
                  />
                </>
              )}

              {/* Country label at the 135 endpoint, alternates left/right */}
              {progress > 0.6 && (
                <text
                  x={labelX}
                  y={isLeft ? y1 + 4 : y2end + 4}
                  textAnchor={labelAnchor}
                  fontSize={c.rank_135 <= 50 ? 14 : 12}
                  fontFamily="var(--serif)"
                  fontWeight={c.rank_135 <= 50 ? 700 : 400}
                  fill={ballColor}
                  opacity={progress > 0.9 ? 1 : (progress - 0.6) / 0.3}
                  style={{ paintOrder: "stroke", stroke: "var(--bg-0)", strokeWidth: 3 }}
                >
                  {isLeft ? (
                    <>
                      <tspan
                        fontFamily="var(--mono)"
                        fontSize="10"
                        fill="var(--ink-2)"
                        fontWeight={400}
                      >
                        {c.rank_change < 0 ? `↓${Math.abs(c.rank_change)}` : c.rank_change > 0 ? `↑${c.rank_change}` : `±0`}
                      </tspan>
                      <tspan dx="4">{c.name_cn}</tspan>
                    </>
                  ) : (
                    <>
                      {c.name_cn}
                      <tspan
                        fontFamily="var(--mono)"
                        fontSize="10"
                        fill="var(--ink-2)"
                        dx="8"
                        fontWeight={400}
                      >
                        {c.rank_change < 0 ? `↓${Math.abs(c.rank_change)}` : c.rank_change > 0 ? `↑${c.rank_change}` : `±0`}
                      </tspan>
                    </>
                  )}
                </text>
              )}

              {/* Hit area for hover */}
              <circle
                cx={x125 + (x135 - x125) * progress}
                cy={y2}
                r={Math.max(r2cur, 14)}
                fill="transparent"
                onMouseEnter={() => setHover(c.iso)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer", pointerEvents: "auto" }}
              />
            </g>
          );
        })}
      </svg>

      {/* Bottom-left: aggregate verdict */}
      <div
        style={{
          position: "absolute",
          left: 48,
          bottom: 60,
          maxWidth: 380,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            marginBottom: 10,
          }}
        >
          {data.perCountry.length} 国 · 排位变化分布
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          <Stat label="排位下降" value={fallers} hint="头部国家普遍下滑" color="#d4a090" />
          <Stat label="排位上升" value={risers} hint="小国从底部追赶" color="#a3c4bf" />
          <Stat label="持平" value={holders} hint="" color="#c9a87c" />
        </div>
        <div
          style={{
            marginTop: 18,
            color: "var(--ink-1)",
            fontSize: 14,
            lineHeight: 1.55,
            fontFamily: "var(--serif)",
          }}
        >
          梯队头部({biggestFaller.name_cn} ↓{Math.abs(biggestFaller.rank_change)})跌得最猛;
          底部小国({biggestRiser.name_cn} ↑{biggestRiser.rank_change})从近乎零基底起跳。
          结果是头尾分化加剧。
        </div>
      </div>

      {/* Bottom-right: legend + bridge → Scene 5 */}
      <div
        style={{
          position: "absolute",
          right: 48,
          bottom: 56,
          zIndex: 5,
          pointerEvents: "none",
          textAlign: "right",
        }}
      >
        {/* Tiny legend */}
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)", letterSpacing: "0.16em", lineHeight: 1.9, marginBottom: 16 }}>
          <div><span style={{ color: "#c4796e" }}>●</span> 排位下降</div>
          <div><span style={{ color: "#7ea8a4" }}>●</span> 排位上升</div>
          <div><span style={{ color: "#c9a87c" }}>●</span> 持平</div>
          <div style={{ marginTop: 4 }}>球大小 = 当期合作论文量</div>
        </div>
        {/* Bridge */}
        <div
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}
          style={{
            opacity: progress > 0.85 ? 1 : 0,
            transition: "opacity 800ms ease",
            borderTop: "1px solid rgba(201,194,173,0.1)",
            paddingTop: 14,
            maxWidth: 340,
            pointerEvents: progress > 0.85 ? "auto" : "none",
            cursor: progress > 0.85 ? "pointer" : "default",
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 6 }}>
            但为什么 →
          </div>
          <div style={{ fontSize: 17, color: "var(--ink-0)", fontWeight: 700, lineHeight: 1.3 }}>
            论文数量明明在翻倍——
            答案藏在{" "}
            <span style={{ color: "var(--accent-physics)" }}>一种特殊的合作方式</span>
            {" "}里。
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: number;
  hint: string;
  color: string;
}) {
  return (
    <div>
      <div
        className="mono tabular"
        style={{ fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="stat-label" style={{ marginTop: 4 }}>
        {label}
      </div>
      {hint && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-2)",
            letterSpacing: "0.1em",
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
