import { useEffect, useMemo, useState } from "react";
import { WorldMap } from "../components/WorldMap";
import type { AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

const PHYS_CODES = new Set(["0702", "0704", "0827"]); // Physics, Astronomy, Nuclear

// Compute the strongest "real bilateral" specialties — (country × non-physics subject)
// pairs that emerge once CERN-style mega-collaboration is stripped out.
// Strategy:
//   1. For every country, look at its non-physics subjects from countrySubjects.
//   2. Score = subject.count × share_in_country (favors both volume and concentration).
//   3. Deduplicate by country (max 1 highlight per country to ensure diversity).
//   4. Keep top 5.
interface Highlight {
  iso: string;
  countryCn: string;
  subjectEn: string;
  subjectCn: string;
  count: number;
  shareInCountry: number;
}
function computeHighlights(
  countrySubjects: Record<string, { name_cn: string; subjects: Array<{ code: string; en: string; cn: string; count: number }> }>,
  perCountry: Array<{ iso: string; name_cn: string; count_135: number }>,
  limit = 4
): Highlight[] {
  const candidates: Highlight[] = [];
  for (const c of perCountry) {
    const cs = countrySubjects[c.iso];
    if (!cs || !c.count_135) continue;
    for (const s of cs.subjects) {
      if (PHYS_CODES.has(s.code)) continue;
      candidates.push({
        iso: c.iso,
        countryCn: c.name_cn,
        subjectEn: s.en,
        subjectCn: s.cn || s.en,
        count: s.count,
        shareInCountry: s.count / c.count_135,
      });
    }
  }
  // Score = count × share. Prefer pairs that are both big and distinctive.
  candidates.sort((a, b) => b.count * b.shareInCountry - a.count * a.shareInCountry);
  // Diversify on both axes: each country and each subject appears at most once.
  const seenCountry = new Set<string>();
  const seenSubject = new Set<string>();
  const picks: Highlight[] = [];
  for (const cand of candidates) {
    if (seenCountry.has(cand.iso)) continue;
    if (seenSubject.has(cand.subjectEn)) continue;
    seenCountry.add(cand.iso);
    seenSubject.add(cand.subjectEn);
    picks.push(cand);
    if (picks.length >= limit) break;
  }
  return picks;
}

/**
 * Scene 6 ── 「合作的另一种地图」
 *
 * Returns to the Scene 1 world map, but the arc weights are recomputed using
 * a "substantive collaboration index" that strips physics-dominated mega-paper
 * cooperation. Result: ranking shuffles. The closing image of the story.
 */
export function Scene6AnotherMap({ data, active }: Props) {
  const [progress, setProgress] = useState(0);
  const [stripped, setStripped] = useState(true);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 3500);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const ranked = useMemo(() => {
    return data.perCountry
      .map((c) => {
        const cs = data.countrySubjects[c.iso];
        let physics = 0;
        if (cs) {
          for (const s of cs.subjects) {
            if (PHYS_CODES.has(s.code)) physics += s.count;
          }
        }
        const real = c.count_135 - physics;
        return {
          ...c,
          physics,
          real,
          full: c.count_135,
        };
      })
      .sort((a, b) => (stripped ? b.real - a.real : b.full - a.full));
  }, [data, stripped]);

  const highlights = useMemo(
    () => computeHighlights(data.countrySubjects, data.perCountry, 4),
    [data]
  );

  const max = Math.max(...ranked.map((r) => (stripped ? r.real : r.full)));
  const arcs = ranked.map((d, idx) => ({
    iso: d.iso,
    weight: Math.pow(((stripped ? d.real : d.full) || 1) / max, 0.5),
    delay: 0.15 + idx * 0.1,
    rank: idx + 1,
  }));

  const [w, setW] = useState(1440);
  const [h, setH] = useState(800);
  useEffect(() => {
    const update = () => {
      setW(window.innerWidth);
      setH(Math.max(600, window.innerHeight - 51 - 60));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)" }}>
      <WorldMap
        beijing={data.countries.beijing}
        countries={data.countries.ceec}
        arcs={arcs}
        width={w}
        height={h}
        progress={progress}
      />

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 48,
          maxWidth: 460,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div className="kicker">SCENE 06 · 另一种地图</div>
        <h1
          className="headline"
          style={{ marginTop: 4, fontSize: "clamp(26px, 3.2vw, 44px)" }}
        >
          {stripped ? (
            <>
              当 CERN 不在场景里,<br />
              <span style={{ color: "var(--accent-warn)" }}>合作版图</span>{" "}
              重新洗牌。
            </>
          ) : (
            <>
              这是我们一开始<br />
              看到的「合作」。
            </>
          )}
        </h1>
        <p className="subhead" style={{ marginTop: 14, fontSize: 14 }}>
          剥离物理 + 天文 + 核科学后的"实质合作量"。地图重画 —— 真正的双边专长浮出水面。
          右上按钮可切换视图。
        </p>
      </div>

      {/* Toggle */}
      <div
        style={{
          position: "absolute",
          right: 48,
          top: 70,
          zIndex: 6,
          display: "flex",
          gap: 4,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 4,
          borderRadius: 4,
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        <button
          onClick={() => setStripped(false)}
          style={{
            background: !stripped ? "var(--accent-warn)" : "transparent",
            color: !stripped ? "#1a1300" : "var(--ink-1)",
            border: "none",
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          完整数据
        </button>
        <button
          onClick={() => setStripped(true)}
          style={{
            background: stripped ? "var(--accent-warn)" : "transparent",
            color: stripped ? "#1a1300" : "var(--ink-1)",
            border: "none",
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderRadius: 2,
          }}
        >
          剥离物理 + 天文
        </button>
      </div>

      {/* Right: re-ranked TOP 6 leaderboard */}
      <div
        style={{
          position: "absolute",
          right: 48,
          top: 170,
          width: 280,
          zIndex: 5,
          fontFamily: "var(--serif)",
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
            marginBottom: 14,
          }}
        >
          {stripped ? "实质合作 TOP 6" : "完整合作 TOP 6"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ranked.slice(0, 6).map((d, i) => {
            const value = stripped ? d.real : d.full;
            const w = (value / max) * 100;
            const oldRank = data.perCountry.findIndex((c) => c.iso === d.iso) + 1;
            const newRank = i + 1;
            const delta = oldRank - newRank;
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
                    {stripped && delta !== 0 && (
                      <span
                        className="mono"
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: delta > 0 ? "#8ae3ff" : "#ff8366",
                        }}
                      >
                        {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                      </span>
                    )}
                  </span>
                  <span
                    className="mono tabular"
                    style={{ color: "var(--ink-1)", fontSize: 13 }}
                  >
                    {value.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    background: "rgba(245, 177, 74, 0.08)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${w}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--accent-warn) 0%, #ffd9a8 100%)",
                      boxShadow: "0 0 12px rgba(245, 177, 74, 0.6)",
                      transition: "width 800ms ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bilateral specialties — the data-driven take-aways */}
      {stripped && (
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 88,
            right: 360,
            zIndex: 5,
            pointerEvents: "none",
            opacity: progress > 0.55 ? 1 : 0,
            transform: progress > 0.55 ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 700ms ease, transform 700ms ease",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--accent-warn)",
              marginBottom: 12,
            }}
          >
            剥离物理之后,这些双边浮出水面
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${highlights.length}, 1fr)`,
              gap: 22,
              fontFamily: "var(--serif)",
            }}
          >
            {highlights.map((h, i) => (
              <div
                key={h.iso + h.subjectEn}
                style={{
                  paddingLeft: 14,
                  borderLeft: "2px solid var(--accent-warn)",
                  opacity: progress > 0.55 + i * 0.07 ? 1 : 0,
                  transform: progress > 0.55 + i * 0.07 ? "translateX(0)" : "translateX(-8px)",
                  transition: "all 500ms ease",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "var(--ink-2)",
                    letterSpacing: "0.16em",
                  }}
                >
                  0{i + 1}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: "var(--ink-0)",
                    fontWeight: 700,
                    marginTop: 4,
                    lineHeight: 1.25,
                  }}
                >
                  中-{h.countryCn}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--accent-warn)",
                    marginTop: 2,
                  }}
                >
                  {h.subjectCn}
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    color: "var(--ink-2)",
                    marginTop: 8,
                    letterSpacing: "0.08em",
                  }}
                >
                  <span className="tabular" style={{ color: "var(--ink-1)" }}>
                    {h.count.toLocaleString()}
                  </span>{" "}
                  篇 · {(h.shareInCountry * 100).toFixed(1)}% 该国合作
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closing line */}
      <div
        style={{
          position: "absolute",
          left: 48,
          bottom: 24,
          right: 48,
          textAlign: "center",
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-2)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          数据来源 · ScienceDB China-CEEC Co-authorship 2011-2020 · WoS · OpenAlex
        </div>
      </div>
    </div>
  );
}
