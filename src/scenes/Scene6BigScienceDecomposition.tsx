import { useEffect, useRef, useState, useCallback } from "react";

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
  "Biochemistry, Genetics and Molecular Biology": "生化与分子生物",
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

const FIELD_EN: Record<string, string> = {
  "Physics and Astronomy": "Physics & Astronomy",
  "Psychology": "Psychology",
  "Biochemistry, Genetics and Molecular Biology": "Biochemistry & Genetics",
  "Immunology and Microbiology": "Immunology",
  "Medicine": "Medicine",
  "Neuroscience": "Neuroscience",
  "Health Professions": "Health Professions",
  "Dentistry": "Dentistry",
  "Social Sciences": "Social Sciences",
  "Nursing": "Nursing",
  "Environmental Science": "Environmental Sci.",
  "Computer Science": "Computer Science",
  "Economics, Econometrics and Finance": "Economics & Finance",
  "Agricultural and Biological Sciences": "Agricultural & Bio",
  "Business, Management and Accounting": "Business",
  "Decision Sciences": "Decision Sciences",
  "Earth and Planetary Sciences": "Earth Sciences",
  "Engineering": "Engineering",
  "Materials Science": "Materials Science",
  "Mathematics": "Mathematics",
  "Energy": "Energy",
  "Chemistry": "Chemistry",
  "Chemical Engineering": "Chemical Engineering",
  "Pharmacology, Toxicology and Pharmaceutics": "Pharmacology",
  "Veterinary": "Veterinary",
  "Arts and Humanities": "Arts & Humanities",
};

function getOrbitInfo(pen: number): { label: string; desc: string; color: string } {
  if (pen >= 0.25)
    return { label: "CERN 轨道", desc: "大型对撞机实验署名驱动，一篇可覆盖数千作者", color: "#9b8ea8" };
  if (pen >= 0.05)
    return { label: "高渗透", desc: "存在相当比例的大科学论文，注意数据失真", color: "#c9a87c" };
  if (pen >= 0.01)
    return { label: "低渗透", desc: "少量大科学影响，合作数据基本可信", color: "#7ea8a4" };
  return { label: "双边轨道", desc: "大科学占比极低，合作论文完全反映真实双边关系", color: "#8fb8b0" };
}

function getBarColor(pen: number): string {
  if (pen >= 0.25) return "#9b8ea8";
  if (pen >= 0.05) return "#c9a87c";
  if (pen >= 0.01) return "#7ea8a4";
  return "#8fb8b0";
}

interface TooltipData {
  field: string;
  pen: number;
  total: number;
  avgPen: number;
  x: number;
  y: number;
}

/* ═══════════════════════════════════════════════════
   Tooltip — floating card, follows mouse
═══════════════════════════════════════════════════ */
function Tooltip({ data }: { data: TooltipData }) {
  const orbit = getOrbitInfo(data.pen);
  const isZero = data.pen < 0.001;
  const ratio = data.avgPen > 0 ? data.pen / data.avgPen : 0;
  const penPct = (data.pen * 100).toFixed(1);

  // Clamp tooltip so it doesn't go off-screen (app is 1440×900)
  const TW = 280, TH = 220;
  const left = Math.min(data.x + 16, 1440 - TW - 20);
  const top = Math.max(data.y - TH - 12, 10);

  return (
    <div
      style={{
        position: "absolute",
        left, top,
        width: TW,
        zIndex: 50,
        pointerEvents: "none",
        fontFamily: "var(--mono)",
        animation: "tooltipIn 160ms cubic-bezier(0.4,0,0.2,1) both",
      }}
    >
      {/* Card */}
      <div style={{
        background: "rgba(8, 6, 20, 0.97)",
        border: `1px solid ${orbit.color}44`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px ${orbit.color}22, 0 0 30px ${orbit.color}18`,
        backdropFilter: "blur(16px)",
      }}>

        {/* Header strip */}
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: `1px solid ${orbit.color}22`,
          background: `linear-gradient(135deg, ${orbit.color}10 0%, transparent 100%)`,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
            color: orbit.color, marginBottom: 4,
          }}>
            {FIELD_EN[data.field] || data.field}
          </div>
          <div style={{
            fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700,
            color: "var(--ink-0)", letterSpacing: 0,
          }}>
            {FIELD_SHORT[data.field] || data.field}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Penetration rate — hero number */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--ink-2)", textTransform: "uppercase", marginBottom: 2 }}>
                大科学渗透率
              </div>
              <div style={{
                fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700,
                color: orbit.color, letterSpacing: "-0.03em", lineHeight: 1,
              }}>
                {isZero ? "0%" : `${penPct}%`}
              </div>
            </div>

            {/* Mini comparison bar */}
            <div style={{ flex: 1, paddingBottom: 6 }}>
              <div style={{ fontSize: 9, color: "var(--ink-2)", marginBottom: 4 }}>
                vs CEEC均值 {(data.avgPen * 100).toFixed(1)}%
              </div>
              <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                {/* avg marker */}
                <div style={{
                  position: "absolute",
                  left: `${Math.min((data.avgPen / Math.max(data.pen, data.avgPen * 1.1)) * 100, 100)}%`,
                  top: 0, bottom: 0, width: 1,
                  background: "rgba(201,194,173,0.5)",
                }} />
                {/* fill */}
                <div style={{
                  height: "100%",
                  width: `${Math.min((data.pen / Math.max(data.pen, data.avgPen * 1.1)) * 100, 100)}%`,
                  background: orbit.color,
                  borderRadius: 3,
                  minWidth: isZero ? 2 : 0,
                }} />
              </div>
              {!isZero && ratio > 0 && (
                <div style={{ fontSize: 9, color: orbit.color, marginTop: 3 }}>
                  {ratio >= 1
                    ? `均值的 ${ratio.toFixed(1)}×`
                    : `均值的 ${(ratio * 100).toFixed(0)}%`}
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}>
            <div style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px",
            }}>
              <div style={{ fontSize: 9, color: "var(--ink-2)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>
                总论文数
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-0)" }}>
                {data.total.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: "var(--ink-2)" }}>篇（2016–2020）</div>
            </div>

            <div style={{
              background: `${orbit.color}10`,
              border: `1px solid ${orbit.color}30`,
              borderRadius: 8, padding: "8px 10px",
            }}>
              <div style={{ fontSize: 9, color: "var(--ink-2)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>
                合作类型
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: orbit.color, letterSpacing: "0.02em" }}>
                {orbit.label}
              </div>
              <div style={{ fontSize: 9, color: `${orbit.color}99`, marginTop: 1, lineHeight: 1.4 }}>
                &nbsp;
              </div>
            </div>
          </div>

          {/* Orbit description */}
          <div style={{
            fontSize: 11, color: "var(--ink-2)", lineHeight: 1.6,
            fontFamily: "var(--serif)", letterSpacing: 0,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
            borderLeft: `2px solid ${orbit.color}55`,
          }}>
            {orbit.desc}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Scene
═══════════════════════════════════════════════════ */
export function Scene6BigScienceDecomposition({ active }: Props) {
  const [data, setData] = useState<PenetrationData | null>(null);
  const [progress, setProgress] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("./data/viz/viz_subject_penetration.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) { setProgress(0); setTooltip(null); return; }
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 3000);
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [active]);

  const handleMouseMove = useCallback((e: React.MouseEvent, field: FieldPenetration) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      field: field.field,
      pen: field.big_penetration,
      total: field.total,
      avgPen: data?.ceec_avg_penetration ?? 0.056,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, [data]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!data) return null;

  const physicsField = data.fields.find((f) => f.field === "Physics and Astronomy");
  const otherFields = [...data.fields]
    .filter((f) => f.field !== "Physics and Astronomy")
    .sort((a, b) => b.big_penetration - a.big_penetration)
    .slice(0, 13);

  const maxPen = physicsField?.big_penetration ?? 0.35;
  const showAnnotations = progress > 0.7;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, background: "var(--bg-0)", overflow: "hidden" }}
    >
      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>

      {/* ── Left panel ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: 300,
        padding: "40px 28px 36px",
        borderRight: "1px solid rgba(201,194,173,0.07)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 14 }}>
          SCENE 07 · 两个合作世界
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 900, fontSize: 30, lineHeight: 1.2, margin: 0 }}>
          物理学<br />
          <span style={{ color: "#9b8ea8" }}>35%</span> 被大科学<br />
          渗透，其余<br />
          近乎 <span style={{ color: "#8fb8b0" }}>零</span>
        </h1>
        <p style={{ fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", marginTop: 18 }}>
          大科学论文（≥100 作者）在各学科的渗透率天差地别。CERN"署名效应"让物理学独成一档——
          <strong style={{ color: "var(--ink-1)" }}>悬停柱条查看各学科详情。</strong>
        </p>

        <div style={{ height: 1, background: "rgba(201,194,173,0.08)", margin: "22px 0" }} />

        {/* Three key stats */}
        {[
          { v: `${((physicsField?.big_penetration ?? 0.35) * 100).toFixed(0)}%`, l: "物理学渗透率", c: "#9b8ea8" },
          { v: `${(data.ceec_avg_penetration * 100).toFixed(1)}%`, l: "各学科均值", c: "var(--accent-warn)" },
          { v: "4.5×", l: "物理 vs 第二名（心理学）", c: "#7ea8a4" },
        ].map(({ v, l, c }) => (
          <div key={l} style={{ marginBottom: 20, opacity: progress, transition: "opacity 500ms" }}>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 28, color: c, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-2)", marginTop: 4 }}>{l}</div>
          </div>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, fontFamily: "var(--serif)", color: "var(--ink-2)", lineHeight: 1.6, opacity: showAnnotations ? 1 : 0, transition: "opacity 600ms" }}>
          <span style={{ color: "#8fb8b0" }}>零渗透学科</span>才是真正双边关系生长的土壤。
        </div>
      </div>

      {/* ── Right chart panel: vertically centered bars ── */}
      <div style={{
        position: "absolute", top: 0, left: 300, right: 0, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* 🔧 条形图整体垂直偏移：负值=上移，正值=下移，调整此数值即可微调 */}
        <div style={{ width: "100%", padding: "0 48px 0 40px", transform: "translateY(-22%)" }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "140px 1fr 54px",
            gap: 12, marginBottom: 14,
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--ink-2)",
          }}>
            <div style={{ textAlign: "right" }}>学科</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>渗透率分布（悬停查看详情）</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 14, height: 1, background: "rgba(201,194,173,0.4)", verticalAlign: "middle" }} />
                均值
              </span>
            </div>
            <div style={{ textAlign: "right" }}>渗透率</div>
          </div>

          {/* Physics hero */}
          {physicsField && (
            <div style={{ marginBottom: 12 }}>
              <BarRow
                field={physicsField}
                maxPen={maxPen}
                avgPen={data.ceec_avg_penetration}
                progress={progress}
                animDelay={0}
                isPhysics
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />
            </div>
          )}

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
            opacity: progress > 0.25 ? 1 : 0, transition: "opacity 400ms",
          }}>
            <div style={{ height: 1, flex: 1, background: "rgba(201,194,173,0.09)" }} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--ink-2)", textTransform: "uppercase" }}>
              其他学科（按渗透率排序）
            </div>
            <div style={{ height: 1, flex: 1, background: "rgba(201,194,173,0.09)" }} />
          </div>

          {/* Other bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {otherFields.map((f, i) => (
              <BarRow
                key={f.field}
                field={f}
                maxPen={maxPen}
                avgPen={data.ceec_avg_penetration}
                progress={progress}
                animDelay={80 + i * 55}
                isPhysics={false}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />
            ))}
          </div>
        </div>

        {/* Next scene cue */}
        <div
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))}
          style={{
            position: "absolute", right: 48, bottom: 36, textAlign: "right",
            pointerEvents: showAnnotations ? "auto" : "none", cursor: showAnnotations ? "pointer" : "default",
            opacity: showAnnotations ? 1 : 0, transition: "opacity 800ms",
          }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 4 }}>
            下一个问题 →
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", lineHeight: 1.4, fontFamily: "var(--serif)" }}>
            剥离物理学后，各国真正的双边合作是哪些学科?
          </div>
        </div>
      </div>

      {/* ── Floating tooltip (portal-style, absolute over whole scene) ── */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Bar Row — clean grid, no text inside bar
═══════════════════════════════════════════════════ */
function BarRow({
  field, maxPen, avgPen, progress, animDelay, isPhysics, onMouseMove, onMouseLeave,
}: {
  field: FieldPenetration;
  maxPen: number; avgPen: number; progress: number; animDelay: number; isPhysics: boolean;
  onMouseMove: (e: React.MouseEvent, f: FieldPenetration) => void;
  onMouseLeave: () => void;
}) {
  const pen = field.big_penetration;
  const isZero = pen < 0.001;
  const color = getBarColor(pen);
  const orbit = getOrbitInfo(pen);
  const barW = isZero ? 0.6 : (pen / maxPen) * 100;
  const avgX = (avgPen / maxPen) * 100;
  const barH = isPhysics ? 38 : 16;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseMove={(e) => { setHovered(true); onMouseMove(e, field); }}
      onMouseLeave={() => { setHovered(false); onMouseLeave(); }}
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr 54px",
        alignItems: "center",
        gap: 12,
        opacity: progress > 0.05 ? 1 : 0,
        transition: `opacity 300ms ease ${animDelay}ms`,
        cursor: "crosshair",
      }}
    >
      {/* Label — always readable, never inside bar */}
      <div style={{
        fontFamily: "var(--serif)",
        fontSize: isPhysics ? 14 : 12,
        fontWeight: isPhysics ? 700 : 400,
        color: hovered ? "var(--ink-0)" : "var(--ink-1)",
        textAlign: "right",
        lineHeight: 1.2,
        transition: "color 120ms",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {FIELD_SHORT[field.field] || field.field}
      </div>

      {/* Bar — only graphics, no text */}
      <div style={{
        position: "relative",
        height: barH,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 5,
        overflow: "hidden",
        border: hovered ? `1px solid ${color}55` : `1px solid ${color}18`,
        transition: "border-color 120ms",
      }}>
        {/* Fill */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${barW * (progress)}%`,
          background: isPhysics
            ? "linear-gradient(90deg, #7d6f8a 0%, #9b8ea8 65%, #b8a0b8 100%)"
            : isZero
            ? `${color}30`
            : color,
          opacity: isZero ? 1 : 0.85,
          borderRadius: 5,
          boxShadow: hovered ? `0 0 18px ${color}66` : "none",
          transition: `width 900ms cubic-bezier(0.65,0,0.35,1) ${animDelay}ms, box-shadow 120ms`,
        }} />
        {/* Zero stub line */}
        {isZero && (
          <div style={{
            position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2,
            background: color, borderRadius: 2,
          }} />
        )}
        {/* Average marker */}
        <div style={{
          position: "absolute", left: `${avgX}%`, top: 0, bottom: 0, width: 1,
          background: "rgba(201,194,173,0.28)",
        }} />
        {/* Orbit badge — top-right inside bar, only for physics or on hover */}
        {(isPhysics || hovered) && !isZero && (
          <div style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            padding: "2px 8px",
            background: `${color}22`,
            border: `1px solid ${color}55`,
            borderRadius: 20,
            fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em",
            color: color,
            opacity: isPhysics ? 1 : hovered ? 1 : 0,
            transition: "opacity 120ms",
            whiteSpace: "nowrap",
          }}>
            {orbit.label}
          </div>
        )}
      </div>

      {/* Percentage — always outside bar */}
      <div style={{
        fontFamily: "var(--mono)",
        fontSize: isPhysics ? 17 : 12,
        fontWeight: 700,
        color: hovered ? color : `${color}cc`,
        textAlign: "right",
        transition: "color 120ms",
        whiteSpace: "nowrap",
      }}>
        {isZero ? "0%" : `${(pen * 100).toFixed(1)}%`}
      </div>
    </div>
  );
}
