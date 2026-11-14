import * as THREE from 'three';
import { WORLD_HALF_EXTENT, type WeatherType } from '../config';
import type { TerrainSystem } from './terrain';
import { distance2D } from '../utils/math';
import { eventBus } from '../core/eventBus';

interface ActiveMeteor {
  mesh: THREE.Group;
  ring: THREE.Mesh;
  targetX: number;
  targetY: number;
  targetZ: number;
  countdown: number;
  totalTime: number;
}

export class MeteorSystem {
  readonly group = new THREE.Group();
  private meteors: ActiveMeteor[] = [];
  private spawnTimer = 9;
  private rockGeo = new THREE.DodecahedronGeometry(0.95, 0);
  private rockMat = new THREE.MeshStandardMaterial({
    color: '#292524',
    emissive: '#ea580c',
    emissiveIntensity: 1.6,
    roughness: 0.6,
  });
  private ringGeo = new THREE.RingGeometry(2.6, 3.3, 28);
  private ringMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });

  constructor(scene: THREE.Scene) {
    this.ringGeo.rotateX(-Math.PI / 2);
    scene.add(this.group);
  }

  isPlayerInDangerZone(px: number, pz: number): boolean {
    return this.meteors.some((m) => distance2D(px, pz, m.targetX, m.targetZ) < 4.2);
  }

  private spawnMeteor(terrain: TerrainSystem, playerPos: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 34;
    const bound = WORLD_HALF_EXTENT - 24;
    const tx = THREE.MathUtils.clamp(playerPos.x + Math.cos(angle) * dist, -bound, bound);
    const tz = THREE.MathUtils.clamp(playerPos.z + Math.sin(angle) * dist, -bound, bound);
    const ty = terrain.groundHeightAt(tx, tz);

    const meteorGroup = new THREE.Group();
    const core = new THREE.Mesh(this.rockGeo, this.rockMat);
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 4.5, 8),
      new THREE.MeshBasicMaterial({ color: '#fb923c', transparent: true, opacity: 0.65 })
    );
    tail.position.y = 2.4;
    meteorGroup.add(core, tail);
    meteorGroup.position.set(tx + 18, ty + 48, tz - 14);

    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.set(tx, ty + 0.08, tz);

    this.group.add(meteorGroup);
    this.group.add(ring);

    this.meteors.push({
      mesh: meteorGroup,
      ring,
      targetX: tx,
      targetY: ty,
      targetZ: tz,
      countdown: 1.6,
      totalTime: 1.6,
    });
  }

  update(
    dt: number,
    weather: WeatherType,
    terrain: TerrainSystem,
    playerPos: THREE.Vector3,
    onImpact: (x: number, y: number, z: number, playerDist: number) => void,
    swarmMultiplier = 1
  ): void {
    const baseRate = weather === 'meteor_shower' ? 2.4 : 11.0;
    const rate = baseRate / swarmMultiplier;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = rate + Math.random() * 2.2;
      this.spawnMeteor(terrain, playerPos);
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.countdown -= dt;
      const progress = THREE.MathUtils.clamp(1 - m.countdown / m.totalTime, 0, 1);

      m.mesh.position.set(
        THREE.MathUtils.lerp(m.targetX + 18, m.targetX, progress),
        THREE.MathUtils.lerp(m.targetY + 48, m.targetY + 0.6, progress),
        THREE.MathUtils.lerp(m.targetZ - 14, m.targetZ, progress)
      );
      m.mesh.rotation.x += dt * 4;
      m.mesh.rotation.z += dt * 3;
      m.ring.scale.setScalar(0.6 + progress * 0.65);

      if (m.countdown <= 0) {
        const pDist = distance2D(playerPos.x, playerPos.z, m.targetX, m.targetZ);
        onImpact(m.targetX, m.targetY, m.targetZ, pDist);
        eventBus.emit('world:meteorImpact', { x: m.targetX, z: m.targetZ, playerDist: pDist });
        this.group.remove(m.mesh);
        this.group.remove(m.ring);
        this.meteors.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.rockGeo.dispose();
    this.rockMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
