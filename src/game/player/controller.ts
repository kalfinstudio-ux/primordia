import * as THREE from 'three';
import { WATER_LEVEL, WORLD_RADIUS } from '../config';
import { input } from '../core/input';
import { gameState } from '../core/state';
import type { TerrainSystem } from '../world/terrain';
import { getDistanceToLava } from '../world/biomes';
import type { CharacterRig } from './character';
import type { CharacterAnimator } from './animator';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class PlayerController {
  readonly position = new THREE.Vector3(0, 1, 18);
  readonly velocity = new THREE.Vector3();
  yaw = Math.PI; // Facing Mount Hadean volcano landmark on spawn
  grounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasGrounded = true;
  private onJumpCb?: () => void;
  private onLandCb?: () => void;
  private onFootstepCb?: () => void;
  private stepAccum = 0;

  constructor(callbacks?: { onJump?: () => void; onLand?: () => void; onFootstep?: () => void }) {
    this.onJumpCb = callbacks?.onJump;
    this.onLandCb = callbacks?.onLand;
    this.onFootstepCb = callbacks?.onFootstep;
  }

  resetTo(x: number, z: number, yaw: number, terrain: TerrainSystem): void {
    const y = terrain.groundHeightAt(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.wasGrounded = true;
  }

  update(
    dt: number,
    cameraYaw: number,
    terrain: TerrainSystem,
    rig: CharacterRig,
    animator: CharacterAnimator,
    elapsed: number
  ): { horizontalSpeed: number; distanceMoved: number; inLava: boolean } {
    const keys = gameState.settings.controls.keys;
    const axes = input.getMoveAxes();
    const wantsSprint = input.isHeld(keys.sprint) && gameState.vitals.stamina > 6;

    if (input.consumeJustPressed(keys.jump)) {
      this.jumpBufferTimer = 0.12;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.grounded) {
      this.coyoteTimer = 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // Camera-relative horizontal movement
    _forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    _right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    _move.set(0, 0, 0).addScaledVector(_forward, -axes.z).addScaledVector(_right, axes.x);

    const hasInput = _move.lengthSq() > 0.001;
    if (hasInput) _move.normalize();

    const groundY = terrain.groundHeightAt(this.position.x, this.position.z);
    const inShallowWater = groundY < WATER_LEVEL - 0.1;
    const baseSpeed = wantsSprint && hasInput ? 9.4 : 5.6;
    const moveSpeed = inShallowWater ? baseSpeed * 0.72 : baseSpeed;

    const targetVx = _move.x * moveSpeed;
    const targetVz = _move.z * moveSpeed;
    const accel = this.grounded ? 14 : 6;
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, 1 - Math.exp(-accel * dt));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, 1 - Math.exp(-accel * dt));

    // Sprint stamina drain / recovery
    if (wantsSprint && hasInput) {
      gameState.vitals.stamina = Math.max(0, gameState.vitals.stamina - 18 * dt);
    } else {
      gameState.vitals.stamina = Math.min(100, gameState.vitals.stamina + 14 * dt);
    }

    // Jump execution with coyote time & buffering
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = 8.4;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      animator.triggerJump();
      this.onJumpCb?.();
    }

    // Gravity
    this.velocity.y -= 21.5 * dt;

    const prevX = this.position.x;
    const prevZ = this.position.z;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Natural caldera perimeter clamp
    const radial = Math.hypot(this.position.x, this.position.z);
    if (radial > WORLD_RADIUS - 4) {
      const s = (WORLD_RADIUS - 4) / radial;
      this.position.x *= s;
      this.position.z *= s;
    }

    // Ground snap & slope check
    const newGroundY = terrain.groundHeightAt(this.position.x, this.position.z);
    const floorY = Math.max(newGroundY, WATER_LEVEL - 0.55);

    if (this.position.y <= floorY + 0.02 && this.velocity.y <= 0) {
      if (!this.wasGrounded && this.velocity.y < -4) {
        animator.triggerLand();
      }
      this.position.y = floorY;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.wasGrounded = this.grounded;

    // Lava channel hazard check
    const lavaDist = getDistanceToLava(this.position.x, this.position.z);
    const inLava = lavaDist < 2.2 && this.position.y < 1.2;

    // Smooth character facing toward movement direction
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hasInput && horizSpeed > 0.35) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, 12 * dt);
    }

    rig.root.position.copy(this.position);
    rig.root.rotation.y = this.yaw;

    animator.update(rig, horizSpeed, this.grounded, gameState.avatar.height, dt, elapsed);

    const distMoved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
    if (this.grounded && distMoved > 0.01) {
      this.stepAccum += distMoved;
      if (this.stepAccum >= 2.1) {
        this.stepAccum = 0;
        this.onFootstepCb?.();
      }
    }

    gameState.playerPos = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
    };

    return { horizontalSpeed: horizSpeed, distanceMoved: distMoved, inLava };
  }
}
