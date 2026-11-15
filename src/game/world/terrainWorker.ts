import type { PlayerFootprint, WorldSeason } from '../data/worldEvolution';
import { createNoise2D, type Noise2D } from './noise';
import { buildChunkGeometryData, type ResolvedAnchor } from './terrainHeight';

let cachedSeed = '';
let cachedNoise: Noise2D | null = null;
const anchorNoises = new Map<string, Noise2D>();

function noiseForSeed(seed: string): Noise2D {
  let n = anchorNoises.get(seed);
  if (!n) {
    if (anchorNoises.size > 12) anchorNoises.clear();
    n = createNoise2D(seed);
    anchorNoises.set(seed, n);
  }
  return n;
}

type WorkerPost = (msg: unknown, transfer: Transferable[]) => void;

self.onmessage = (
  e: MessageEvent<{
    jobId: number;
    seed: string;
    chunkX: number;
    chunkZ: number;
    chunkSize: number;
    segments: number;
    anchors?: Array<{ x: number; z: number; r: number; seed: string }>;
    eraYear?: number;
    season?: WorldSeason;
    eraTerrainDelta?: boolean;
    footprints?: PlayerFootprint[];
  }>
) => {
  const { jobId, seed, chunkX, chunkZ, chunkSize, segments, anchors = [], eraYear, season, eraTerrainDelta, footprints } = e.data;
  const post = (self as unknown as { postMessage: WorkerPost }).postMessage.bind(self);
  try {
    if (!cachedNoise || cachedSeed !== seed) {
      cachedSeed = seed;
      cachedNoise = createNoise2D(seed);
    }
    const meshData = buildChunkGeometryData(
      seed,
      cachedNoise,
      chunkX,
      chunkZ,
      chunkSize,
      segments,
      anchors.map((a): ResolvedAnchor => ({ x: a.x, z: a.z, r: a.r, noise: noiseForSeed(a.seed) })),
      { eraYear, season, eraTerrainDelta, footprints }
    );
    post({ jobId, chunkX, chunkZ, segments, ...meshData }, [
      meshData.positions.buffer,
      meshData.colors.buffer,
      meshData.normals.buffer,
      meshData.indices.buffer,
    ]);
  } catch (err) {
    // Laporkan ke thread utama supaya bisa pindah ke fallback bertahap.
    post({ jobId, chunkX, chunkZ, segments, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
