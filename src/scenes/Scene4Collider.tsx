import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import type { AppData } from "../data/useData";

interface Props {
  data: AppData;
  active: boolean;
}

/**
 * Scene 4 ── “粒子对撞机里的中欧外交”
 *
 * Concept: zoom into a single arc (Beijing → Warsaw, IHEP × IFJ-PAN). Reveal
 * that under the hood the cooperation is a stylised CERN/LHC detector firing
 * thousands of co-author “particles”. Each particle is one author of one real
 * multi-author physics paper. China and Poland get tinted highlights.
 */
export function Scene4Collider({ data, active }: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg-0)" }}>
      <Canvas
        camera={{ position: [0, 1.4, 7.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#040713"]} />
        <fog attach="fog" args={["#040713", 8, 22]} />
        <ambientLight intensity={0.25} />
        <pointLight position={[0, 0, 0]} intensity={3.5} color="#c77dff" distance={12} />
        <pointLight position={[5, 4, 6]} intensity={0.6} color="#4cc9f0" />
        <pointLight position={[-5, -4, 6]} intensity={0.6} color="#ff4d3d" />
        {active && (
          <>
            <ColliderGeometry />
            <EnergyCore />
            <ParticleBurst count={3024} />
            <BeamLines />
          </>
        )}
      </Canvas>
      <Overlay data={data} active={active} />
    </div>
  );
}

/* ============================================================
 * Detector / collider geometry
 * Concentric tori + an inner cylindrical "tracker" + endcaps
 * Stylised, not anatomically accurate.
 * ============================================================ */
function ColliderGeometry() {
  const rings = useMemo(
    () => [
      { r: 1.3,  tube: 0.06,  color: "#c77dff", op: 0.55 },
      { r: 1.7,  tube: 0.08,  color: "#9d4edd", op: 0.45 },
      { r: 2.15, tube: 0.10,  color: "#7b2cbf", op: 0.35 },
      { r: 2.6,  tube: 0.04,  color: "#4cc9f0", op: 0.55 },
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
            emissiveIntensity={1.4}
            metalness={0.4}
            roughness={0.3}
            transparent
            opacity={ring.op}
          />
        </mesh>
      ))}

      {/* Inner cylindrical tracker */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 1.8, 64, 1, true]} />
        <meshStandardMaterial
          color="#5a189a"
          emissive="#7b2cbf"
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
            color="#c77dff"
            emissive="#c77dff"
            emissiveIntensity={1.6}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
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
        <meshBasicMaterial color="#ffe6a8" transparent opacity={0.95} />
      </mesh>
      {/* outer halo */}
      <mesh>
        <sphereGeometry args={[0.85, 24, 24]} />
        <meshBasicMaterial color="#c77dff" transparent opacity={0.18} />
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

    const cChina = new THREE.Color("#ff4d3d");
    const cPoland = new THREE.Color("#4cc9f0");
    const cWarm = new THREE.Color("#ffe6a8");
    const cFaint = new THREE.Color("#c77dff");

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
        size={0.05}
        sizeAttenuation
        vertexColors
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
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
        <meshBasicMaterial color="#ff4d3d" transparent opacity={0.55} />
      </mesh>
      {[-3, 3].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#ffe6a8" />
        </mesh>
      ))}
    </>
  );
}

/* ============================================================
 * 2D narrative overlay
 * ============================================================ */
function Overlay({ data: _data, active }: { data: AppData; active: boolean }) {
  const [authorCount, setAuthorCount] = useState(0);
  const TARGET = 3024;
  useEffect(() => {
    if (!active) return;
    setAuthorCount(0);
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 2400);
      // ease-out so the count whips toward target
      const e = 1 - Math.pow(1 - t, 3);
      setAuthorCount(Math.round(e * TARGET));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <>
      {/* Top-left: kicker + headline */}
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
        <div className="kicker" style={{ color: "var(--accent-physics)" }}>
          SCENE 04 · 揭穿
        </div>
        <h1
          className="headline"
          style={{
            marginTop: 4,
            fontSize: "clamp(28px, 3.4vw, 48px)",
          }}
        >
          一篇论文,<br />
          <span style={{ color: "#ffe6a8" }}>3,024 位作者</span><br />
          横跨 38 国
        </h1>
        <p className="subhead" style={{ marginTop: 14, fontSize: 15 }}>
          打开「波兰 × 中科院高能物理研究所」这条最粗的弧线 ——<br />
          它的本体,是一个个 <strong style={{ color: "var(--accent-physics)" }}>CERN ATLAS / CMS 大科学协作</strong>
          的论文,每一位作者都被算作一次"中欧合作"。
        </p>
      </div>

      {/* Top-right: real paper card */}
      <div
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
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--accent-warn)",
            marginBottom: 10,
          }}
        >
          一个真实样本 · Phys. Lett. B
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-0)" }}>
          “Observation of a new particle in the search for the Standard Model
          Higgs boson with the ATLAS detector at the LHC”
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-2)",
            marginTop: 10,
            fontFamily: "var(--mono)",
            letterSpacing: "0.1em",
          }}
        >
          ATLAS Collaboration · 2012<br />
          DOI: 10.1016/j.physletb.2012.08.020
        </div>
      </div>

      {/* Bottom: stat counters */}
      <div
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
        <Counter label="该论文作者数" value={authorCount.toLocaleString()} />
        <Counter label="参与国家数" value="38" />
        <Counter label="参与机构数" value="174" />
        <Counter
          label="物理 + 天文学占比"
          value="40.4%"
          sub="中-中东欧合作论文"
        />
      </div>
    </>
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
            fontSize: 10,
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
