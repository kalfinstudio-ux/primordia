import * as THREE from 'three';
import type { StructureType } from '../core/state';
import { markShared } from './disposal';
import { SHELTER_DOOR_SLOT, SHELTER_WALL_SLOTS, wallSlotLocal } from './shelterLayout';

export interface WorldInteractable {
  id: string;
  kind:
    | 'rock'
    | 'mineral'
    | 'obsidian'
    | 'salt'
    | 'meteor_iron'
    | 'crystal'
    | 'water'
    | 'geyser_pool'
    | 'shelter'
    | 'storage_chest'
    | 'water_collector'
    | 'garden_plot'
    | 'auto_drill'
    | 'fast_beacon'
    | 'gas_vent';
  actionKey: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  depleted: boolean;
  mesh: THREE.Group;
  chunkKey?: string;
}

const basaltMat = markShared(new THREE.MeshStandardMaterial({ color: '#3b3532', roughness: 0.9, metalness: 0.08 }));
const darkBasaltMat = markShared(new THREE.MeshStandardMaterial({ color: '#24201e', roughness: 0.85, metalness: 0.12 }));
const sulfurMat = markShared(new THREE.MeshStandardMaterial({ color: '#eab308', emissive: '#854d0e', emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.65 }));
const obsidianMat = markShared(new THREE.MeshStandardMaterial({ color: '#1e1b4b', emissive: '#312e81', emissiveIntensity: 0.25, roughness: 0.16, metalness: 0.6 }));
const saltMat = markShared(new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#d97706', emissiveIntensity: 0.18, roughness: 0.45, metalness: 0.1 }));
const meteorIronMat = markShared(new THREE.MeshStandardMaterial({ color: '#475569', emissive: '#1d4ed8', emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.85 }));
const crystalMat = markShared(new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#ea580c', emissiveIntensity: 1.15, roughness: 0.14, metalness: 0.2 }));
const shelterFrameMat = markShared(new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.75, metalness: 0.25 }));
const shelterShieldMat = markShared(new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.32, metalness: 0.65 }));
const hutWallMat = markShared(new THREE.MeshStandardMaterial({ color: '#4a423d', roughness: 0.92, metalness: 0.06 }));
const hutWallLightMat = markShared(new THREE.MeshStandardMaterial({ color: '#5f5650', roughness: 0.88, metalness: 0.06 }));
const hutRoofMat = markShared(new THREE.MeshStandardMaterial({ color: '#2c2724', roughness: 0.8, metalness: 0.18 }));
const hutRimMat = markShared(new THREE.MeshStandardMaterial({ color: '#b45309', emissive: '#7c2d12', emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.55 }));
const hutHearthMat = markShared(new THREE.MeshStandardMaterial({ color: '#7c2d12', emissive: '#f97316', emissiveIntensity: 1.25, roughness: 0.6 }));
const hutDoorGlowMat = markShared(new THREE.MeshBasicMaterial({ color: '#ff9a4d', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
const ironMat = markShared(new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.8 }));
const glassMat = markShared(new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.65, roughness: 0.1, metalness: 0.2 }));
const mossMat = markShared(new THREE.MeshStandardMaterial({ color: '#4d7c0f', emissive: '#14532d', emissiveIntensity: 0.25, roughness: 0.85 }));
const beaconMat = markShared(new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#eab308', emissiveIntensity: 1.4, roughness: 0.2 }));

export function createBasaltRockNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), basaltMat);
  main.scale.set(1.2, 0.78, 1.0);
  main.position.y = 0.52;
  const sideA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), darkBasaltMat);
  sideA.position.set(0.65, 0.3, 0.25);
  const shadow = makeShadowDisc(shadowTex, 1.3);
  g.add(shadow, main, sideA);
  return g;
}

export function createMineralVeinNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const host = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), darkBasaltMat);
  host.scale.set(1.1, 0.85, 1.0);
  host.position.y = 0.55;
  const ore1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), sulfurMat);
  ore1.position.set(0.38, 0.85, 0.2);
  const ore2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), sulfurMat);
  ore2.position.set(-0.42, 0.72, -0.15);
  const shadow = makeShadowDisc(shadowTex, 1.45);
  g.add(shadow, host, ore1, ore2);
  return g;
}

export function createObsidianNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.32 - i * 0.05, 1.5 - i * 0.25, 4), obsidianMat);
    blade.position.set((i - 1) * 0.35, 0.65, (i % 2) * 0.2);
    blade.rotation.z = (i - 1) * 0.24;
    g.add(blade);
  }
  g.add(makeShadowDisc(shadowTex, 1.25));
  return g;
}

export function createThermalSaltNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 0.45, 8), saltMat);
  mound.position.y = 0.22;
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), saltMat);
  cap.position.y = 0.5;
  g.add(makeShadowDisc(shadowTex, 1.15), mound, cap);
  return g;
}

export function createMeteorIronNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.88, 1), meteorIronMat);
  chunk.scale.set(1.15, 0.85, 1.0);
  chunk.position.y = 0.58;
  g.add(makeShadowDisc(shadowTex, 1.4), chunk);
  return g;
}

export function createCrystalClusterNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 0.45, 7), darkBasaltMat);
  base.position.y = 0.22;
  const spire1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.65, 5), crystalMat);
  spire1.position.set(0, 1.05, 0);
  const spire2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.25, 5), crystalMat);
  spire2.position.set(0.35, 0.8, 0.15);
  spire2.rotation.z = -0.32;
  g.add(makeShadowDisc(shadowTex, 1.35), base, spire1, spire2);
  return g;
}

export function createFumaroleVentModel(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 0.9, 7), darkBasaltMat);
  cone.position.y = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.12, 6, 12), sulfurMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.88;
  g.add(cone, rim);
  return g;
}

export function createStructureMesh(type: StructureType, shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();

  if (type === 'basic_shelter') {
    buildBasaltHut(g, shadowTex);
  } else if (type === 'campfire_kit') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), basaltMat);
      stone.position.set(Math.cos(a) * 0.65, 0.16, Math.sin(a) * 0.65);
      g.add(stone);
    }
    const ember = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 6), crystalMat);
    ember.position.y = 0.42;
    const light = new THREE.PointLight('#ff6b2b', 9, 14, 1.8);
    light.position.y = 1.1;
    g.add(makeShadowDisc(shadowTex, 1.1), ember, light);
  } else if (type === 'workbench') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.95), shelterShieldMat);
    top.position.y = 0.95;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), darkBasaltMat);
    legs.position.y = 0.45;
    g.add(makeShadowDisc(shadowTex, 1.3), legs, top);
  } else if (type === 'smelter_furnace') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 1.7, 8), darkBasaltMat);
    body.position.y = 0.85;
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.3), crystalMat);
    core.position.set(0, 0.5, 0.72);
    g.add(makeShadowDisc(shadowTex, 1.4), body, core);
  } else if (type === 'research_station') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 1.2), ironMat);
    base.position.y = 0.48;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), glassMat);
    dome.position.set(0, 1.25, 0);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), beaconMat);
    orb.position.set(0, 1.25, 0);
    g.add(makeShadowDisc(shadowTex, 1.5), base, dome, orb);
  } else if (type === 'storage_chest') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 0.75), shelterFrameMat);
    box.position.y = 0.38;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 0.78), shelterShieldMat);
    band.position.y = 0.55;
    g.add(makeShadowDisc(shadowTex, 1.0), box, band);
  } else if (type === 'water_collector') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 1.1, 10), glassMat);
    tank.position.y = 0.55;
    const funnel = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 10, 1, true), ironMat);
    funnel.rotation.x = Math.PI;
    funnel.position.y = 1.38;
    g.add(makeShadowDisc(shadowTex, 1.1), tank, funnel);
  } else if (type === 'garden_plot') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 1.6), darkBasaltMat);
    bed.position.y = 0.14;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.4), basaltMat);
    soil.position.y = 0.3;
    g.add(makeShadowDisc(shadowTex, 1.5), bed, soil);
    for (let i = 0; i < 6; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 5), mossMat);
      tuft.position.set(-0.7 + (i % 3) * 0.7, 0.55, i < 3 ? -0.3 : 0.3);
      g.add(tuft);
    }
  } else if (type === 'auto_drill') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 8), darkBasaltMat);
    base.position.y = 0.2;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), ironMat);
    tower.position.y = 1.5;
    const bit = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), shelterShieldMat);
    bit.rotation.x = Math.PI;
    bit.position.y = 0.55;
    g.add(makeShadowDisc(shadowTex, 1.3), base, tower, bit);
  } else if (type === 'fast_beacon') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 0.4, 8), darkBasaltMat);
    plinth.position.y = 0.2;
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 2.6, 6), ironMat);
    pylon.position.y = 1.5;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), beaconMat);
    orb.position.y = 3.1;
    g.add(makeShadowDisc(shadowTex, 1.3), plinth, pylon, orb);
  } else if (type === 'terrain_anchor') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 0.45, 8), darkBasaltMat);
    plinth.position.y = 0.22;
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 3.2, 6), ironMat);
    pylon.position.y = 2.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 24), beaconMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.6;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), crystalMat);
    orb.position.y = 3.9;
    g.add(makeShadowDisc(shadowTex, 1.5), plinth, pylon, ring, orb);
  } else if (type === 'floor_tile') {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 3.0), shelterFrameMat);
    slab.position.y = 0.12;
    g.add(slab);
  } else if (type === 'wall_panel') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 0.28), darkBasaltMat);
    wall.position.y = 1.3;
    const brace = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.2, 0.34), shelterShieldMat);
    brace.position.y = 2.48;
    g.add(wall, brace);
  } else if (type === 'roof_panel') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.22, 3.1), shelterShieldMat);
    roof.position.y = 2.65;
    g.add(roof);
  } else if (type === 'door_frame') {
    const leftP = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.6, 0.3), darkBasaltMat);
    leftP.position.set(-1.07, 1.3, 0);
    const rightP = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.6, 0.3), darkBasaltMat);
    rightP.position.set(1.07, 1.3, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.32), shelterShieldMat);
    lintel.position.set(0, 2.35, 0);
    g.add(leftP, rightP, lintel);
  }

  return g;
}

/**
 * Pondok basal: cincin 8 slot dinding batu (slot ke-6 = pintu menghadap -Z lokal), atap bertingkat
 * dengan tepi berkarat, lantai bara hangat, dan cahaya lembut di pintu. Tanpa PointLight (hemat GPU HP).
 * Ukuran harus sinkron dengan `shelterLayout.ts` (cincin R=1,9; collider dibuat di chunkManager).
 * Mesh bertanda `userData.ghostHide` disembunyikan pada pratinjau penempatan.
 */
function buildBasaltHut(g: THREE.Group, shadowTex: THREE.Texture): void {
  // Alas batu bundar + lantai bara di dalam
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.75, 0.3, 16), darkBasaltMat);
  plinth.position.y = 0.15;
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.04, 16), hutHearthMat);
  floor.position.y = 0.32;
  floor.userData.ghostHide = true;
  g.add(makeShadowDisc(shadowTex, 3.3), plinth, floor);

  // Dinding: balok batu bersusun, tinggi/kemiringan dibuat bervariasi (deterministik) agar tidak terlihat kotak
  const heights = [2.25, 2.0, 2.35, 2.1, 2.3, 2.05, 0, 2.2];
  for (let i = 0; i < SHELTER_WALL_SLOTS; i++) {
    if (i === SHELTER_DOOR_SLOT) continue;
    const l = wallSlotLocal(i);
    const h = heights[i];
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.6, h * 0.58, 0.62), i % 2 ? hutWallMat : hutWallLightMat);
    lower.position.set(l.x, 0.3 + (h * 0.58) / 2, l.z);
    lower.rotation.y = -l.angle + Math.PI / 2;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.46, h * 0.46, 0.54), i % 2 ? hutWallLightMat : hutWallMat);
    upper.position.set(l.x * 0.985, 0.3 + h * 0.58 + (h * 0.46) / 2 - 0.04, l.z * 0.985);
    upper.rotation.y = -l.angle + Math.PI / 2 + (i % 3 === 0 ? 0.07 : -0.05);
    g.add(lower, upper);
  }

  // Pintu: dua tiang besi + ambang amber + cahaya hangat dari dalam (pintu di -Z lokal)
  const door = wallSlotLocal(SHELTER_DOOR_SLOT);
  for (const side of [-0.78, 0.78]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.3, 0.5), shelterFrameMat);
    post.position.set(door.x + side, 1.45, door.z);
    g.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.62), hutRimMat);
  lintel.position.set(door.x, 2.42, door.z);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.0), hutDoorGlowMat);
  glow.position.set(door.x, 1.35, door.z + 0.12);
  glow.rotation.y = Math.PI; // sisi depan menghadap -Z (keluar)
  glow.userData.ghostHide = true;
  g.add(lintel, glow);

  // Atap: tiga cincin kerucut terpancung bertumpuk (limpasan hujan asam) + tepi berkarat + puncak kristal
  const tiers: Array<[number, number, number, number]> = [
    // [radiusAtas, radiusBawah, tinggi, y]
    [2.45, 2.75, 0.42, 2.72],
    [1.85, 2.35, 0.46, 3.14],
    [1.0, 1.7, 0.5, 3.58],
  ];
  for (const [rt, rb, h, y] of tiers) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), hutRoofMat);
    tier.position.y = y;
    g.add(tier);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.08, 6, 24), hutRimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.52;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.55, 12), hutRoofMat);
  cap.position.y = 4.1;
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), crystalMat);
  beacon.position.y = 4.55;
  g.add(rim, cap, beacon);
}

function makeShadowDisc(tex: THREE.Texture, radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 14),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  return m;
}
