import * as THREE from 'three';
import { VOLCANO_MAIN } from './biomes';
import type { TerrainSystem } from './terrain';
import { eventBus } from '../core/eventBus';

const PLUME_COUNT = 48;
const _dummy = new THREE.Object3D();

export class VolcanoSystem {
  readonly group = new THREE.Group();
  private plumeMesh: THREE.InstancedMesh;
  private particles: Array<{ x: number; y: number; z: number; vy: number; vx: number; vz: number; age: number; life: number }> = [];
  private eruptionTimer = 18;
  private fissureRing: THREE.Mesh;
  private fissureAge = 0;

  constructor(scene: THREE.Scene, terrain: TerrainSystem) {
    const spireMat = new THREE.MeshStandardMaterial({ color: '#29211e', roughness: 0.9, metalness: 0.1 });
    const sulfurMat = new THREE.MeshStandardMaterial({ color: '#ca8a04', emissive: '#78350f', emissiveIntensity: 0.35, roughness: 0.55, metalness: 0.25 });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const r = 7.4;
      const sx = VOLCANO_MAIN.x + Math.cos(angle) * r;
      const sz = VOLCANO_MAIN.z + Math.sin(angle) * r;
      const sy = terrain.groundHeightAt(sx, sz);

      const ridge = new THREE.Group();
      const base = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.4, 6), spireMat);
      base.position.y = 2.0;
      const flank = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), spireMat);
      flank.position.set(0.8, 0.8, 0.4);
      const sulfurCrust = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), sulfurMat);
      sulfurCrust.position.set(-0.7, 0.5, -0.3);
      ridge.add(base, flank, sulfurCrust);
      ridge.position.set(sx, sy - 0.3, sz);
      ridge.rotation.y = angle;
      this.group.add(ridge);
    }

    const plumeGeo = new THREE.DodecahedronGeometry(0.8, 0);
    const plumeMat = new THREE.MeshStandardMaterial({
      color: '#443733',
      emissive: '#9a3412',
      emissiveIntensity: 0.45,
      roughness: 0.95,
      transparent: true,
      opacity: 0.78,
    });
    this.plumeMesh = new THREE.InstancedMesh(plumeGeo, plumeMat, PLUME_COUNT);
    this.plumeMesh.frustumCulled = false;

    for (let i = 0; i < PLUME_COUNT; i++) {
      this.particles.push({
        x: VOLCANO_MAIN.x,
        y: 14 + (i / PLUME_COUNT) * 26,
        z: VOLCANO_MAIN.z,
        vx: (Math.sin(i * 3.1) - 0.5) * 1.4,
        vy: 3.5 + (i % 5) * 0.7,
        vz: (Math.cos(i * 2.7) - 0.5) * 1.4,
        age: (i / PLUME_COUNT) * 6,
        life: 6,
      });
    }
    this.group.add(this.plumeMesh);

    const crackGeo = new THREE.RingGeometry(1.5, 2.2, 18);
    crackGeo.rotateX(-Math.PI / 2);
    this.fissureRing = new THREE.Mesh(
      crackGeo,
      new THREE.MeshBasicMaterial({ color: '#ea580c', side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    this.fissureRing.visible = false;
    this.group.add(this.fissureRing);

    scene.add(this.group);
  }

  update(
    dt: number,
    showParticles: boolean,
    playerPos?: THREE.Vector3,
    terrain?: TerrainSystem,
    activityMult = 1,
    wind?: { x: number; z: number }
  ): void {
    this.plumeMesh.visible = showParticles;
    if (showParticles) {
      const wx = wind ? wind.x * 0.65 : 0;
      const wz = wind ? wind.z * 0.65 : 0;
      for (let i = 0; i < PLUME_COUNT; i++) {
        const p = this.particles[i];
        p.age += dt * Math.max(0.6, Math.min(1.6, activityMult));
        if (p.age >= p.life) {
          p.age = 0;
          const a = (i * 1.7 + performance.now() * 0.001) % (Math.PI * 2);
          p.x = VOLCANO_MAIN.x + Math.cos(a) * 2.6;
          p.y = 13.5;
          p.z = VOLCANO_MAIN.z + Math.sin(a) * 2.6;
        } else {
          p.x += (p.vx + wx) * dt;
          p.y += p.vy * dt;
          p.z += (p.vz + wz) * dt;
        }
        const t = p.age / p.life;
        const scale = 0.9 + t * 3.2;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.scale.setScalar(scale);
        _dummy.rotation.set(t * 2, t * 1.5, 0);
        _dummy.updateMatrix();
        this.plumeMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.plumeMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.fissureRing.visible) {
      this.fissureAge += dt;
      this.fissureRing.scale.setScalar(1 + this.fissureAge * 2.4);
      (this.fissureRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - this.fissureAge * 0.25);
      if (this.fissureAge >= 3.0) {
        this.fissureRing.visible = false;
      }
    }

    this.eruptionTimer -= dt * Math.max(0.5, activityMult);
    if (this.eruptionTimer <= 0) {
      this.eruptionTimer = 28 + Math.random() * 18;
      eventBus.emit('world:quake', { intensity: 0.42 });
      if (playerPos && terrain) {
        const fx = playerPos.x + (Math.random() - 0.5) * 14;
        const fz = playerPos.z + (Math.random() - 0.5) * 14;
        const fy = terrain.groundHeightAt(fx, fz);
        this.fissureRing.position.set(fx, fy + 0.09, fz);
        this.fissureRing.scale.setScalar(1);
        this.fissureAge = 0;
        this.fissureRing.visible = true;
      }
    }
  }

  dispose(): void {
    this.plumeMesh.geometry.dispose();
    (this.plumeMesh.material as THREE.Material).dispose();
    this.fissureRing.geometry.dispose();
    (this.fissureRing.material as THREE.Material).dispose();
  }
}
