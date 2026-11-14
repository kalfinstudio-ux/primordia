// Panah tujuan misi aktif. Murni (tanpa THREE/React) agar bisa dites.
// Sumber target: node dunia yang sedang dimuat (dari HUD snapshot) + titik tetap (kolam awal, POI) sebagai cadangan
// supaya panah tetap ada walau targetnya belum dimuat (di luar jarak pandang).
import { CRYSTAL_CRATER, WORLD_POIS } from '../world/biomes';
import { distance2D } from '../utils/math';

export type GuideKind = 'water' | 'crystal' | 'geyser' | 'obsidian' | 'meteor';

export interface GuideNode {
  x: number;
  z: number;
  kind: string;
}

export interface GuideTarget {
  kind: GuideKind;
  x: number;
  z: number;
  dist: number;
}

/** Kolam dangkal awal (lihat chunkManager: water_starter). */
export const STARTER_POOL = { x: 16, z: 22 } as const;

/** Misi → jenis tujuan. Misi lain (bangun, kerajinan) tidak butuh panah. */
const QUEST_KINDS: Record<string, GuideKind[]> = {
  q1: ['water', 'geyser'],
  q5: ['crystal'],
  q7: ['obsidian'],
  q16: ['meteor'],
};

export function guideKindsForQuest(questId: string | null): GuideKind[] {
  return (questId && QUEST_KINDS[questId]) || [];
}

function staticTargets(kind: GuideKind): Array<{ x: number; z: number }> {
  switch (kind) {
    case 'water':
      return [STARTER_POOL];
    case 'crystal':
      return [CRYSTAL_CRATER, ...WORLD_POIS.filter((p) => p.kind === 'crater')];
    case 'geyser':
      return WORLD_POIS.filter((p) => p.kind === 'geyser');
    case 'obsidian':
      return WORLD_POIS.filter((p) => p.kind === 'obsidian_crevasse');
    case 'meteor':
      return WORLD_POIS.filter((p) => p.kind === 'meteor_site');
  }
}

/** Target terdekat untuk misi aktif, atau null bila misi tidak butuh panah. */
export function pickQuestGuide(
  questId: string | null,
  px: number,
  pz: number,
  nodes: readonly GuideNode[]
): GuideTarget | null {
  const kinds = guideKindsForQuest(questId);
  if (kinds.length === 0) return null;
  let best: GuideTarget | null = null;
  for (const kind of kinds) {
    const candidates: Array<{ x: number; z: number }> = [
      ...nodes.filter((n) => n.kind === kind),
      ...staticTargets(kind),
    ];
    for (const c of candidates) {
      const d = distance2D(px, pz, c.x, c.z);
      if (!best || d < best.dist) best = { kind, x: c.x, z: c.z, dist: d };
    }
  }
  return best;
}
