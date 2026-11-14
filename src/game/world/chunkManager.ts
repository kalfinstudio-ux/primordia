import * as THREE from 'three';
import { WATER_LEVEL, WORLD_RADIUS } from '../config';
import type { ProceduralAssets } from '../core/assetLoader';
import { hashString, mulberry32, distance2D } from '../utils/math';
import { CRYSTAL_CRATER, VOLCANO_MAIN, getDistanceToLava } from './biomes';
import type { TerrainSystem } from './terrain';
import {
  createBasaltRockNode,
  createCampfireModel,
  createCrystalClusterNode,
  createFumaroleVentModel,
  createMineralVeinNode,
  createShelterModel,
  type WorldInteractable,
} from './props';
import type { PlacedStructure } from '../core/state';

export class ChunkManager {
  readonly group = new THREE.Group();
  readonly interactables: WorldInteractable[] = [];
  readonly structureMeshes: THREE.Group[] = [];
  private instancedSpires: THREE.InstancedMesh;
  private assets: ProceduralAssets;

  constructor(scene: THREE.Scene, terrain: TerrainSystem, seed: string, assets: ProceduralAssets) {
    this.assets = assets;

    // Instanced jagged basalt monolith columns across the horizon & ridges (>20 instances)
    const spireGeo = new THREE.CylinderGeometry(0.45, 1.35, 5.5, 6);
    spireGeo.translate(0, 2.75, 0);
    const spireMat = new THREE.MeshStandardMaterial({
      color: '#2b2422',
      roughness: 0.92,
      metalness: 0.1,
    });
    this.instancedSpires = new THREE.InstancedMesh(spireGeo, spireMat, 64);
    this.instancedSpires.castShadow = true;
    this.instancedSpires.receiveShadow = true;
    this.group.add(this.instancedSpires);

    this.populate(terrain, seed);
    scene.add(this.group);
  }

  populate(terrain: TerrainSystem, seed: string): void {
    // Clear previous interactables
    for (const item of this.interactables) {
      this.group.remove(item.mesh);
    }
    this.interactables.length = 0;

    const rng = mulberry32(hashString(seed));
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    // Place 64 instanced basalt spires around mid/outer world
    let placedSpires = 0;
    let attempts = 0;
    while (placedSpires < 64 && attempts < 300) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const dist = 24 + rng() * (WORLD_RADIUS - 26);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = terrain.groundHeightAt(x, z);
      if (y < WATER_LEVEL + 0.3 || getDistanceToLava(x, z) < 5) continue;

      dummy.position.set(x, y - 0.3, z);
      const s = 0.7 + rng() * 1.4;
      dummy.scale.set(s, s * (0.8 + rng() * 0.9), s);
      dummy.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
      dummy.updateMatrix();
      this.instancedSpires.setMatrixAt(placedSpires, dummy.matrix);

      tint.set('#2b2422').offsetHSL(0, 0, (rng() - 0.5) * 0.08);
      this.instancedSpires.setColorAt(placedSpires, tint);
      placedSpires++;
    }
    this.instancedSpires.count = placedSpires;
    this.instancedSpires.instanceMatrix.needsUpdate = true;
    if (this.instancedSpires.instanceColor) this.instancedSpires.instanceColor.needsUpdate = true;
    this.instancedSpires.computeBoundingSphere();

    // Guaranteed starter basalt rocks & mineral veins near spawn (0, 18) for smooth onboarding
    const guaranteedRocks = [
      { x: -6, z: 14 },
      { x: -9, z: 22 },
      { x: 6, z: 12 },
      { x: 10, z: 26 },
    ];
    guaranteedRocks.forEach((pt, idx) => {
      this.addNode('rock', `rock_start_${idx}`, pt.x, pt.z, terrain, 'gather_rock');
    });

    const guaranteedMinerals = [
      { x: -11, z: 10 },
      { x: 12, z: 11 },
      { x: -15, z: -2 },
    ];
    guaranteedMinerals.forEach((pt, idx) => {
      this.addNode('mineral', `min_start_${idx}`, pt.x, pt.z, terrain, 'gather_mineral');
    });

    // Procedural scatter of basalt rocks and sulfur mineral veins
    for (let i = 0; i < 24; i++) {
      const a = rng() * Math.PI * 2;
      const r = 14 + rng() * 72;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrain.groundHeightAt(x, z);
      if (y < WATER_LEVEL + 0.35 || getDistanceToLava(x, z) < 5) continue;
      if (i % 3 === 0) {
        this.addNode('mineral', `min_${i}`, x, z, terrain, 'gather_mineral');
      } else {
        this.addNode('rock', `rock_${i}`, x, z, terrain, 'gather_rock');
      }
    }

    // Primordial Crystals inside the Crystal Crater (38, -22)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0.5 : 4.5 + (i % 3) * 2.2;
      const cx = CRYSTAL_CRATER.x + Math.cos(a) * r;
      const cz = CRYSTAL_CRATER.z + Math.sin(a) * r;
      this.addNode('crystal', `crystal_${i}`, cx, cz, terrain, 'gather_crystal');
    }

    // Toxic volcanic gas fumaroles near Mount Hadean slopes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const vx = VOLCANO_MAIN.x + Math.cos(a) * 19;
      const vz = VOLCANO_MAIN.z + Math.sin(a) * 19;
      this.addNode('gas_vent', `vent_${i}`, vx, vz, terrain, 'gather_mineral');
    }

    // Starter shallow water collection point near (16, 22)
    this.addWaterMarker('water_starter', 16, 22, terrain);
    this.addWaterMarker('water_south', 8, 38, terrain);
    this.addWaterMarker('water_east', 44, 28, terrain);
  }

  private addNode(
    kind: WorldInteractable['kind'],
    id: string,
    x: number,
    z: number,
    terrain: TerrainSystem,
    actionKey: string
  ): void {
    const y = terrain.groundHeightAt(x, z);
    let mesh: THREE.Group;
    if (kind === 'rock') mesh = createBasaltRockNode(this.assets.contactShadowTexture);
    else if (kind === 'mineral') mesh = createMineralVeinNode(this.assets.contactShadowTexture);
    else if (kind === 'crystal') mesh = createCrystalClusterNode(this.assets.contactShadowTexture);
    else mesh = createFumaroleVentModel();

    mesh.position.set(x, y, z);
    mesh.rotation.y = (x * 0.37 + z * 0.71) % (Math.PI * 2);
    this.group.add(mesh);

    this.interactables.push({
      id,
      kind,
      actionKey,
      x,
      y,
      z,
      radius: kind === 'crystal' ? 3.2 : 2.8,
      depleted: false,
      mesh,
    });
  }

  private addWaterMarker(id: string, x: number, z: number, terrain: TerrainSystem): void {
    const y = Math.max(WATER_LEVEL, terrain.groundHeightAt(x, z));
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 20),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    g.position.set(x, y, z);
    this.group.add(g);

    this.interactables.push({
      id,
      kind: 'water',
      actionKey: 'collect_water',
      x,
      y,
      z,
      radius: 4.5,
      depleted: false,
      mesh: g,
    });
  }

  spawnMeteorCrystal(x: number, y: number, z: number): void {
    const id = `meteor_crystal_${Date.now()}_${Math.floor(Math.random() * 999)}`;
    const mesh = createCrystalClusterNode(this.assets.contactShadowTexture);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.85);
    this.group.add(mesh);
    this.interactables.push({
      id,
      kind: 'crystal',
      actionKey: 'gather_crystal',
      x,
      y,
      z,
      radius: 3.0,
      depleted: false,
      mesh,
    });
  }

  syncPlacedStructures(structures: PlacedStructure[]): void {
    for (const m of this.structureMeshes) {
      this.group.remove(m);
    }
    this.structureMeshes.length = 0;

    // Remove previous shelter interactables
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      if (this.interactables[i].kind === 'shelter') {
        this.interactables.splice(i, 1);
      }
    }

    for (const s of structures) {
      const model =
        s.type === 'basic_shelter'
          ? createShelterModel(this.assets.contactShadowTexture)
          : createCampfireModel(this.assets.contactShadowTexture);
      model.position.set(s.x, s.y, s.z);
      model.rotation.y = s.rotY;
      this.group.add(model);
      this.structureMeshes.push(model);

      if (s.type === 'basic_shelter') {
        this.interactables.push({
          id: s.id,
          kind: 'shelter',
          actionKey: 'rest_shelter',
          x: s.x,
          y: s.y,
          z: s.z,
          radius: 4.2,
          depleted: false,
          mesh: model,
        });
      }
    }
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

  dispose(): void {
    this.instancedSpires.geometry.dispose();
    (this.instancedSpires.material as THREE.Material).dispose();
  }
}
