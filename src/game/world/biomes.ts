import { WATER_LEVEL } from '../config';
import { distance2D } from '../utils/math';

export type BiomeId =
  | 'shallow_ocean'
  | 'basalt_shore'
  | 'ash_plains'
  | 'lava_rift'
  | 'volcanic_ridge'
  | 'crystal_crater';

export interface BiomeSample {
  id: BiomeId;
  ambientTempC: number;
  toxicLevel: number; // 0..1
  nearLava: boolean;
  nearWater: boolean;
}

export const VOLCANO_MAIN = { x: 0, z: -48 };
export const CRYSTAL_CRATER = { x: 38, z: -22 };

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
      nearLava: false,
      nearWater: true,
    };
  }

  if (craterDist < 17) {
    return {
      id: 'crystal_crater',
      ambientTempC: 39,
      toxicLevel: 0.22,
      nearLava,
      nearWater,
    };
  }

  if (lavaDist < 4.8) {
    return {
      id: 'lava_rift',
      ambientTempC: 66,
      toxicLevel: 0.42,
      nearLava: true,
      nearWater: false,
    };
  }

  if (volcanoDist < 26 || height > 7.5) {
    return {
      id: 'volcanic_ridge',
      ambientTempC: 46,
      toxicLevel: 0.55,
      nearLava,
      nearWater: false,
    };
  }

  if (height <= WATER_LEVEL + 1.5) {
    return {
      id: 'basalt_shore',
      ambientTempC: 36,
      toxicLevel: 0.06,
      nearLava,
      nearWater: true,
    };
  }

  return {
    id: 'ash_plains',
    ambientTempC: nearLava ? 49 : 38,
    toxicLevel: nearLava ? 0.25 : 0.08,
    nearLava,
    nearWater,
  };
}
