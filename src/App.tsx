import { useEffect, useState } from "react";
import { useData } from "./data/useData";
import { Scene1Opening } from "./scenes/Scene1Opening";
import { Scene2BarRace } from "./scenes/Scene2BarRace";
import { Scene3RankFall } from "./scenes/Scene3RankFall";
import { Scene4Collider } from "./scenes/Scene4Collider";
import { Scene5RealBilateral } from "./scenes/Scene5RealBilateral";
import { Scene6AnotherMap } from "./scenes/Scene6AnotherMap";

const SCENES = [
  { id: 1, label: "01 · 最热的友谊" },
  { id: 2, label: "02 · 但有人被甩开了" },
  { id: 3, label: "03 · 排位在掉" },
  { id: 4, label: "04 · 粒子对撞机" },
  { id: 5, label: "05 · 真正的双边" },
  { id: 6, label: "06 · 另一种地图" },
];

export default function App() {
  const data = useData();
  const [scene, setScene] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setScene((s) => Math.min(SCENES.length, s + 1));
      if (e.key === "ArrowLeft") setScene((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="title">
          <strong>中欧合作</strong> · 粒子对撞机里的科技外交
        </div>
        <div>2011 — 2020 · scidb.cn / china-ceec coauthorship</div>
      </div>

      <div className="scene-stage">
        {!data && <LoadingScreen />}
        {data && (
          <>
            <Scene className={`scene${scene === 1 ? " active" : ""}`}>
              <Scene1Opening data={data} active={scene === 1} />
            </Scene>
            <Scene className={`scene${scene === 2 ? " active" : ""}`}>
              <Scene2BarRace data={data} active={scene === 2} />
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
          </>
        )}
      </div>

      <nav className="scene-nav">
        {SCENES.map((s) => (
          <button
            key={s.id}
            className={s.id === scene ? "active" : ""}
            onClick={() => setScene(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
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
