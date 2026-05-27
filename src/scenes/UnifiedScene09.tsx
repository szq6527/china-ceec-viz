// UnifiedScene09.tsx
// Combines SceneCountryTypology (cluster view) and Scene9DualOutward (scatter & bar view)
// Premium glassmorphism segmented control with smooth transitions.

import { useState } from "react";
import { SceneCountryTypology } from "./SceneCountryTypology";
import { Scene9DualOutward } from "./Scene9DualOutward";

interface Props {
  active: boolean;
}

export function UnifiedScene09({ active }: Props) {
  const [view, setView] = useState<"typology" | "dual">("typology");

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <style>{`
        @keyframes scene09PillGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(76,201,240,0.25), inset 0 1px 0 rgba(255,255,255,0.12); }
          50%       { box-shadow: 0 0 22px rgba(76,201,240,0.5),  inset 0 1px 0 rgba(255,255,255,0.22); }
        }
        .s09-pill {
          position: absolute;
          top: 4px; bottom: 4px;
          border-radius: 7px;
          background: linear-gradient(135deg, rgba(76,201,240,0.22) 0%, rgba(76,201,240,0.07) 100%);
          border: 1px solid rgba(76,201,240,0.38);
          animation: scene09PillGlow 3.2s ease-in-out infinite;
          transition: left 230ms cubic-bezier(0.4,0,0.2,1);
          pointer-events: none;
        }
        .s09-tab {
          position: relative; z-index: 1;
          width: 148px; padding: 9px 0;
          background: transparent; border: none;
          font-family: var(--mono); font-size: 12px;
          letter-spacing: 0.13em; cursor: pointer;
          transition: color 200ms ease, text-shadow 200ms ease;
        }
      `}</style>

      {/* Premium glassmorphism segmented control */}
      <SegmentedControl view={view} onChange={setView} />

      {view === "typology" && <SceneCountryTypology active={active} />}
      {view === "dual"     && <Scene9DualOutward    active={active} />}
    </div>
  );
}

function SegmentedControl({
  view,
  onChange,
}: {
  view: "typology" | "dual";
  onChange: (v: "typology" | "dual") => void;
}) {
  const tabs: { id: "typology" | "dual"; label: string }[] = [
    { id: "typology", label: "四种合作命运" },
    { id: "dual",     label: "双外向型"     },
  ];
  const TAB_W = 148;
  const selectedIdx = tabs.findIndex((t) => t.id === view);

  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(6,5,18,0.78)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: 11,
        padding: 4,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow:
          "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Sliding pill */}
      <div
        className="s09-pill"
        style={{ left: 4 + selectedIdx * TAB_W, width: TAB_W }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="s09-tab"
          style={{
            color:
              view === tab.id
                ? "rgba(255,255,255,0.95)"
                : "rgba(201,194,173,0.4)",
            fontWeight: view === tab.id ? 700 : 400,
            textShadow:
              view === tab.id
                ? "0 0 14px rgba(76,201,240,0.65)"
                : "none",
          }}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
