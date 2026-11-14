import * as THREE from 'three';
import { CHUNK_SIZE } from '../config';
import { createNoise2D, type Noise2D } from './noise';
import { buildChunkGeometryData, sampleHeightAnchored, type ResolvedAnchor } from './terrainHeight';
import type { AnchorSpec } from '../data/eden';
import type { ProceduralAssets } from '../core/assetLoader';
import { gameState } from '../core/state';
import {
  SYNC_RING_DISTANCE,
  computeWantedChunks,
  diffChunks,
  radiusChunksForViewDistance,
  type ChunkSpec,
} from './chunkScheduler';

interface ChunkGeometryData {
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

interface WorkerResult extends Partial<ChunkGeometryData> {
  jobId: number;
  chunkX: number;
  chunkZ: number;
  segments: number;
  error?: string;
}

interface ActiveTerrainChunk {
  key: string;
  cx: number;
  cz: number;
  segments: number;
  mesh: THREE.Mesh;
}

interface WorkerSlot {
  worker: Worker;
  busy: number;
}

interface InflightJob {
  spec: ChunkSpec;
  epoch: number;
  slot: WorkerSlot;
}

const MAX_WORKERS = 2;
const MAX_JOBS_PER_WORKER = 2;
/** Anggaran waktu per frame untuk fallback tanpa Worker (ms). Minimal 1 chunk per frame. */
const FALLBACK_BUDGET_MS = 5;

export class TerrainSystem {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private noise: Noise2D;
  private seed: string;
  private anchorSpecs: AnchorSpec[] = [];
  private anchorNoises = new Map<string, Noise2D>();
  private resolvedAnchors: ResolvedAnchor[] = [];
  private chunks = new Map<string, ActiveTerrainChunk>();

  // Penjadwalan streaming
  private wanted = new Map<string, number>(); // key -> segments yang diinginkan
  private queue: ChunkSpec[] = []; // belum dikirim, urut terdekat dulu
  private inflight = new Map<number, InflightJob>();
  private slots: WorkerSlot[] = [];
  private nextJobId = 1;
  private epoch = 0; // naik tiap ganti seed / clear; hasil worker lama dibuang
  private dirty = false; // butuh replan walau pemain belum pindah chunk
  private lastCenterKey = '';
  private lastRadius = -1;

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

    this.createWorkers();
    this.updateStreaming(0, 18, true);
  }

  getActiveChunkCount(): number {
    return this.chunks.size;
  }

  /** Jumlah chunk yang masih antre atau sedang dikerjakan worker. */
  getPendingChunkCount(): number {
    let n = this.queue.length;
    for (const job of this.inflight.values()) if (job.epoch === this.epoch) n++;
    return n;
  }

  setSeed(seed: string): void {
    this.seed = seed;
    this.noise = createNoise2D(seed);
    this.clearAllChunks();
    // Replan terjadi pada updateStreaming berikutnya (enterWorld memanggilnya langsung).
    this.lastCenterKey = '';
  }

  /** Jangkar medan: area di sekitarnya tetap memakai seed lama. Tidak menghapus chunk (hasil sama saat dipasang). */
  setAnchors(list: AnchorSpec[]): void {
    this.anchorSpecs = list.map((a) => ({ ...a }));
    this.resolvedAnchors = list.map((a) => {
      let n = this.anchorNoises.get(a.seed);
      if (!n) {
        n = createNoise2D(a.seed);
        this.anchorNoises.set(a.seed, n);
      }
      return { x: a.x, z: a.z, r: a.r, noise: n };
    });
  }

  groundHeightAt(x: number, z: number): number {
    return sampleHeightAnchored(this.noise, this.resolvedAnchors, x, z);
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

  /**
   * Dipanggil tiap frame. Replan hanya saat pemain pindah chunk, ganti view distance,
   * atau ada hasil usang. Sisanya hanya memompa antrean (murah bila kosong).
   * `synchronousImmediate` (spawn/teleport): chunk terdekat dibangun langsung agar tidak ada
   * lubang di depan pemain; sisanya tetap lewat worker.
   */
  updateStreaming(px: number, pz: number, synchronousImmediate = false): void {
    const pcx = Math.round(px / CHUNK_SIZE);
    const pcz = Math.round(pz / CHUNK_SIZE);
    const centerKey = `${pcx},${pcz}`;
    const radius = radiusChunksForViewDistance(gameState.settings.graphics.viewDistance);

    if (synchronousImmediate || this.dirty || centerKey !== this.lastCenterKey || radius !== this.lastRadius) {
      this.lastCenterKey = centerKey;
      this.lastRadius = radius;
      this.dirty = false;
      this.replan(pcx, pcz, radius);
      if (synchronousImmediate) this.buildInnerRingNow();
    }

    this.pump();
  }

  private replan(pcx: number, pcz: number, radius: number): void {
    const wanted = computeWantedChunks(pcx, pcz, radius);
    this.wanted = new Map(wanted.map((w) => [w.key, w.segments]));

    const loaded = new Map<string, number>();
    for (const [key, ch] of this.chunks) loaded.set(key, ch.segments);
    const inflightSeg = new Map<string, number>();
    for (const job of this.inflight.values()) {
      if (job.epoch === this.epoch) inflightSeg.set(job.spec.key, job.spec.segments);
    }

    const { unload, build } = diffChunks(wanted, loaded, inflightSeg);
    for (const key of unload) this.removeChunk(key);
    this.queue = build;
  }

  private buildInnerRingNow(): void {
    const rest: ChunkSpec[] = [];
    for (const spec of this.queue) {
      if (spec.dist <= SYNC_RING_DISTANCE) this.buildNow(spec);
      else rest.push(spec);
    }
    this.queue = rest;
  }

  private buildNow(spec: ChunkSpec): void {
    const data = buildChunkGeometryData(this.seed, this.noise, spec.cx, spec.cz, CHUNK_SIZE, spec.segments, this.resolvedAnchors);
    this.applyChunkGeometry(spec.key, spec.cx, spec.cz, spec.segments, data);
  }

  private pump(): void {
    if (this.queue.length === 0) return;

    if (this.slots.length > 0) {
      while (this.queue.length > 0) {
        const slot = this.pickSlot();
        if (!slot) break;
        this.dispatch(slot, this.queue.shift()!);
      }
      return;
    }

    // Fallback tanpa Worker: bangun bertahap (minimal 1 chunk per frame, dibatasi waktu).
    const t0 = performance.now();
    do {
      this.buildNow(this.queue.shift()!);
    } while (this.queue.length > 0 && performance.now() - t0 < FALLBACK_BUDGET_MS);
  }

  private pickSlot(): WorkerSlot | null {
    let best: WorkerSlot | null = null;
    for (const s of this.slots) {
      if (s.busy < MAX_JOBS_PER_WORKER && (!best || s.busy < best.busy)) best = s;
    }
    return best;
  }

  private dispatch(slot: WorkerSlot, spec: ChunkSpec): void {
    const jobId = this.nextJobId++;
    slot.busy++;
    this.inflight.set(jobId, { spec, epoch: this.epoch, slot });
    slot.worker.postMessage({
      jobId,
      seed: this.seed,
      chunkX: spec.cx,
      chunkZ: spec.cz,
      chunkSize: CHUNK_SIZE,
      segments: spec.segments,
      anchors: this.anchorSpecs,
    });
  }

  private createWorkers(): void {
    if (typeof Worker === 'undefined') return;
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    const count = Math.max(1, Math.min(MAX_WORKERS, cores - 1));
    for (let i = 0; i < count; i++) {
      try {
        const worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
        const slot: WorkerSlot = { worker, busy: 0 };
        worker.onmessage = (e: MessageEvent<WorkerResult>) => this.onWorkerMessage(slot, e.data);
        worker.onerror = () => this.failWorkers();
        this.slots.push(slot);
      } catch {
        break;
      }
    }
  }

  /** Worker bermasalah: matikan semua dan lanjut dengan fallback bertahap di thread utama. */
  private failWorkers(): void {
    if (this.slots.length === 0) return;
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
    this.inflight.clear();
    this.dirty = true;
    console.warn('[Terrain] Worker gagal, pindah ke pembangunan chunk bertahap di thread utama.');
  }

  private onWorkerMessage(slot: WorkerSlot, data: WorkerResult): void {
    const job = this.inflight.get(data.jobId);
    if (!job) return;
    this.inflight.delete(data.jobId);
    slot.busy = Math.max(0, slot.busy - 1);

    if (data.error || !data.positions || !data.colors || !data.normals || !data.indices) {
      this.failWorkers();
      return;
    }

    const { spec } = job;
    // Hasil usang (seed berganti atau LOD/area sudah berubah): buang dan jadwalkan ulang.
    if (job.epoch !== this.epoch || this.wanted.get(spec.key) !== spec.segments) {
      this.dirty = true;
      return;
    }
    this.applyChunkGeometry(spec.key, spec.cx, spec.cz, spec.segments, {
      positions: data.positions,
      colors: data.colors,
      normals: data.normals,
      indices: data.indices,
    });
  }

  private applyChunkGeometry(key: string, cx: number, cz: number, segments: number, data: ChunkGeometryData): void {
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

  private removeChunk(key: string): void {
    const ch = this.chunks.get(key);
    if (!ch) return;
    this.group.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    this.chunks.delete(key);
  }

  private clearAllChunks(): void {
    this.epoch++;
    this.queue = [];
    this.wanted.clear();
    for (const ch of this.chunks.values()) {
      this.group.remove(ch.mesh);
      ch.mesh.geometry.dispose();
    }
    this.chunks.clear();
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
    this.inflight.clear();
    this.clearAllChunks();
    this.material.dispose();
  }
}
