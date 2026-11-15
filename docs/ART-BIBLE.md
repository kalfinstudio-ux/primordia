# PRIMORDIA Art Bible — Original "Pixar-Inspired" Stylized Direction

**Studio / Author:** Jurkon Studio (100% original procedural code, shaders, and studio art — zero third-party models, textures, HDRIs, LUTs, or animations).  
**Scope:** Visual direction for explorers (Adam & Hawa), companion golem (Bruk), world lighting, materials, atmosphere, hazards, and animation/camera craft across `High / Medium / Low` graphics tiers.

---

## 1. Visual Pillars

1. **Tactile Handmade Forms:** Every character, golem, rock, crystal, and shelter feels sculpted rather than mathematically boxy. Prefer beveled forms, tapered silhouettes, subtle organic asymmetry, and clean silhouette separation over noisy micro-detail.
2. **Film-Lit Primordial Warmth:** Contrast warm ember/amber key sunlight against cool slate-blue sky bounce and crisp rim separation so characters and props read like miniature physical maquettes under cinema lighting—never flat ambient gray.
3. **Readability Before Decoration:** Dark volcanic basalt ground (`TERRAIN_DARKEN` values) acts as a low-frequency stage so the bright explorer, glowing Bruk, resources, and hazards pop immediately on a small phone screen—including for colour-blind players via shape, luminance contrast, and motion.
4. **Mobile-First Discipline:** Zero per-frame heap allocations, shared geometries and materials (`markShared`), vertex-baked crevice AO (`0` extra fragment taps), and progressive visual scaling across `High / Medium / Low` (with `Auto` FPS hysteresis).

---

## 2. Shape Language & Character Proportions

### Explorers (Adam & Hawa)
- **Proportions (~6.5–7 heads stylized):** Slightly larger, appealing head (`~1.05×–1.12×` readable silhouette at third-person camera distance ~7.4 m), expressive oversized eyes with clear iris/glint contrast, rounded brow ridge, soft nose/cheek planes, tapered limbs with chunky hands/boots for clear locomotion reads.
- **Silhouette & Gear:**
  - Broad-shouldered, sturdy **Adam** vs. agile, tapered-waist **Hawa**, both supporting `slim / standard / athletic` builds and `0.90–1.15` height scaling.
  - Distinct **hair silhouettes** (`short`, `buzz`, `ponytail`, `long`, `bun`, `braid`, `hood`) and **packs** (`o2_pack` twin cylinders, `expedition` tall frame + bedroll, `scout` sleek capsule) that stay crisp from behind (the primary gameplay camera angle).
  - **Held tool** attached cleanly to right-hand socket (`mixamorigRightHand` / `rightElbow`) and **heat shield** anchored to back/spine (`mixamorigSpine2` / `chestGroup`), offset cleanly outside every pack silhouette.
- **Facial Expression Targets (Morphs):** `blink`, `hurt`, `tired`, `cold`, `happy` — subtle, non-uncanny, readable in New Game preview, close camera, and status transitions.

### Bruk (Living Basalt Golem, 3.3 m)
- **Proportions & Silhouette:** Broad hunched shoulders, heavy tapering stone forearms/claws, sturdy pillar legs, angled twin turquoise crystal horns, single living amber slit-pupil eye (`Eye`) + scarred dead left socket (`EyeDead`), gold cheek ore nuggets, faceted brow/snout (matching `/public/studio/bruk/*` mascot identity).
- **Emotional Readability (Trust Levels 0–4):**
  - Low trust: cool charcoal basalt, dim embers, averted/hunched posture.
  - High trust: warm hearth-orange fissures (`Lava`), brighter golden-amber eye (`Eye`), open welcoming arm stance.

---

## 3. Lighting & Colour Grading Architecture

### 3-Point Film Lighting (`SkySystem`)
1. **Key Light (`sunLight`, `DirectionalLight`):** Warm primordial amber-orange (`#ffb06e` midday -> `#ff7a3d` dawn/dusk), intensity modulated by `dayFactor` and weather, tight shadow frustum (`1024×1024 PCFSoftShadowMap` on Medium/High).
2. **Sky/Ground Bounce (`hemiLight`, `HemisphereLight`):** Cool slate-mauve sky fill (`#7c8ba6` / biome-tinted) paired with warm magma-earth bounce (`#421c12`) so shadow faces never go muddy black.
3. **Silhouette Rim Light (`rimLight`, `DirectionalLight`, Medium & High only):** Positioned opposite the key azimuth at grazing elevation (`castShadow = false`) with a crisp cool-amber or sky-cyan tint (`intensity ~0.55–0.75`) to separate character shoulders, hair, horns, and boulders against dark terrain and horizon haze.
4. **Environment Reflections:** `RoomEnvironment` PMREM (`scene.environment`) kept active across all tiers so metals, obsidian, and suit visors never reflect black void.

### Filmic Tone & Colour Grade (`Engine`)
- **All tiers:** `SRGBColorSpace` + `ACESFilmicToneMapping` (`exposure ~1.12`).
- **High tier post-processing (`EffectComposer`):**
  1. `RenderPass`
  2. Half-resolution `UnrealBloomPass` (~75% fewer pixels; selective threshold `>= 0.9` so only lava, crystals, eyes, beacons, and sparks bloom)
  3. **Single-pass `FilmGradePass` (`ShaderPass`):** Warm shadow lift (subtle sepia/plum split-toning in darks), clean highlight roll-off, gentle vibrance boost, and subtle edge vignette (`<= 14%` corner darkening) — zero extra render targets beyond composer ping-pong.
  4. `OutputPass`

---

## 4. Material & Surface Guidelines

| Surface | Roughness | Metalness | Shader / Finish Rule |
|---|---|---|---|
| **Explorer Skin (`Skin`)** | `0.62–0.68` | `0.0` | Warm wrap-lighting (`onBeforeCompile` half-Lambert / subtle red-orange terminator scatter on Medium & High) so noses, cheeks, and hands look soft and alive instead of harsh CG plastic. |
| **Hair (`Hair`)** | `0.52–0.65` | `0.04` | Softened specular sheen (`roughness` slightly lower than skin/cloth) for a gentle stylized highlight band. |
| **Expedition Cloth (`Cloth`)** | `0.78–0.86` | `0.08` | Tactile matte fabric that darkens cleanly with `sootLevel` and picks up rim light cleanly. |
| **Armor / Packs / Tools** | `0.28–0.38` | `0.65–0.80` | `>= 0.30` roughness separation from matte cloth so straps, tanks, and buckles pop. |
| **Bruk Basalt / Crystal / Gold** | `0.90` / `0.32` / `0.42` | `0.06` / `0.12` / `0.58` | Flat-faceted stone contrasted with glossy turquoise horns and warm brushed gold ore. |
| **Terrain & Rocks** | `0.85–0.92` | `0.06–0.10` | Vertex-baked concavity AO in `terrainHeight.ts` (Phase C2) + wet sheen darkening during rain/wading. |
| **Water & Lava** | `0.16` / `0.42` | `0.35` / `0.05` | Water uses Fresnel sky-tint + shallow shoreline contrast; lava pairs dark cooled crust plates with pulsing `emissiveIntensity >= 2.0` veins (Phase C2). |

---

## 5. Biome Palette & Atmospheric Integration

All 10 biomes retain existing `BIOME_ATMOSPHERE` fog multipliers (`atmosphere.ts`) and `LandmarkSilhouettes` (`landmarks.ts`), balanced for clear value separation:

- **Basalt Plains (`black_basalt_plains`):** Deep charcoal-umber earth, warm amber horizon haze (`#d9581a` day / `#2b110b` night).
- **Volcanic Ridge / Lava Rift (`volcanic_ridge`, `lava_rift`):** Scorched obsidian-crimson slopes, glowing ember cracks, fiery horizon tint (`#ff4a12` / `#ff3a0a`).
- **Sulfur Flats (`sulfur_flats`):** Warm ochre-mustard dust (`#c9b02a`), golden-yellow mineral clusters, dense sulfuric mist (`fogMult: 1.3`).
- **Obsidian Fields / Crystal Crater (`obsidian_fields`, `crystal_crater`):** Cool indigo-violet basalt contrast (`#3a2a55` / `#7a5cc4`) offsetting bright warm orange crystals (`#fb923c`).
- **Geyser Basin / Shallow Ocean (`geyser_basin`, `shallow_ocean`):** Cool mineral teal-slate (`#9fb4b8` / `#7a8a8c`) giving visual relief from volcanic warmth.
- **Ash Dunes / Meteor Impact (`ash_dunes`, `meteor_impact`):** Warm taupe ash (`#8a7a6c`) and scorched rust craters (`#b8402a`).

---

## 6. Hazard Readability (Including Colour-Blind Accessibility)

Hazards **never rely solely on hue**:
1. **Lava & Heat Zones:** High luminance contrast (`emissive >= 2.0`), cooled dark crust patterns over bright veins, rising animated ember particles, plus HUD thermal badge + text.
2. **Toxic Vents & Acid Rain:** Distinct tall/ringed fumarole silhouette, rising vertical plumes/ripples, directional slanted rain streaks, paired with pulsing clean-air directional arrow + HUD hazard banner.
3. **Cold / Wet / Wind / Fall Threats:** HUD status badges pair distinct shapes (`Snowflake`, `Droplets`, `Wind`, `ArrowDown`) with localized labels (`i18n`), never color alone.

---

## 7. Quality-Tier Feature Matrix (`High / Medium / Low` + `Auto`)

| System | High | Medium | Low (Fallback / Software WebGL) |
|---|---|---|---|
| **DPR & Shadows** | `<= 2.0×`, `PCFSoftShadowMap` (1024) | `<= 1.5×`, `PCFSoftShadowMap` (1024) | `<= 1.0×`, real-time shadows OFF (blob contact discs only) |
| **Lighting Rig** | Key + Hemi + Rim Light + PMREM | Key + Hemi + Rim Light + PMREM | Key + Hemi + PMREM (no rim light) |
| **Post-Processing** | `RenderPass` -> half-res `UnrealBloomPass` -> `FilmGradePass` (grade + vignette) -> `OutputPass` | Direct render (`ACESFilmicToneMapping`) | Direct render (`ACESFilmicToneMapping`) |
| **Glow Halos** | Half-res Bloom + PBR emissive | Single shared `SpriteMaterial` additive `glowSprites` + PBR emissive | Emissive materials only |
| **Character Shading & Face** | Wrap-lit skin + hair sheen + morph expressions (`blink/hurt/cold/tired/happy`) | Wrap-lit skin + morph blink/hurt + shared materials | Standard PBR + blink |
| **Terrain & World (C2)** | Vertex-baked concavity AO + wet specular + stylized water/lava shaders | Same baked vertex AO + Fresnel water + scrolling lava | Same baked vertex AO + basic water/emissive lava |
| **Particles & Fog** | `<= 320` weather/ember particles + ground fog layers | `<= 180` particles + reduced fog layers | `<= 60` particles, 0 splash/fog layers |
