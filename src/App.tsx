import { useEffect, useState } from "react";
import { useData } from "./data/useData";
import { Scene1Opening } from "./scenes/Scene1Opening";
import { Scene2BarRace } from "./scenes/Scene2BarRace";
import { Scene3RankFall } from "./scenes/Scene3RankFall";
import { Scene4Collider } from "./scenes/Scene4Collider";
import { Scene5RealBilateral } from "./scenes/Scene5RealBilateral";
import { Scene6AnotherMap } from "./scenes/Scene6AnotherMap";
import { Scene7InstitutionNetwork } from "./scenes/Scene7InstitutionNetwork";

const SCENES = [
  { id: 1, label: "01 · 最热的友谊" },
  { id: 2, label: "02 · 但有人被甩开了" },
  { id: 3, label: "03 · 排位在掉" },
  { id: 4, label: "04 · 粒子对撞机" },
  { id: 5, label: "05 · 真正的双边" },
  { id: 6, label: "06 · 另一种地图" },
  { id: 7, label: "07 · 谁在和谁对话" },
];

// Autoplay dwell time (ms) per scene — long enough for the entrance animation +
// the viewer to read the headline. Tuned per scene's length.
const SCENE_DWELL: Record<number, number> = {
  1: 7000,
  2: 11000, // 8s race + 1.5s hold + read time
  3: 7000,
  4: 9000,
  5: 12000, // two 4s loop ticks for the strip toggle
  6: 8000,
  7: 10000,
};

export default function App() {
  const data = useData();
  const [scene, setScene] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [viewMode, setViewMode] = useState<"bars" | "heatmap">("bars");

  // Fire the cinematic flash + letterbox whenever scene changes
  useEffect(() => {
    setTransitioning(true);
    const id = setTimeout(() => setTransitioning(false), 720);
    return () => clearTimeout(id);
  }, [scene]);

  // Keyboard: arrows step, space toggles autoplay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setScene((s) => Math.min(SCENES.length, s + 1));
      if (e.key === "ArrowLeft") setScene((s) => Math.max(1, s - 1));
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setAutoplay((a) => !a);
      }
      if (e.key === "Escape") setAutoplay(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mouse wheel: step scenes (debounced)
  useEffect(() => {
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - last < 600) return;
      // require enough delta to count as a deliberate scroll
      if (Math.abs(e.deltaY) < 30) return;
      last = now;
      if (e.deltaY > 0) setScene((s) => Math.min(SCENES.length, s + 1));
      else setScene((s) => Math.max(1, s - 1));
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Autoplay scheduler: advance scene after its dwell time, loop back to 1 at end
  useEffect(() => {
    if (!autoplay) return;
    const dwell = SCENE_DWELL[scene] ?? 8000;
    const id = setTimeout(() => {
      setScene((s) => (s < SCENES.length ? s + 1 : 1));
    }, dwell);
    return () => clearTimeout(id);
  }, [autoplay, scene]);

  // Viewport scaling: design size is 1440×900; scale down to fit smaller viewports.
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / 1440;
      const sy = window.innerHeight / 900;
      const scale = Math.min(sx, sy, 1);
      document.documentElement.style.setProperty("--app-scale", String(scale));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="title">
          <strong>中欧合作</strong> · 粒子对撞机里的科技外交
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span>2011 — 2020 · scidb.cn / china-ceec coauthorship</span>
          <button
            onClick={() => setAutoplay((a) => !a)}
            title="按空格键切换自动播放"
            style={{
              background: autoplay ? "var(--accent-cn)" : "transparent",
              color: autoplay ? "#150202" : "var(--ink-2)",
              border: `1px solid ${autoplay ? "var(--accent-cn)" : "rgba(201,194,173,0.18)"}`,
              padding: "4px 10px",
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            {autoplay ? "● 自动播放" : "○ 自动播放 [SPACE]"}
          </button>
        </div>
      </div>

      <div className="scene-stage">
        <div className={`scene-bar top${transitioning ? " firing" : ""}`} />
        <div className={`scene-bar bottom${transitioning ? " firing" : ""}`} />
        <div className={`scene-flash${transitioning ? " firing" : ""}`} />
        {!data && <LoadingScreen />}
        {data && (
          <>
            <Scene className={`scene${scene === 1 ? " active" : ""}`}>
              <Scene1Opening data={data} active={scene === 1} />
            </Scene>
            <Scene className={`scene${scene === 2 ? " active" : ""}`}>
              <Scene2BarRace data={data} active={scene === 2} viewMode={viewMode} />
            </Scene>
            <Scene className={`scene${scene === 3 ? " active" : ""}`}>
              <Scene3RankFall data={data} active={scene === 3} />
            </Scene>
            <Scene className={`scene${scene === 4 ? " active" : ""}`}>
              <Scene4Collider data={data} active={scene === 4} />
            </Scene>
            <Scene className={`scene${scene === 5 ? " active" : ""}`}>
              <Scene5RealBilateral data={data} active={scene === 5} />
            </Scene>
            <Scene className={`scene${scene === 6 ? " active" : ""}`}>
              <Scene6AnotherMap data={data} active={scene === 6} />
            </Scene>
            <Scene className={`scene${scene === 7 ? " active" : ""}`}>
              <Scene7InstitutionNetwork active={scene === 7} />
            </Scene>
          </>
        )}
      </div>

      <nav className="scene-nav" style={{ position: "relative" }}>
        {SCENES.map((s) => (
          <button
            key={s.id}
            className={s.id === scene ? "active" : ""}
            onClick={() => setScene(s.id)}
          >
            {s.label}
          </button>
        ))}
        {scene === 2 && (
          <button
            onClick={() => setViewMode((v) => v === "bars" ? "heatmap" : "bars")}
            style={{
              position: "absolute",
              right: 64,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 6,
              color: "var(--ink-1)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              padding: "8px 16px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-0)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)";
            }}
          >
            {viewMode === "bars" ? "▸ 热力地图" : "▸ 动态条形图"}
          </button>
        )}
      </nav>

      {/* Autoplay progress bar at the very bottom */}
      {autoplay && (
        <div
          key={scene}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "rgba(255, 77, 61, 0.12)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              height: "100%",
              background:
                "linear-gradient(90deg, var(--accent-cn), var(--accent-cn-glow))",
              transformOrigin: "left center",
              animation: `autoplayBar ${SCENE_DWELL[scene] ?? 8000}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Scene({ className, children }: { className: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}

function LoadingScreen() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        color: "var(--ink-2)",
        fontFamily: "var(--mono)",
        fontSize: 12,
        letterSpacing: "0.2em",
      }}
    >
      LOADING ·  ·  ·
    </div>
  );
}

function PlaceholderScene({ id }: { id: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        color: "var(--ink-2)",
        fontFamily: "var(--mono)",
        textAlign: "center",
      }}
    >
      <div>
        <div className="kicker" style={{ color: "var(--ink-2)" }}>
          SCENE 0{id}
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: "var(--ink-1)" }}>
          这一屏即将开发 · 请按 ← 回到第 1 屏
        </div>
      </div>
    </div>
  );
}
