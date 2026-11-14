import { WATER_LEVEL, WORLD_HALF_EXTENT } from '../config';
import { clamp, distance2D, lerp, smoothstep } from '../utils/math';
import type { Noise2D } from './noise';
import { CRYSTAL_CRATER, VOLCANO_MAIN, WORLD_POIS, getBiomeAt, getDistanceToLava, getLavaRiverCenterX } from './biomes';

export function sampleWorldHeight(noise: Noise2D, x: number, z: number): number {
  // Continental basalt terrain + ridged tectonic faults
  const continent = noise.fbm(x * 0.0032, z * 0.0032, 3) * 8.5;
  const broad = noise.fbm(x * 0.016, z * 0.016, 4) * 5.2;
  const ridged = noise.ridged(x * 0.028 + 11.3, z * 0.028 - 5.1, 3) * 3.4;
  let h = continent + broad + ridged - 1.2;

  // Keep starter basin (radius 110m) rich and recognizable while streaming 4km x 4km around it
  const spawnDist = distance2D(x, z, 0, 18);
  const spawnFlatten = 1 - smoothstep(4, 16, spawnDist);
  h = lerp(h, 0.85, spawnFlatten);

  // Starter shallow steaming pool near (16, 22) and southern coastline
  const starterPoolDist = distance2D(x, z, 16, 22);
  if (starterPoolDist < 12) {
    const dip = (1 - smoothstep(2.5, 11.5, starterPoolDist)) * 2.5;
    h = Math.min(h, 0.8 - dip);
  }
  if (Math.hypot(x, z) < 130) {
    const oceanMask = smoothstep(24, 52, z + x * 0.25) * (1 - smoothstep(75, 130, Math.hypot(x, z)));
    h -= oceanMask * 3.4;
  }

  // Main Volcano cone at (0, -48)
  const vDist = distance2D(x, z, VOLCANO_MAIN.x, VOLCANO_MAIN.z);
  if (vDist < 34) {
    const cone = (1 - smoothstep(4, 34, vDist)) * 21.5;
    const craterBowl = (1 - smoothstep(1.5, 7.5, vDist)) * 9.5;
    h += cone - craterBowl;
  }

  // Lava river trench from volcano down to (-30, 22)
  if (z >= -44 && z <= 25) {
    const rx = getLavaRiverCenterX(z);
    const rDist = Math.abs(x - rx);
    if (rDist < 6.5) {
      const carve = (1 - smoothstep(1.8, 6.5, rDist)) * 2.8;
      h = Math.min(h, -0.55) - carve * 0.35;
    }
  }

  // Starter Crystal Crater (38, -22)
  const cDist = distance2D(x, z, CRYSTAL_CRATER.x, CRYSTAL_CRATER.z);
  if (cDist < 20) {
    const rim = Math.exp(-Math.pow((cDist - 12.5) / 3.8, 2)) * 3.4;
    const bowl = (1 - smoothstep(2, 11.5, cDist)) * 3.2;
    h += rim - bowl;
  }

  // Regional POIs across the 4km world
  for (const poi of WORLD_POIS) {
    if (poi.id === 'poi_volcano_main' || poi.id === 'poi_crystal_east') continue;
    const d = distance2D(x, z, poi.x, poi.z);
    if (poi.kind === 'volcano' && d < 52) {
      h += (1 - smoothstep(6, 52, d)) * 26 - (1 - smoothstep(2, 10, d)) * 11;
    } else if ((poi.kind === 'crater' || poi.kind === 'meteor_site') && d < 36) {
      const rim = Math.exp(-Math.pow((d - 20) / 5.2, 2)) * 4.5;
      const bowl = (1 - smoothstep(3, 18, d)) * 4.2;
      h += rim - bowl;
    } else if (poi.kind === 'geyser' && d < 28) {
      const basin = (1 - smoothstep(3, 25, d)) * 2.6;
      h = lerp(h, WATER_LEVEL + 0.15 - basin * 0.35, 1 - smoothstep(6, 26, d));
    } else if (poi.kind === 'obsidian_crevasse' && d < 32) {
      const spike = Math.sin(x * 0.25) * Math.cos(z * 0.25) * 2.2;
      h += (1 - smoothstep(5, 32, d)) * (2.5 + spike);
    }
  }

  // Natural oceanic shelf boundary near ±2048m world perimeter
  const edgeDist = Math.max(Math.abs(x), Math.abs(z));
  if (edgeDist > WORLD_HALF_EXTENT - 90) {
    const cliff = smoothstep(WORLD_HALF_EXTENT - 90, WORLD_HALF_EXTENT + 20, edgeDist) * 22;
    h += cliff;
  }

  return h;
}

export function sampleTerrainColor(noise: Noise2D, x: number, z: number, y: number): [number, number, number] {
  const lavaDist = getDistanceToLava(x, z);
  const biome = getBiomeAt(x, z, y);
  const n = noise.fbm(x * 0.08, z * 0.08, 2) * 0.5 + 0.5;

  if (y < WATER_LEVEL + 0.35) {
    return [0.15 + n * 0.04, 0.14 + n * 0.03, 0.12 + n * 0.02];
  }
  if (lavaDist < 3.6) {
    const glow = clamp(1 - lavaDist / 3.6, 0, 1);
    return [lerp(0.14, 0.72, glow * 0.7), lerp(0.09, 0.11, glow), 0.07];
  }

  switch (biome.id) {
    case 'sulfur_flats':
      return [lerp(0.24, 0.56, n), lerp(0.22, 0.44, n), lerp(0.11, 0.12, n)];
    case 'obsidian_fields':
      return [lerp(0.08, 0.16, n), lerp(0.08, 0.14, n), lerp(0.14, 0.26, n)];
    case 'geyser_basin':
      return [lerp(0.18, 0.36, n), lerp(0.25, 0.42, n), lerp(0.24, 0.38, n)];
    case 'meteor_impact':
      return [lerp(0.16, 0.24, n), lerp(0.16, 0.25, n), lerp(0.2, 0.33, n)];
    case 'crystal_crater':
      return [lerp(0.18, 0.28, n), lerp(0.14, 0.19, n), lerp(0.13, 0.18, n)];
    case 'ash_dunes':
      return [lerp(0.22, 0.34, n), lerp(0.19, 0.28, n), lerp(0.17, 0.24, n)];
    case 'volcanic_ridge':
      return [lerp(0.13, 0.28, n), lerp(0.11, 0.19, n), lerp(0.1, 0.14, n)];
    default:
      return [lerp(0.16, 0.27, n), lerp(0.14, 0.2, n), lerp(0.13, 0.17, n)];
  }
}

export interface ResolvedAnchor {
  x: number;
  z: number;
  r: number;
  noise: Noise2D;
}

function anchorWeight(a: ResolvedAnchor, x: number, z: number): number {
  return 1 - smoothstep(a.r * 0.7, a.r, Math.hypot(x - a.x, z - a.z));
}

/** Tinggi medan dengan jangkar: di dalam radius jangkar dipakai medan beku, lalu dicampur halus ke medan baru. */
export function sampleHeightAnchored(noise: Noise2D, anchors: readonly ResolvedAnchor[], x: number, z: number): number {
  let h = sampleWorldHeight(noise, x, z);
  for (const a of anchors) {
    const w = anchorWeight(a, x, z);
    if (w > 0) h = lerp(h, sampleWorldHeight(a.noise, x, z), w);
  }
  return h;
}

function pickColorNoise(noise: Noise2D, anchors: readonly ResolvedAnchor[], x: number, z: number): Noise2D {
  for (const a of anchors) if (anchorWeight(a, x, z) >= 0.5) return a.noise;
  return noise;
}

export function buildChunkGeometryData(
  seed: string,
  noise: Noise2D,
  chunkX: number,
  chunkZ: number,
  chunkSize: number,
  segments: number,
  anchors: readonly ResolvedAnchor[] = []
): { positions: Float32Array; colors: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const gridN = segments + 1;
  const baseVerts = gridN * gridN;
  const skirtVerts = gridN * 4;
  const totalVerts = baseVerts + skirtVerts;

  const positions = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  const originX = chunkX * chunkSize - chunkSize * 0.5;
  const originZ = chunkZ * chunkSize - chunkSize * 0.5;
  const step = chunkSize / segments;
  const skirtDepth = 3.5;

  // Grid vertices
  for (let gz = 0; gz < gridN; gz++) {
    for (let gx = 0; gx < gridN; gx++) {
      const idx = gz * gridN + gx;
      const wx = originX + gx * step;
      const wz = originZ + gz * step;
      const wy = sampleHeightAnchored(noise, anchors, wx, wz);

      positions[idx * 3] = wx - chunkX * chunkSize;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = wz - chunkZ * chunkSize;

      const [r, g, b] = sampleTerrainColor(pickColorNoise(noise, anchors, wx, wz), wx, wz, wy);
      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;

      // Finite-difference normal so chunk edges match seamlessly
      const eps = 0.85;
      const hL = sampleHeightAnchored(noise, anchors, wx - eps, wz);
      const hR = sampleHeightAnchored(noise, anchors, wx + eps, wz);
      const hD = sampleHeightAnchored(noise, anchors, wx, wz - eps);
      const hU = sampleHeightAnchored(noise, anchors, wx, wz + eps);
      const nx = hL - hR;
      const ny = 2 * eps;
      const nz = hD - hU;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      normals[idx * 3] = nx * invLen;
      normals[idx * 3 + 1] = ny * invLen;
      normals[idx * 3 + 2] = nz * invLen;
    }
  }

  // Edge skirt vertices to hide LOD boundary cracks
  const copySkirt = (dstIdx: number, srcIdx: number) => {
    positions[dstIdx * 3] = positions[srcIdx * 3];
    positions[dstIdx * 3 + 1] = positions[srcIdx * 3 + 1] - skirtDepth;
    positions[dstIdx * 3 + 2] = positions[srcIdx * 3 + 2];
    colors[dstIdx * 3] = colors[srcIdx * 3];
    colors[dstIdx * 3 + 1] = colors[srcIdx * 3 + 1];
    colors[dstIdx * 3 + 2] = colors[srcIdx * 3 + 2];
    normals[dstIdx * 3] = normals[srcIdx * 3];
    normals[dstIdx * 3 + 1] = normals[srcIdx * 3 + 1];
    normals[dstIdx * 3 + 2] = normals[srcIdx * 3 + 2];
  };

  const northStart = baseVerts;
  const southStart = baseVerts + gridN;
  const westStart = baseVerts + gridN * 2;
  const eastStart = baseVerts + gridN * 3;

  for (let i = 0; i < gridN; i++) {
    copySkirt(northStart + i, i);
    copySkirt(southStart + i, (gridN - 1) * gridN + i);
    copySkirt(westStart + i, i * gridN);
    copySkirt(eastStart + i, i * gridN + (gridN - 1));
  }

  const quadCount = segments * segments + segments * 4;
  const indices = new Uint32Array(quadCount * 6);
  let ptr = 0;

  for (let gz = 0; gz < segments; gz++) {
    for (let gx = 0; gx < segments; gx++) {
      const a = gz * gridN + gx;
      const b = a + 1;
      const c = a + gridN;
      const d = c + 1;
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }

  const pushSkirtSide = (edgeFn: (i: number) => number, skirtBase: number, flip: boolean) => {
    for (let i = 0; i < segments; i++) {
      const a = edgeFn(i);
      const b = edgeFn(i + 1);
      const c = skirtBase + i;
      const d = skirtBase + i + 1;
      if (flip) {
        indices[ptr++] = a;
        indices[ptr++] = b;
        indices[ptr++] = c;
        indices[ptr++] = b;
        indices[ptr++] = d;
        indices[ptr++] = c;
      } else {
        indices[ptr++] = a;
        indices[ptr++] = c;
        indices[ptr++] = b;
        indices[ptr++] = b;
        indices[ptr++] = c;
        indices[ptr++] = d;
      }
    }
  };

  pushSkirtSide((i) => i, northStart, false);
  pushSkirtSide((i) => (gridN - 1) * gridN + i, southStart, true);
  pushSkirtSide((i) => i * gridN, westStart, true);
  pushSkirtSide((i) => i * gridN + (gridN - 1), eastStart, false);

  void seed;
  return { positions, colors, normals, indices };
}
