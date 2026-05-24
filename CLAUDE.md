# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # TypeScript check + Vite production build (outputs to dist/)
npm run preview    # Preview production build locally
npm run data       # Run data pipeline: python3 scripts/build_data.py
```

Deployment is automatic via GitHub Actions on push to `main` — builds and deploys `dist/` to GitHub Pages.

## Architecture

This is a **7-scene narrative data visualization** about China-CEEC scientific co-authorship (2011–2020), built as a single-page React app with no routing. It uses a mix of DOM/SVG (D3) and WebGL (Three.js via @react-three/fiber).

### Scene navigation

`App.tsx` owns all state: current `scene` (1–7), `autoplay` toggle, `transitioning` flag, and `viewMode` for Scene 2. All 7 `<Scene />` components are mounted simultaneously but only the active one is visible (opacity/pointer-events CSS). Scene transitions use a cinematic flash + letterbox animation (720ms). Controls: arrow keys, mouse wheel (debounced 600ms), space to toggle autoplay, escape to stop.

### Data loading

`useData.ts` exports a single `useData()` hook that fetches 7 JSON files from `public/data/` in parallel and returns an `AppData | null`. The `App.tsx` renders a loading screen until data arrives. All scene components receive `data: AppData` and `active: boolean` as props.

Data types are defined in `types.ts`: `YearlyDatum` (aggregate counts per year), `PerCountryDatum` (country-level 125/135 period stats with ranking), `PerCountryYearly` (per-country yearly estimates), `SubjectRow` (subject classification), `InstitutionRow` (institution-level counts), and `CountriesData` (geographic coordinates).

### Scene design pattern

Each scene file is a self-contained component that:
1. Receives `{ data, active }` (plus optional extra props like `viewMode`)
2. Animates its own entrance via `requestAnimationFrame` with a `progress` state (0→1)
3. Uses absolute positioning within the 1440×900 stage
4. Cleans up animation frames and timers on deactivation

Key scenes:
- **Scene 1**: Opening map with animated great-circle arcs from Beijing to 16 CEEC countries (`WorldMap.tsx` component using D3 geoNaturalEarth1 projection)
- **Scene 2**: Bar race (16 country rows re-ranking over time) + heatmap (geographic choropleth on TopoJSON map with clickable country labels). Toggleable via `viewMode`
- **Scene 3**: Slope graph showing rank changes between two 5-year periods (125 vs 135). Two-segment Y-scale for better readability in the crowded top ranks
- **Scene 4**: Three.js 3D collider detector visualization using @react-three/fiber. Particle system simulating co-author "particles", camera dolly-in, post-processing effects
- **Scene 5**: Stacked horizontal bars by subject category (physics/medicine/materials/biology/chemistry), toggling physics strip mode every 4s
- **Scene 6**: Revisited world map with arcs recomputed after stripping physics, showing "real bilateral" cooperation
- **Scene 7**: Institution-level force-directed network graph (D3 force simulation) with period/physics toggles, plus an alternative geographic map view

### Viewport scaling

The app is designed at a fixed **1440×900** resolution. `App.tsx` computes `--app-scale` as `min(windowWidth/1440, windowHeight/900, 1)` and applies it via CSS `transform: scale()` on `.app-shell`. The SVG scenes use `viewBox` for their own internal scaling. This means all positioning coordinates are in the 1440×900 design space.

### Reusable components

- `WorldMap.tsx` — shared by Scenes 1 and 6. Renders country polygons + animated great-circle arcs from Beijing to CEEC capitals. Props: `beijing`, `countries`, `arcs`, `width`, `height`, `progress`.

### Data pipeline

Python scripts in `scripts/` generate the JSON files in `public/data/`:
- `build_data.py` — main data assembly from ScienceDB WoS exports
- `backfill_missing_countries.py` — fills gaps for Lithuania/North Macedonia via OpenAlex
- `fetch_openalex_megapapers.py` — samples mega-papers (ATLAS/CMS) to quantify CERN distortion (used in Scene 4)
- `fetch_institution_network.py` — builds the institution-level co-occurrence network (used in Scene 7)
- `redistribute_yearly.py` — estimates per-year distribution from period totals

The `public/data/` and `dist/data/` directories contain identical JSON files (build output + source-of-truth for deployment).

### Tech stack

React 18, TypeScript (strict), Vite 5, D3 v7, Three.js via @react-three/fiber + @react-three/postprocessing, GSAP (listed but sparingly used; animations are mostly rAF-based), topojson-client for map geometries.
