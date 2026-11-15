import { MAX_TIER, SPAWN_POINT, dangerTier } from './regions';

export type PoiKind = 'volcano' | 'crater' | 'geyser' | 'obsidian_crevasse' | 'meteor_site' | 'lava_tube' | 'hot_spring';

export interface WorldPoi {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  labelKey: string;
}

/**
 * Seed tata letak TETAP (bukan seed pemain): semua pemain & ruang multiplayer melihat titik penting
 * yang sama. Menjadikannya bergantung seed = langkah 4 (butuh keselarasan dengan effectiveTerrainSeed).
 */
export const LAYOUT_SEED = 'primordia-layout-v1';
export const CELL = 256;
export const WORLD_MARGIN = 170;
export const SPAWN_CLEAR_RADIUS = 220;
export const MIN_SEPARATION = 170;
export const MAX_GENERATED = 36;
const CANDIDATE_CHANCE = 0.3;

export const POI_LABEL_KEY: Record<PoiKind, string> = {
  volcano: 'biomes.volcanic_ridge',
  crater: 'biomes.crystal_crater',
  geyser: 'biomes.geyser_basin',
  obsidian_crevasse: 'biomes.obsidian_fields',
  meteor_site: 'biomes.meteor_impact',
  lava_tube: 'poiNames.lava_tube',
  hot_spring: 'poiNames.hot_spring',
};

/** Bobot jenis per tingkat bahaya: dekat spawn lebih ramah, jauh lebih garang. */
const WEIGHTS: Record<number, Partial<Record<PoiKind, number>>> = {
  0: { geyser: 3, hot_spring: 3, crater: 2 },
  1: { geyser: 3, hot_spring: 3, crater: 2, obsidian_crevasse: 2, meteor_site: 1 },
  2: { geyser: 2, crater: 2, obsidian_crevasse: 2, meteor_site: 2, lava_tube: 2, volcano: 1, hot_spring: 1 },
  3: { obsidian_crevasse: 2, meteor_site: 3, lava_tube: 3, volcano: 2, geyser: 1 },
  4: { meteor_site: 3, lava_tube: 3, volcano: 3, obsidian_crevasse: 1 },
};

/** Hash string -> uint32 (cyrb53 versi 32-bit). */
export function hash32(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKind(tier: number, r: number): PoiKind {
  const w = WEIGHTS[Math.min(MAX_TIER, Math.max(0, tier))];
  const entries = Object.entries(w) as Array<[PoiKind, number]>;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  let roll = r * total;
  for (const [kind, n] of entries) {
    roll -= n;
    if (roll < 0) return kind;
  }
  return entries[entries.length - 1][0];
}

/**
 * Grid berjitter 256 m: tiap sel punya peluang menghasilkan satu titik. Kandidat diurutkan menurut
 * prioritas hash lalu diterima rakus (jarak minimum antar titik), maksimal MAX_GENERATED. Deterministik.
 */
export function generatePois(
  existing: ReadonlyArray<{ x: number; z: number }>,
  worldHalf: number,
  seed: string = LAYOUT_SEED
): WorldPoi[] {
  const limit = worldHalf - WORLD_MARGIN;
  const cells = Math.floor((worldHalf * 2) / CELL);
  const candidates: Array<{ prio: number; x: number; z: number; r: number; ix: number; iz: number }> = [];

  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const rng = mulberry32(hash32(`${seed}:${ix}:${iz}`));
      if (rng() > CANDIDATE_CHANCE) continue;
      const x = -worldHalf + ix * CELL + 30 + rng() * (CELL - 60);
      const z = -worldHalf + iz * CELL + 30 + rng() * (CELL - 60);
      candidates.push({ prio: rng(), x: Math.round(x), z: Math.round(z), r: rng(), ix, iz });
    }
  }
  candidates.sort((a, b) => a.prio - b.prio || a.ix - b.ix || a.iz - b.iz);

  const placed: Array<{ x: number; z: number }> = [...existing];
  const out: WorldPoi[] = [];
  for (const c of candidates) {
    if (out.length >= MAX_GENERATED) break;
    if (Math.abs(c.x) > limit || Math.abs(c.z) > limit) continue;
    if (Math.hypot(c.x - SPAWN_POINT.x, c.z - SPAWN_POINT.z) < SPAWN_CLEAR_RADIUS) continue;
    if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < MIN_SEPARATION)) continue;
    const kind = pickKind(dangerTier(c.x, c.z), c.r);
    out.push({ id: `poi_gen_${c.ix}_${c.iz}`, kind, x: c.x, z: c.z, labelKey: POI_LABEL_KEY[kind] });
    placed.push({ x: c.x, z: c.z });
  }
  // Urutan stabil untuk tampilan/penyimpanan: baris lalu kolom.
  out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return out;
}

/**
 * Titik penting musiman/bulanan (4–6 titik) yang muncul dan menghilang mengikuti bulan UTC kalender nyata.
 * Deterministik untuk semua pemain di bulan yang sama.
 */
export function monthlyPois(
  existing: ReadonlyArray<{ x: number; z: number }>,
  worldHalf: number,
  date: Date = new Date()
): WorldPoi[] {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const seed = `${LAYOUT_SEED}|M|${year}-${month}`;
  const rng = mulberry32(hash32(seed));
  const count = 4 + Math.floor(rng() * 3); // 4..6 POI bulanan
  const limit = worldHalf - WORLD_MARGIN;
  const kinds: PoiKind[] = ['hot_spring', 'lava_tube', 'meteor_site', 'crater', 'geyser'];
  const placed: Array<{ x: number; z: number }> = [...existing];
  const out: WorldPoi[] = [];

  for (let attempt = 0; attempt < 80 && out.length < count; attempt++) {
    const x = Math.round((rng() * 2 - 1) * limit);
    const z = Math.round((rng() * 2 - 1) * limit);
    if (Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < SPAWN_CLEAR_RADIUS) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_SEPARATION)) continue;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    out.push({
      id: `poi_month_${year}_${month}_${out.length}`,
      kind,
      x,
      z,
      labelKey: POI_LABEL_KEY[kind],
    });
    placed.push({ x, z });
  }
  return out;
}
