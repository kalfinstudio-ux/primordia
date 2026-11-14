import { hashString, lerp } from '../utils/math';

export interface Noise2D {
  sample(x: number, z: number): number;
  fbm(x: number, z: number, octaves?: number, lacunarity?: number, gain?: number): number;
  ridged(x: number, z: number, octaves?: number): number;
}

export function createNoise2D(seedStr: string): Noise2D {
  const baseSeed = hashString(seedStr || 'HADEAN-01');

  const hash2 = (ix: number, iz: number): number => {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + baseSeed;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const sample = (x: number, z: number): number => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);

    return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
  };

  const fbm = (x: number, z: number, octaves = 4, lacunarity = 2.05, gain = 0.5): number => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += sample(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / (norm || 1);
  };

  const ridged = (x: number, z: number, octaves = 3): number => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(sample(x * freq, z * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / (norm || 1);
  };

  return { sample, fbm, ridged };
}
