import { WATER_LEVEL, WORLD_HALF_EXTENT } from '../config';
import { distance2D } from '../utils/math';
import { generatePois, type PoiKind, type WorldPoi } from './poiGen';

export type { PoiKind, WorldPoi };

export type BiomeId =
  | 'shallow_ocean'
  | 'black_basalt_plains'
  | 'volcanic_ridge'
  | 'lava_rift'
  | 'sulfur_flats'
  | 'obsidian_fields'
  | 'geyser_basin'
  | 'crystal_crater'
  | 'ash_dunes'
  | 'meteor_impact';

export interface BiomeSample {
  id: BiomeId;
  ambientTempC: number;
  toxicLevel: number; // 0..1
  radiationLevel: number; // 0..1
  nearLava: boolean;
  nearWater: boolean;
  surfaceType: 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur';
}

export const VOLCANO_MAIN = { x: 0, z: -48 };
export const CRYSTAL_CRATER = { x: 38, z: -22 };

// Titik penting buatan tangan (inti dunia, tidak berubah)
export const HANDCRAFTED_POIS: WorldPoi[] = [
  { id: 'poi_volcano_main', kind: 'volcano', x: 0, z: -48, labelKey: 'biomes.volcanic_ridge' },
  { id: 'poi_crystal_east', kind: 'crater', x: 38, z: -22, labelKey: 'biomes.crystal_crater' },
  { id: 'poi_geyser_nw', kind: 'geyser', x: -92, z: -64, labelKey: 'biomes.geyser_basin' },
  { id: 'poi_obsidian_ne', kind: 'obsidian_crevasse', x: 145, z: -135, labelKey: 'biomes.obsidian_fields' },
  { id: 'poi_meteor_sw', kind: 'meteor_site', x: -180, z: 140, labelKey: 'biomes.meteor_impact' },
  { id: 'poi_geyser_far_e', kind: 'geyser', x: 320, z: 85, labelKey: 'biomes.geyser_basin' },
  { id: 'poi_crater_far_n', kind: 'crater', x: -240, z: -420, labelKey: 'biomes.crystal_crater' },
  { id: 'poi_meteor_far_se', kind: 'meteor_site', x: 480, z: 390, labelKey: 'biomes.meteor_impact' },
  { id: 'poi_volcano_far_w', kind: 'volcano', x: -640, z: -120, labelKey: 'biomes.volcanic_ridge' },
  { id: 'poi_obsidian_far_s', kind: 'obsidian_crevasse', x: 110, z: 540, labelKey: 'biomes.obsidian_fields' },
  { id: 'poi_geyser_deep_n', kind: 'geyser', x: 520, z: -680, labelKey: 'biomes.geyser_basin' },
  { id: 'poi_meteor_deep_nw', kind: 'meteor_site', x: -860, z: -780, labelKey: 'biomes.meteor_impact' },
];

/** Titik penting = buatan tangan + generator deterministik (grid berjitter, tata letak tetap). */
export const WORLD_POIS: WorldPoi[] = [
  ...HANDCRAFTED_POIS,
  ...generatePois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT),
];

const POIS_BY_KIND: Record<PoiKind, WorldPoi[]> = {
  volcano: [],
  crater: [],
  geyser: [],
  obsidian_crevasse: [],
  meteor_site: [],
  lava_tube: [],
  hot_spring: [],
};
for (const p of WORLD_POIS) POIS_BY_KIND[p.kind].push(p);

/** Cepat (tanpa akar kuadrat): apakah (x,z) dalam radius r dari POI berjenis kind. */
function nearPoiKind(kind: PoiKind, x: number, z: number, r: number): boolean {
  const r2 = r * r;
  for (const p of POIS_BY_KIND[kind]) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

export function getLavaRiverCenterX(z: number): number {
  return -14 + Math.sin(z * 0.075) * 10 - (z + 48) * 0.25;
}

export function getDistanceToLava(x: number, z: number): number {
  const craterDist = distance2D(x, z, VOLCANO_MAIN.x, VOLCANO_MAIN.z);
  let minRiverDist = 999;
  if (z >= -48 && z <= 26) {
    const rx = getLavaRiverCenterX(z);
    minRiverDist = Math.abs(x - rx);
  }
  return Math.min(craterDist - 6.5, minRiverDist);
}

// Smooth macro climate/geology hashes using pure trig blending (seed-independent biome regions + local seed terrain)
function macroSignal(x: number, z: number, freq: number, phase: number): number {
  return (
    Math.sin(x * freq + phase) * 0.5 +
    Math.cos(z * freq * 1.13 - phase * 0.7) * 0.5
  );
}

export function getBiomeAt(x: number, z: number, height: number): BiomeSample {
  const craterDist = distance2D(x, z, CRYSTAL_CRATER.x, CRYSTAL_CRATER.z);
  const volcanoDist = distance2D(x, z, VOLCANO_MAIN.x, VOLCANO_MAIN.z);
  const lavaDist = getDistanceToLava(x, z);
  const nearLava = lavaDist < 6.5;
  const nearWater = height <= WATER_LEVEL + 0.65;

  if (height <= WATER_LEVEL + 0.05) {
    return {
      id: 'shallow_ocean',
      ambientTempC: 35,
      toxicLevel: 0.04,
      radiationLevel: 0,
      nearLava: false,
      nearWater: true,
      surfaceType: 'water',
    };
  }

  // Starter Crystal Crater & Regional Craters
  const nearCraterPoi = nearPoiKind('crater', x, z, 22);
  if (craterDist < 17 || nearCraterPoi) {
    return {
      id: 'crystal_crater',
      ambientTempC: 39,
      toxicLevel: 0.2,
      radiationLevel: 0.05,
      nearLava,
      nearWater,
      surfaceType: 'crystal',
    };
  }

  if (lavaDist < 4.8) {
    return {
      id: 'lava_rift',
      ambientTempC: 68,
      toxicLevel: 0.42,
      radiationLevel: 0,
      nearLava: true,
      nearWater: false,
      surfaceType: 'basalt',
    };
  }

  const nearVolcanoPoi = nearPoiKind('volcano', x, z, 34) || nearPoiKind('lava_tube', x, z, 20);
  if (volcanoDist < 26 || nearVolcanoPoi || height > 10.5) {
    return {
      id: 'volcanic_ridge',
      ambientTempC: 48,
      toxicLevel: 0.52,
      radiationLevel: 0,
      nearLava,
      nearWater: false,
      surfaceType: 'basalt',
    };
  }

  const nearMeteorPoi = nearPoiKind('meteor_site', x, z, 34);
  if (nearMeteorPoi) {
    return {
      id: 'meteor_impact',
      ambientTempC: 41,
      toxicLevel: 0.14,
      radiationLevel: 0.65,
      nearLava,
      nearWater,
      surfaceType: 'basalt',
    };
  }

  const nearGeyserPoi = nearPoiKind('geyser', x, z, 28) || nearPoiKind('hot_spring', x, z, 20);
  if (nearGeyserPoi) {
    return {
      id: 'geyser_basin',
      ambientTempC: 42,
      toxicLevel: 0.16,
      radiationLevel: 0,
      nearLava,
      nearWater: true,
      surfaceType: 'water',
    };
  }

  const nearObsidianPoi = nearPoiKind('obsidian_crevasse', x, z, 34);
  const heat = macroSignal(x, z, 0.0042, 1.3);
  const sulfur = macroSignal(x, z, 0.0038, -2.1);

  if (nearObsidianPoi || (heat > 0.48 && height > 1.2)) {
    return {
      id: 'obsidian_fields',
      ambientTempC: 40,
      toxicLevel: 0.14,
      radiationLevel: 0,
      nearLava,
      nearWater,
      surfaceType: 'obsidian',
    };
  }

  if (sulfur > 0.45 && height > 0.2) {
    return {
      id: 'sulfur_flats',
      ambientTempC: 43,
      toxicLevel: 0.62,
      radiationLevel: 0,
      nearLava,
      nearWater,
      surfaceType: 'sulfur',
    };
  }

  if (heat < -0.45 && height > 0.4) {
    return {
      id: 'ash_dunes',
      ambientTempC: 36,
      toxicLevel: 0.18,
      radiationLevel: 0,
      nearLava,
      nearWater,
      surfaceType: 'ash',
    };
  }

  return {
    id: 'black_basalt_plains',
    ambientTempC: nearLava ? 49 : 37.5,
    toxicLevel: nearLava ? 0.25 : 0.08,
    radiationLevel: 0,
    nearLava,
    nearWater,
    surfaceType: 'basalt',
  };
}
