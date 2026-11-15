import * as THREE from 'three';
import { CHUNK_SIZE, WATER_LEVEL } from '../config';
import type { ProceduralAssets } from '../core/assetLoader';
import type { SpatialHashGrid } from '../core/spatialHash';
import { gameState, type PlacedStructure } from '../core/state';
import { eventBus } from '../core/eventBus';
import { distance2D, hashString, mulberry32 } from '../utils/math';
import { CRYSTAL_CRATER, VOLCANO_MAIN, WORLD_POIS, getBiomeAt, getDistanceToLava } from './biomes';
import { disposeObject3D, markShared } from './disposal';
import type { TerrainSystem } from './terrain';
import { shelterColliders } from './shelterLayout';
import {
  createBasaltRockNode,
  createCrystalClusterNode,
  createFumaroleVentModel,
  createMeteorIronNode,
  createMineralVeinNode,
  createObsidianNode,
  createStructureMesh,
  createThermalSaltNode,
  type WorldInteractable,
} from './props';

// Aset spire dipakai bersama semua chunk (dibuat sekali, tidak pernah dibuang per chunk).
const SPIRE_MATERIAL = markShared(new THREE.MeshStandardMaterial({ color: '#2b2422', roughness: 0.92, metalness: 0.1 }));
// Satu geometri spire berukuran 1; skala per spire lewat mesh.scale.
// Bentuk setara CylinderGeometry(0.45*s, 1.3*s, 5.2*s, 6) karena skala seragam.
const SPIRE_GEOMETRY = markShared(new THREE.CylinderGeometry(0.45, 1.3, 5.2, 6));

interface LoadedPropChunk {
  key: string;
  group: THREE.Group;
  interactables: WorldInteractable[];
  colliderIds: string[];
}

export class ChunkManager {
  readonly group = new THREE.Group();
  readonly interactables: WorldInteractable[] = [];
  readonly structureMeshes: THREE.Group[] = [];
  readonly spatialHash: SpatialHashGrid;

  private propChunks = new Map<string, LoadedPropChunk>();
  private extraInteractables: WorldInteractable[] = [];
  private structureInteractables: WorldInteractable[] = [];
  /** Semua id collider struktur (pondok punya beberapa) agar bisa dibuang utuh saat sinkron. */
  private structureColliderIds: string[] = [];
  private assets: ProceduralAssets;
  private seed = 'HADEAN-01';
  private lastCenterKey = '';

  constructor(
    scene: THREE.Scene,
    terrain: TerrainSystem,
    seed: string,
    assets: ProceduralAssets,
    spatialHash: SpatialHashGrid
  ) {
    this.assets = assets;
    this.spatialHash = spatialHash;
    this.populate(terrain, seed);
    scene.add(this.group);
  }

  populate(terrain: TerrainSystem, seed: string): void {
    this.seed = seed;
    this.clearAllPropChunks();
    for (const ex of this.extraInteractables) {
      this.group.remove(ex.mesh);
      disposeObject3D(ex.mesh);
    }
    this.extraInteractables = [];
    this.lastCenterKey = '';
    this.updateStreaming(terrain, gameState.playerPos.x, gameState.playerPos.z, true);
  }

  updateStreaming(terrain: TerrainSystem, px: number, pz: number, force = false): void {
    const pcx = Math.round(px / CHUNK_SIZE);
    const pcz = Math.round(pz / CHUNK_SIZE);
    const centerKey = `${pcx},${pcz}`;
    if (!force && centerKey === this.lastCenterKey) return;
    this.lastCenterKey = centerKey;

    // Discover chunk on fog-of-war map
    if (!gameState.discoveredChunks.includes(centerKey)) {
      gameState.discoveredChunks.push(centerKey);
    }

    // Discover nearby POIs
    for (const poi of WORLD_POIS) {
      if (distance2D(px, pz, poi.x, poi.z) < 42) {
        if (!gameState.discoveredPois.some((d) => d.id === poi.id)) {
          gameState.discoveredPois.push({ ...poi });
          eventBus.emit('poi:discovered', poi);
        }
      }
    }

    const radius = 2; // 5x5 chunks = 320m x 320m active props & colliders around player
    const wanted = new Set<string>();
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        wanted.add(`${pcx + dx},${pcz + dz}`);
      }
    }

    for (const [key, chunk] of this.propChunks.entries()) {
      if (!wanted.has(key)) {
        this.releaseChunk(chunk);
        this.propChunks.delete(key);
      }
    }

    for (const key of wanted) {
      if (this.propChunks.has(key)) continue;
      const [cxStr, czStr] = key.split(',');
      this.buildChunkProps(key, Number(cxStr), Number(czStr), terrain);
    }

    this.rebuildInteractablesIndex();
  }

  private buildChunkProps(key: string, cx: number, cz: number, terrain: TerrainSystem): void {
    const chunkGroup = new THREE.Group();
    const list: WorldInteractable[] = [];
    const colliderIds: string[] = [];
    const rng = mulberry32(hashString(`${this.seed}_${cx}_${cz}`));
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const addProp = (
      kind: WorldInteractable['kind'],
      id: string,
      x: number,
      z: number,
      actionKey: string,
      colliderRadius = 0.9
    ) => {
      const y = terrain.groundHeightAt(x, z);
      let mesh: THREE.Group;
      if (kind === 'rock') mesh = createBasaltRockNode(this.assets.contactShadowTexture);
      else if (kind === 'mineral') mesh = createMineralVeinNode(this.assets.contactShadowTexture);
      else if (kind === 'obsidian') mesh = createObsidianNode(this.assets.contactShadowTexture);
      else if (kind === 'salt') mesh = createThermalSaltNode(this.assets.contactShadowTexture);
      else if (kind === 'meteor_iron') mesh = createMeteorIronNode(this.assets.contactShadowTexture);
      else if (kind === 'crystal') mesh = createCrystalClusterNode(this.assets.contactShadowTexture);
      else mesh = createFumaroleVentModel();

      mesh.position.set(x, y, z);
      mesh.rotation.y = rng() * Math.PI * 2;
      chunkGroup.add(mesh);

      const node: WorldInteractable = {
        id,
        kind,
        actionKey,
        x,
        y,
        z,
        radius: kind === 'crystal' ? 3.2 : 2.9,
        depleted: false,
        mesh,
        chunkKey: key,
      };
      list.push(node);

      if (colliderRadius > 0) {
        const colId = `col_${id}`;
        colliderIds.push(colId);
        this.spatialHash.insert({
          id: colId,
          x,
          z,
          radius: colliderRadius,
          yMin: y - 0.5,
          yMax: y + 2.4,
          kind: kind === 'crystal' ? 'crystal' : kind === 'rock' ? 'rock' : 'mineral',
        });
      }
    };

    // Starter chunk (0,0) guaranteed landmarks & resources for smooth onboarding
    if (cx === 0 && cz === 0) {
      const guaranteedRocks = [
        { x: -6, z: 14 },
        { x: -9, z: 22 },
        { x: 6, z: 12 },
        { x: 10, z: 26 },
      ];
      guaranteedRocks.forEach((p, idx) => addProp('rock', `start_rock_${idx}`, p.x, p.z, 'gather_rock', 0.85));
      [
        { x: -11, z: 10 },
        { x: 12, z: 11 },
        { x: -15, z: -2 },
      ].forEach((p, idx) => addProp('mineral', `start_min_${idx}`, p.x, p.z, 'gather_mineral', 0.95));

      this.addWaterDisc(chunkGroup, list, 'water_starter', 16, 22, terrain, 'water', 'collect_water');
    }

    // Procedural basalt spires for vertical geological silhouette + spatial obstacle collision
    for (let i = 0; i < 4; i++) {
      const sx = baseX + (rng() - 0.5) * (CHUNK_SIZE - 8);
      const sz = baseZ + (rng() - 0.5) * (CHUNK_SIZE - 8);
      if (distance2D(sx, sz, 0, 18) < 13) continue;
      const sy = terrain.groundHeightAt(sx, sz);
      if (sy < WATER_LEVEL + 0.3 || getDistanceToLava(sx, sz) < 5) continue;
      const scale = 0.75 + rng() * 1.1;
      const spire = new THREE.Mesh(SPIRE_GEOMETRY, SPIRE_MATERIAL);
      spire.scale.setScalar(scale);
      spire.position.set(sx, sy + 2.3 * scale, sz);
      spire.rotation.set((rng() - 0.5) * 0.16, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
      chunkGroup.add(spire);
      const colId = `spire_${key}_${i}`;
      colliderIds.push(colId);
      this.spatialHash.insert({
        id: colId,
        x: sx,
        z: sz,
        radius: 1.15 * scale,
        yMin: sy - 0.5,
        yMax: sy + 5.2 * scale,
        kind: 'spire',
      });
    }

    // Biome-aware resource nodes per chunk
    const nodeCount = 7;
    for (let i = 0; i < nodeCount; i++) {
      const nx = baseX + (rng() - 0.5) * (CHUNK_SIZE - 6);
      const nz = baseZ + (rng() - 0.5) * (CHUNK_SIZE - 6);
      if (distance2D(nx, nz, 0, 18) < 9) continue;
      const ny = terrain.groundHeightAt(nx, nz);
      if (getDistanceToLava(nx, nz) < 4.5) continue;

      const biome = getBiomeAt(nx, nz, ny);
      if (ny < WATER_LEVEL + 0.1) {
        if (i === 0) this.addWaterDisc(chunkGroup, list, `water_${key}_${i}`, nx, nz, terrain, 'water', 'collect_water');
        continue;
      }

      if (biome.id === 'crystal_crater') {
        addProp('crystal', `crys_${key}_${i}`, nx, nz, 'gather_crystal', 0.85);
      } else if (biome.id === 'obsidian_fields') {
        addProp(i % 2 === 0 ? 'obsidian' : 'rock', `obs_${key}_${i}`, nx, nz, i % 2 === 0 ? 'gather_obsidian' : 'gather_rock', 0.85);
      } else if (biome.id === 'geyser_basin') {
        if (i === 0) {
          this.addWaterDisc(chunkGroup, list, `geyser_${key}`, nx, nz, terrain, 'geyser_pool', 'seed_pool');
        } else {
          addProp('salt', `salt_${key}_${i}`, nx, nz, 'gather_salt', 0.75);
        }
      } else if (biome.id === 'meteor_impact') {
        addProp(i % 2 === 0 ? 'meteor_iron' : 'crystal', `miron_${key}_${i}`, nx, nz, i % 2 === 0 ? 'gather_meteor_iron' : 'gather_crystal', 0.9);
      } else if (biome.id === 'sulfur_flats' || biome.id === 'volcanic_ridge') {
        if (i === 0) addProp('gas_vent', `vent_${key}`, nx, nz, 'gather_mineral', 0.9);
        else addProp('mineral', `min_${key}_${i}`, nx, nz, 'gather_mineral', 0.85);
      } else {
        addProp(i % 3 === 0 ? 'mineral' : 'rock', `res_${key}_${i}`, nx, nz, i % 3 === 0 ? 'gather_mineral' : 'gather_rock', 0.85);
      }
    }

    // Ensure Crystal Crater (38,-22) always spawns rich crystals
    if (distance2D(baseX, baseZ, CRYSTAL_CRATER.x, CRYSTAL_CRATER.z) < CHUNK_SIZE) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        addProp('crystal', `crater_main_${i}`, CRYSTAL_CRATER.x + Math.cos(a) * 5, CRYSTAL_CRATER.z + Math.sin(a) * 5, 'gather_crystal', 0.85);
      }
    }
    if (distance2D(baseX, baseZ, VOLCANO_MAIN.x, VOLCANO_MAIN.z) < CHUNK_SIZE) {
      addProp('obsidian', 'volc_obs_0', VOLCANO_MAIN.x + 14, VOLCANO_MAIN.z + 18, 'gather_obsidian', 0.85);
    }

    this.group.add(chunkGroup);
    this.propChunks.set(key, { key, group: chunkGroup, interactables: list, colliderIds });
  }

  private addWaterDisc(
    parent: THREE.Group,
    list: WorldInteractable[],
    id: string,
    x: number,
    z: number,
    terrain: TerrainSystem,
    kind: 'water' | 'geyser_pool',
    actionKey: string
  ): void {
    const y = Math.max(WATER_LEVEL, terrain.groundHeightAt(x, z));
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 22),
      new THREE.MeshBasicMaterial({
        color: kind === 'geyser_pool' ? '#34d399' : '#38bdf8',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    g.position.set(x, y, z);
    parent.add(g);
    list.push({ id, kind, actionKey, x, y, z, radius: 4.8, depleted: false, mesh: g });
  }

  spawnMeteorCrystal(x: number, y: number, z: number): void {
    const id = `meteor_crystal_${Date.now()}_${Math.floor(Math.random() * 999)}`;
    const isIron = Math.random() < 0.45;
    const mesh = isIron
      ? createMeteorIronNode(this.assets.contactShadowTexture)
      : createCrystalClusterNode(this.assets.contactShadowTexture);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this.extraInteractables.push({
      id,
      kind: isIron ? 'meteor_iron' : 'crystal',
      actionKey: isIron ? 'gather_meteor_iron' : 'gather_crystal',
      x,
      y,
      z,
      radius: 3.1,
      depleted: false,
      mesh,
    });
    this.rebuildInteractablesIndex();
  }

  syncPlacedStructures(structures: PlacedStructure[]): void {
    for (const m of this.structureMeshes) {
      this.group.remove(m);
      disposeObject3D(m);
    }
    this.structureMeshes.length = 0;
    for (const id of this.structureColliderIds) this.spatialHash.remove(id);
    this.structureColliderIds.length = 0;
    this.structureInteractables = [];

    for (const s of structures) {
      const model = createStructureMesh(s.type, this.assets.contactShadowTexture);
      model.position.set(s.x, s.y, s.z);
      model.rotation.y = s.rotY;
      this.group.add(model);
      this.structureMeshes.push(model);

      // Register collision for solid structures (skip flat floor_tile/roof/door walk-throughs)
      if (s.type !== 'floor_tile' && s.type !== 'roof_panel' && s.type !== 'door_frame') {
        if (s.type === 'basic_shelter') {
          // Pondok bisa dimasuki: cincin 7 segmen dinding, celah di sisi pintu (lihat shelterLayout.ts)
          shelterColliders(s).forEach((c, k) => {
            const id = `col_str_${s.id}_${k}`;
            this.spatialHash.insert({ id, x: c.x, z: c.z, radius: c.radius, yMin: s.y - 0.3, yMax: s.y + 2.8, kind: 'structure' });
            this.structureColliderIds.push(id);
          });
        } else {
          const colR = s.type === 'wall_panel' ? 1.3 : 0.85;
          const id = `col_str_${s.id}`;
          this.spatialHash.insert({ id, x: s.x, z: s.z, radius: colR, yMin: s.y - 0.3, yMax: s.y + 2.8, kind: 'structure' });
          this.structureColliderIds.push(id);
        }
      }

      if (s.type === 'basic_shelter') {
        this.structureInteractables.push({
          id: s.id,
          kind: 'shelter',
          actionKey: 'rest_shelter',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 4.4,
          depleted: false,
          mesh: model,
        });
      } else if (s.type === 'storage_chest') {
        this.structureInteractables.push({
          id: s.id,
          kind: 'storage_chest',
          actionKey: 'open_storage',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 3.2,
          depleted: false,
          mesh: model,
        });
      } else if (s.type === 'water_collector') {
        this.structureInteractables.push({
          id: s.id,
          kind: 'water_collector',
          actionKey: 'collect_rain',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 3.2,
          depleted: false,
          mesh: model,
        });
      } else if (s.type === 'garden_plot' || s.type === 'auto_drill') {
        this.structureInteractables.push({
          id: s.id,
          kind: s.type,
          actionKey: s.type === 'garden_plot' ? 'harvest_garden' : 'collect_drill',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 3.2,
          depleted: false,
          mesh: model,
        });
      } else if (s.type === 'fast_beacon') {
        this.structureInteractables.push({
          id: s.id,
          kind: 'fast_beacon',
          actionKey: 'use_beacon',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 3.6,
          depleted: false,
          mesh: model,
        });
      }
    }
    this.rebuildInteractablesIndex();
  }

  private rebuildInteractablesIndex(): void {
    this.interactables.length = 0;
    for (const ch of this.propChunks.values()) {
      this.interactables.push(...ch.interactables);
    }
    this.interactables.push(...this.extraInteractables, ...this.structureInteractables);
  }

  findNearestInteractable(px: number, pz: number): WorldInteractable | null {
    let best: WorldInteractable | null = null;
    let bestDist = Infinity;
    for (const item of this.interactables) {
      if (item.depleted || item.kind === 'gas_vent') continue;
      const d = distance2D(px, pz, item.x, item.z);
      if (d <= item.radius && d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  private clearAllPropChunks(): void {
    for (const ch of this.propChunks.values()) this.releaseChunk(ch);
    this.propChunks.clear();
  }

  /** Lepas chunk dari scene, hapus collider, dan buang geometri/material miliknya (bukan yang bersama). */
  private releaseChunk(chunk: LoadedPropChunk): void {
    this.group.remove(chunk.group);
    for (const cid of chunk.colliderIds) this.spatialHash.remove(cid);
    disposeObject3D(chunk.group);
  }

  dispose(): void {
    this.clearAllPropChunks();
    for (const m of this.structureMeshes) {
      this.group.remove(m);
      disposeObject3D(m);
    }
    this.structureMeshes.length = 0;
  }
}
