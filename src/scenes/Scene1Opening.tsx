import { useEffect, useRef, useState } from "react";
import { WorldMap } from "../components/WorldMap";
import type { AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

export function Scene1Opening({ data, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [progress, setProgress] = useState(0);
  const [year, setYear] = useState(2011);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drive the arc-drawing animation (4s) when scene becomes active
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 4000;
      setProgress(Math.min(1, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Year ticker: spans 2011→2020 over 4 seconds, then sticks at 2020
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const total = 4000;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / total);
      const y = Math.round(2011 + t * 9);
      setYear(y);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const max135 = Math.max(...data.perCountry.map((d) => d.count_135));
  // perCountry is already sorted by count_135 desc — index = rank-1
  const arcs = data.perCountry.map((d, idx) => ({
    iso: d.iso,
    weight: Math.pow(d.count_135 / max135, 0.5),
    delay: 0.15 + idx * 0.12,
    rank: idx + 1,
    highlight: d.iso === "POL",
  }));

  const totalCEEC = data.yearly[data.yearly.length - 1].ceec;
  const totalCEEC11 = data.yearly[0].ceec;
  const cumulative = data.yearly.reduce((a, d) => a + d.ceec, 0);
  const yearDatum = data.yearly.find((d) => d.year === year) ?? data.yearly[0];

  return (
    <div ref={ref} className="scene-1" style={{ position: "absolute", inset: 0 }}>
      <WorldMap
        beijing={data.countries.beijing}
        countries={data.countries.ceec}
        arcs={arcs}
        width={size.w}
        height={size.h}
        progress={progress}
      />

      {/* Top-left: kicker + headline (kept narrow so it doesn't crash into the arc bundle) */}
      <div style={{ position: "absolute", top: 56, left: 48, maxWidth: 420, zIndex: 2 }}>
        <div className="kicker">SCENE 01 · 最热的友谊</div>
        <h1 className="headline" style={{ marginTop: 4, fontSize: "clamp(28px, 3.4vw, 48px)" }}>
          十年,从北京<br />
          连向 <span style={{ color: "var(--accent-eu-glow)" }}>中东欧 16 国</span><br />
          的弧光
        </h1>
        <p className="subhead" style={{ marginTop: 14, fontSize: 15 }}>
          2011–2020 年,中国与中东欧 16 国的合作论文从 <strong>1,046</strong> 篇增长到{" "}
          <strong>4,791</strong> 篇 —— 看起来,这是一场科技外交的盛宴。
        </p>
      </div>

      {/* Bottom: counters */}
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 40,
          display: "flex",
          gap: 56,
          zIndex: 2,
          flexWrap: "wrap",
        }}
      >
        <Counter label="当前年度" value={String(year)} mono />
        <Counter label="当年合作论文" value={yearDatum.ceec.toLocaleString()} mono />
        <Counter label="十年累计" value={cumulative.toLocaleString()} mono />
        <Counter label="增长倍数" value={`${(totalCEEC / totalCEEC11).toFixed(1)}×`} mono />
      </div>

      {/* Right: leaderboard of top 6 partner countries with mini bars */}
      <Leaderboard data={data} />

      {/* Top-right: tiny legend */}
      <div
        style={{
          position: "absolute",
          right: 48,
          top: 70,
          textAlign: "right",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          color: "var(--ink-2)",
          textTransform: "uppercase",
          zIndex: 2,
          lineHeight: 1.8,
        }}
      >
        <div>
          <span style={{ color: "var(--accent-cn-glow)" }}>●</span>&nbsp;&nbsp;北京 / 中国
        </div>
        <div>
          <span style={{ color: "var(--accent-eu-glow)" }}>●</span>&nbsp;&nbsp;中东欧 16 国
        </div>
        <div style={{ marginTop: 6, color: "var(--ink-2)" }}>
          弧线粗细 = 十三五合作论文量
        </div>
      </div>
    </div>
  );
}

function Counter({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className={mono ? "stat-big mono tabular" : "stat-big"}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Leaderboard({ data }: { data: AppData }) {
  const top6 = data.perCountry.slice(0, 6);
  const max = top6[0].count_135;
  return (
    <div
      style={{
        position: "absolute",
        right: 48,
        top: 170,
        width: 280,
        zIndex: 2,
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
          marginBottom: 14,
        }}
      >
        TOP 6 / 2016 — 2020
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top6.map((d, i) => {
          const w = (d.count_135 / max) * 100;
          return (
            <div key={d.iso}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                <span>
                  <span
                    className="mono"
                    style={{ color: "var(--ink-2)", fontSize: 11, marginRight: 8 }}
                  >
                    0{i + 1}
                  </span>
                  <span style={{ color: "var(--ink-0)" }}>{d.name_cn}</span>
                </span>
                <span
                  className="mono tabular"
                  style={{ color: "var(--ink-1)", fontSize: 13 }}
                >
                  {d.count_135.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: 3,
                  background: "rgba(76, 201, 240, 0.1)",
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
                      "linear-gradient(90deg, var(--accent-eu) 0%, var(--accent-eu-glow) 100%)",
                    boxShadow: "0 0 12px var(--accent-eu-glow)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
