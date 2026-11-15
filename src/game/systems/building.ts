import { advanceProducer, collectAnchors, currentSeason, currentSeasonFx, effectiveTerrainSeed, type AwayWeather } from '../data/eden';
import { collectPlayerFootprints } from '../data/worldEvolution';
import * as THREE from 'three';
import { WATER_LEVEL } from '../config';
import { gameState, type StructureType } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { TerrainSystem } from '../world/terrain';
import type { ChunkManager } from '../world/chunkManager';
import { createStructureMesh } from '../world/props';
import { getItemCount, removeItem } from './inventory';
import { distance2D } from '../utils/math';

const MODULAR_TYPES: StructureType[] = ['floor_tile', 'wall_panel', 'roof_panel', 'door_frame'];

export class BuildingGhostSystem {
  private ghostMesh: THREE.Group | null = null;
  private ghostType: StructureType | null = null;
  private validMat = new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.45, wireframe: false });
  private invalidMat = new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.45, wireframe: false });
  private scene: THREE.Scene;
  private shadowTex: THREE.Texture;

  lastCandidate = { x: 0, y: 0, z: 0, rotY: 0, valid: false };

  constructor(scene: THREE.Scene, shadowTex: THREE.Texture) {
    this.scene = scene;
    this.shadowTex = shadowTex;
  }

  update(terrain: TerrainSystem): { active: boolean; valid: boolean } {
    const mode = gameState.buildModeItem;
    if (!mode || gameState.screen !== 'hud') {
      if (this.ghostMesh) this.ghostMesh.visible = false;
      return { active: false, valid: false };
    }

    if (this.ghostType !== mode) {
      if (this.ghostMesh) this.scene.remove(this.ghostMesh);
      this.ghostMesh = createStructureMesh(mode, this.shadowTex);
      this.scene.add(this.ghostMesh);
      this.ghostType = mode;
    }

    const p = gameState.playerPos;
    const dist = 3.6;
    let tx = p.x + Math.sin(p.yaw) * dist;
    let tz = p.z + Math.cos(p.yaw) * dist;
    let rotY = p.yaw + gameState.buildRotOffset;

    // Snap modular pieces to 3.0m grid aligned with nearby modules
    if (MODULAR_TYPES.includes(mode)) {
      const nearestMod = gameState.placedStructures.find(
        (s) => MODULAR_TYPES.includes(s.type) && distance2D(tx, tz, s.x, s.z) < 5.2
      );
      if (nearestMod) {
        const dx = Math.round((tx - nearestMod.x) / 3.0) * 3.0;
        const dz = Math.round((tz - nearestMod.z) / 3.0) * 3.0;
        tx = nearestMod.x + dx;
        tz = nearestMod.z + dz;
        rotY = Math.round((p.yaw + gameState.buildRotOffset) / (Math.PI / 2)) * (Math.PI / 2);
      } else {
        tx = Math.round(tx / 3.0) * 3.0;
        tz = Math.round(tz / 3.0) * 3.0;
        rotY = Math.round((p.yaw + gameState.buildRotOffset) / (Math.PI / 2)) * (Math.PI / 2);
      }
    }

    const ty = terrain.groundHeightAt(tx, tz);
    const slope = terrain.slopeDegreesAt(tx, tz);
    const hasQty = getItemCount(mode) > 0;
    const aboveWater = ty >= WATER_LEVEL + 0.05;
    const flatEnough = slope <= 38;
    const noExactOverlap = !gameState.placedStructures.some(
      (s) => s.type === mode && distance2D(tx, tz, s.x, s.z) < 0.8
    );

    const valid = hasQty && aboveWater && flatEnough && noExactOverlap;
    this.lastCandidate = { x: tx, y: ty, z: tz, rotY, valid };

    if (this.ghostMesh) {
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(tx, ty, tz);
      this.ghostMesh.rotation.y = rotY;
      const mat = valid ? this.validMat : this.invalidMat;
      this.ghostMesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = mat;
        }
      });
    }

    return { active: true, valid };
  }

  dispose(): void {
    if (this.ghostMesh) this.scene.remove(this.ghostMesh);
    this.validMat.dispose();
    this.invalidMat.dispose();
  }
}

export function tryPlaceStructure(
  type: StructureType,
  terrain: TerrainSystem,
  chunks: ChunkManager,
  overridePos?: { x: number; y: number; z: number; rotY: number }
): boolean {
  if (getItemCount(type) <= 0) return false;

  const p = gameState.playerPos;
  const dist = 3.4;
  const tx = overridePos?.x ?? p.x + Math.sin(p.yaw) * dist;
  const tz = overridePos?.z ?? p.z + Math.cos(p.yaw) * dist;
  const ty = overridePos?.y ?? terrain.groundHeightAt(tx, tz);
  const rotY = overridePos?.rotY ?? p.yaw;

  if (ty < WATER_LEVEL + 0.05) return false;

  removeItem(type, 1);
  const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 99)}`;
  const maxHp = MODULAR_TYPES.includes(type) ? 250 : 160;
  gameState.placedStructures.push({
    id,
    type,
    x: tx,
    y: ty,
    z: tz,
    rotY,
    hp: maxHp,
    maxHp,
    waterStored: type === 'water_collector' ? 0 : undefined,
    growth: type === 'garden_plot' ? 0 : undefined,
    stored: type === 'auto_drill' ? 0 : undefined,
    anchorSeed: type === 'terrain_anchor' ? effectiveTerrainSeed(gameState.worldSeed) : undefined,
  });

  if (type === 'terrain_anchor') {
    terrain.setAnchors(collectAnchors(gameState.placedStructures));
  }
  terrain.setFootprints(collectPlayerFootprints(gameState.placedStructures));

  if (type === 'storage_chest') {
    gameState.storageInventories[id] = [];
  }

  gameState.buildModeItem = null;
  chunks.syncPlacedStructures(gameState.placedStructures);
  eventBus.emit('audio:sfx', 'build');
  eventBus.emit('structure:placed', { type, x: tx, z: tz });
  return true;
}

export function tickStructures(dt: number, weather: string): void {
  const rainy = weather === 'acid_rain' || weather === 'electrical_storm';
  const fillRate = (rainy ? 3.5 : 0.8) * currentSeasonFx().waterFillMult;
  const season = currentSeason();
  for (const s of gameState.placedStructures) {
    if (s.type === 'water_collector') {
      s.waterStored = Math.min(100, (s.waterStored || 0) + fillRate * dt);
    } else if (s.type === 'garden_plot' || s.type === 'auto_drill') {
      // Laju yang sama dengan simulasi offline (per jam), diterapkan per detik
      advanceProducer(s, dt / 3600, weather as AwayWeather, season);
    }
  }
}
