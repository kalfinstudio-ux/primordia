import { createNoise2D, type Noise2D } from './noise';
import { buildChunkGeometryData } from './terrainHeight';

let cachedSeed = '';
let cachedNoise: Noise2D | null = null;

type WorkerPost = (msg: unknown, transfer: Transferable[]) => void;

self.onmessage = (e: MessageEvent<{ jobId: number; seed: string; chunkX: number; chunkZ: number; chunkSize: number; segments: number }>) => {
  const { jobId, seed, chunkX, chunkZ, chunkSize, segments } = e.data;
  const post = (self as unknown as { postMessage: WorkerPost }).postMessage.bind(self);
  try {
    if (!cachedNoise || cachedSeed !== seed) {
      cachedSeed = seed;
      cachedNoise = createNoise2D(seed);
    }
    const meshData = buildChunkGeometryData(seed, cachedNoise, chunkX, chunkZ, chunkSize, segments);
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
