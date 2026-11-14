import * as THREE from 'three';
import { input } from '../core/input';
import type { SpatialHashGrid } from '../core/spatialHash';
import type { TerrainSystem } from '../world/terrain';
import { clamp, damp } from '../utils/math';

const _desiredPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.2;
  distance = 7.4;
  private activeDistance = 7.4;
  private currentPos = new THREE.Vector3(0, 4, 25);
  private currentLook = new THREE.Vector3(0, 2.2, 12);
  private trauma = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapToPlayer(playerPos: THREE.Vector3, camYaw = 0): void {
    this.yaw = camYaw;
    this.pitch = 0.2;
    this.activeDistance = this.distance;
    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance + 1.65;
    this.currentPos.set(
      playerPos.x + Math.sin(this.yaw) * horizDist,
      playerPos.y + vertDist,
      playerPos.z + Math.cos(this.yaw) * horizDist
    );
    this.currentLook.set(playerPos.x, playerPos.y + 1.9, playerPos.z);
  }

  updateGameplay(
    dt: number,
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    terrain: TerrainSystem,
    spatialHash?: SpatialHashGrid
  ): void {
    const delta = input.consumeLookDelta();
    this.yaw -= delta.dx;
    this.pitch = clamp(this.pitch + delta.dy, 0.05, 1.1);

    _lookTarget.set(playerPos.x, playerPos.y + 1.9, playerPos.z);

    // Camera boom collision sweep against terrain and spatial obstacles
    let safeDist = this.distance;
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const frac = i / steps;
      const testDist = this.distance * frac;
      const hDist = Math.cos(this.pitch) * testDist;
      const vDist = Math.sin(this.pitch) * testDist + 1.65;
      const tx = playerPos.x + Math.sin(this.yaw) * hDist;
      const tz = playerPos.z + Math.cos(this.yaw) * hDist;
      const ty = playerPos.y + vDist;

      const groundY = terrain.groundHeightAt(tx, tz);
      if (ty < groundY + 0.65) {
        safeDist = Math.min(safeDist, Math.max(1.8, testDist - 0.5));
        break;
      }
      if (spatialHash) {
        const hits = spatialHash.queryRadius(tx, tz, 0.45);
        if (hits.some((c) => ty >= c.yMin && ty <= c.yMax + 0.35)) {
          safeDist = Math.min(safeDist, Math.max(1.8, testDist - 0.6));
          break;
        }
      }
    }

    this.activeDistance = damp(this.activeDistance, safeDist, 14, dt);

    const horizDist = Math.cos(this.pitch) * this.activeDistance;
    const vertDist = Math.sin(this.pitch) * this.activeDistance + 1.65;
    const cx = playerPos.x + Math.sin(this.yaw) * horizDist;
    const cz = playerPos.z + Math.cos(this.yaw) * horizDist;
    const cy = playerPos.y + vertDist;

    const groundAtCam = terrain.groundHeightAt(cx, cz);
    _desiredPos.set(cx, Math.max(cy, groundAtCam + 0.85), cz);

    this.currentPos.x = damp(this.currentPos.x, _desiredPos.x, 12, dt);
    this.currentPos.y = damp(this.currentPos.y, _desiredPos.y, 12, dt);
    this.currentPos.z = damp(this.currentPos.z, _desiredPos.z, 12, dt);

    this.currentLook.x = damp(this.currentLook.x, _lookTarget.x, 15, dt);
    this.currentLook.y = damp(this.currentLook.y, _lookTarget.y, 15, dt);
    this.currentLook.z = damp(this.currentLook.z, _lookTarget.z, 15, dt);

    camera.position.copy(this.currentPos);

    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 0.45;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }

    camera.lookAt(this.currentLook);
  }

  updateMenuFlyover(elapsed: number, camera: THREE.PerspectiveCamera): void {
    const t = elapsed * 0.12;
    const camX = -22 + Math.sin(t) * 14;
    const camZ = 18 + Math.cos(t) * 10;
    const camY = 14 + Math.sin(t * 1.5) * 2.5;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(-6, 5, -34);
  }
}
