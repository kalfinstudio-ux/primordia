/**
 * Pure ambient fauna placement, species selection, distance scheduling,
 * kill-persistence, and zero-allocation boids steering (no Three.js / React).
 */
import { CHUNK_SIZE, WATER_LEVEL } from '../config';
import { clamp, distance2D, hashString, mulberry32 } from '../utils/math';
import { BALANCE } from './balance';
import { getBiomeAt, getDistanceToLava, type BiomeId } from '../world/biomes';
import { dangerTier } from '../world/regions';

export type FaunaSpeciesId =
  | 'ash_hopper'
  | 'basalt_grazer'
  | 'hydro_skimmer'
  | 'cinder_beetle'
  | 'ridge_stalker'
  | 'magma_crawler';

export type FaunaHabitat = 'terrestrial' | 'aquatic' | 'volcanic';
export type FaunaTemperament = 'calm' | 'wary' | 'aggressive';
export type FaunaRateBucket = 'full' | 'medium' | 'coarse' | 'distant' | 'paused';

export interface FaunaSpeciesSpec {
  id: FaunaSpeciesId;
  habitat: FaunaHabitat;
  temperament: FaunaTemperament;
  isHerd: boolean;
  minTier: number;
  maxTier: number;
  allowedBiomes: readonly BiomeId[];
  speed: number;
  scale: number;
  baseColorHex: number;
  accentColorHex: number;
  bodyRadius: number;
  herdMin: number;
  herdMax: number;
}

export const FAUNA_SPECIES: Record<FaunaSpeciesId, FaunaSpeciesSpec> = {
  ash_hopper: {
    id: 'ash_hopper',
    habitat: 'terrestrial',
    temperament: 'calm',
    isHerd: true,
    minTier: 0,
    maxTier: 2,
    allowedBiomes: ['black_basalt_plains', 'ash_dunes', 'geyser_basin'],
    speed: 2.35,
    scale: 0.72,
    baseColorHex: 0x8d8274,
    accentColorHex: 0xd99b52,
    bodyRadius: 0.42,
    herdMin: 2,
    herdMax: 4,
  },
  basalt_grazer: {
    id: 'basalt_grazer',
    habitat: 'terrestrial',
    temperament: 'calm',
    isHerd: true,
    minTier: 0,
    maxTier: 3,
    allowedBiomes: ['black_basalt_plains', 'ash_dunes', 'crystal_crater', 'obsidian_fields'],
    speed: 1.9,
    scale: 1.15,
    baseColorHex: 0x5c534c,
    accentColorHex: 0xa68b6b,
    bodyRadius: 0.65,
    herdMin: 2,
    herdMax: 4,
  },
  hydro_skimmer: {
    id: 'hydro_skimmer',
    habitat: 'aquatic',
    temperament: 'calm',
    isHerd: true,
    minTier: 0,
    maxTier: 4,
    allowedBiomes: ['shallow_ocean', 'geyser_basin'],
    speed: 2.15,
    scale: 0.82,
    baseColorHex: 0x3b7a80,
    accentColorHex: 0x7fd4c9,
    bodyRadius: 0.45,
    herdMin: 2,
    herdMax: 4,
  },
  cinder_beetle: {
    id: 'cinder_beetle',
    habitat: 'terrestrial',
    temperament: 'wary',
    isHerd: true,
    minTier: 1,
    maxTier: 4,
    allowedBiomes: ['sulfur_flats', 'obsidian_fields', 'ash_dunes', 'crystal_crater', 'meteor_impact'],
    speed: 2.55,
    scale: 0.85,
    baseColorHex: 0x4b422e,
    accentColorHex: 0xd6b042,
    bodyRadius: 0.48,
    herdMin: 2,
    herdMax: 3,
  },
  ridge_stalker: {
    id: 'ridge_stalker',
    habitat: 'terrestrial',
    temperament: 'aggressive',
    isHerd: false,
    minTier: 1,
    maxTier: 4,
    allowedBiomes: ['black_basalt_plains', 'obsidian_fields', 'ash_dunes', 'meteor_impact', 'crystal_crater'],
    speed: 3.35,
    scale: 1.05,
    baseColorHex: 0x3f2d2c,
    accentColorHex: 0xe05d3a,
    bodyRadius: 0.58,
    herdMin: 1,
    herdMax: 1,
  },
  magma_crawler: {
    id: 'magma_crawler',
    habitat: 'volcanic',
    temperament: 'aggressive',
    isHerd: false,
    minTier: 2,
    maxTier: 4,
    allowedBiomes: ['volcanic_ridge', 'lava_rift', 'obsidian_fields'],
    speed: 2.85,
    scale: 1.12,
    baseColorHex: 0x2c2220,
    accentColorHex: 0xff6b2c,
    bodyRadius: 0.62,
    herdMin: 1,
    herdMax: 1,
  },
};

export const FAUNA_SPECIES_LIST: readonly FaunaSpeciesSpec[] = Object.values(FAUNA_SPECIES);

export interface FaunaSpawnRecord {
  id: string;
  speciesId: FaunaSpeciesId;
  herdId: string;
  chunkKey: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tintIndex: number;
  borderCrossing: boolean;
}

export interface FaunaGenerateParams {
  seed: string;
  chunkX: number;
  chunkZ: number;
  era: number | string;
  playerX: number;
  playerZ: number;
  playtimeSec: number;
  groundHeightAt: (x: number, z: number) => number;
  waterLevel?: number;
  killedFauna?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  chunkSize?: number;
  minSpawnDistM?: number;
  chunkPopCap?: number;
  capOvershootPct?: number;
  respawnDelaySec?: number;
}

/** Canonical chunk hash(seed, chunkX, chunkZ, era). */
export function hashFaunaChunk(seed: string, chunkX: number, chunkZ: number, era: number | string): number {
  return hashString(`fauna|${seed}|E:${era}|C:${chunkX},${chunkZ}`);
}

/**
 * Symmetric border seed across chunk pair (ax, az) <-> (bx, bz) so players arriving from either
 * chunk generate the exact same border-crossing herd IDs, species, and positions.
 */
export function hashFaunaBorder(
  seed: string,
  era: number | string,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const firstA = ax < bx || (ax === bx && az <= bz);
  const c1x = firstA ? ax : bx;
  const c1z = firstA ? az : bz;
  const c2x = firstA ? bx : ax;
  const c2z = firstA ? bz : az;
  return hashString(`faunaBorder|${seed}|E:${era}|${c1x},${c1z}|${c2x},${c2z}`);
}

export function chunkKeyOf(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function isTerrainSuitableForSpawn(
  x: number,
  z: number,
  groundHeightAt: (x: number, z: number) => number,
  maxSlopeDeg: number = BALANCE.fauna.maxSlopeDeg,
  pitDepthLimitM: number = BALANCE.fauna.pitDepthLimitM
): { ok: boolean; y: number } {
  const y = groundHeightAt(x, z);
  if (!Number.isFinite(y)) return { ok: false, y: 0 };

  const d = 2.0;
  const hN = groundHeightAt(x, z - d);
  const hS = groundHeightAt(x, z + d);
  const hW = groundHeightAt(x - d, z);
  const hE = groundHeightAt(x + d, z);
  if (!Number.isFinite(hN) || !Number.isFinite(hS) || !Number.isFinite(hW) || !Number.isFinite(hE)) {
    return { ok: false, y };
  }

  const grad = Math.hypot((hE - hW) / (2 * d), (hS - hN) / (2 * d));
  const slopeDeg = (Math.atan(grad) * 180) / Math.PI;
  if (slopeDeg > maxSlopeDeg) return { ok: false, y };

  const avg = (hN + hS + hW + hE) * 0.25;
  const minH = Math.min(hN, hS, hW, hE);
  const maxH = Math.max(hN, hS, hW, hE);
  if (y < avg - pitDepthLimitM) return { ok: false, y };
  if (maxH - minH > pitDepthLimitM * 1.45) return { ok: false, y };

  return { ok: true, y };
}

export function pickSpeciesForSite(
  biomeId: BiomeId,
  tier: number,
  y: number,
  waterLevel: number,
  lavaDist: number,
  roll: number
): FaunaSpeciesSpec | null {
  const isWater = y <= waterLevel - 0.12;
  const isDeepWater = y < waterLevel - 3.6;
  const isDryLand = y > waterLevel + BALANCE.fauna.waterClearanceM;

  if (isDeepWater) return null;

  const candidates: FaunaSpeciesSpec[] = [];
  for (let i = 0; i < FAUNA_SPECIES_LIST.length; i++) {
    const sp = FAUNA_SPECIES_LIST[i];
    if (tier < sp.minTier || tier > sp.maxTier) continue;
    if (!sp.allowedBiomes.includes(biomeId)) continue;

    if (sp.habitat === 'aquatic') {
      if (!isWater || lavaDist < 6.0) continue;
    } else if (sp.habitat === 'volcanic') {
      if (!isDryLand || lavaDist < 2.2) continue;
    } else {
      if (!isDryLand || lavaDist < BALANCE.fauna.minLavaClearanceM) continue;
    }
    candidates.push(sp);
  }

  if (candidates.length === 0) return null;
  const idx = Math.min(candidates.length - 1, Math.floor(clamp(roll, 0, 0.999999) * candidates.length));
  return candidates[idx];
}

export function sanitizeKilledFauna(raw: unknown): Record<string, Record<string, number>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [chunkKey, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof chunkKey !== 'string' || typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
      continue;
    }
    const cleanChunk: Record<string, number> = {};
    for (const [id, ts] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof id === 'string' && typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) {
        cleanChunk[id] = ts;
      }
    }
    if (Object.keys(cleanChunk).length > 0) out[chunkKey] = cleanChunk;
  }
  return out;
}

export function isFaunaKilled(
  killedFauna: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  chunkKey: string,
  creatureId: string,
  playtimeSec: number,
  respawnDelaySec: number = BALANCE.fauna.respawnDelaySec
): boolean {
  if (!killedFauna) return false;
  const chunkMap = killedFauna[chunkKey];
  if (!chunkMap) return false;
  const killedAt = chunkMap[creatureId];
  if (typeof killedAt !== 'number' || !Number.isFinite(killedAt)) return false;
  return playtimeSec - killedAt < respawnDelaySec;
}

export function recordFaunaKill(
  killedFauna: Record<string, Record<string, number>>,
  chunkKey: string,
  creatureId: string,
  playtimeSec: number
): void {
  if (!chunkKey || !creatureId) return;
  let chunkMap = killedFauna[chunkKey];
  if (!chunkMap) {
    chunkMap = {};
    killedFauna[chunkKey] = chunkMap;
  }
  chunkMap[creatureId] = Number.isFinite(playtimeSec) && playtimeSec >= 0 ? playtimeSec : 0;
}

export function pruneExpiredFaunaKills(
  killedFauna: Record<string, Record<string, number>>,
  playtimeSec: number,
  respawnDelaySec: number = BALANCE.fauna.respawnDelaySec
): number {
  let pruned = 0;
  for (const chunkKey of Object.keys(killedFauna)) {
    const chunkMap = killedFauna[chunkKey];
    for (const id of Object.keys(chunkMap)) {
      if (playtimeSec - chunkMap[id] >= respawnDelaySec) {
        delete chunkMap[id];
        pruned += 1;
      }
    }
    if (Object.keys(chunkMap).length === 0) {
      delete killedFauna[chunkKey];
    }
  }
  return pruned;
}

/**
 * Generate the deterministic creature list for chunk `(chunkX, chunkZ)`.
 * Combines canonical border-crossing herds (using symmetric neighbor hashes) and interior spawns,
 * strictly respecting spawn distance, habitat/hazard/slope checks, kill persistence, and cap + 25% overshoot.
 */
export function generateChunkFauna(params: FaunaGenerateParams): FaunaSpawnRecord[] {
  const {
    seed,
    chunkX,
    chunkZ,
    era,
    playerX,
    playerZ,
    playtimeSec,
    groundHeightAt,
    waterLevel = WATER_LEVEL,
    killedFauna,
    chunkSize = CHUNK_SIZE,
    minSpawnDistM = BALANCE.fauna.minSpawnDistM,
    chunkPopCap = BALANCE.fauna.chunkPopCap,
    capOvershootPct = BALANCE.fauna.capOvershootPct,
    respawnDelaySec = BALANCE.fauna.respawnDelaySec,
  } = params;

  const baseCap = Math.max(1, Math.floor(chunkPopCap));
  const maxAllowed = Math.max(baseCap, Math.floor(baseCap * (1 + Math.max(0, capOvershootPct))));
  const chunkKey = chunkKeyOf(chunkX, chunkZ);
  const centerX = chunkX * chunkSize;
  const centerZ = chunkZ * chunkSize;
  const half = chunkSize * 0.5;
  const out: FaunaSpawnRecord[] = [];
  const seenIds = new Set<string>();

  const tryAcceptMember = (
    id: string,
    species: FaunaSpeciesSpec,
    herdId: string,
    x: number,
    z: number,
    yaw: number,
    scaleJitter: number,
    tintIndex: number,
    borderCrossing: boolean
  ) => {
    if (out.length >= maxAllowed) return;
    if (seenIds.has(id)) return;
    if (isFaunaKilled(killedFauna, chunkKey, id, playtimeSec, respawnDelaySec)) return;
    if (distance2D(x, z, playerX, playerZ) < minSpawnDistM) return;

    const terr = isTerrainSuitableForSpawn(x, z, groundHeightAt);
    if (!terr.ok) return;

    const lavaDist = getDistanceToLava(x, z);
    const biome = getBiomeAt(x, z, terr.y);
    if (!species.allowedBiomes.includes(biome.id)) return;
    if (species.habitat === 'aquatic') {
      if (terr.y > waterLevel - 0.12 || terr.y < waterLevel - 3.6 || lavaDist < 6.0) return;
    } else if (species.habitat === 'volcanic') {
      if (terr.y <= waterLevel + BALANCE.fauna.waterClearanceM || lavaDist < 2.2) return;
    } else {
      if (terr.y <= waterLevel + BALANCE.fauna.waterClearanceM || lavaDist < BALANCE.fauna.minLavaClearanceM) return;
    }

    seenIds.add(id);
    out.push({
      id,
      speciesId: species.id,
      herdId,
      chunkKey,
      x,
      y: Math.max(terr.y, species.habitat === 'aquatic' ? waterLevel - 0.15 : terr.y),
      z,
      yaw,
      scale: species.scale * (0.9 + scaleJitter * 0.2),
      tintIndex,
      borderCrossing,
    });
  };

  // 1) Border-crossing herds across canonical shared chunk edges (independent of arrival direction)
  const edges: ReadonlyArray<[number, number]> = [
    [chunkX + 1, chunkZ],
    [chunkX - 1, chunkZ],
    [chunkX, chunkZ + 1],
    [chunkX, chunkZ - 1],
  ];
  for (let e = 0; e < edges.length; e++) {
    if (out.length >= baseCap) break;
    const [nx, nz] = edges[e];
    const bHash = hashFaunaBorder(seed, era, chunkX, chunkZ, nx, nz);
    const bRng = mulberry32(bHash);
    const activeRoll = bRng();
    if (activeRoll > 0.38) continue;

    // Canonical shared midpoint on the border between (chunkX, chunkZ) and (nx, nz)
    const midX = ((chunkX + nx) * 0.5) * chunkSize;
    const midZ = ((chunkZ + nz) * 0.5) * chunkSize;
    const alongOffset = (bRng() - 0.5) * (chunkSize - 16);
    const perpJitter = (bRng() - 0.5) * 3.0;
    const anchorX = nx === chunkX ? midX + alongOffset : midX + perpJitter;
    const anchorZ = nz === chunkZ ? midZ + alongOffset : midZ + perpJitter;

    const terrA = isTerrainSuitableForSpawn(anchorX, anchorZ, groundHeightAt);
    const lavaA = getDistanceToLava(anchorX, anchorZ);
    const biomeA = getBiomeAt(anchorX, anchorZ, terrA.y);
    const tierA = dangerTier(anchorX, anchorZ);
    const sp = pickSpeciesForSite(biomeA.id, tierA, terrA.y, waterLevel, lavaA, bRng());
    if (!sp || !sp.isHerd) continue;

    const herdSize = sp.herdMin + Math.floor(bRng() * (sp.herdMax - sp.herdMin + 1));
    const herdId = `herd_b_${bHash.toString(36)}`;
    for (let m = 0; m < herdSize; m++) {
      const ang = (m / herdSize) * Math.PI * 2 + bRng() * 0.8;
      const rad = 1.8 + bRng() * 5.2;
      const mx = anchorX + Math.cos(ang) * rad;
      const mz = anchorZ + Math.sin(ang) * rad;
      const myaw = bRng() * Math.PI * 2;
      const scaleJ = bRng();
      const tint = Math.floor(bRng() * 4);
      // Canonical chunk ownership: whichever chunk center `(cx*size, cz*size)` owns `(mx, mz)`
      const ownerCx = Math.round(mx / chunkSize);
      const ownerCz = Math.round(mz / chunkSize);
      if (ownerCx !== chunkX || ownerCz !== chunkZ) continue;
      if (out.length >= maxAllowed) break;
      tryAcceptMember(`fauna_b_${era}_${bHash.toString(36)}_${m}`, sp, herdId, mx, mz, myaw, scaleJ, tint, true);
    }
  }

  // 2) Interior deterministic spawns inside chunk `(chunkX, chunkZ)`
  const cHash = hashFaunaChunk(seed, chunkX, chunkZ, era);
  const rng = mulberry32(cHash);
  const groupAttempts = 3;

  for (let g = 0; g < groupAttempts; g++) {
    if (out.length >= baseCap) break;
    const gx = centerX + (rng() - 0.5) * (chunkSize - 12);
    const gz = centerZ + (rng() - 0.5) * (chunkSize - 12);
    const speciesRoll = rng();
    const herdRoll = rng();

    const terr = isTerrainSuitableForSpawn(gx, gz, groundHeightAt);
    if (!terr.ok) continue;

    const lavaDist = getDistanceToLava(gx, gz);
    const biome = getBiomeAt(gx, gz, terr.y);
    const tier = dangerTier(gx, gz);
    const sp = pickSpeciesForSite(biome.id, tier, terr.y, waterLevel, lavaDist, speciesRoll);
    if (!sp) continue;

    const count = sp.isHerd ? sp.herdMin + Math.floor(herdRoll * (sp.herdMax - sp.herdMin + 1)) : 1;
    const herdId = `herd_${era}_${chunkX}_${chunkZ}_${g}`;

    for (let m = 0; m < count; m++) {
      const ang = m === 0 ? 0 : (m / count) * Math.PI * 2 + rng() * 0.65;
      const dist = m === 0 ? 0 : 1.6 + rng() * 4.5;
      const mx = clamp(gx + Math.cos(ang) * dist, centerX - half + 2, centerX + half - 2);
      const mz = clamp(gz + Math.sin(ang) * dist, centerZ - half + 2, centerZ + half - 2);
      const myaw = rng() * Math.PI * 2;
      const scaleJ = rng();
      const tint = Math.floor(rng() * 4);
      if (out.length >= maxAllowed) break;
      tryAcceptMember(
        `fauna_${era}_${cHash.toString(36)}_${g}_${m}`,
        sp,
        herdId,
        mx,
        mz,
        myaw,
        scaleJ,
        tint,
        false
      );
    }
  }

  return out;
}

// ── Distance-based Activation Schedule (never freezes visible creatures) ─────

export function faunaRateBucket(distM: number, inView: boolean, loadedChunkMaxDistM: number): FaunaRateBucket {
  const d = Number.isFinite(distM) ? Math.max(0, distM) : Infinity;
  if (!inView && d > loadedChunkMaxDistM) return 'paused';
  if (d <= 40) return 'full';
  if (d <= 90) return 'medium';
  if (d <= 160) return 'coarse';
  return 'distant';
}

export function faunaUpdateInterval(
  distM: number,
  inView: boolean,
  loadedChunkMaxDistM: number,
  lowGfx: boolean
): number {
  const bucket = faunaRateBucket(distM, inView, loadedChunkMaxDistM);
  if (bucket === 'paused') return Infinity;
  if (bucket === 'full') return lowGfx ? 1 / 30 : 0;
  if (bucket === 'medium') return lowGfx ? 1 / 8 : 1 / 15;
  if (bucket === 'coarse') return lowGfx ? 1 / 4 : 1 / 6;
  return 1 / 3;
}

// ── Zero-Allocation Boids & Spatial Grid ─────────────────────────────────────

export interface FaunaActor {
  active: boolean;
  id: string;
  speciesId: FaunaSpeciesId;
  herdId: string;
  chunkKey: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  scale: number;
  tintIndex: number;
  homeX: number;
  homeZ: number;
  phase: number;
  stepAccum: number;
  lastBucket: FaunaRateBucket;
}

export interface BoidObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface BoidStepStats {
  neighborsUsed: number;
  avoidedObstacles: number;
}

const GRID_BUCKETS = 1024;
const GRID_CELL_SIZE = 12;

/** Fixed-buffer linked spatial hash grid — zero heap allocations per rebuild/query. */
export class FaunaSpatialGrid {
  readonly cellSize: number;
  private readonly heads = new Int32Array(GRID_BUCKETS);
  private next: Int32Array;

  constructor(maxActors = 256, cellSize = GRID_CELL_SIZE) {
    this.cellSize = cellSize;
    this.heads.fill(-1);
    this.next = new Int32Array(maxActors).fill(-1);
  }

  private bucketIndex(cx: number, cz: number): number {
    // Integer hash mod GRID_BUCKETS (power of 2)
    const h = (Math.imul(cx | 0, 73856093) ^ Math.imul(cz | 0, 19349663)) >>> 0;
    return h & (GRID_BUCKETS - 1);
  }

  rebuild(actors: readonly FaunaActor[], count: number): void {
    this.heads.fill(-1);
    if (count > this.next.length) {
      this.next = new Int32Array(count);
    }
    for (let i = 0; i < count; i++) {
      const a = actors[i];
      if (!a.active) {
        this.next[i] = -1;
        continue;
      }
      const cx = Math.floor(a.x / this.cellSize);
      const cz = Math.floor(a.z / this.cellSize);
      const b = this.bucketIndex(cx, cz);
      this.next[i] = this.heads[b];
      this.heads[b] = i;
    }
  }

  getHead(cx: number, cz: number): number {
    return this.heads[this.bucketIndex(cx, cz)];
  }

  getNext(idx: number): number {
    return this.next[idx];
  }
}

/**
 * Pure zero-allocation Boids + high-weight obstacle avoidance update for actor `index`.
 * Mutates `actor.vx`, `actor.vz`, `actor.x`, `actor.z`, `actor.yaw`, `actor.y`.
 */
export function stepFaunaActor(
  index: number,
  actors: readonly FaunaActor[],
  actorCount: number,
  grid: FaunaSpatialGrid,
  dt: number,
  obstacles: readonly BoidObstacle[],
  obstacleCount: number,
  playerX: number,
  playerZ: number,
  groundHeightAt: (x: number, z: number) => number,
  waterLevel = WATER_LEVEL,
  outStats?: BoidStepStats
): void {
  const actor = actors[index];
  if (!actor || !actor.active) return;

  const spec = FAUNA_SPECIES[actor.speciesId];
  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.4) : 0;
  if (safeDt <= 0) return;

  let steerX = 0;
  let steerZ = 0;
  let neighborsUsed = 0;
  let avoidedObstacles = 0;

  // 1) Boids rules (only for herd species, capped strictly at BALANCE.fauna.boidMaxNeighbors)
  if (spec.isHerd) {
    const maxN = BALANCE.fauna.boidMaxNeighbors;
    const rad = BALANCE.fauna.boidRadiusM;
    const radSq = rad * rad;
    const sepRadSq = 3.2 * 3.2;

    let sepX = 0;
    let sepZ = 0;
    let alignX = 0;
    let alignZ = 0;
    let cohX = 0;
    let cohZ = 0;

    const myCx = Math.floor(actor.x / grid.cellSize);
    const myCz = Math.floor(actor.z / grid.cellSize);

    for (let dz = -1; dz <= 1 && neighborsUsed < maxN; dz++) {
      for (let dx = -1; dx <= 1 && neighborsUsed < maxN; dx++) {
        let j = grid.getHead(myCx + dx, myCz + dz);
        while (j !== -1 && neighborsUsed < maxN) {
          if (j !== index) {
            const other = actors[j];
            if (other && other.active && other.speciesId === actor.speciesId) {
              const ox = other.x - actor.x;
              const oz = other.z - actor.z;
              const dSq = ox * ox + oz * oz;
              if (dSq > 1e-6 && dSq <= radSq) {
                neighborsUsed += 1;
                alignX += other.vx;
                alignZ += other.vz;
                cohX += other.x;
                cohZ += other.z;
                if (dSq < sepRadSq) {
                  const inv = 1 / Math.max(0.25, dSq);
                  sepX -= ox * inv;
                  sepZ -= oz * inv;
                }
              }
            }
          }
          j = grid.getNext(j);
        }
      }
    }

    if (neighborsUsed > 0) {
      const invN = 1 / neighborsUsed;
      // Separation (1.6), Alignment (0.85), Cohesion (0.65)
      steerX += sepX * 1.65;
      steerZ += sepZ * 1.65;

      const avgVx = alignX * invN - actor.vx;
      const avgVz = alignZ * invN - actor.vz;
      steerX += avgVx * 0.85;
      steerZ += avgVz * 0.85;

      const centerDx = cohX * invN - actor.x;
      const centerDz = cohZ * invN - actor.z;
      steerX += centerDx * 0.18;
      steerZ += centerDz * 0.18;
    }
  }

  // 2) Gentle home-territory tether + deterministic wander ripple
  const homeDx = actor.homeX - actor.x;
  const homeDz = actor.homeZ - actor.z;
  const homeDist = Math.hypot(homeDx, homeDz);
  if (homeDist > 18) {
    const pull = (homeDist - 18) * 0.09;
    steerX += (homeDx / homeDist) * pull;
    steerZ += (homeDz / homeDist) * pull;
  }

  actor.phase += safeDt * (spec.isHerd ? 0.55 : 0.8);
  steerX += Math.cos(actor.phase) * 0.55;
  steerZ += Math.sin(actor.phase * 0.87) * 0.55;

  // Player reaction: calm species drift gently aside when player gets within 6 m; aggressive slightly turn/stalk at mid range
  const pdx = actor.x - playerX;
  const pdz = actor.z - playerZ;
  const pDistSq = pdx * pdx + pdz * pdz;
  if (pDistSq > 1e-4 && pDistSq < 36) {
    const pDist = Math.sqrt(pDistSq);
    if (spec.temperament !== 'aggressive') {
      const flee = (6 - pDist) * 0.85;
      steerX += (pdx / pDist) * flee;
      steerZ += (pdz / pDist) * flee;
    }
  }

  // 3) High-weight obstacle avoidance (rocks, crystals, spires, structures)
  const avoidRadiusPad = spec.bodyRadius + 1.4;
  for (let i = 0; i < obstacleCount; i++) {
    const obs = obstacles[i];
    if (!obs) continue;
    const dx = actor.x - obs.x;
    const dz = actor.z - obs.z;
    const minDist = obs.radius + avoidRadiusPad;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDist * minDist) {
      const d = Math.sqrt(dSq);
      const strength = ((minDist - d) / Math.max(0.25, minDist)) * 5.2;
      if (d > 1e-4) {
        steerX += (dx / d) * strength;
        steerZ += (dz / d) * strength;
      } else {
        steerX += 4.5;
      }
      avoidedObstacles += 1;
    }
  }

  // Integrate smoothed velocity
  let nvx = actor.vx + steerX * safeDt * 2.4;
  let nvz = actor.vz + steerZ * safeDt * 2.4;
  const speed = Math.hypot(nvx, nvz);
  const maxSpd = spec.speed;
  const minSpd = maxSpd * 0.35;
  if (speed > maxSpd) {
    nvx = (nvx / speed) * maxSpd;
    nvz = (nvz / speed) * maxSpd;
  } else if (speed > 1e-4 && speed < minSpd) {
    nvx = (nvx / speed) * minSpd;
    nvz = (nvz / speed) * minSpd;
  } else if (speed <= 1e-4) {
    nvx = Math.sin(actor.yaw) * minSpd;
    nvz = Math.cos(actor.yaw) * minSpd;
  }

  const candX = actor.x + nvx * safeDt;
  const candZ = actor.z + nvz * safeDt;
  const candY = groundHeightAt(candX, candZ);
  const lavaDist = getDistanceToLava(candX, candZ);

  // Terrain / habitat containment check before committing step
  let validStep = Number.isFinite(candY);
  if (validStep) {
    if (spec.habitat === 'aquatic') {
      if (candY > waterLevel - 0.08 || lavaDist < 5.5) validStep = false;
    } else if (spec.habitat === 'volcanic') {
      if (candY <= waterLevel + 0.1 || lavaDist < 2.0) validStep = false;
    } else {
      if (candY <= waterLevel + 0.1 || lavaDist < BALANCE.fauna.minLavaClearanceM - 0.8) validStep = false;
    }
    if (validStep && Math.abs(candY - actor.y) > 1.45) {
      validStep = false; // Reject steep cliff drop/wall
    }
  }

  if (validStep) {
    actor.x = candX;
    actor.z = candZ;
    actor.y = spec.habitat === 'aquatic' ? waterLevel - 0.15 : candY;
    actor.vx = nvx;
    actor.vz = nvz;
  } else {
    // Bounce back smoothly toward home/safe heading
    actor.vx = -nvx * 0.65 + (homeDist > 1 ? (homeDx / homeDist) * 0.7 : 0);
    actor.vz = -nvz * 0.65 + (homeDist > 1 ? (homeDz / homeDist) * 0.7 : 0);
    actor.phase += 1.25;
  }

  if (Math.hypot(actor.vx, actor.vz) > 0.05) {
    actor.yaw = Math.atan2(actor.vx, actor.vz);
  }

  if (outStats) {
    outStats.neighborsUsed = neighborsUsed;
    outStats.avoidedObstacles = avoidedObstacles;
  }
  void actorCount;
}
