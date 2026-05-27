import { useEffect, useState } from "react";

interface CountryPoint {
  iso: string;
  name_cn: string;
  geopolitical_group: string;
  eu6_intensity_2020: number;
  china_internal_rca_2020: number;
  china_rca_2020: number;
  total_output: number;
  eu6_china_ratio: number;
}

interface ScatterData {
  correlation: {
    eu6_intensity_vs_china_rca: {
      pearson_r: number;
      p_value: number;
      significant_at_0_05: boolean;
    };
  };
  geopolitical_groups: Record<string, { label: string; color: string }>;
  highlights: Array<{ iso: string; reason: string; position: string }>;
  countries: CountryPoint[];
}

const GROUP_COLORS: Record<string, string> = {
  eurozone_core: "#7ea8a4",
  eurozone_special: "#c9a87c",
  eu_non_eurozone: "#9b8ea8",
  eu_candidate: "#8fb8b0",
};

const GROUP_ORDER = ["eurozone_core", "eurozone_special", "eu_non_eurozone", "eu_candidate"];

interface Props {
  active: boolean;
}

export function Scene9DualOutward({ active }: Props) {
  const [data, setData] = useState<ScatterData | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"dots" | "trend" | "annotations">("dots");
  const [viewMode, setViewMode] = useState<"scatter" | "bars">("scatter");
  const [hovered, setHovered] = useState<{ point: CountryPoint; cx: number; cy: number; color: string } | null>(null);

  useEffect(() => {
    fetch("./data/viz/viz_eu6_china_scatter.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!active) { setProgress(0); setPhase("dots"); return; }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 5500);
      const e = 1 - Math.pow(1 - t, 3);
      setProgress(e);
      if (t < 0.4) setPhase("dots");
      else if (t < 0.68) setPhase("trend");
      else setPhase("annotations");
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const W = 1440; const H = 760;
  const padL = 200; const padR = 260; const padT = 175; const padB = 130;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (!data) return null;

  const points = data.countries;
  const maxRCA = Math.max(...points.map((p) => p.china_internal_rca_2020), 3);
  const maxEU6 = Math.max(...points.map((p) => p.eu6_intensity_2020), 0.65);

  const xScale = (v: number) => padL + (v / maxEU6) * plotW;
  const yScale = (v: number) => padT + (1 - v / maxRCA) * plotH;

  // Linear regression
  const xs = points.map((p) => p.eu6_intensity_2020);
  const ys = points.map((p) => p.china_internal_rca_2020);
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((a, x, i) => a + (x - xMean) * (ys[i] - yMean), 0) /
    Math.max(0.0001, xs.reduce((a, x) => a + (x - xMean) ** 2, 0));
  const intercept = yMean - slope * xMean;
  const r = data.correlation.eu6_intensity_vs_china_rca.pearson_r;
  const pVal = data.correlation.eu6_intensity_vs_china_rca.p_value;

  const highlightIsos = new Set(data.highlights.map((h) => h.iso));

  // EU6/China ratio by group
  const groupOrder = ["eurozone_core", "eurozone_special", "eu_non_eurozone", "eu_candidate"];
  const ratioByGroup: Record<string, { label: string; color: string; countries: CountryPoint[]; meanRatio: number }> = {};
  for (const key of groupOrder) {
    const gCountries = points.filter((p) => p.geopolitical_group === key);
    if (gCountries.length > 0) {
      ratioByGroup[key] = {
        label: data.geopolitical_groups[key]?.label || key,
        color: data.geopolitical_groups[key]?.color || "var(--ink-2)",
        countries: gCountries.sort((a, b) => b.eu6_china_ratio - a.eu6_china_ratio),
        meanRatio: gCountries.reduce((s, c) => s + c.eu6_china_ratio, 0) / gCountries.length,
      };
    }
  }

  // Eastward substitution
  const candidateRCAs = points.filter((p) => p.geopolitical_group === "eu_candidate").map((p) => p.china_internal_rca_2020);
  const memberRCAs = points.filter((p) => p.geopolitical_group !== "eu_candidate").map((p) => p.china_internal_rca_2020);
  const candMeanRCA = candidateRCAs.reduce((a, b) => a + b, 0) / candidateRCAs.length;
  const membMeanRCA = memberRCAs.reduce((a, b) => a + b, 0) / memberRCAs.length;

  // Bar chart constants
  const sortedByGroup = groupOrder.flatMap((g) =>
    points.filter((p) => p.geopolitical_group === g).sort((a, b) => b.eu6_china_ratio - a.eu6_china_ratio)
  );
  const maxRatio = Math.max(...points.map((p) => p.eu6_china_ratio), 1);

  // Bar chart layout (full view) — left-aligned
  const barPadL = 120; const barPadT = 195; const barPadB = 60;
  const barPlotH = H - barPadT - barPadB;
  const barGapRaw = 4;
  const barGap = barGapRaw * 0.9;
  const groupCount = 4;
  const groupHeaderH = 22;
  const interGroupGap = 8;
  const bottomReserve = 50;
  const barOverhead = groupCount * groupHeaderH + (groupCount - 1) * interGroupGap + bottomReserve;
  const barH = Math.min(22, Math.max(12, (barPlotH - barOverhead - points.length * barGap) / points.length)) * 0.9;
  const totalBarH = barOverhead - bottomReserve + points.length * (barH + barGap);
  const barStartY = barPadT + Math.max(20, (barPlotH - totalBarH) / 2);
  const nameW = 90;
  const barStartX = barPadL + nameW + 10;
  const barMaxW = Math.min(880, W - barStartX - 80);

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ position: "absolute", top: 40, left: 48, maxWidth: 560, zIndex: 5, pointerEvents: "none" }}>
        <div className="kicker">SCENE 10 · 相关视角</div>
        <h1 className="headline" style={{ marginTop: 4, fontSize: "clamp(24px, 3vw, 40px)" }}>
          不是"选边站",<br />
          <span style={{ color: "var(--accent-eu-glow)" }}>越是EU导向的国家</span>
          ,<br />对中国的合作也越深
        </h1>
        <p className="subhead" style={{ marginTop: 10, fontSize: 14 }}>
          EU6科研嵌入度与中国内部RCA呈{" "}
          <strong style={{ color: "var(--accent-eu-glow)" }}>显著正相关</strong>{" "}
          (r={r.toFixed(2)}, p{pVal < 0.01 ? "<0.01" : "=" + pVal.toFixed(3)})。
          科研开放度是统一维度,而非此消彼长的零和博弈。
        </p>
      </div>

      {/* Inner view segmented control – right side */}
      <div style={{
        position: "absolute", right: 48, top: 48, zIndex: 10,
        display: "inline-flex", alignItems: "center",
        background: "rgba(6,5,18,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderRadius: 9,
        padding: 4,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        {(["scatter", "bars"] as const).map((mode) => {
          const active = viewMode === mode;
          const label  = mode === "scatter" ? "散点相关图" : "EU6/中国 比值图";
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "7px 18px",
                background: active
                  ? "linear-gradient(135deg, rgba(201,168,124,0.22) 0%, rgba(201,168,124,0.07) 100%)"
                  : "transparent",
                border: active
                  ? "1px solid rgba(201,168,124,0.38)"
                  : "1px solid transparent",
                borderRadius: 7,
                color: active ? "rgba(255,255,255,0.95)" : "rgba(201,194,173,0.42)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                letterSpacing: "0.11em",
                cursor: "pointer",
                textShadow: active ? "0 0 12px rgba(201,168,124,0.55)" : "none",
                transition: "all 200ms ease",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* === SCATTER VIEW === */}
      {viewMode === "scatter" && (
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          <defs>
            <filter id="glow-est2">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {[0.5, 1.0, 1.5, 2.0, 2.5].map((v) =>
            v <= maxRCA ? (
              <line key={`h-${v}`} x1={padL} x2={padL + plotW}
                y1={yScale(v)} y2={yScale(v)}
                stroke="rgba(201,194,173,0.06)" strokeDasharray="3 6" />
            ) : null
          )}

          {/* RCA = 1 reference */}
          <line x1={padL} x2={padL + plotW} y1={yScale(1)} y2={yScale(1)}
            stroke="rgba(201,168,124,0.3)" strokeDasharray="6 6" strokeWidth="1.5" />
          <text x={padL + plotW + 8} y={yScale(1) + 4}
            fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="10">RCA=1</text>

          {/* Axes */}
          <line x1={padL} x2={padL + plotW} y1={padT + plotH + 16} y2={padT + plotH + 16}
            stroke="rgba(201,194,173,0.15)" strokeWidth="1" />
          <line x1={padL - 8} x2={padL - 8} y1={padT} y2={padT + plotH}
            stroke="rgba(201,194,173,0.15)" strokeWidth="1" />

          <text x={padL + plotW / 2} y={padT + plotH + 44} textAnchor="middle"
            fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="11" letterSpacing="0.1em">
            EU6 科研嵌入度 (与 DE/FR/GB/IT/ES/NL 的合作占比)
          </text>
          <text x={padL - 40} y={padT + plotH / 2} textAnchor="middle"
            fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="11" letterSpacing="0.1em"
            transform={`rotate(-90, ${padL - 40}, ${padT + plotH / 2})`}>
            中国合作 Internal RCA
          </text>

          {/* Trend line */}
          {phase !== "dots" && (() => {
            const tx1 = Math.min(...xs) * 0.9;
            const tx2 = maxEU6 * 1.02;
            const ty1 = Math.max(0, Math.min(maxRCA, intercept + slope * tx1));
            const ty2 = Math.max(0, Math.min(maxRCA, intercept + slope * tx2));
            return (
              <line x1={xScale(tx1)} x2={xScale(tx2)}
                y1={yScale(ty1)} y2={yScale(ty2)}
                stroke="var(--accent-eu-glow)" strokeWidth="2.5" strokeDasharray="8 4"
                opacity={phase === "trend" ? progress * 1.5 : 1}
                style={{ transition: "opacity 600ms ease" }} />
            );
          })()}

          {/* Dots */}
          {points.map((p) => {
            const cx = xScale(p.eu6_intensity_2020);
            const cy = yScale(p.china_internal_rca_2020);
            const radius = 6 + Math.sqrt(Math.min(p.total_output, 200000) / 200000) * 20;
            const color = GROUP_COLORS[p.geopolitical_group] || "var(--ink-1)";
            const isHL = highlightIsos.has(p.iso);
            return (
              <g key={p.iso} opacity={progress > 0.15 ? 1 : 0}
                style={{ transition: "opacity 400ms ease", transitionDelay: `${points.indexOf(p) * 30}ms`, cursor: "pointer" }}
                onMouseEnter={() => setHovered({ point: p, cx, cy, color })}
                onMouseLeave={() => setHovered(null)}>
                <circle cx={cx} cy={cy} r={radius} fill={color} opacity={hovered?.point.iso === p.iso ? 0.45 : 0.32}
                  filter={isHL ? "url(#glow-est2)" : undefined}
                  style={{ transition: "opacity 200ms ease" }} />
                <circle cx={cx} cy={cy} r={radius * 0.62} fill={color} opacity={1}
                  stroke="#ffffff" strokeWidth={isHL ? 2 : 1.4}
                  style={{ transition: "opacity 200ms ease" }} />
                <text x={cx + radius + 6} y={cy - radius * 0.3} textAnchor="start"
                  fill="var(--ink-0)" fontFamily="var(--serif)" fontSize="12" fontWeight={isHL ? 700 : 500}
                  style={{ paintOrder: "stroke", stroke: "var(--bg-0)", strokeWidth: 3 }}>
                  {p.name_cn}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* Hover tooltip for scatter dots */}
      {viewMode === "scatter" && hovered && (
        <div style={{
          position: "absolute",
          left: Math.min(W - padR - 10, Math.max(padL + 10, hovered.cx + 24)),
          top: Math.min(H - padB - 10, Math.max(padT + 10, hovered.cy - 60)),
          zIndex: 20,
          background: "rgba(12,10,8,0.94)",
          border: `1px solid ${hovered.color}44`,
          borderLeft: `3px solid ${hovered.color}`,
          borderRadius: 6,
          padding: "14px 18px",
          fontFamily: "var(--serif)",
          pointerEvents: "none",
          transition: "opacity 200ms ease, transform 200ms ease",
          transform: "translateY(0)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          minWidth: 190,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-0)", marginBottom: 2 }}>
            {hovered.point.name_cn}
          </div>
          <div style={{ fontSize: 10, color: hovered.color, fontFamily: "var(--mono)", letterSpacing: "0.06em", marginBottom: 10 }}>
            {data.geopolitical_groups[hovered.point.geopolitical_group]?.label || ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { label: "EU6嵌入度", value: `${(hovered.point.eu6_intensity_2020 * 100).toFixed(1)}%` },
              { label: "中国RCA", value: hovered.point.china_internal_rca_2020.toFixed(2) },
              { label: "总产出", value: `${hovered.point.total_output.toLocaleString()} 篇` },
              { label: "EU6/中国比", value: `${hovered.point.eu6_china_ratio.toFixed(2)}×` },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
                <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{row.label}</span>
                <span style={{ fontSize: 11, color: "var(--ink-0)", fontWeight: 600, fontFamily: "var(--mono)" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === BAR CHART VIEW === */}
      {viewMode === "bars" && (
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          {/* Title — right side */}
          <text x={barStartX + barMaxW} y={barPadT - 24} fill="var(--ink-0)"
            fontFamily="var(--serif)" fontSize="18" fontWeight="700" textAnchor="end">
            EU6 / 中国 合作论文比
          </text>
          <text x={barStartX + barMaxW} y={barPadT - 2} fill="var(--ink-2)"
            fontFamily="var(--mono)" fontSize="10" letterSpacing="0.08em" textAnchor="end">
            比值 &gt;1 表示与EU6的合作多于与中国合作
          </text>

          {/* Bars with group headers */}
          {(() => {
            let yCursor = barStartY;
            const rows: Array<{ y: number; p: CountryPoint; color: string; groupLabel?: string }> = [];

            for (const group of groupOrder) {
              const gData = ratioByGroup[group];
              if (!gData) continue;
              rows.push({ y: yCursor, p: null as unknown as CountryPoint, color: gData.color, groupLabel: gData.label });
              yCursor += 22;
              for (const c of gData.countries) {
                rows.push({ y: yCursor, p: c, color: gData.color });
                yCursor += barH + barGap;
              }
              yCursor += 8;
            }

            return rows.map((row, i) => {
              if (row.groupLabel) {
                return (
                  <g key={`gh-${i}`}>
                    <rect x={barPadL} y={row.y + 6} width={8} height={3} rx="1.5" fill={row.color} />
                    <text x={barPadL + 14} y={row.y + 13} fill={row.color}
                      fontFamily="var(--serif)" fontSize="12" fontWeight="700">
                      {row.groupLabel}
                    </text>
                    <line x1={barPadL} y1={row.y + 18} x2={barStartX + barMaxW} y2={row.y + 18}
                      stroke="rgba(201,194,173,0.06)" strokeWidth="0.8" />
                  </g>
                );
              }
              const p = row.p;
              const bw = Math.max(4, (p.eu6_china_ratio / Math.max(maxRatio, 2.5)) * barMaxW);
              const barColor = GROUP_COLORS[p.geopolitical_group] || "var(--ink-2)";
              return (
                <g key={`bar-${p.iso}`} opacity={progress > 0.1 + i * 0.03 ? 1 : 0}
                  style={{ transition: "opacity 250ms ease" }}>
                  <text x={barPadL + nameW} y={row.y + barH / 2 + 4} textAnchor="end"
                    fill="var(--ink-2)" fontFamily="var(--serif)" fontSize="11">
                    {p.name_cn}
                  </text>
                  <rect x={barStartX} y={row.y + 2} width={bw} height={barH - 4} rx="3"
                    fill={barColor} opacity={0.7} />
                  <text x={barStartX + bw + 8} y={row.y + barH / 2 + 4}
                    fill="var(--ink-1)" fontFamily="var(--mono)" fontSize="11" fontWeight="700">
                    {p.eu6_china_ratio.toFixed(2)}×
                  </text>
                </g>
              );
            });
          })()}

          {/* Bottom stats */}
          {phase === "annotations" && (
            <g opacity={progress > 0.85 ? 1 : 0} style={{ transition: "opacity 600ms ease" }}>
              <text x={barPadL} y={barStartY + totalBarH + 18}
                fill="var(--ink-2)" fontFamily="var(--serif)" fontSize="12">
                所有CEEC国家EU6合作均超过中国合作。EU候选国(塞尔维亚、阿尔巴尼亚、波黑、北马其顿)
                的平均比值为 {(() => {
                  const cands = points.filter((p) => p.geopolitical_group === "eu_candidate");
                  return (cands.reduce((s, c) => s + c.eu6_china_ratio, 0) / cands.length).toFixed(1);
                })()}×,
                并未因EU准入受限而转向中国。
              </text>
            </g>
          )}
        </svg>
      )}

      {/* Right panel: correlation stats (scatter view only) */}
      {viewMode === "scatter" && (
        <div style={{
          position: "absolute", right: 36, top: 190, width: 220, zIndex: 4, pointerEvents: "none",
          fontFamily: "var(--serif)", opacity: phase !== "dots" ? 1 : 0,
          transition: "opacity 600ms ease",
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 8 }}>
            相关性检验
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--accent-eu-glow)", lineHeight: 1 }}>
            r = {r.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-1)", marginTop: 2 }}>Pearson 相关系数</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink-0)", marginTop: 14 }}>
            p {pVal < 0.01 ? "< 0.01" : "= " + pVal.toFixed(3)}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-1)", marginTop: 2 }}>统计显著 (n = {n})</div>

          {phase === "annotations" && (
            <>
              <div style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid rgba(201,194,173,0.1)" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em",
                  color: "var(--accent-eu-glow)", marginBottom: 6 }}>
                  东向替代不成立
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-0)" }}>
                      {membMeanRCA.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-2)" }}>EU成员国RCA均值</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-2)" }}>
                      {candMeanRCA.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-2)" }}>候选国RCA均值</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5 }}>
                  候选国并未因EU准入受限而更依赖中国。
                  Kruskal-Wallis组间差异不显著(p=0.19)。
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(201,194,173,0.1)" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em",
                  color: "var(--ink-1)", marginBottom: 4 }}>
                  小结
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.6 }}>
                  科研国际化是统一维度——越是深度嵌入EU框架的国家,对中国合作的相对强度也越高。
                  三条分析线指向同一个结论:中国-中东欧合作是一幅多力量交织的复杂图景。
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom-left: group legend */}
      <div style={{
        position: "absolute", left: 48, bottom: 48, zIndex: 4, pointerEvents: "none",
        display: "flex", gap: 22, fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em",
      }}>
        {Object.entries(data.geopolitical_groups).map(([key, g]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%",
              background: g.color }} />
            <span style={{ color: "var(--ink-2)" }}>{g.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom closing strip */}
      <div style={{
        position: "absolute", left: 48, right: 48, bottom: 14, textAlign: "center",
        zIndex: 5, pointerEvents: "none",
        opacity: progress > 0.85 ? 1 : 0,
        transition: "opacity 800ms ease",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)",
          letterSpacing: "0.14em", textTransform: "uppercase" }}>
          —— 大科学幻象、学科指纹、地缘嵌入 —— 三股力量交织出十六条独特的合作轨道
        </div>
      </div>
    </div>
  );
}
