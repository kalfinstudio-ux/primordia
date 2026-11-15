/**
 * Ambient Fauna & Herds Three.js System.
 * - Deterministic per-chunk + canonical border-crossing spawns
 * - Distance-based AI rate throttling (never freezes visible animals inside loaded view)
 * - Zero-allocation boids steering with spatial grid & static obstacle avoidance
 * - Shared geometries, shared material, InstancedMesh rendering + fallback primitive
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE, WATER_LEVEL } from '../config';
import type { SpatialCollider, SpatialHashGrid } from '../core/spatialHash';
import { gameState } from '../core/state';
import { BALANCE } from '../data/balance';
import {
  FAUNA_SPECIES,
  FAUNA_SPECIES_LIST,
  FaunaSpatialGrid,
  faunaRateBucket,
  faunaUpdateInterval,
  generateChunkFauna,
  pruneExpiredFaunaKills,
  recordFaunaKill,
  stepFaunaActor,
  type BoidObstacle,
  type FaunaActor,
  type FaunaRateBucket,
  type FaunaSpeciesId,
} from '../data/fauna';
import { computeWantedChunks, radiusChunksForViewDistance } from './chunkScheduler';
import { markShared } from './disposal';
import type { TerrainSystem } from './terrain';

const MAX_POOL_ACTORS = 128;

// Reusable scratch math helpers (zero per-frame heap allocations)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _color = new THREE.Color();
const _frustum = new THREE.Frustum();
const _projScreenMat = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);

function preparePart(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIdx = geom.index ? geom.toNonIndexed() : geom;
  if (nonIdx !== geom) geom.dispose();
  if (nonIdx.getAttribute('uv')) nonIdx.deleteAttribute('uv');
  nonIdx.computeVertexNormals();
  return nonIdx;
}

function createFallbackGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.65, 0.42, 0.96);
  body.translate(0, 0.24, 0);
  const head = new THREE.BoxGeometry(0.36, 0.3, 0.36);
  head.translate(0, 0.46, 0.52);
  const parts = [preparePart(body), preparePart(head)];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (merged) return markShared(merged);
  const single = new THREE.BoxGeometry(0.65, 0.45, 0.95);
  single.translate(0, 0.225, 0);
  return markShared(single);
}

function buildSpeciesGeometry(speciesId: FaunaSpeciesId): THREE.BufferGeometry {
  try {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0) => {
      if (rx !== 0) g.rotateX(rx);
      if (ry !== 0) g.rotateY(ry);
      if (rz !== 0) g.rotateZ(rz);
      if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
      parts.push(preparePart(g));
    };

    if (speciesId === 'ash_hopper') {
      add(new THREE.SphereGeometry(0.28, 7, 5), 0, 0.34, 0);
      add(new THREE.ConeGeometry(0.14, 0.38, 6), 0, 0.46, 0.3, Math.PI * 0.35);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 5), -0.16, 0.16, -0.05, -0.25);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 5), 0.16, 0.16, -0.05, -0.25);
    } else if (speciesId === 'basalt_grazer') {
      add(new THREE.BoxGeometry(0.62, 0.46, 1.05), 0, 0.48, 0);
      add(new THREE.BoxGeometry(0.36, 0.34, 0.44), 0, 0.56, 0.64, 0.22);
      add(new THREE.ConeGeometry(0.11, 0.34, 5), 0, 0.78, 0.55, -0.35);
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.34, 5), -0.22, 0.17, 0.35);
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.34, 5), 0.22, 0.17, 0.35);
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.34, 5), -0.22, 0.17, -0.35);
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.34, 5), 0.22, 0.17, -0.35);
    } else if (speciesId === 'hydro_skimmer') {
      add(new THREE.CylinderGeometry(0.32, 0.44, 0.16, 7), 0, 0.12, 0);
      add(new THREE.ConeGeometry(0.22, 0.42, 6), 0, 0.14, -0.42, -Math.PI * 0.5);
      add(new THREE.BoxGeometry(0.95, 0.06, 0.22), 0, 0.1, 0.06);
    } else if (speciesId === 'cinder_beetle') {
      add(new THREE.SphereGeometry(0.36, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58), 0, 0.18, 0);
      add(new THREE.BoxGeometry(0.28, 0.16, 0.28), 0, 0.2, 0.36);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.24, 5), -0.26, 0.12, 0.15, 0, 0, 0.45);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.24, 5), 0.26, 0.12, 0.15, 0, 0, -0.45);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.24, 5), -0.26, 0.12, -0.18, 0, 0, 0.45);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.24, 5), 0.26, 0.12, -0.18, 0, 0, -0.45);
    } else if (speciesId === 'ridge_stalker') {
      add(new THREE.BoxGeometry(0.42, 0.34, 0.96), 0, 0.44, 0);
      add(new THREE.ConeGeometry(0.2, 0.5, 6), 0, 0.52, 0.62, Math.PI * 0.46);
      add(new THREE.ConeGeometry(0.09, 0.62, 5), 0, 0.44, -0.72, -Math.PI * 0.45);
      add(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 5), -0.16, 0.18, 0.3);
      add(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 5), 0.16, 0.18, 0.3);
      add(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 5), -0.16, 0.18, -0.3);
      add(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 5), 0.16, 0.18, -0.3);
    } else {
      // magma_crawler
      add(new THREE.DodecahedronGeometry(0.42, 0), 0, 0.34, 0);
      add(new THREE.ConeGeometry(0.18, 0.42, 5), 0, 0.58, 0.05);
      add(new THREE.BoxGeometry(0.32, 0.24, 0.34), 0, 0.28, 0.44);
      add(new THREE.CylinderGeometry(0.07, 0.05, 0.28, 5), -0.34, 0.14, 0.2, 0, 0, 0.4);
      add(new THREE.CylinderGeometry(0.07, 0.05, 0.28, 5), 0.34, 0.14, 0.2, 0, 0, -0.4);
      add(new THREE.CylinderGeometry(0.07, 0.05, 0.28, 5), -0.34, 0.14, -0.22, 0, 0, 0.4);
      add(new THREE.CylinderGeometry(0.07, 0.05, 0.28, 5), 0.34, 0.14, -0.22, 0, 0, -0.4);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) return createFallbackGeometry();
    merged.computeBoundingSphere();
    return markShared(merged);
  } catch {
    return createFallbackGeometry();
  }
}

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const sharedSpeciesGeometries = new Map<FaunaSpeciesId, THREE.BufferGeometry>();

function getSharedMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = markShared(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.08,
      })
    );
  }
  return sharedMaterial;
}

function getSharedGeometry(speciesId: FaunaSpeciesId): THREE.BufferGeometry {
  let g = sharedSpeciesGeometries.get(speciesId);
  if (!g) {
    g = buildSpeciesGeometry(speciesId);
    sharedSpeciesGeometries.set(speciesId, g);
  }
  return g;
}

export interface FaunaTelemetry {
  activeCount: number;
  bucketsSummary: string;
  aiMs: number;
  bucketCounts: Record<FaunaRateBucket, number>;
}

export class FaunaSystem {
  readonly group = new THREE.Group();
  private readonly spatialHash: SpatialHashGrid;
  private readonly boidGrid = new FaunaSpatialGrid(MAX_POOL_ACTORS, 12);
  private readonly actors: FaunaActor[] = [];
  private activeCount = 0;
  private readonly loadedChunks = new Set<string>();
  private readonly meshes = new Map<FaunaSpeciesId, THREE.InstancedMesh>();
  private readonly speciesRenderCounts = new Map<FaunaSpeciesId, number>();

  // Reusable zero-allocation scratch buffers
  private readonly colliderScratch: SpatialCollider[] = [];
  private readonly boidObstacles: BoidObstacle[] = Array.from({ length: 48 }, () => ({ x: 0, z: 0, radius: 0 }));

  private lastCenterKey = '';
  private lastRadius = -1;
  private lastEra = -1;
  private lastSeed = '';
  private waterLevel = WATER_LEVEL;
  private pruneAccum = 0;
  private aiMsSmoothed = 0;
  private readonly bucketCounts: Record<FaunaRateBucket, number> = {
    full: 0,
    medium: 0,
    coarse: 0,
    distant: 0,
    paused: 0,
  };

  constructor(scene: THREE.Scene, spatialHash: SpatialHashGrid) {
    this.spatialHash = spatialHash;

    for (let i = 0; i < MAX_POOL_ACTORS; i++) {
      this.actors.push({
        active: false,
        id: '',
        speciesId: 'ash_hopper',
        herdId: '',
        chunkKey: '',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vz: 0,
        yaw: 0,
        scale: 1,
        tintIndex: 0,
        homeX: 0,
        homeZ: 0,
        phase: 0,
        stepAccum: 0,
        lastBucket: 'full',
      });
    }

    const mat = getSharedMaterial();
    for (const sp of FAUNA_SPECIES_LIST) {
      const mesh = new THREE.InstancedMesh(getSharedGeometry(sp.id), mat, MAX_POOL_ACTORS);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.meshes.set(sp.id, mesh);
      this.speciesRenderCounts.set(sp.id, 0);
      this.group.add(mesh);
    }

    scene.add(this.group);
  }

  reset(seed: string, era: number, waterLevel: number, terrain: TerrainSystem, playerX: number, playerZ: number): void {
    for (let i = 0; i < MAX_POOL_ACTORS; i++) {
      this.actors[i].active = false;
    }
    this.activeCount = 0;
    this.loadedChunks.clear();
    this.lastCenterKey = '';
    this.lastRadius = -1;
    this.lastSeed = seed;
    this.lastEra = era;
    this.waterLevel = waterLevel;
    this.pruneAccum = 0;
    this.aiMsSmoothed = 0;
    this.syncChunks(terrain, seed, era, playerX, playerZ, true);
    this.rebuildInstanceMatrices();
  }

  killCreature(id: string): boolean {
    for (let i = 0; i < this.activeCount; i++) {
      const a = this.actors[i];
      if (!a.active || a.id !== id) continue;
      recordFaunaKill(gameState.killedFauna, a.chunkKey, a.id, gameState.playtimeSec);
      this.removeActorAt(i);
      this.rebuildInstanceMatrices();
      return true;
    }
    return false;
  }

  private removeActorAt(idx: number): void {
    const lastIdx = this.activeCount - 1;
    if (idx !== lastIdx) {
      const tmp = this.actors[idx];
      this.actors[idx] = this.actors[lastIdx];
      this.actors[lastIdx] = tmp;
    }
    this.actors[lastIdx].active = false;
    this.activeCount -= 1;
  }

  private unloadChunk(chunkKey: string): void {
    let i = 0;
    while (i < this.activeCount) {
      if (this.actors[i].chunkKey === chunkKey) {
        this.removeActorAt(i);
      } else {
        i += 1;
      }
    }
    this.loadedChunks.delete(chunkKey);
  }

  private spawnChunk(
    chunkKey: string,
    cx: number,
    cz: number,
    terrain: TerrainSystem,
    seed: string,
    era: number,
    playerX: number,
    playerZ: number
  ): void {
    this.loadedChunks.add(chunkKey);
    const maxCap = Math.min(MAX_POOL_ACTORS, BALANCE.fauna.maxActiveFauna);
    if (this.activeCount >= maxCap) return;

    const spawns = generateChunkFauna({
      seed,
      chunkX: cx,
      chunkZ: cz,
      era,
      playerX,
      playerZ,
      playtimeSec: gameState.playtimeSec,
      groundHeightAt: (x, z) => terrain.groundHeightAt(x, z),
      waterLevel: this.waterLevel,
      killedFauna: gameState.killedFauna,
    });

    for (let i = 0; i < spawns.length && this.activeCount < maxCap; i++) {
      const spRec = spawns[i];
      const spec = FAUNA_SPECIES[spRec.speciesId];
      const actor = this.actors[this.activeCount];
      actor.active = true;
      actor.id = spRec.id;
      actor.speciesId = spRec.speciesId;
      actor.herdId = spRec.herdId;
      actor.chunkKey = spRec.chunkKey;
      actor.x = spRec.x;
      actor.y = spRec.y;
      actor.z = spRec.z;
      actor.yaw = spRec.yaw;
      actor.vx = Math.sin(spRec.yaw) * spec.speed * 0.6;
      actor.vz = Math.cos(spRec.yaw) * spec.speed * 0.6;
      actor.scale = spRec.scale;
      actor.tintIndex = spRec.tintIndex;
      actor.homeX = spRec.x;
      actor.homeZ = spRec.z;
      actor.phase = (i * 1.37) % (Math.PI * 2);
      actor.stepAccum = 0;
      actor.lastBucket = 'full';
      this.activeCount += 1;
    }
  }

  private syncChunks(
    terrain: TerrainSystem,
    seed: string,
    era: number,
    playerX: number,
    playerZ: number,
    force = false
  ): number {
    const pcx = Math.round(playerX / CHUNK_SIZE);
    const pcz = Math.round(playerZ / CHUNK_SIZE);
    const centerKey = `${pcx},${pcz}`;
    const radius = radiusChunksForViewDistance(gameState.settings.graphics.viewDistance);

    if (force || centerKey !== this.lastCenterKey || radius !== this.lastRadius || era !== this.lastEra || seed !== this.lastSeed) {
      this.lastCenterKey = centerKey;
      this.lastRadius = radius;
      this.lastEra = era;
      this.lastSeed = seed;

      const wanted = computeWantedChunks(pcx, pcz, radius);
      const wantedKeys = new Set<string>();
      for (let i = 0; i < wanted.length; i++) wantedKeys.add(wanted[i].key);

      for (const existingKey of [...this.loadedChunks]) {
        if (!wantedKeys.has(existingKey)) {
          this.unloadChunk(existingKey);
        }
      }

      for (let i = 0; i < wanted.length; i++) {
        const w = wanted[i];
        if (!this.loadedChunks.has(w.key)) {
          this.spawnChunk(w.key, w.cx, w.cz, terrain, seed, era, playerX, playerZ);
        }
      }
    }

    return (radius + 0.5) * CHUNK_SIZE;
  }

  update(
    dt: number,
    terrain: TerrainSystem,
    camera: THREE.Camera,
    playerX: number,
    playerZ: number,
    seed: string,
    era: number,
    waterLevel: number,
    lowGfx: boolean
  ): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.waterLevel = waterLevel;

    this.pruneAccum += safeDt;
    if (this.pruneAccum >= 5.0) {
      this.pruneAccum = 0;
      pruneExpiredFaunaKills(gameState.killedFauna, gameState.playtimeSec, BALANCE.fauna.respawnDelaySec);
    }

    const loadedMaxDist = this.syncChunks(terrain, seed, era, playerX, playerZ, false);

    // Update camera frustum once per frame
    camera.updateMatrixWorld();
    _projScreenMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMat);

    const t0 = performance.now();

    this.bucketCounts.full = 0;
    this.bucketCounts.medium = 0;
    this.bucketCounts.coarse = 0;
    this.bucketCounts.distant = 0;
    this.bucketCounts.paused = 0;

    if (this.activeCount > 0 && safeDt > 0) {
      this.boidGrid.rebuild(this.actors, this.activeCount);

      for (let i = 0; i < this.activeCount; i++) {
        const actor = this.actors[i];
        if (!actor.active) continue;

        const dist = Math.hypot(actor.x - playerX, actor.z - playerZ);
        _sphere.center.set(actor.x, actor.y + 0.4, actor.z);
        const inView = _frustum.intersectsSphere(_sphere);
        const bucket = faunaRateBucket(dist, inView, loadedMaxDist);
        actor.lastBucket = bucket;
        this.bucketCounts[bucket] += 1;

        const interval = faunaUpdateInterval(dist, inView, loadedMaxDist, lowGfx);
        if (!Number.isFinite(interval)) continue;

        actor.stepAccum += safeDt;
        if (interval > 0 && actor.stepAccum < interval) continue;

        const stepDt = interval > 0 ? actor.stepAccum : safeDt;
        actor.stepAccum = 0;

        // Zero-allocation obstacle lookup around this creature
        const nCol = this.spatialHash.queryRadiusInto(actor.x, actor.z, 5.5, this.colliderScratch);
        const obsCount = Math.min(nCol, this.boidObstacles.length);
        for (let k = 0; k < obsCount; k++) {
          this.boidObstacles[k].x = this.colliderScratch[k].x;
          this.boidObstacles[k].z = this.colliderScratch[k].z;
          this.boidObstacles[k].radius = this.colliderScratch[k].radius;
        }

        stepFaunaActor(
          i,
          this.actors,
          this.activeCount,
          this.boidGrid,
          stepDt,
          this.boidObstacles,
          obsCount,
          playerX,
          playerZ,
          (x, z) => terrain.groundHeightAt(x, z),
          this.waterLevel
        );
      }

      this.rebuildInstanceMatrices();
    }

    const aiElapsed = performance.now() - t0;
    this.aiMsSmoothed = this.aiMsSmoothed * 0.85 + aiElapsed * 0.15;
  }

  private rebuildInstanceMatrices(): void {
    for (const sp of FAUNA_SPECIES_LIST) {
      this.speciesRenderCounts.set(sp.id, 0);
    }

    for (let i = 0; i < this.activeCount; i++) {
      const a = this.actors[i];
      if (!a.active) continue;
      const mesh = this.meshes.get(a.speciesId);
      if (!mesh) continue;
      const slot = this.speciesRenderCounts.get(a.speciesId) ?? 0;
      if (slot >= MAX_POOL_ACTORS) continue;

      const spec = FAUNA_SPECIES[a.speciesId];
      const bob = Math.sin(a.phase * 2.2) * (spec.habitat === 'aquatic' ? 0.05 : 0.03);
      _pos.set(a.x, a.y + bob, a.z);
      _euler.set(0, a.yaw, Math.sin(a.phase * 2.2) * 0.04, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.setScalar(a.scale);
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(slot, _mat4);

      const tintShift = 0.88 + a.tintIndex * 0.08;
      _color.setHex(spec.baseColorHex).multiplyScalar(tintShift);
      mesh.setColorAt(slot, _color);

      this.speciesRenderCounts.set(a.speciesId, slot + 1);
    }

    for (const [id, mesh] of this.meshes.entries()) {
      const count = this.speciesRenderCounts.get(id) ?? 0;
      mesh.count = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  getTelemetry(): FaunaTelemetry {
    const b = this.bucketCounts;
    return {
      activeCount: this.activeCount,
      bucketsSummary: `full:${b.full} med:${b.medium} coarse:${b.coarse} far:${b.distant} pause:${b.paused}`,
      aiMs: this.aiMsSmoothed,
      bucketCounts: { ...b },
    };
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const mesh of this.meshes.values()) {
      mesh.dispose();
    }
    this.meshes.clear();
  }
}
