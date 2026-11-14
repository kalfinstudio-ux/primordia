import * as THREE from 'three';
import { CHUNK_SIZE } from '../config';
import { createNoise2D, type Noise2D } from './noise';
import { buildChunkGeometryData, sampleWorldHeight } from './terrainHeight';
import type { ProceduralAssets } from '../core/assetLoader';
import { gameState } from '../core/state';

interface ActiveTerrainChunk {
  key: string;
  cx: number;
  cz: number;
  segments: number;
  mesh: THREE.Mesh;
}

export class TerrainSystem {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private noise: Noise2D;
  private seed: string;
  private chunks = new Map<string, ActiveTerrainChunk>();
  private pendingKeys = new Map<string, number>();
  private worker: Worker | null = null;
  private nextJobId = 1;
  private lastCenterKey = '';

  constructor(seed: string, assets: ProceduralAssets) {
    this.seed = seed;
    this.noise = createNoise2D(seed);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.08,
      bumpMap: assets.basaltBumpMap,
      bumpScale: 0.35,
      roughnessMap: assets.basaltRoughnessMap,
    });

    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = this.onWorkerMessage;
      }
    } catch {
      this.worker = null;
    }

    this.updateStreaming(0, 18, true);
  }

  getActiveChunkCount(): number {
    return this.chunks.size;
  }

  setSeed(seed: string): void {
    this.seed = seed;
    this.noise = createNoise2D(seed);
    this.clearAllChunks();
    this.lastCenterKey = '';
    this.updateStreaming(gameState.playerPos.x, gameState.playerPos.z, true);
  }

  groundHeightAt(x: number, z: number): number {
    return sampleWorldHeight(this.noise, x, z);
  }

  slopeDegreesAt(x: number, z: number): number {
    const eps = 0.7;
    const hL = this.groundHeightAt(x - eps, z);
    const hR = this.groundHeightAt(x + eps, z);
    const hD = this.groundHeightAt(x, z - eps);
    const hU = this.groundHeightAt(x, z + eps);
    const dx = (hR - hL) / (2 * eps);
    const dz = (hU - hD) / (2 * eps);
    const grad = Math.hypot(dx, dz);
    return (Math.atan(grad) * 180) / Math.PI;
  }

  updateStreaming(px: number, pz: number, synchronousImmediate = false): void {
    const pcx = Math.round(px / CHUNK_SIZE);
    const pcz = Math.round(pz / CHUNK_SIZE);
    const centerKey = `${pcx},${pcz}`;
    if (!synchronousImmediate && centerKey === this.lastCenterKey && this.pendingKeys.size === 0) {
      return;
    }
    this.lastCenterKey = centerKey;

    const viewDist = gameState.settings.graphics.viewDistance;
    const radiusChunks = viewDist <= 95 ? 2 : viewDist <= 145 ? 3 : 4;

    const wanted = new Map<string, { cx: number; cz: number; segments: number }>();
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const distChunks = Math.hypot(dx, dz);
        if (distChunks > radiusChunks + 0.5) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const segments = distChunks <= 1.5 ? 32 : distChunks <= 2.7 ? 16 : 8;
        wanted.set(`${cx},${cz}`, { cx, cz, segments });
      }
    }

    // Unload chunks out of range
    for (const [key, ch] of this.chunks.entries()) {
      if (!wanted.has(key)) {
        this.group.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }

    // Build or upgrade LOD of wanted chunks
    for (const [key, spec] of wanted.entries()) {
      const existing = this.chunks.get(key);
      if (existing && existing.segments === spec.segments) continue;

      if (synchronousImmediate || !this.worker || Math.hypot(spec.cx - pcx, spec.cz - pcz) <= 1.5) {
        const data = buildChunkGeometryData(this.seed, this.noise, spec.cx, spec.cz, CHUNK_SIZE, spec.segments);
        this.applyChunkGeometry(key, spec.cx, spec.cz, spec.segments, data);
      } else if (this.pendingKeys.get(key) !== spec.segments) {
        this.pendingKeys.set(key, spec.segments);
        this.worker.postMessage({
          jobId: this.nextJobId++,
          seed: this.seed,
          chunkX: spec.cx,
          chunkZ: spec.cz,
          chunkSize: CHUNK_SIZE,
          segments: spec.segments,
        });
      }
    }
  }

  private onWorkerMessage = (
    e: MessageEvent<{
      chunkX: number;
      chunkZ: number;
      segments: number;
      positions: Float32Array;
      colors: Float32Array;
      normals: Float32Array;
      indices: Uint32Array;
    }>
  ): void => {
    const { chunkX, chunkZ, segments, positions, colors, normals, indices } = e.data;
    const key = `${chunkX},${chunkZ}`;
    if (!this.pendingKeys.has(key)) return;
    this.pendingKeys.delete(key);
    this.applyChunkGeometry(key, chunkX, chunkZ, segments, { positions, colors, normals, indices });
  };

  private applyChunkGeometry(
    key: string,
    cx: number,
    cz: number,
    segments: number,
    data: { positions: Float32Array; colors: Float32Array; normals: Float32Array; indices: Uint32Array }
  ): void {
    const existing = this.chunks.get(key);
    if (existing) {
      this.group.remove(existing.mesh);
      existing.mesh.geometry.dispose();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.group.add(mesh);

    this.chunks.set(key, { key, cx, cz, segments, mesh });
  }

  private clearAllChunks(): void {
    this.pendingKeys.clear();
    for (const ch of this.chunks.values()) {
      this.group.remove(ch.mesh);
      ch.mesh.geometry.dispose();
    }
    this.chunks.clear();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.clearAllChunks();
    this.material.dispose();
  }
}
