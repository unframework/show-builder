# CLAUDE.md

Gothic Folly show-builder — tools to author and preview LED light shows for a full-scale LED cathedral. This file covers the React-based cathedral simulator; see `README.md`, `getting-started.md`, and `CLI-PLAYBACK.md` for the xLights/relay pipeline.

## The React app

A Vite + React + TypeScript app living in-place at the repo root (entry `cathedral.html`, source in `src/`). It renders the cathedral in 3D with Three.js and previews live sACN data. The legacy standalone sims (`cathedral-3d-sim.html`, `rose-window-sim.html`, `arches-sim.html`) still exist.

Pixel pipeline: xLights → (sACN/E1.31) → WebSocket relay → (WS frames) → browser. The app itself runs the sim engine, which is fed from the WebSocket.

## Running it

Requires Node ≥20 (`.nvmrc` pins 24).

- `npm install` — first time only.
- `npm run dev` — then open http://localhost:5173/cathedral.html
- For live mode, run the relay in another terminal: `node relay/relay.js` (WebSocket + HTTP on port 3001). It bridges incoming sACN/E1.31 to the browser. The sidenav lists xLights sequences and can trigger headless renders; the **● LIVE** badge lights when DMX frames arrive. Without the relay the app runs in demo mode.

Other scripts: `npm run build` (`tsc -b && vite build`). Run `npm run format`, `npm run typecheck`, and `npm run lint` before committing.

## Layout & conventions

- `src/engine/` — imperative Three.js (scene, render loop, per-zone builders under `build/`).
- `src/relay/` — relay data frame reception.
- `src/components/` — misc UI chrome.
- `pixel-map/*.json` — LED positions, rendered by the engine.
