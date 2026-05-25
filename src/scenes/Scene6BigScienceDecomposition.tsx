import { useEffect, useState } from "react";

interface FieldPenetration {
  field: string;
  total: number;
  big_penetration: number;
  small_growth: number;
}

interface PenetrationData {
  description: string;
  ceec_avg_penetration: number;
  fields: FieldPenetration[];
}

interface Props {
  active: boolean;
}

const FIELD_SHORT: Record<string, string> = {
  "Physics and Astronomy": "物理与天文",
  "Psychology": "心理学",
  "Biochemistry, Genetics and Molecular Biology": "生化与分子生物学",
  "Immunology and Microbiology": "免疫与微生物",
  "Medicine": "医学",
  "Neuroscience": "神经科学",
  "Health Professions": "健康专业",
  "Dentistry": "牙科",
  "Social Sciences": "社会科学",
  "Nursing": "护理学",
  "Environmental Science": "环境科学",
  "Computer Science": "计算机科学",
  "Economics, Econometrics and Finance": "经济与金融",
  "Agricultural and Biological Sciences": "农业与生物",
  "Business, Management and Accounting": "商业管理",
  "Decision Sciences": "决策科学",
  "Earth and Planetary Sciences": "地球与行星科学",
  "Engineering": "工程学",
  "Materials Science": "材料科学",
  "Mathematics": "数学",
  "Energy": "能源",
  "Chemistry": "化学",
  "Chemical Engineering": "化学工程",
  "Pharmacology, Toxicology and Pharmaceutics": "药学与毒理",
  "Veterinary": "兽医学",
  "Arts and Humanities": "人文艺术",
};

export function Scene6BigScienceDecomposition({ active }: Props) {
  const [data, setData] = useState<PenetrationData | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"bars" | "annotations">("bars");

  useEffect(() => {
    fetch("./data/viz/viz_subject_penetration.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!active) { setProgress(0); setPhase("bars"); return; }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 4500);
      const e = 1 - Math.pow(1 - t, 3);
      setProgress(e);
      if (t < 0.6) setPhase("bars");
      else setPhase("annotations");
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!data) return null;

  const physicsField = data.fields.find((f) => f.field === "Physics and Astronomy");
  // Keep only fields with meaningful penetration (>= 0.8%), trim the noise
  const nonPhysics = data.fields.filter(
    (f) => f.field !== "Physics and Astronomy" && f.big_penetration >= 0.008
  );
  // Fields that were trimmed (low / zero penetration)
  const trimmedFields = data.fields.filter(
    (f) => f.field !== "Physics and Astronomy" && f.big_penetration < 0.008
  );
  const maxPen = physicsField?.big_penetration ?? 0.35;

  const W = 1440; const H = 780;
  const padL = 200; const padR = 370; const padT = 215; const padB = 90;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const totalFields = nonPhysics.length;
  const rowH = Math.min(26, (plotH - 60) / (totalFields + 2));
  const totalH = (totalFields + 2) * rowH + 12;
  const startY = padT + (plotH - totalH) / 2;

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}>
      {/* Header — kept tighter to avoid bar overlap */}
      <div style={{ position: "absolute", top: 36, left: 48, maxWidth: 520, zIndex: 5, pointerEvents: "none" }}>
        <div className="kicker">SCENE 06 · 两个合作世界</div>
        <h1 className="headline" style={{ marginTop: 4, fontSize: "clamp(24px, 3vw, 38px)", lineHeight: 1.25 }}>
          物理学 <span style={{ color: "#c77dff" }}>35%</span> 被大科学渗透,
          <br />化学工程 <span style={{ color: "#80ed99" }}>0%</span>
        </h1>
        <p className="subhead" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
          大科学论文(≥100作者)在不同学科中的渗透率天差地别。物理与天文的35%独成一档——
          CERN/ATLAS/CMS对撞机实验的"署名效应"。而化学、药学等学科几乎为零。
        </p>
      </div>

      {/* Right: key stat */}
      <div style={{
        position: "absolute", top: 52, right: 52, zIndex: 5, pointerEvents: "none",
        textAlign: "right", fontFamily: "var(--serif)",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>
          CEEC总体 2016-2020
        </div>
        <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.7 }}>
          大科学渗透率均值: <span style={{ color: "var(--ink-0)", fontWeight: 700 }}>{(data.ceec_avg_penetration * 100).toFixed(1)}%</span>
        </div>
      </div>

      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, zIndex: 2 }}>

        {/* Reference line at CEEC average */}
        <line x1={padL + (data.ceec_avg_penetration / maxPen) * plotW}
          x2={padL + (data.ceec_avg_penetration / maxPen) * plotW}
          y1={padT - 12} y2={padT + plotH}
          stroke="rgba(201,194,173,0.15)" strokeWidth="1" strokeDasharray="4 6" />
        <text x={padL + (data.ceec_avg_penetration / maxPen) * plotW} y={padT - 18} textAnchor="middle"
          fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="9">
          CEEC均值 5.6%
        </text>

        {/* Physics — giant bar */}
        {physicsField && (() => {
          const y = startY;
          const bw = (physicsField.big_penetration / maxPen) * plotW;
          const barH = rowH * 2.2;
          return (
            <g opacity={progress}>
              <text x={padL - 10} y={y + barH / 2 + 3} textAnchor="end"
                fill="var(--ink-0)" fontFamily="var(--serif)" fontSize="13" fontWeight="700">
                {FIELD_SHORT[physicsField.field] || physicsField.field}
              </text>
              <text x={padL - 10} y={y + barH / 2 + 19} textAnchor="end"
                fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="9">
                {physicsField.total.toLocaleString()} 篇
              </text>
              <rect x={padL} y={y + 2} width={bw} height={barH - 4} rx="3"
                fill="#c77dff" opacity={0.85} />
              <text x={padL + bw + 8} y={y + barH / 2 + 4}
                fill="#c77dff" fontFamily="var(--mono)" fontSize="13" fontWeight="700">
                {(physicsField.big_penetration * 100).toFixed(1)}%
              </text>
            </g>
          );
        })()}

        {/* Separator */}
        <line x1={padL - 10} y1={startY + rowH * 2.2 + 10}
          x2={padL + plotW + 24} y2={startY + rowH * 2.2 + 10}
          stroke="rgba(201,194,173,0.18)" strokeWidth="1" />

        {/* Non-physics fields */}
        {nonPhysics.map((f, i) => {
          const y = startY + rowH * 2.2 + 16 + i * rowH;
          const bw = Math.max(2, (f.big_penetration / maxPen) * plotW);
          const visible = progress > 0.1 + i * 0.025;
          const isZero = f.big_penetration < 0.001;
          const color = isZero ? "#80ed99" :
            f.big_penetration < 0.02 ? "#c9c2ad" :
            f.big_penetration < 0.05 ? "#f5b14a" : "#ff8366";
          return (
            <g key={f.field} opacity={visible ? 1 : 0}
              style={{ transition: "opacity 200ms ease" }}>
              <text x={padL - 10} y={y + rowH / 2 + 3} textAnchor="end"
                fill="var(--ink-0)" fontFamily="var(--serif)" fontSize="11">
                {FIELD_SHORT[f.field] || f.field}
              </text>
              <rect x={padL} y={y + 1} width={isZero ? 4 : bw} height={Math.max(2, rowH - 2)} rx="2"
                fill={color} opacity={isZero ? 0.65 : 0.92} />
              <text x={padL + Math.max(isZero ? 8 : bw + 6, 10)} y={y + rowH / 2 + 3}
                fill={color} fontFamily="var(--mono)" fontSize="10" fontWeight="600">
                {isZero ? "0%" : `${(f.big_penetration * 100).toFixed(1)}%`}
              </text>
            </g>
          );
        })}

        {/* Trimmed fields note */}
        <text x={padL} y={startY + rowH * 2.2 + 16 + nonPhysics.length * rowH + 20}
          fill="var(--ink-2)" fontFamily="var(--serif)" fontSize="10"
          opacity={progress > 0.7 ? 0.6 : 0}>
          ↑ 以上为前{nonPhysics.length}大学科。其余{trimmedFields.length}个学科大科学渗透率均 &lt;0.7%
          （化学、材料、工程、数学、能源、地球科学、决策科学、药学、人文艺术等）
        </text>

        {/* Annotations */}
        {phase === "annotations" && (
          <>
            <rect x={padL + plotW + 24} y={startY + 6} width={120} height={28} rx="4"
              fill="rgba(199,125,255,0.08)" stroke="rgba(199,125,255,0.25)" strokeWidth="1" />
            <text x={padL + plotW + 84} y={startY + 17} textAnchor="middle"
              fill="#c77dff" fontFamily="var(--serif)" fontSize="11" fontWeight="600">
              CERN 轨道
            </text>
            <text x={padL + plotW + 84} y={startY + 28} textAnchor="middle"
              fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="8">
              大型合作实验署名
            </text>

            <rect x={padL + plotW + 24} y={startY + rowH * 2.2 + plotH * 0.62} width={120} height={28} rx="4"
              fill="rgba(128,237,153,0.08)" stroke="rgba(128,237,153,0.25)" strokeWidth="1" />
            <text x={padL + plotW + 84} y={startY + rowH * 2.2 + plotH * 0.62 + 14} textAnchor="middle"
              fill="#80ed99" fontFamily="var(--serif)" fontSize="11" fontWeight="600">
              双边轨道
            </text>
            <text x={padL + plotW + 84} y={startY + rowH * 2.2 + plotH * 0.62 + 25} textAnchor="middle"
              fill="var(--ink-2)" fontFamily="var(--mono)" fontSize="8">
              真正的小规模合作
            </text>

            <line x1={padL + plotW + 24} y1={startY + rowH / 2}
              x2={padL + plotW} y2={startY + rowH / 2}
              stroke="rgba(199,125,255,0.3)" strokeWidth="0.8" />
            <line x1={padL + plotW + 24} y1={startY + rowH * 2.2 + plotH * 0.76}
              x2={padL + plotW} y2={startY + rowH * 2.2 + plotH * 0.76}
              stroke="rgba(128,237,153,0.3)" strokeWidth="0.8" />
          </>
        )}
      </svg>

      {/* Bottom insight */}
      <div style={{
        position: "absolute", left: 48, right: 48, bottom: 26, zIndex: 4, pointerEvents: "none",
        opacity: phase === "annotations" ? progress : 0,
        transition: "opacity 600ms ease",
        display: "flex", gap: 50, alignItems: "flex-end",
      }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>
            关键发现
          </div>
          <div style={{ fontSize: 15, color: "var(--ink-1)", lineHeight: 1.6, fontFamily: "var(--serif)" }}>
            大科学 ≠ 物理学,但物理学中的大科学渗透率(35%)是第二名(心理学7.8%)的4.5倍。<br />
            零渗透的学科才是真正双边关系生长的土壤。
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 4 }}>
            下一个问题 →
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)", lineHeight: 1.4 }}>
            剥离物理学,各国真正的<br />
            双边合作是哪些学科?
          </div>
        </div>
      </div>
    </div>
  );
}
