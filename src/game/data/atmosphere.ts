import type { BiomeId } from '../world/biomes';

/** Atmosfer per biome: pengali kepadatan kabut + semburat warna horizon. Murni data (tanpa three.js). */
export interface BiomeAtmosphere {
  /** Pengali kepadatan kabut (>1 = lebih pekat). */
  fogMult: number;
  /** Warna semburat horizon/kabut. */
  tint: string;
  /** Seberapa kuat semburat dicampur (0..1). */
  amount: number;
}

export const BIOME_ATMOSPHERE: Record<BiomeId, BiomeAtmosphere> = {
  shallow_ocean: { fogMult: 1.25, tint: '#7a8a8c', amount: 0.5 },
  black_basalt_plains: { fogMult: 1.0, tint: '#000000', amount: 0 },
  volcanic_ridge: { fogMult: 1.15, tint: '#ff4a12', amount: 0.45 },
  lava_rift: { fogMult: 1.2, tint: '#ff3a0a', amount: 0.55 },
  sulfur_flats: { fogMult: 1.3, tint: '#c9b02a', amount: 0.55 },
  obsidian_fields: { fogMult: 0.9, tint: '#3a2a55', amount: 0.4 },
  geyser_basin: { fogMult: 1.45, tint: '#9fb4b8', amount: 0.5 },
  crystal_crater: { fogMult: 0.9, tint: '#7a5cc4', amount: 0.45 },
  ash_dunes: { fogMult: 1.35, tint: '#8a7a6c', amount: 0.5 },
  meteor_impact: { fogMult: 1.1, tint: '#b8402a', amount: 0.4 },
};

export function atmosphereFor(id: BiomeId): BiomeAtmosphere {
  return BIOME_ATMOSPHERE[id] ?? BIOME_ATMOSPHERE.black_basalt_plains;
}
