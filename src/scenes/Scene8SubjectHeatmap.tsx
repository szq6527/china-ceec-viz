import { useEffect, useMemo, useState } from "react";

interface Specialization {
  field_id: string;
  field_name: string;
  count: number;
  specialization_ratio: number;
}

interface CountrySubject {
  iso: string;
  name_cn: string;
  period_135_total: number;
  physics_share: number;
  physics_count: number;
  non_physics_total: number;
  specializations: Specialization[];
}

interface FieldMeta {
  name: string;
  moe_code: string | null;
  moe_cn: string | null;
}

interface SubjectSpecData {
  field_metadata: Record<string, FieldMeta>;
  countries: CountrySubject[];
}

const SOCIAL_HUMANITIES_FIELDS = new Set([
  "Social Sciences", "Arts and Humanities", "Economics, Econometrics and Finance",
  "Business, Management and Accounting", "Psychology", "Decision Sciences",
]);

interface Props {
  active: boolean;
}

export function Scene8SubjectHeatmap({ active }: Props) {
  const [data, setData] = useState<SubjectSpecData | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch("./data/viz/viz_subject_specialization.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!active) { setProgress(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 4800);
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Compute per-country category counts + global log-scale max
  const radarData = useMemo(() => {
    if (!data) return { countries: [] as Array<{ iso: string; name: string; total: number; phys: number; stem: number; sh: number; physLog: number; stemLog: number; shLog: number }>, maxLog: 1 };
    let globalMax = 1;
    const countries = data.countries.map((c) => {
      let stemCount = 0;
      let shCount = 0;
      for (const s of c.specializations) {
        if (s.field_name === "Physics and Astronomy") continue;
        if (SOCIAL_HUMANITIES_FIELDS.has(s.field_name)) {
          shCount += s.count;
        } else {
          stemCount += s.count;
        }
      }
      const phys = c.physics_count;
      const total = phys + stemCount + shCount;
      if (phys > globalMax) globalMax = phys;
      if (stemCount > globalMax) globalMax = stemCount;
      if (shCount > globalMax) globalMax = shCount;
      return { iso: c.iso, name: c.name_cn, total, phys, stem: stemCount, sh: shCount, physLog: 0, stemLog: 0, shLog: 0 };
    });
    const maxLog = Math.log10(globalMax + 1);
    return {
      countries: countries.map((c) => ({
        ...c,
        physLog: Math.log10(c.phys + 1) / maxLog,
        stemLog: Math.log10(c.stem + 1) / maxLog,
        shLog: Math.log10(c.sh + 1) / maxLog,
      })),
      maxLog,
    };
  }, [data]);

  if (!data) return null;

  const sorted = [...radarData.countries].sort((a, b) => b.total - a.total);
  const maxLog = radarData.maxLog;

  const W = 1440; const H = 780;
  const COLS = 4; const ROWS = 4;
  const marginX = 60; const marginTop = 195; const marginBot = 110;
  const cellW = (W - marginX * 2) / COLS;
  const cellH = (H - marginTop - marginBot) / ROWS;

  const radarR = Math.min(cellW, cellH) * 0.28;
  const radarCY = cellH * 0.44;

  // 3 axes at 120° apart: top=physics, bottom-right=STEM, bottom-left=SH
  const axisAngles = [
    { label: "物理", angle: -Math.PI / 2, color: "#9b8ea8" },
    { label: "理工医农", angle: Math.PI / 6, color: "#7ea8a4" },
    { label: "社科人文", angle: Math.PI * 5 / 6, color: "#c9a87c" },
  ];

  const axisEnd = (cx: number, cy: number, angle: number, r: number) => ({
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  });

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ position: "absolute", top: 42, left: 48, maxWidth: 380, zIndex: 5, pointerEvents: "none" }}>
        <div className="kicker">SCENE 09 · 学科指纹</div>
        <h1 className="headline" style={{ marginTop: 4, fontSize: "clamp(26px, 3.2vw, 42px)" }}>
          每个国家有自己的<br />
          <span style={{ color: "var(--accent-eu-glow)" }}>合作学科指纹</span>
        </h1>
        <p className="subhead" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
          三轴雷达图:物理(上)、理工医农(右下)、社科人文(左下),
          距离按 log(论文数) 缩放。物理主导 vs 多元化,一眼可见。
        </p>
      </div>

      {/* Top-right legend — 3 rows */}
      <div style={{
        position: "absolute", right: 150, top: 72, zIndex: 5, pointerEvents: "none",
        fontFamily: "var(--mono)", fontSize: 18, color: "var(--ink-2)",
        display: "flex", flexDirection: "column", gap: 6, letterSpacing: "0.12em",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#9b8ea8" }} />
          物理 (上轴)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#7ea8a4" }} />
          理工医农 (右下)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#c9a87c" }} />
          社科人文 (左下)
        </div>
      </div>

      {/* 4x4 grid */}
      <div style={{ position: "absolute", left: marginX, top: marginTop, zIndex: 2 }}>
        <svg width={W - marginX * 2} height={H - marginTop - marginBot}
          viewBox={`0 0 ${W - marginX * 2} ${H - marginTop - marginBot}`}>
          {sorted.map((c, idx) => {
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const cx = col * cellW + cellW / 2;
            const cy = row * cellH + radarCY;
            const visible = progress > idx * 0.035;

            // Polygon points
            const physEnd = axisEnd(cx, cy, axisAngles[0].angle, radarR * c.physLog);
            const stemEnd = axisEnd(cx, cy, axisAngles[1].angle, radarR * c.stemLog);
            const shEnd = axisEnd(cx, cy, axisAngles[2].angle, radarR * c.shLog);
            const polyPoints = `${physEnd.x},${physEnd.y} ${stemEnd.x},${stemEnd.y} ${shEnd.x},${shEnd.y}`;

            // Category with highest log value determines the fill color dominance
            const physDominant = c.physLog >= c.stemLog && c.physLog >= c.shLog;

            return (
              <g key={c.iso} opacity={visible ? 1 : 0}
                style={{ transition: "opacity 300ms ease" }}>

                {/* Grid rings (log scale: 0.25, 0.5, 0.75, 1.0) */}
                {[0.25, 0.5, 0.75, 1.0].map((frac) => {
                  const r = radarR * frac;
                  const pts = axisAngles.map((a) => {
                    const end = axisEnd(cx, cy, a.angle, r);
                    return `${end.x},${end.y}`;
                  }).join(" ");
                  return <polygon key={`ring-${frac}`} points={pts}
                    fill="none" stroke="rgba(201,194,173,0.06)" strokeWidth="0.6" />;
                })}

                {/* Axis lines */}
                {axisAngles.map((a) => {
                  const end = axisEnd(cx, cy, a.angle, radarR);
                  return <line key={`axis-${a.label}`} x1={cx} y1={cy} x2={end.x} y2={end.y}
                    stroke="rgba(201,194,173,0.1)" strokeWidth="0.6" />;
                })}

                {/* Filled polygon */}
                <polygon points={polyPoints}
                  fill={physDominant ? "rgba(45,203,140,0.18)" : "rgba(126,168,164,0.14)"}
                  stroke={physDominant ? "rgba(45,203,140,0.45)" : "rgba(126,168,164,0.4)"}
                  strokeWidth="1.2" />

                {/* Data points on each axis */}
                {[
                  { end: physEnd, color: "#9b8ea8", val: c.phys },
                  { end: stemEnd, color: "#7ea8a4", val: c.stem },
                  { end: shEnd, color: "#c9a87c", val: c.sh },
                ].map((dp, di) => (
                  <circle key={`dp-${di}`} cx={dp.end.x} cy={dp.end.y} r={2.8}
                    fill={dp.color} opacity={0.85} />
                ))}

                {/* Axis endpoint labels */}
                {axisAngles.map((a) => {
                  const end = axisEnd(cx, cy, a.angle, radarR + 8);
                  return <text key={`al-${a.label}`} x={end.x} y={end.y} textAnchor="middle"
                    fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="7.5">
                    {a.label}
                  </text>;
                })}

                {/* Country name */}
                <text x={cx} y={cy + radarR + 5} textAnchor="middle"
                  fill="var(--ink-0)" fontFamily="var(--serif)" fontSize="16" fontWeight="600">
                  {c.name}
                </text>
                <text x={cx} y={cy + radarR + 22} textAnchor="middle"
                  fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="12">
                  共 {c.total.toLocaleString()} 篇
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom insight + bridge → Scene 9 */}
      <div style={{
        position: "absolute", left: 48, right: 48, bottom: 14, zIndex: 4, pointerEvents: "none",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24,
        opacity: progress > 0.7 ? 1 : 0,
        transition: "opacity 600ms ease",
      }}>
        <div style={{ fontSize: 14, color: "var(--ink-1)", lineHeight: 1.5, fontFamily: "var(--serif)", maxWidth: 520 }}>
          捷克(物理4,639篇)和波兰(物理3,215篇)的物理轴极长;
          爱沙尼亚和拉脱维亚的轮廓则偏向生命科学与社科。
          <strong style={{ color: "var(--ink-0)" }}>每个国家有自己独特的合作节奏。</strong>
        </div>
        <div 
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}
          style={{ textAlign: "right", flexShrink: 0, maxWidth: 300, pointerEvents: progress > 0.7 ? "auto" : "none", cursor: progress > 0.7 ? "pointer" : "default" }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 6 }}>
            最后一问 →
          </div>
          <div style={{ fontSize: 17, color: "var(--ink-0)", fontWeight: 700, lineHeight: 1.3 }}>
            这些差异背后,有没有一条<br />
            <span style={{ color: "var(--accent-eu-glow)" }}>共同的规律</span>?
          </div>
        </div>
      </div>
    </div>
  );
}
