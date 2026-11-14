import { createNoise2D, type Noise2D } from './noise';
import { buildChunkGeometryData } from './terrainHeight';

let cachedSeed = '';
let cachedNoise: Noise2D | null = null;

self.onmessage = (e: MessageEvent<{ jobId: number; seed: string; chunkX: number; chunkZ: number; chunkSize: number; segments: number }>) => {
  const { jobId, seed, chunkX, chunkZ, chunkSize, segments } = e.data;
  if (!cachedNoise || cachedSeed !== seed) {
    cachedSeed = seed;
    cachedNoise = createNoise2D(seed);
  }
  const meshData = buildChunkGeometryData(seed, cachedNoise, chunkX, chunkZ, chunkSize, segments);
  (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
    { jobId, chunkX, chunkZ, segments, ...meshData },
    [meshData.positions.buffer, meshData.colors.buffer, meshData.normals.buffer, meshData.indices.buffer]
  );
};
