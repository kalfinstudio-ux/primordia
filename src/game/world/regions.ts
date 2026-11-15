/** Wilayah bernama + tingkat bahaya menurut jarak dari titik spawn. Murni (tanpa three.js). */
export const SPAWN_POINT = { x: 0, z: 18 };
/** Batas luar tiap tingkat (meter dari spawn): tier 0 < 350, 1 < 800, 2 < 1400, 3 < 2000, 4 selebihnya. */
export const TIER_RADII = [350, 800, 1400, 2000] as const;
export const MAX_TIER = TIER_RADII.length; // 4

export type Dir8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const DIRS: Dir8[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export interface Region {
  /** 0 = zona awal … 4 = paling berbahaya. */
  tier: number;
  /** Arah mata angin dari spawn (utara = -z, atas peta); null di zona awal. */
  dir: Dir8 | null;
  key: string;
}

export function dangerTier(x: number, z: number): number {
  const d = Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z);
  for (let i = 0; i < TIER_RADII.length; i++) if (d < TIER_RADII[i]) return i;
  return MAX_TIER;
}

export function directionOf(x: number, z: number): Dir8 {
  const dx = x - SPAWN_POINT.x;
  const dz = z - SPAWN_POINT.z;
  // 0° = utara (−z), searah jarum jam.
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

export function getRegionAt(x: number, z: number): Region {
  const tier = dangerTier(x, z);
  const dir = tier === 0 ? null : directionOf(x, z);
  return { tier, dir, key: dir ? `${tier}:${dir}` : '0' };
}

/** Tingkat bahaya untuk ditampilkan (1..5). */
export function dangerLevel(tier: number): number {
  return Math.min(MAX_TIER, Math.max(0, tier)) + 1;
}

/** Nama tampil wilayah; `tr` = fungsi terjemah (t). Murni agar bisa dites. */
export function regionLabel(r: Region, tr: (key: string) => string): string {
  const tier = tr(`regions.tier.${r.tier}`);
  if (!r.dir) return tier;
  return tr('regions.format').replace('{tier}', tier).replace('{dir}', tr(`regions.dir.${r.dir}`));
}
