import { useEffect, useMemo, useState } from "react";
import type { AppData, AppData as _AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

/**
 * Scene 6 ── 「剥离 CERN,真实双边长这样」
 *
 * Each country is a horizontal stacked bar. Two states:
 *   A "完整数据" — full bar, segments by major subject (Physics + Astronomy = purple,
 *      Medicine = warm orange, Materials = gold, Biology = teal, Chemistry = green,
 *      Other = grey).
 *   B "剥离物理 + 天文" — physics & astronomy segments collapse, revealing what
 *      truly bilateral cooperation looks like outside CERN-style mega papers.
 *
 * Auto-loops A → B → A every 4 s while scene is active.
 */
const PHYS_CODES = new Set(["0702", "0704"]); // Physics, Astronomy
const MED_CODES = new Set(["1002", "1001"]);  // Clinical, Basic Medicine
const MAT_CODES = new Set(["0805"]);          // Materials Science & Engineering
const BIO_CODES = new Set(["0710"]);          // Biology
const CHEM_CODES = new Set(["0703"]);         // Chemistry
const NUC_CODES = new Set(["0827"]);          // Nuclear Science (treat as physics-adjacent)

type Bucket = "physics" | "medicine" | "materials" | "biology" | "chemistry" | "other";

const BUCKET_COLOR: Record<Bucket, string> = {
  physics: "#c77dff",
  medicine: "#ff8366",
  materials: "#f5b14a",
  biology: "#4cc9f0",
  chemistry: "#80ed99",
  other: "rgba(201,194,173,0.18)",
};

const BUCKET_LABEL: Record<Bucket, string> = {
  physics: "物理 + 天文 + 核",
  medicine: "医学",
  materials: "材料",
  biology: "生物",
  chemistry: "化学",
  other: "其他",
};

function bucketFor(code: string): Bucket {
  if (PHYS_CODES.has(code) || NUC_CODES.has(code)) return "physics";
  if (MED_CODES.has(code)) return "medicine";
  if (MAT_CODES.has(code)) return "materials";
  if (BIO_CODES.has(code)) return "biology";
  if (CHEM_CODES.has(code)) return "chemistry";
  return "other";
}

interface CountryBuckets {
  iso: string;
  name: string;
  total: number;
  buckets: Record<Bucket, number>;
  physicsShare: number;
  realBilateral: number; // total - physics
}

export function Scene6RealBilateral({ data, active }: Props) {
  const [stripped, setStripped] = useState(false);

  // Auto-loop A → B → A while active
  useEffect(() => {
    if (!active) {
      setStripped(false);
      return;
    }
    setStripped(false);
    const id = setInterval(() => setStripped((s) => !s), 4000);
    return () => clearInterval(id);
  }, [active]);

  const rows: CountryBuckets[] = useMemo(() => {
    return data.perCountry
      // Only countries with subject-level data (2 are backfilled, no subject breakdown)
      .filter((c) => !!data.countrySubjects[c.iso])
      .map((c) => {
        const cs = data.countrySubjects[c.iso];
        const buckets: Record<Bucket, number> = {
          physics: 0,
          medicine: 0,
          materials: 0,
          biology: 0,
          chemistry: 0,
          other: 0,
        };
        if (cs) {
          for (const s of cs.subjects) {
            buckets[bucketFor(s.code)] += s.count;
          }
        }
        // "other" gets the residual so the bar still sums to count_135
        const known = Object.values(buckets).reduce((a, b) => a + b, 0);
        buckets.other += Math.max(0, c.count_135 - known);
        return {
          iso: c.iso,
          name: c.name_cn,
          total: c.count_135,
          buckets,
          physicsShare: buckets.physics / c.count_135,
          realBilateral: c.count_135 - buckets.physics,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data]);

  // Aggregate physics share across all CEEC (135 group)
  const groupTotal = rows.reduce((a, b) => a + b.total, 0);
  const groupPhysics = rows.reduce((a, b) => a + b.buckets.physics, 0);
  const groupPhysicsShare = groupPhysics / groupTotal;

  const max = rows[0]?.total ?? 1;

  // Most "diverse" (lowest physics share) and most physics-pure
  const sortedByDiversity = [...rows].sort((a, b) => a.physicsShare - b.physicsShare);
  const mostDiverse = sortedByDiversity[0];
  const mostPhysics = sortedByDiversity[sortedByDiversity.length - 1];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-0)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
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
        <div className="kicker">SCENE 07 · 真正的双边</div>
        <h1
          className="headline"
          style={{ marginTop: 4, fontSize: "clamp(26px, 3.2vw, 44px)" }}
        >
          剥离物理与天文,<br />
          <span style={{ color: "var(--accent-physics)" }}>真实双边</span> 长这样
        </h1>
        <p className="subhead" style={{ marginTop: 14, fontSize: 15 }}>
          中欧合作论文里,物理学 + 天文学(含核)合占{" "}
          <strong style={{ color: "var(--accent-physics)" }}>
            {(groupPhysicsShare * 100).toFixed(0)}%
          </strong>
          。把它们剥离出去,各国的合作版图被重新画出。
        </p>
      </div>

      {/* Mode indicator */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 64,
          textAlign: "right",
          fontFamily: "var(--mono)",
          color: stripped ? "var(--accent-warn)" : "var(--ink-1)",
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          模式 · MODE
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginTop: 4,
            color: stripped ? "var(--accent-warn)" : "var(--ink-0)",
            transition: "color 600ms ease",
          }}
        >
          {stripped ? "剥离物理 + 天文" : "完整数据"}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, letterSpacing: "0.16em" }}>
          每 4 秒自动切换
        </div>
      </div>

      {/* Bars */}
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: "clamp(210px, 32vh, 245px)",
          bottom: "clamp(112px, 18vh, 150px)",
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          gap: "clamp(3px, 0.55vh, 7px)",
        }}
      >
        {rows.map((row) => {
          const fullW = (row.total / max) * 100;
          const strippedW = (row.realBilateral / max) * 100;
          const barW = stripped ? strippedW : fullW;
          return (
            <div
              key={row.iso}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontFamily: "var(--serif)",
                minHeight: 0,
              }}
            >
              {/* Country name */}
              <div
                style={{
                  width: 90,
                  fontSize: "clamp(12px, 1.35vh, 16px)",
                  color: "var(--ink-1)",
                  textAlign: "right",
                }}
              >
                {row.name}
              </div>

              {/* Stacked bar */}
              <div
                style={{
                  flex: 1,
                  height: "clamp(10px, 1.25vh, 18px)",
                  position: "relative",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${barW}%`,
                    transition: "width 1200ms cubic-bezier(0.65, 0, 0.35, 1)",
                    display: "flex",
                  }}
                >
                  {(["physics", "medicine", "materials", "biology", "chemistry", "other"] as Bucket[]).map(
                    (b) => {
                      const segVal = row.buckets[b];
                      // when stripped, physics segment collapses to 0
                      const adj = stripped && b === "physics" ? 0 : segVal;
                      const flex = adj / (stripped ? row.realBilateral || 1 : row.total);
                      if (flex <= 0) return null;
                      return (
                        <div
                          key={b}
                          style={{
                            flex: flex,
                            background: BUCKET_COLOR[b],
                            transition: "flex 1200ms cubic-bezier(0.65, 0, 0.35, 1)",
                          }}
                        />
                      );
                    }
                  )}
                </div>
              </div>

              {/* Right: total + physics share */}
              <div
                className="mono tabular"
                style={{
                  width: 70,
                  textAlign: "right",
                  fontSize: "clamp(12px, 1.3vh, 15px)",
                  color: "var(--ink-1)",
                }}
              >
                {(stripped ? row.realBilateral : row.total).toLocaleString()}
              </div>
              <div
                style={{
                  width: 56,
                  fontSize: "clamp(11px, 1.15vh, 13px)",
                  textAlign: "right",
                  color: stripped ? "var(--ink-2)" : "var(--accent-physics)",
                  fontFamily: "var(--mono)",
                }}
              >
                {!stripped && `物理 ${(row.physicsShare * 100).toFixed(0)}%`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom: insight callouts + legend */}
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 36,
          display: "flex",
          gap: 40,
          zIndex: 4,
          alignItems: "flex-end",
          pointerEvents: "none",
          paddingTop: 18,
          background:
            "linear-gradient(to bottom, rgba(5,8,16,0), rgba(5,8,16,0.9) 38%, var(--bg-0))",
        }}
      >
        <Insight
          label="最依赖物理 + 天文"
          name={mostPhysics.name}
          value={`${(mostPhysics.physicsShare * 100).toFixed(0)}%`}
          tint="var(--accent-physics)"
        />
        <Insight
          label="最多元化"
          name={mostDiverse.name}
          value={`${(mostDiverse.physicsShare * 100).toFixed(0)}%`}
          tint="#80ed99"
        />
        <Insight
          label={`${rows.length} 国(有学科数据)· 物理 + 天文均值`}
          name="—"
          value={`${(groupPhysicsShare * 100).toFixed(0)}%`}
          tint="var(--accent-physics)"
        />

        {/* Legend */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--ink-2)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {(["physics", "medicine", "materials", "biology", "chemistry", "other"] as Bucket[]).map((b) => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: BUCKET_COLOR[b],
                  borderRadius: 2,
                }}
              />
              {BUCKET_LABEL[b]}
            </div>
          ))}
        </div>
      </div>

      {/* Bridge → Scene 8 */}
      <div
        style={{
          position: "absolute",
          right: 48,
          bottom: 56,
          maxWidth: 360,
          zIndex: 5,
          pointerEvents: "none",
          textAlign: "right",
        }}
      >
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent-warn)", marginBottom: 8 }}>
          继续深挖 →
        </div>
        <div style={{ fontSize: 18, color: "var(--ink-0)", fontWeight: 700, lineHeight: 1.3 }}>
          剥离物理后,每个国家的合作重心各不相同——
          这正是各国独特的{" "}
          <span style={{ color: "var(--accent-eu-glow)" }}>学科指纹</span>。
        </div>
      </div>
    </div>
  );
}

function Insight({
  label,
  name,
  value,
  tint,
}: {
  label: string;
  name: string;
  value: string;
  tint: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--serif)" }}>
        <span style={{ fontSize: 22, color: "var(--ink-0)", fontWeight: 700 }}>{name}</span>
        <span
          className="mono tabular"
          style={{ fontSize: 18, color: tint, fontWeight: 700 }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
