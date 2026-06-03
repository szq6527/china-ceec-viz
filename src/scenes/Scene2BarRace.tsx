import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "../data/useData";
import { Scene2HeatMap } from "./Scene2HeatMap";

interface Props {
  data: AppData;
  active: boolean;
  viewMode: "bars" | "standardized" | "heatmap";
}

interface RcaYearlyPoint {
  year: number;
  internal_rca: number;
  cn_ceec_papers: number;
  country_total_papers: number;
}

interface RcaCountry {
  iso: string;
  name_cn: string;
  internal_rca_2011: number;
  internal_rca_2020: number;
  yearly: RcaYearlyPoint[];
}

interface RcaData {
  countries: RcaCountry[];
}

/**
 * Scene 2 ── 「但有人被甩开了」
 *
 * Horizontal bar race over 2011–2020. Per-country yearly counts are estimated
 * (period total × per-year share of aggregate trajectory; see build_data.py).
 * Visual goal: Poland pulls visibly ahead while the back half barely moves.
 *
 * Layout:  bars on the left two-thirds, year ticker top-right, narrative
 * callouts that fade in/out at specific years.
 */
export function Scene2BarRace({ data, active, viewMode }: Props) {
  const series = data.perCountryYearly;
  const years = useMemo(() => {
    if (!series.length) return [] as number[];
    return series[0].yearly.map((d) => d.year);
  }, [series]);

  const [t, setT] = useState(0); // continuous year cursor 0..years.length-1
  const startedAt = useRef<number | null>(null);
  const pausedT = useRef<number>(0); // t value when paused
  const [paused, setPaused] = useState(false);
  const [scaleMode, setScaleMode] = useState<"relative" | "absolute">("relative");
  const rafRef = useRef(0);

  // Snap t to the nearest whole year index
  const snapToYear = (raw: number) => Math.round(Math.min(raw, years.length - 1));

  useEffect(() => {
    if (!active) {
      setT(0);
      setPaused(false);
      startedAt.current = null;
      pausedT.current = 0;
      return;
    }
    // Reset timer when viewMode or active changes
    startedAt.current = null;
    pausedT.current = 0;
    setT(0);
    setPaused(false);

    const total = viewMode === "bars" ? 24000 : 12000;
    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = now - (startedAt.current ?? now);
      const p = Math.min(1, elapsed / total);
      const eased = p < 0.85 ? p / 0.85 : 0.999;
      const newT = eased * (years.length - 1);
      pausedT.current = newT;
      setT(newT);
      if (elapsed < total + 1500) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, years.length, viewMode]);

  // Handle pause/resume
  const togglePause = () => {
    if (!active) return;
    if (!paused) {
      // Pause: cancel animation, snap to nearest year
      cancelAnimationFrame(rafRef.current);
      const snapped = snapToYear(pausedT.current);
      setT(snapped);
      pausedT.current = snapped;
      setPaused(true);
    } else {
      // Resume: restart animation from current snapped position
      const total = viewMode === "bars" ? 24000 : 12000;
      const currentFrac = pausedT.current / (years.length - 1);
      // Convert eased fraction back to linear time offset
      const linearP = Math.min(currentFrac * 0.85, 0.85);
      const resumeOffset = linearP * total;

      startedAt.current = performance.now() - resumeOffset;
      setPaused(false);

      const tick = (now: number) => {
        const elapsed = now - (startedAt.current ?? now);
        const p = Math.min(1, elapsed / total);
        const eased = p < 0.85 ? p / 0.85 : 0.999;
        const newT = eased * (years.length - 1);
        pausedT.current = newT;
        setT(newT);
        if (elapsed < total + 1500) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  // Jump to a specific year (while paused)
  const jumpToYear = (yearIdx: number) => {
    cancelAnimationFrame(rafRef.current);
    setT(yearIdx);
    pausedT.current = yearIdx;
    setPaused(true);
  };

  // Interpolate counts at fractional year cursor t (0..n-1)
  const cursorCounts = useMemo(() => {
    const lo = Math.floor(t);
    const hi = Math.min(years.length - 1, lo + 1);
    const frac = t - lo;
    return series.map((row) => {
      const a = row.yearly[lo].count;
      const b = row.yearly[hi].count;
      const v = a + (b - a) * frac;
      return { iso: row.iso, name: row.name_cn, value: v, total: row.total };
    });
  }, [t, series, years.length]);

  const ranked = useMemo(
    () => [...cursorCounts].sort((a, b) => b.value - a.value),
    [cursorCounts]
  );
  // Absolute max = Poland's final year value (overall maximum across all countries/time)
  const absoluteMax = useMemo(() => {
    let m = 1;
    for (const row of series) {
      const last = row.yearly[row.yearly.length - 1];
      if (last.count > m) m = last.count;
    }
    return m;
  }, [series]);

  const barMax = scaleMode === "absolute" ? absoluteMax : Math.max(...cursorCounts.map((c) => c.value), 1);
  const currentYear = years[Math.round(t)] ?? 2011;

  // Total CEEC for current cursor year (from aggregate yearly file, more accurate than sum of estimates)
  const yearlyAgg = data.yearly.find((y) => y.year === currentYear) ?? data.yearly[0];

  // Top vs bottom — far more honest framing than Poland-vs-rest, because the
  // raw country totals double-count multi-country CERN papers and don't sum to
  // the global CEEC count.
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const ratio = bottom && Math.round(bottom.value) > 0 ? top.value / bottom.value : 0;
  const top5Sum = ranked.slice(0, 5).reduce((a, b) => a + b.value, 0);
  const allSum = ranked.reduce((a, b) => a + b.value, 0);
  const top5Share = allSum > 0 ? top5Sum / allSum : 0;

  // Choose narrative callout based on year
  const callout = useMemo(() => {
    const y = currentYear;
    if (y <= 2012) return { title: "起点 · 2011-2012", body: "16 国挤在同一起跑线,差距还能用一只手数清。" };
    if (y <= 2014) return { title: "波兰提速", body: "波兰开始与捷克、希腊拉开数量级。" };
    if (y <= 2016)
      return {
        title: "梯队成形 · 十二五尾声",
        body: `前 5 国合计已占整体合作量的 ${(top5Share * 100).toFixed(0)}%。`,
      };
    if (y <= 2018) return { title: "十三五加速期", body: "波兰单年首次破千 —— 与排名末位拉到两个数量级。" };
    return {
      title: "终点 · 2020",
      body: ratio > 0
        ? `${top?.name ?? "波兰"} 是 ${bottom?.name ?? "末位"} 的 ${ratio.toFixed(0)} 倍 —— 同名"合作",量级悬殊。`
        : `领头羊与末位之间，已是难以跨越的鸿沟。`,
    };
  }, [currentYear, top, bottom, ratio, top5Share]);

  const COLORS: Record<string, string> = {
    POL: "#e88db2",       // 中国红高亮 — 头号合作伙伴
    CZE: "#ffb2c1",
    GRC: "#ffe38b",       // 暖金
    HUN: "#ffe38b",
    ROU: "#c8a2c8",
    SRB: "#c8a2c8",
  };

  const ROW_H = 30;
  const N = ranked.length;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-0)",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      {viewMode === "bars" ? (
        <>
      {/* Subtle vertical grid */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        width="100%"
        height="100%"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={`${f * 60 + 8}%`}
            x2={`${f * 60 + 8}%`}
            y1="14%"
            y2="86%"
            stroke="rgba(216,205,224,0.05)"
            strokeDasharray="3 6"
          />
        ))}
      </svg>

      {/* Header: kicker + headline */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 48,
          maxWidth: 540,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div className="kicker">SCENE 02 · 但有人被甩开了</div>
        <h1
          className="headline"
          style={{
            marginTop: 4,
            fontSize: "clamp(26px, 3.2vw, 44px)",
          }}
        >
          十年赛跑 ——<br />
          有人飞奔,<span style={{ color: "var(--accent-cn-glow)" }}>有人原地</span>
        </h1>
      </div>

      {/* Scale mode toggle — absolute vs relative */}
      <div
        onClick={() => setScaleMode((m) => (m === "relative" ? "absolute" : "relative"))}
        style={{
          position: "absolute",
          top: 100,
          right: 480,
          textAlign: "right",
          zIndex: 5,
          fontFamily: "var(--mono)",
          cursor: "pointer",
          userSelect: "none",
          padding: "10px 16px",
          borderRadius: 8,
          border: scaleMode === "absolute"
            ? "1px solid rgba(255,227,139,0.35)"
            : "1px solid rgba(216,205,224,0.12)",
          background: scaleMode === "absolute"
            ? "rgba(255,227,139,0.06)"
            : "rgba(255,255,255,0.03)",
          transition: "all 300ms ease",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-2)" }}>
          标尺模式
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: scaleMode === "absolute" ? "var(--accent-warn)" : "var(--ink-0)", transition: "color 300ms ease" }}>
          {scaleMode === "absolute" ? "绝对长度" : "相对长度"}
        </div>
      </div>

      {/* Big year ticker, top right — click to pause/resume */}
      <div
        onClick={togglePause}
        style={{
          position: "absolute",
          top: 60,
          right: 64,
          textAlign: "right",
          zIndex: 5,
          fontFamily: "var(--mono)",
          color: "var(--ink-0)",
          cursor: "pointer",
          userSelect: "none",
          padding: "10px 16px",
          borderRadius: 8,
          border: paused
            ? "1px solid rgba(232,141,178,0.35)"
            : "1px solid transparent",
          background: paused
            ? "rgba(232,141,178,0.04)"
            : "transparent",
          transition: "all 400ms ease",
        }}
      >
        <div
          style={{
            fontSize: 96,
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: paused ? "var(--accent-cn-glow)" : "var(--ink-0)",
            fontVariantNumeric: "tabular-nums",
            transition: "color 300ms ease",
          }}
        >
          {currentYear}
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            marginTop: 6,
          }}
        >
          当年合作论文 · {yearlyAgg.ceec.toLocaleString()}
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            color: paused ? "var(--accent-cn-glow)" : "var(--ink-2)",
            marginTop: 8,
            transition: "color 300ms ease",
          }}
        >
          {paused ? "▸ 点击继续播放" : "▸ 点击暂停"}
        </div>

        {/* Year timeline scrubber */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 4,
            marginTop: 14,
          }}
        >
          {years.map((yr, idx) => {
            const isActive = idx === Math.round(t);
            const isPast = idx <= Math.round(t);
            return (
              <div
                key={yr}
                onClick={(e) => {
                  e.stopPropagation();
                  jumpToYear(idx);
                }}
                title={String(yr)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: isActive ? 12 : 8,
                    height: isActive ? 12 : 8,
                    borderRadius: "50%",
                    background: isActive
                      ? "var(--accent-cn-glow)"
                      : isPast
                        ? "rgba(232,141,178,0.45)"
                        : "rgba(216,205,224,0.15)",
                    border: isActive ? "2px solid var(--accent-cn-glow)" : "none",
                    boxShadow: isActive ? "0 0 8px rgba(232,141,178,0.5)" : "none",
                    transition: "all 300ms ease",
                  }}
                />
                <div
                  style={{
                    fontSize: 8,
                    color: isActive ? "var(--ink-0)" : "var(--ink-2)",
                    fontVariantNumeric: "tabular-nums",
                    opacity: isActive || idx === 0 || idx === years.length - 1 ? 1 : 0.5,
                    transition: "all 300ms ease",
                  }}
                >
                  {yr}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The bars */}
      <div
        style={{
          position: "absolute",
          left: 48,
          top: 200,
          width: "62%",
          height: ROW_H * N + 20,
          zIndex: 3,
        }}
      >
        {ranked.map((row, idx) => {
          const w = (row.value / barMax) * 100;
          const isTop = idx < 5;
          const color = COLORS[row.iso] ?? (isTop ? "#8bd0d5" : "rgba(139,208,213,0.5)");
          const glow = idx === 0 ? "0 0 18px rgba(232,141,178,0.7)" : "none";
          return (
            <div
              key={row.iso}
              style={{
                position: "absolute",
                top: idx * ROW_H,
                left: 0,
                right: 0,
                height: ROW_H - 6,
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "top 700ms cubic-bezier(0.65, 0, 0.35, 1)",
              }}
            >
              {/* rank badge */}
              <div
                className="mono"
                style={{
                  width: 28,
                  textAlign: "right",
                  color: idx === 0 ? "var(--accent-cn-glow)" : "var(--ink-2)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(idx + 1).padStart(2, "0")}
              </div>
              {/* country name */}
              <div
                style={{
                  width: 72,
                  fontFamily: "var(--serif)",
                  fontSize: idx === 0 ? 17 : 14,
                  fontWeight: idx === 0 ? 700 : 400,
                  color: idx === 0 ? "var(--ink-0)" : "var(--ink-1)",
                }}
              >
                {row.name}
              </div>
              {/* bar */}
              <div
                style={{
                  flex: 1,
                  height: ROW_H - 14,
                  position: "relative",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${w}%`,
                    background:
                      idx === 0
                        ? `linear-gradient(90deg, ${color} 0%, #ffb2c1 100%)`
                        : isTop
                          ? `linear-gradient(90deg, ${color} 0%, rgba(255,255,255,0.25) 100%)`
                          : "rgba(139,208,213,0.35)",
                    boxShadow: glow,
                  }}
                />
              </div>
              {/* value */}
              <div
                className="mono tabular"
                style={{
                  width: 64,
                  textAlign: "right",
                  fontSize: idx === 0 ? 15 : 13,
                  fontWeight: idx === 0 ? 700 : 400,
                  color: idx === 0 ? "var(--ink-0)" : "var(--ink-1)",
                }}
              >
                {Math.round(row.value).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right side: narrative callout */}
      <div
        key={callout.title /* triggers fade-in on change */}
        style={{
          position: "absolute",
          right: 64,
          top: 330,
          width: 320,
          zIndex: 4,
          pointerEvents: "none",
          fontFamily: "var(--serif)",
          animation: "fadeInUp 600ms ease both",
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
          {callout.title}
        </div>
        <div style={{ fontSize: 18, lineHeight: 1.45, color: "var(--ink-0)", fontWeight: 700 }}>
          {callout.body}
        </div>
      </div>

      {/* Right side bottom: top vs bottom ratio — the most honest gap framing */}
      {top && bottom && (
        <div
          style={{
            position: "absolute",
            right: 64,
            bottom: 80,
            width: 320,
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
              color: "var(--ink-2)",
              marginBottom: 10,
            }}
          >
            头号 vs 末位 · 倍数差
          </div>
          <div
            className="mono tabular"
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--accent-cn-glow)",
            }}
          >
            {ratio > 0 && Number.isFinite(ratio) ? `${ratio.toFixed(0)}×` : "—"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-1)",
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            {top.name}{" "}
            <span className="mono tabular" style={{ color: "var(--ink-2)" }}>
              {Math.round(top.value).toLocaleString()}
            </span>{" "}
            <span style={{ color: "var(--ink-2)" }}>·</span>{" "}
            {bottom.name}{" "}
            <span className="mono tabular" style={{ color: "var(--ink-2)" }}>
              {Math.round(bottom.value).toLocaleString()}
            </span>
          </div>

          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              marginTop: 22,
              marginBottom: 6,
            }}
          >
            前 5 国 / 整体占比
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
        </div>
      )}

      {/* Footnote */}
      <div
        style={{
          position: "absolute",
          left: 48,
          bottom: 6,
          right: 400,
          zIndex: 3,
          fontFamily: "var(--mono)",
          fontSize: 9,
          color: "var(--ink-2)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          lineHeight: 1.5,
          opacity: 0.7,
        }}
      >
        ScienceDB 原始 125/135 期间总量 · 年内分布按全局年度走势估算 · 立陶宛/北马其顿由 OpenAlex 回填 · 各国数和 ≠ CEEC 总数(因多国共著)
      </div>

      {/* Bridge to Scene 3 — fades in only at the end of the race */}
      <div
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}
        style={{
          position: "absolute",
          right: 56,
          bottom: 56,
          maxWidth: 380,
          zIndex: 4,
          pointerEvents: currentYear >= 2020 ? "auto" : "none",
          cursor: currentYear >= 2020 ? "pointer" : "default",
          fontFamily: "var(--serif)",
          textAlign: "right",
          opacity: currentYear >= 2020 ? 1 : 0,
          transform: currentYear >= 2020 ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 800ms ease, transform 800ms ease",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--accent-warn)",
            marginBottom: 8,
          }}
        >
          下一个问题 →
        </div>
        <div
          style={{
            fontSize: 18,
            color: "var(--ink-0)",
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          数字背后,是哪些{" "}
          <span style={{ color: "var(--accent-cn-glow)" }}>机构</span>{" "}
          在推动这些合作?
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      </>
      ) : viewMode === "standardized" ? (
        <Scene2StandardizedRca cursorIndex={t} years={years} currentYear={currentYear} />
      ) : (
        <Scene2HeatMap
          data={data}
          cursorCounts={cursorCounts}
          currentYear={currentYear}
          max={barMax}
        />
      )}

    </div>
  );
}

function Scene2StandardizedRca({
  cursorIndex,
  years,
  currentYear,
}: {
  cursorIndex: number;
  years: number[];
  currentYear: number;
}) {
  const [rcaData, setRcaData] = useState<RcaData | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch("./data/viz/viz_rca_trajectories.json")
      .then((r) => r.json())
      .then(setRcaData)
      .catch(console.error);
  }, []);

  const rows = useMemo(() => {
    if (!rcaData || years.length === 0) return [];
    const lo = Math.floor(cursorIndex);
    const hi = Math.min(years.length - 1, lo + 1);
    const frac = cursorIndex - lo;

    return rcaData.countries
      .map((country) => {
        const a = country.yearly[lo] ?? country.yearly[0];
        const b = country.yearly[hi] ?? a;
        const rca = a.internal_rca + (b.internal_rca - a.internal_rca) * frac;
        const papers = a.cn_ceec_papers + (b.cn_ceec_papers - a.cn_ceec_papers) * frac;
        const delta = country.internal_rca_2020 - country.internal_rca_2011;
        return {
          iso: country.iso,
          name: country.name_cn,
          rca,
          papers,
          delta,
          isRising: delta >= 0,
          start: country.internal_rca_2011,
          end: country.internal_rca_2020,
        };
      })
      .sort((a, b) => b.rca - a.rca);
  }, [cursorIndex, rcaData, years.length]);

  const maxRca = Math.max(3, ...rows.map((r) => r.rca), 1);
  const top = rows[0];
  const aboveOne = rows.filter((r) => r.rca >= 1).length;
  const rising = rows.filter((r) => r.isRising).length;
  const ROW_H = 30;
  const chartLeft = 92;
  const chartTop = 218;
  const chartWidth = 900;
  const chartHeight = ROW_H * Math.max(rows.length, 1);
  const referenceX = chartLeft + (1 / maxRca) * chartWidth;

  if (!rcaData) {
    return (
      <div style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--mono)",
        fontSize: 12,
        letterSpacing: "0.2em",
        color: "var(--ink-2)",
      }}>
        LOADING RCA · · ·
      </div>
    );
  }

  return (
    <>
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="100%" height="100%">
        {[0, 1, 2, 3].map((v) => {
          const x = chartLeft + (v / maxRca) * chartWidth;
          return (
            <g key={v}>
              <line
                x1={x}
                x2={x}
                y1={chartTop - 24}
                y2={chartTop + chartHeight + 18}
                stroke={v === 1 ? "rgba(139,208,213,0.45)" : "rgba(216,205,224,0.07)"}
                strokeDasharray={v === 1 ? "6 4" : "3 8"}
              />
              <text
                x={x}
                y={chartTop - 36}
                textAnchor="middle"
                fill={v === 1 ? "rgba(139,208,213,0.75)" : "rgba(216,205,224,0.35)"}
                fontFamily="var(--mono)"
                fontSize={10}
              >
                {v === 1 ? "RCA=1" : v.toFixed(0)}
              </text>
            </g>
          );
        })}
        <line
          x1={referenceX}
          x2={referenceX}
          y1={chartTop - 24}
          y2={chartTop + chartHeight + 18}
          stroke="rgba(139,208,213,0.45)"
          strokeDasharray="6 4"
        />
      </svg>

      <div style={{
        position: "absolute",
        top: 56,
        left: 48,
        maxWidth: 590,
        zIndex: 5,
        pointerEvents: "none",
      }}>
        <div className="kicker">SCENE 02 · 标准化视图</div>
        <h1 className="headline" style={{ marginTop: 4, fontSize: "clamp(26px, 3.1vw, 42px)" }}>
          不只看数量，<br />
          还要看<span style={{ color: "var(--accent-eu)" }}>相对聚焦度</span>
        </h1>
        <p style={{
          marginTop: 14,
          width: 500,
          fontFamily: "var(--serif)",
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--ink-2)",
        }}>
          中国内部 RCA 把各国总体论文规模标准化：RCA &gt; 1 表示该国对华合作强度高于中东欧平均基准，
          可以和后面的 RCA 轨迹图使用同一套口径阅读。
        </p>
      </div>

      <div style={{
        position: "absolute",
        top: 62,
        right: 70,
        textAlign: "right",
        zIndex: 5,
        fontFamily: "var(--mono)",
      }}>
        <div style={{
          fontSize: 84,
          lineHeight: 1,
          fontWeight: 700,
          color: "var(--ink-0)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {currentYear}
        </div>
        <div style={{
          marginTop: 8,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}>
          标准化合作强度 · 中国内部 RCA
        </div>
      </div>

      <div style={{
        position: "absolute",
        left: chartLeft,
        top: chartTop,
        width: chartWidth,
        height: chartHeight,
        zIndex: 4,
      }}>
        {rows.map((row, idx) => {
          const width = (row.rca / maxRca) * 100;
          const color = row.isRising ? "#aadd88" : "#ffb2c1";
          const isHovered = hovered === row.iso;
          const isDimmed = hovered !== null && !isHovered;
          return (
            <div
              key={row.iso}
              onMouseEnter={() => setHovered(row.iso)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: "absolute",
                top: idx * ROW_H,
                left: 0,
                right: 0,
                height: ROW_H - 6,
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: isDimmed ? 0.28 : 1,
                transition: "top 700ms cubic-bezier(0.65,0,0.35,1), opacity 180ms ease",
                cursor: "crosshair",
              }}
            >
              <div className="mono" style={{
                width: 30,
                textAlign: "right",
                color: idx === 0 ? "var(--accent-eu)" : "var(--ink-2)",
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
              }}>
                {String(idx + 1).padStart(2, "0")}
              </div>
              <div style={{
                width: 78,
                fontFamily: "var(--serif)",
                fontSize: idx === 0 ? 17 : 14,
                fontWeight: idx === 0 ? 800 : 500,
                color: idx === 0 ? "var(--ink-0)" : "var(--ink-1)",
              }}>
                {row.name}
              </div>
              <div style={{
                flex: 1,
                height: ROW_H - 14,
                position: "relative",
                background: "rgba(255,255,255,0.035)",
                borderRadius: 2,
              }}>
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${color} 0%, rgba(255,255,255,0.24) 100%)`,
                  boxShadow: isHovered ? `0 0 18px ${color}66` : "none",
                }} />
              </div>
              <div className="mono tabular" style={{
                width: 62,
                textAlign: "right",
                color,
                fontSize: idx === 0 ? 16 : 13,
                fontWeight: 800,
              }}>
                {row.rca.toFixed(2)}
              </div>
              <div className="mono tabular" style={{
                width: 58,
                color: "var(--ink-2)",
                fontSize: 10,
              }}>
                {row.isRising ? "↑" : "↓"} {row.delta >= 0 ? "+" : ""}{row.delta.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        position: "absolute",
        right: 64,
        top: 302,
        width: 330,
        zIndex: 5,
        fontFamily: "var(--serif)",
      }}>
        <div style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--accent-warn)",
          marginBottom: 10,
        }}>
          标准化后的领跑者
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--ink-0)", lineHeight: 1.2 }}>
          {top?.name ?? "—"}
          <span className="mono tabular" style={{ color: "var(--accent-eu)", marginLeft: 12 }}>
            {top ? top.rca.toFixed(2) : "—"}
          </span>
        </div>
        <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)" }}>
          绝对量视图回答“谁合作最多”，RCA 视图回答“谁对华合作更集中”。数量小的国家也可能在标准化后浮上来。
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 22,
        }}>
          <SmallPanel value={`${aboveOne} / ${rows.length}`} label="高于 RCA=1 基准" color="#8bd0d5" />
          <SmallPanel value={`${rising} 国`} label="2011→2020 首尾上升" color="#aadd88" />
        </div>
      </div>

      <div style={{
        position: "absolute",
        left: 48,
        bottom: 6,
        right: 420,
        zIndex: 3,
        fontFamily: "var(--mono)",
        fontSize: 9,
        color: "var(--ink-2)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        lineHeight: 1.5,
        opacity: 0.7,
      }}>
        RCA 数据来自 public/data/viz/viz_rca_trajectories.json · 当前值按 2011–2020 年度 RCA 插值 · 颜色按 2011→2020 首尾变化判定
      </div>
    </>
  );
}

function SmallPanel({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(216,205,224,0.09)",
      borderRadius: 8,
      padding: "12px 14px",
    }}>
      <div className="mono tabular" style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{
        marginTop: 6,
        fontFamily: "var(--mono)",
        fontSize: 9,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--ink-2)",
        lineHeight: 1.4,
      }}>
        {label}
      </div>
    </div>
  );
}
