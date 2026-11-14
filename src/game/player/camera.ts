import * as THREE from 'three';
import { input } from '../core/input';
import type { TerrainSystem } from '../world/terrain';
import { clamp, damp } from '../utils/math';

const _desiredPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class ThirdPersonCamera {
  yaw = 0; // 0 looks North (-Z) toward Mount Hadean landmark
  pitch = 0.2;
  distance = 7.4;
  private currentPos = new THREE.Vector3(0, 4, 25);
  private currentLook = new THREE.Vector3(0, 2.2, 12);
  private trauma = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapToPlayer(playerPos: THREE.Vector3, camYaw = 0): void {
    this.yaw = camYaw;
    this.pitch = 0.2;
    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance + 1.65;
    const cx = playerPos.x + Math.sin(this.yaw) * horizDist;
    const cz = playerPos.z + Math.cos(this.yaw) * horizDist;
    const cy = playerPos.y + vertDist;
    this.currentPos.set(cx, cy, cz);
    this.currentLook.set(playerPos.x, playerPos.y + 1.9, playerPos.z);
  }

  updateGameplay(dt: number, camera: THREE.PerspectiveCamera, playerPos: THREE.Vector3, terrain: TerrainSystem): void {
    const delta = input.consumeLookDelta();
    this.yaw -= delta.dx;
    this.pitch = clamp(this.pitch + delta.dy, 0.05, 1.1);

    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance + 1.65;

    // Camera sits behind player at +sin(yaw), +cos(yaw) looking toward -sin(yaw), -cos(yaw)
    const cx = playerPos.x + Math.sin(this.yaw) * horizDist;
    const cz = playerPos.z + Math.cos(this.yaw) * horizDist;
    const cy = playerPos.y + vertDist;

    const groundAtCam = terrain.groundHeightAt(cx, cz);
    _desiredPos.set(cx, Math.max(cy, groundAtCam + 0.9), cz);
    _lookTarget.set(playerPos.x, playerPos.y + 1.9, playerPos.z);

    this.currentPos.x = damp(this.currentPos.x, _desiredPos.x, 11, dt);
    this.currentPos.y = damp(this.currentPos.y, _desiredPos.y, 11, dt);
    this.currentPos.z = damp(this.currentPos.z, _desiredPos.z, 11, dt);

    this.currentLook.x = damp(this.currentLook.x, _lookTarget.x, 14, dt);
    this.currentLook.y = damp(this.currentLook.y, _lookTarget.y, 14, dt);
    this.currentLook.z = damp(this.currentLook.z, _lookTarget.z, 14, dt);

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
    // Sweeping vista framing Mount Hadean volcano and glowing lava river on the right 2/3 of viewport
    const t = elapsed * 0.12;
    const camX = -22 + Math.sin(t) * 14;
    const camZ = 18 + Math.cos(t) * 10;
    const camY = 14 + Math.sin(t * 1.5) * 2.5;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(-6, 5, -34);
  }
}
