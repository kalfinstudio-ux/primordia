# PRIMORDIA — 3D Open-World Primordial Earth Survival Game

**PRIMORDIA** is a browser-based 3D open-world survival exploration game set during Earth's Hadean–Archean eras—before plants, animals, or other humans existed. Stream across a 4 km × 4 km bare basalt planet with active volcanoes, molten lava rivers, sulfur fumaroles, obsidian fields, hydrothermal geyser basins, meteorite impact zones, and shallow steaming oceans.

## Stage 2 Highlights
- **Responsive Portrait & Landscape HUD (`src/ui/HudScreen.tsx`)**: Safe-area inset support (`env(safe-area-inset-*)`), multi-touch joystick + simultaneous look/actions, HUD scale/opacity/handedness controls, collapsible quest card, long-press hotbar inspect/drop, fullscreen + landscape orientation lock, and `<420px` short-landscape scrolling.
- **60 Hz Fixed-Timestep Physics & Collision (`src/game/core/loop.ts`, `spatialHash.ts`, `player/controller.ts`, `camera.ts`)**: Sub-stepped deterministic simulation, `SpatialHashGrid` capsule-vs-cylinder obstacle sliding, steep slope blocking & downhill sliding, deep-water swimming, camera boom collision sweep, and `F3` / triple-tap debug telemetry.
- **4 km × 4 km Chunk-Streamed Open World (`src/game/world/`)**: 64 m LOD chunks with edge skirts and off-thread Web Worker generation (`terrainWorker.ts`), 10 primordial biomes, 12 regional POIs, moving ocean mesh, ground lightning strike telegraphs, seismic fissure decals, and `[M]` interactive Survey Map with fog-of-war, waypoints, and Fast-Travel Beacons.
- **Character System & Optional `.glb` Explorer (`src/game/player/`)**: Articulated procedural humanoid (`CapsuleGeometry`, 4 hair/hood styles, 3 body builds, 3 pack styles, live 3D customization preview, surface-aware footstep audio, ash soot accumulation) plus automatic drop-in `.glb` loader. To use a custom humanoid character (e.g. Ready Player Me / Mixamo export), place your rigged model with `Idle`, `Walk`, `Run`, `Jump`, `Swim`, and `Mine` clips at `public/models/explorer.glb`.
- **5-Tier Crafting, Modular Building & Campaign (`src/game/data/`, `systems/`)**: 42 items across 5 tech tiers, 33 recipes with station proximity & material unlocks, snap-grid modular building (`3m` ghost preview), persistent Storage Chests, 22-quest **"Seed of Life"** campaign + Victory/New Game+, `[J]` Discovery Journal / Achievements / Repeatable Survey Contracts, and timed world events.
- **PWA, Save Migration & Hardened Supabase Sync (`public/`, `src/game/systems/saveLoad.ts`, `supabase/`)**: Offline Service Worker, install prompt, v1 → v2 save migration, Cloud Save Conflict resolution (`Keep Local / Keep Cloud / Keep Both`), and validated server-side Postgres RPC leaderboard (`submit_validated_score`).

## Running Locally & Testing
```bash
npm install
npm test
npm run lint
npm run dev
```

## Deploying to GitHub Pages
1. Push the repository to GitHub (`main` branch).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. (Optional) Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Settings → Secrets and variables → Actions**.
4. `.github/workflows/deploy.yml` runs `npm ci`, `npm run lint`, `npm test`, `npm run build` (`base: './'`), and deploys `dist/`.
