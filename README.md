# PRIMORDIA — 3D Early Earth Survival Game

**PRIMORDIA** is a browser-based 3D open-world survival exploration game set during Earth's Hadean–Archean eras—before plants, animals, or other humans existed. Navigate barren basalt ridges, active volcanoes, molten lava rivers, shallow steaming oceans, acid rain, ash storms, and meteor showers while managing body temperature, oxygen, stamina, and hydration.

## Features
- **Procedural 3D World (`src/game/world/`)**: Seeded basalt terrain, Mount Hadean volcano with rising ash plume, flowing molten lava river, shallow steaming Archean ocean, day/night cycle, electrical/ash/acid-rain weather, and falling meteors with ground danger telegraphs.
- **Survival & Progression (`src/game/systems/`, `src/game/player/`)**: Customizable 10-part 3D explorer, temperature/oxygen/water/stamina/health simulation, resource gathering, crafting (Stone Axe, Water Vessel, Heat Shield, Basalt Shelter, Lava Hearth), structure building, 5 chained starter quests, and 60-second autosave.
- **Desktop & Mobile Touch Support**: Full keyboard/mouse controls plus adaptive virtual thumbstick and touch action buttons.
- **Localization (`src/i18n/`)**: Indonesian (`id`) default and English (`en`) switchable live in Settings.
- **Offline Guest Mode + Optional Supabase Cloud Sync (`src/game/net/`, `supabase/`)**: Email/password, magic link, multi-slot cloud saves, settings sync, and leaderboard.

## Architecture
- `src/game/`: Framework-independent Three.js engine, world generation, player controller, survival systems, Web Audio synthesizer, and Supabase client modules communicating via `eventBus.ts`.
- `src/ui/`: React UI shell covering Splash, Onboarding, Main Menu, Auth/Guest, New Game, Load Game, 6-tab Settings, HUD, Pause, Inventory & Crafting, Game Over/Respawn, and Credits.
- `supabase/`: Database schema (`schema.sql`), RLS policies (`policies.sql`), and setup guide (`README-supabase.md`).

## Running Locally
```bash
npm install
npm run dev
```

## Deploying to GitHub Pages
1. Push the repository to GitHub with `main` as the default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. (Optional) Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Settings → Secrets and variables → Actions**.
4. Every push to `main` builds with `vite.config.ts` (`base: './'`) and deploys `dist/` via `.github/workflows/deploy.yml`.
