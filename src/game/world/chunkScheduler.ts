/**
 * Perencana streaming chunk terrain (murni, tanpa three.js) supaya mudah diuji.
 * TerrainSystem memakai ini untuk menentukan chunk mana yang dimuat, dibuang,
 * atau di-upgrade LOD-nya, urut dari yang paling dekat dengan pemain.
 */

export interface ChunkSpec {
  key: string;
  cx: number;
  cz: number;
  segments: number;
  /** Jarak (dalam satuan chunk) dari chunk tempat pemain berada. */
  dist: number;
}

/** Chunk dengan jarak <= nilai ini dibangun sinkron saat teleport/spawn (maks 9 chunk). */
export const SYNC_RING_DISTANCE = 1.5;

export function radiusChunksForViewDistance(viewDist: number): number {
  return viewDist <= 95 ? 2 : viewDist <= 145 ? 3 : 4;
}

export function segmentsForChunkDistance(dist: number): number {
  return dist <= 1.5 ? 32 : dist <= 2.7 ? 16 : 8;
}

export function computeWantedChunks(pcx: number, pcz: number, radius: number): ChunkSpec[] {
  const out: ChunkSpec[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.hypot(dx, dz);
      if (dist > radius + 0.5) continue;
      const cx = pcx + dx;
      const cz = pcz + dz;
      out.push({ key: `${cx},${cz}`, cx, cz, segments: segmentsForChunkDistance(dist), dist });
    }
  }
  out.sort((a, b) => a.dist - b.dist || a.cz - b.cz || a.cx - b.cx);
  return out;
}

export interface ChunkDiff {
  /** Kunci chunk yang sudah dimuat tapi sudah di luar jangkauan. */
  unload: string[];
  /** Chunk yang perlu dibangun/di-upgrade, urut dari yang terdekat. */
  build: ChunkSpec[];
}

export function diffChunks(
  wanted: readonly ChunkSpec[],
  loaded: ReadonlyMap<string, number>,
  inflight: ReadonlyMap<string, number>
): ChunkDiff {
  const wantedKeys = new Set<string>();
  for (const w of wanted) wantedKeys.add(w.key);

  const unload: string[] = [];
  for (const key of loaded.keys()) {
    if (!wantedKeys.has(key)) unload.push(key);
  }

  const build: ChunkSpec[] = [];
  for (const w of wanted) {
    if (loaded.get(w.key) === w.segments) continue;
    if (inflight.get(w.key) === w.segments) continue;
    build.push(w);
  }
  return { unload, build };
}
