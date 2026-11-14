import * as THREE from 'three';

export interface WorldInteractable {
  id: string;
  kind: 'rock' | 'mineral' | 'crystal' | 'water' | 'lava_edge' | 'shelter' | 'gas_vent';
  actionKey: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  depleted: boolean;
  mesh: THREE.Group;
}

const basaltMat = new THREE.MeshStandardMaterial({ color: '#3b3532', roughness: 0.9, metalness: 0.08 });
const darkBasaltMat = new THREE.MeshStandardMaterial({ color: '#24201e', roughness: 0.85, metalness: 0.12 });
const sulfurMat = new THREE.MeshStandardMaterial({
  color: '#eab308',
  emissive: '#854d0e',
  emissiveIntensity: 0.45,
  roughness: 0.35,
  metalness: 0.65,
});
const crystalMat = new THREE.MeshStandardMaterial({
  color: '#fb923c',
  emissive: '#ea580c',
  emissiveIntensity: 1.15,
  roughness: 0.14,
  metalness: 0.2,
});
const shelterFrameMat = new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.75, metalness: 0.25 });
const shelterShieldMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.32, metalness: 0.65 });

export function createBasaltRockNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), basaltMat);
  main.scale.set(1.2, 0.78, 1.0);
  main.position.y = 0.52;
  const sideA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), darkBasaltMat);
  sideA.position.set(0.65, 0.3, 0.25);
  const sideB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), basaltMat);
  sideB.position.set(-0.55, 0.25, -0.3);
  const shadow = makeShadowDisc(shadowTex, 1.3);
  g.add(shadow, main, sideA, sideB);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== shadow) c.castShadow = true; });
  return g;
}

export function createMineralVeinNode(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const host = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), darkBasaltMat);
  host.scale.set(1.1, 0.85, 1.0);
  host.position.y = 0.55;
  const ore1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), sulfurMat);
  ore1.position.set(0.38, 0.85, 0.2);
  ore1.rotation.set(0.4, 0.2, 0.6);
  const ore2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), sulfurMat);
  ore2.position.set(-0.42, 0.72, -0.15);
  const ore3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), sulfurMat);
  ore3.position.set(0.1, 0.98, -0.35);
  const shadow = makeShadowDisc(shadowTex, 1.45);
  g.add(shadow, host, ore1, ore2, ore3);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== shadow) c.castShadow = true; });
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
  const spire3 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 5), crystalMat);
  spire3.position.set(-0.32, 0.72, -0.2);
  spire3.rotation.z = 0.35;
  spire3.rotation.x = 0.2;
  const shadow = makeShadowDisc(shadowTex, 1.35);
  g.add(shadow, base, spire1, spire2, spire3);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== shadow) c.castShadow = true; });
  return g;
}

export function createShelterModel(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.55, 0.3, 8), darkBasaltMat);
  plinth.position.y = 0.15;

  // 4 angled basalt ribs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.5, 0.32), shelterFrameMat);
    rib.position.set(Math.cos(a) * 1.45, 1.25, Math.sin(a) * 1.45);
    rib.rotation.y = -a;
    rib.rotation.z = 0.22;
    g.add(rib);
  }

  // Heat-shielded geodesic roof canopy
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.3, 8), shelterShieldMat);
  roof.position.y = 2.55;
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), crystalMat);
  beacon.position.y = 3.35;

  const shadow = makeShadowDisc(shadowTex, 3.0);
  g.add(shadow, plinth, roof, beacon);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== shadow) c.castShadow = true; });
  return g;
}

export function createCampfireModel(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), basaltMat);
    stone.position.set(Math.cos(a) * 0.65, 0.16, Math.sin(a) * 0.65);
    g.add(stone);
  }
  const ember = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 6), crystalMat);
  ember.position.y = 0.42;
  const light = new THREE.PointLight('#ff6b2b', 10, 14, 1.8);
  light.position.y = 1.1;
  const shadow = makeShadowDisc(shadowTex, 1.1);
  g.add(shadow, ember, light);
  return g;
}

export function createFumaroleVentModel(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 0.9, 7), darkBasaltMat);
  cone.position.y = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.12, 6, 12), sulfurMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.88;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 10), crystalMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.86;
  g.add(cone, rim, glow);
  return g;
}

function makeShadowDisc(tex: THREE.Texture, radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  return m;
}
