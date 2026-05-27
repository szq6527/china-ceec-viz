import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import { useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import type { AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

/**
 * Scene 5 ── “大科学幻象”
 *
 * Concept: zoom into a single arc (Beijing → Warsaw, IHEP × IFJ-PAN). Reveal
 * that under the hood the cooperation is a stylised CERN/LHC detector firing
 * thousands of co-author “particles”. Each particle is one author of one real
 * multi-author physics paper. China and Poland get tinted highlights.
 */
export function Scene5Collider({ data, active }: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)" }}>
      <Canvas
        camera={{ position: [0, 1.4, 7.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, toneMappingExposure: 1.15 }}
      >
        <color attach="background" args={["#040713"]} />
        <fog attach="fog" args={["#040713", 8, 22]} />
        <ambientLight intensity={0.18} />
        <pointLight position={[0, 0, 0]} intensity={4.2} color="#9b8ea8" distance={14} />
        <pointLight position={[5, 4, 6]} intensity={0.7} color="#7ea8a4" />
        <pointLight position={[-5, -4, 6]} intensity={0.7} color="#c4796e" />
        {active && (
          <>
            <CameraDolly />
            <ColliderGeometry />
            <EnergyCore />
            <ParticleBurst count={3024} />
            <BeamLines />
            <EffectComposer multisampling={0}>
              <Bloom
                intensity={1.6}
                luminanceThreshold={0.18}
                luminanceSmoothing={0.55}
                kernelSize={KernelSize.LARGE}
                mipmapBlur
              />
              <ChromaticAberration
                blendFunction={BlendFunction.NORMAL}
                offset={new THREE.Vector2(0.0008, 0.0012)}
                radialModulation={false}
                modulationOffset={0}
              />
              <Vignette eskil={false} offset={0.25} darkness={0.85} />
            </EffectComposer>
          </>
        )}
      </Canvas>
      <Overlay data={data} active={active} />
    </div>
  );
}

/* ============================================================
 * Camera dolly-in — flies the camera from far Z toward the rest position
 * to give a "diving into the collider" feel on scene enter.
 * ============================================================ */
const DOLLY_DURATION = 1700; // ms
const REST = new THREE.Vector3(0, 1.4, 7.5);
const START = new THREE.Vector3(0, 4.5, 26);

function CameraDolly() {
  const { camera } = useThree();
  const startTime = useRef<number | null>(null);
  useFrame(() => {
    if (startTime.current === null) {
      startTime.current = performance.now();
      camera.position.copy(START);
    }
    const t = Math.min(1, (performance.now() - startTime.current) / DOLLY_DURATION);
    // ease-out quintic
    const e = 1 - Math.pow(1 - t, 5);
    camera.position.lerpVectors(START, REST, e);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ============================================================
 * Detector / collider geometry
 * Concentric tori + an inner cylindrical "tracker" + endcaps
 * Stylised, not anatomically accurate.
 * ============================================================ */
function ColliderGeometry() {
  const rings = useMemo(
    () => [
      { r: 1.3,  tube: 0.06,  color: "#9b8ea8", op: 0.65, emis: 2.2 },
      { r: 1.7,  tube: 0.08,  color: "#9d4edd", op: 0.55, emis: 1.8 },
      { r: 2.15, tube: 0.10,  color: "#7c5cbf", op: 0.45, emis: 1.4 },
      { r: 2.6,  tube: 0.04,  color: "#7ea8a4", op: 0.65, emis: 2.4 },
    ],
    []
  );

  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.z += dt * 0.05;
  });

  return (
    <group ref={groupRef} rotation={[Math.PI * 0.18, 0, 0]}>
      {rings.map((ring, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[ring.r, ring.tube, 24, 128]} />
          <meshStandardMaterial
            color={ring.color}
            emissive={ring.color}
            emissiveIntensity={ring.emis}
            metalness={0.4}
            roughness={0.3}
            transparent
            opacity={ring.op}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Inner cylindrical tracker */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 1.8, 64, 1, true]} />
        <meshStandardMaterial
          color="#5a189a"
          emissive="#7c5cbf"
          emissiveIntensity={0.6}
          metalness={0.6}
          roughness={0.4}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Endcap discs — like CMS endcaps */}
      {[-0.92, 0.92].map((z, i) => (
        <mesh key={i} position={[0, 0, z]}>
          <ringGeometry args={[0.15, 1.0, 64]} />
          <meshStandardMaterial
            color="#9b8ea8"
            emissive="#9b8ea8"
            emissiveIntensity={2.6}
            transparent
            opacity={0.65}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Outer skeletal frame — 12 spokes */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh
            key={`spoke-${i}`}
            position={[Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0]}
            rotation={[0, 0, a + Math.PI / 2]}
          >
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <meshStandardMaterial
              color="#3a0ca3"
              emissive="#4361ee"
              emissiveIntensity={0.4}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ============================================================
 * Glowing energy core at the collision point
 * ============================================================ */
function EnergyCore() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const s = 0.45 + Math.sin(t * 4) * 0.04 + Math.sin(t * 9) * 0.015;
    ref.current.scale.setScalar(s);
  });
  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#fff2c8" transparent opacity={0.98} toneMapped={false} />
      </mesh>
      {/* outer halo */}
      <mesh scale={1.4}>
        <sphereGeometry args={[0.85, 24, 24]} />
        <meshBasicMaterial color="#9b8ea8" transparent opacity={0.22} toneMapped={false} />
      </mesh>
    </>
  );
}

/* ============================================================
 * Particle burst — author particles flying outward
 * On loop, particles emit from the core, travel outward, fade.
 * Two countries (China, Poland) get tinted; rest are warm white.
 * ============================================================ */
function ParticleBurst({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  // Pre-compute per-particle constant data (direction + speed + country tint).
  const { positions, colors, dirs, speeds, lives, lifespans } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const lives = new Float32Array(count);
    const lifespans = new Float32Array(count);

    const cChina = new THREE.Color("#c4796e");
    const cPoland = new THREE.Color("#7ea8a4");
    const cWarm = new THREE.Color("#ffe6a8");
    const cFaint = new THREE.Color("#9b8ea8");

    for (let i = 0; i < count; i++) {
      // random direction on a sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta);
      const dz = Math.cos(phi);
      dirs.set([dx, dy, dz], i * 3);

      // staggered initial life so particles emit continuously
      lifespans[i] = 2.0 + Math.random() * 1.5;
      lives[i] = -Math.random() * lifespans[i]; // negative = not yet emitted
      speeds[i] = 1.3 + Math.random() * 1.2;

      // initial position at origin (will be set in useFrame anyway)
      positions.set([0, 0, 0], i * 3);

      // colour: 3% China, 3% Poland, rest mix of warm-white / soft-purple
      let color: THREE.Color;
      const r = Math.random();
      if (r < 0.03) color = cChina;
      else if (r < 0.06) color = cPoland;
      else if (r < 0.55) color = cWarm;
      else color = cFaint;

      colors.set([color.r, color.g, color.b], i * 3);
    }
    return { positions, colors, dirs, speeds, lives, lifespans };
  }, [count]);

  useFrame((_, dt) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pts.geometry.attributes.color as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      lives[i] += dt;
      if (lives[i] < 0) {
        // not yet alive — keep at origin invisible
        posArr[i * 3] = 0;
        posArr[i * 3 + 1] = 0;
        posArr[i * 3 + 2] = 0;
        // alpha proxy: blacken color until alive
        colArr[i * 3] *= 0;
        colArr[i * 3 + 1] *= 0;
        colArr[i * 3 + 2] *= 0;
        continue;
      }
      const t = lives[i];
      const lifeT = Math.min(1, t / lifespans[i]);
      // restore base color, then fade by life
      const baseR = colors[i * 3];
      const baseG = colors[i * 3 + 1];
      const baseB = colors[i * 3 + 2];
      const fade = 1 - lifeT;
      colArr[i * 3] = baseR * fade;
      colArr[i * 3 + 1] = baseG * fade;
      colArr[i * 3 + 2] = baseB * fade;

      const r = speeds[i] * t * (1 + lifeT * 0.3);
      posArr[i * 3] = dirs[i * 3] * r;
      posArr[i * 3 + 1] = dirs[i * 3 + 1] * r;
      posArr[i * 3 + 2] = dirs[i * 3 + 2] * r;

      if (lives[i] > lifespans[i]) {
        // respawn
        lives[i] = -Math.random() * 0.5;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        sizeAttenuation
        vertexColors
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/* ============================================================
 * Two horizontal beam lines along Z (the proton beams pre-collision)
 * ============================================================ */
function BeamLines() {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 6, 16]} />
        <meshBasicMaterial color="#c4796e" transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {[-3, 3].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color="#fff2c8" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

interface FeaturePaper {
  doi: string;
  title: string;
  venue: string;
  year: number;
  collaboration: string;
  total_authors: number;
  distinct_countries: number;
  distinct_institutions: number;
}

interface MegaPaperStats {
  aggregate: {
    papers_sampled: number;
    authorships_total: number;
    band_papers: Record<string, number>;
    band_authorships: Record<string, number>;
    share_big_papers: number;        // ≥ 100 authors
    share_big_authorships: number;
  };
  by_country: Record<string, {
    name_cn: string;
    papers_sampled: number;
    authorships_total: number;
    share_big_papers: number;
    share_big_authorships: number;
  }>;
}

/* ============================================================
 * 2D narrative overlay
 * ============================================================ */
function Overlay({ data: _data, active }: { data: AppData; active: boolean }) {
  const [paper, setPaper] = useState<FeaturePaper | null>(null);
  const [stats, setStats] = useState<MegaPaperStats | null>(null);
  useEffect(() => {
    fetch("./data/feature_paper.json")
      .then((r) => r.json())
      .then(setPaper)
      .catch(() => setPaper(null));
    fetch("./data/megapaper_stats.json")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  // Worst-affected country (most CERN-distorted)
  const worstCountry = stats
    ? Object.values(stats.by_country).sort(
        (a, b) => b.share_big_authorships - a.share_big_authorships
      )[0]
    : null;

  const TARGET = paper?.total_authors ?? 2932;
  const [authorCount, setAuthorCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    setAuthorCount(0);
    let raf = 0;
    const ANIM_DELAY = 2100;   // wait for dolly + stats panel reveal
    const ANIM_DURATION = 2400;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed < ANIM_DELAY) {
        setAuthorCount(0);
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (elapsed - ANIM_DELAY) / ANIM_DURATION);
      // ease-out so the count whips toward target
      const e = 1 - Math.pow(1 - t, 3);
      setAuthorCount(Math.round(e * TARGET));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, TARGET]);

  return (
    <>
      {/* Top-left: kicker + headline */}
      <div
        key={`headline-${active}`}
        className="scene4-panel delay-headline"
        style={{
          position: "absolute",
          top: 56,
          left: 48,
          maxWidth: 460,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <div className="kicker" style={{ color: "var(--accent-physics)" }}>
          SCENE 06 · 大科学幻象
        </div>
        <h1
          className="headline"
          style={{
            marginTop: 4,
            fontSize: "clamp(26px, 3.2vw, 44px)",
            lineHeight: 1.15,
            wordBreak: "keep-all",
          }}
        >
          <span style={{ color: "#ffe6a8" }}>
            {stats ? `${(stats.aggregate.share_big_papers * 100).toFixed(1)}%` : "—"}
          </span>{" "}
          的论文,<br />
          制造了{" "}
          <span style={{ color: "var(--accent-physics)" }}>
            {stats ? `${(stats.aggregate.share_big_authorships * 100).toFixed(1)}%` : "—"}
          </span>
          <br />
          的"合作量"
        </h1>
        <p className="subhead" style={{ marginTop: 14, fontSize: 15 }}>
          在 OpenAlex 抽样的{" "}
          <strong className="mono tabular">
            {stats?.aggregate.papers_sampled.toLocaleString() ?? "17,098"}
          </strong>{" "}
          篇中-中东欧合作论文里(2016-2020),作者数 ≥ 100 的"大科学协作"只占
          一小部分,却吃下了大半"合作量"。一篇 ATLAS 论文,把 38 国连成一次"合作"。
        </p>
      </div>

      {/* Mid-left: the disproportion bars — the proof */}
      {stats && (
        <div
          key={`bars-${active}`}
          className="scene4-panel delay-headline"
          style={{
            position: "absolute",
            left: 48,
            top: 360,
            width: 380,
            zIndex: 5,
            pointerEvents: "none",
            fontFamily: "var(--serif)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              marginBottom: 12,
            }}
          >
            按作者数分桶
          </div>
          <DisproportionRow
            label="论文数占比"
            bands={bandShares(stats.aggregate.band_papers)}
          />
          <div style={{ height: 10 }} />
          <DisproportionRow
            label="合作量占比"
            bands={bandShares(stats.aggregate.band_authorships)}
            emphasize
          />
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--ink-2)",
              letterSpacing: "0.16em",
              lineHeight: 1.8,
            }}
          >
            <span style={{ color: "#8fb8b0" }}>■</span> 1-9 作者&nbsp;&nbsp;
            <span style={{ color: "#7ea8a4" }}>■</span> 10-49&nbsp;&nbsp;
            <span style={{ color: "#c9a87c" }}>■</span> 50-99&nbsp;&nbsp;
            <span style={{ color: "#9b8ea8" }}>■</span> 100+ (大科学)
          </div>
        </div>
      )}

      {/* Top-right: real paper card */}
      <div
        key={`paper-${active}`}
        className="scene4-panel delay-paper"
        style={{
          position: "absolute",
          top: 70,
          right: 48,
          width: 320,
          zIndex: 5,
          pointerEvents: "none",
          fontFamily: "var(--serif)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--accent-warn)",
            marginBottom: 10,
          }}
        >
          一个真实样本 · {paper?.venue ?? "Phys. Lett. B"}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-0)" }}>
          “{paper?.title ??
            "Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC"}”
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            marginTop: 10,
            fontFamily: "var(--mono)",
            letterSpacing: "0.1em",
          }}
        >
          {paper?.collaboration ?? "ATLAS Collaboration"} · {paper?.year ?? 2012}
          <br />
          DOI: {paper?.doi ?? "10.1016/j.physletb.2012.08.020"} · 数据 OpenAlex
        </div>
      </div>

      {/* Bottom: stat counters */}
      <div
        key={`stats-${active}`}
        className="scene4-panel delay-stats"
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 40,
          display: "flex",
          gap: 56,
          zIndex: 5,
          pointerEvents: "none",
          flexWrap: "wrap",
        }}
      >
        <Counter
          label="中–中东欧合作论文总量"
          value={stats?.aggregate.papers_sampled.toLocaleString() ?? "—"}
          sub="数据来源：OpenAlex · 2016–2020"
        />
        <Counter
          label="属于大科学论文（≥100 位作者）"
          value={
            stats ? `${(stats.aggregate.share_big_papers * 100).toFixed(1)}%` : "—"
          }
          sub="论文数量极少，却影响极大"
        />
        <Counter
          label="的「合作量」由这少数论文贡献"
          value={
            stats ? `${(stats.aggregate.share_big_authorships * 100).toFixed(1)}%` : "—"
          }
          sub="不足 8% 的论文制造了近 40% 的合作记录"
        />
        <Counter
          label={worstCountry ? `受影响最严重 · ${worstCountry.name_cn}` : "代表样本作者数"}
          value={
            worstCountry
              ? `${(worstCountry.share_big_authorships * 100).toFixed(0)}%`
              : authorCount.toLocaleString()
          }
          sub={worstCountry ? "合作量由大科学论文贡献，数据严重失真" : ""}
        />
      </div>
    </>
  );
}

const BAND_ORDER = ["1-9", "10-49", "50-99", "100-499"] as const;
const BAND_COLORS: Record<string, string> = {
  "1-9": "#8fb8b0",
  "10-49": "#7ea8a4",
  "50-99": "#c9a87c",
  "100-499": "#9b8ea8",
};

function bandShares(record: Record<string, number>): Array<{ key: string; share: number }> {
  const sum = BAND_ORDER.reduce((s, b) => s + (record[b] || 0), 0);
  if (!sum) return [];
  return BAND_ORDER.map((b) => ({ key: b, share: (record[b] || 0) / sum }));
}

function DisproportionRow({
  label,
  bands,
  emphasize,
}: {
  label: string;
  bands: Array<{ key: string; share: number }>;
  emphasize?: boolean;
}) {
  const last = bands[bands.length - 1];
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-1)",
          }}
        >
          {label}
        </span>
        <span
          className="mono tabular"
          style={{
            fontSize: emphasize ? 22 : 16,
            fontWeight: 700,
            color: emphasize ? "var(--accent-physics)" : "var(--ink-0)",
          }}
        >
          {last ? `${(last.share * 100).toFixed(1)}%` : "—"}
          <span style={{ fontSize: 12, color: "var(--ink-2)", marginLeft: 6 }}>
            100+
          </span>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: emphasize ? 16 : 10,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: emphasize ? "0 0 18px rgba(155, 142, 168, 0.25)" : "none",
        }}
      >
        {bands.map((b) => (
          <div
            key={b.key}
            style={{
              flex: b.share,
              background: BAND_COLORS[b.key],
              transition: "flex 800ms cubic-bezier(0.65,0,0.35,1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Counter({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="stat-big mono tabular">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--ink-2)",
            letterSpacing: "0.16em",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
