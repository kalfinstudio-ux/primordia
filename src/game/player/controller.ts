import * as THREE from 'three';
import { WATER_LEVEL, WORLD_HALF_EXTENT } from '../config';
import { input } from '../core/input';
import { gameState } from '../core/state';
import { resolveCapsuleObstacles, type SpatialHashGrid } from '../core/spatialHash';
import type { TerrainSystem } from '../world/terrain';
import { getDistanceToLava } from '../world/biomes';
import type { CharacterRig } from './character';
import type { CharacterAnimator } from './animator';
import type { GlbExplorerHandle } from './glbCharacter';
import { clamp } from '../utils/math';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _interp = new THREE.Vector3();

export interface FixedStepResult {
  horizontalSpeed: number;
  distanceMoved: number;
  inLava: boolean;
  inWater: boolean;
  swimming: boolean;
}

export interface LandEvent {
  impactSpeed: number;
  inWater: boolean;
  immersed: boolean;
}

export class PlayerController {
  readonly position = new THREE.Vector3(0, 1, 18);
  readonly prevPosition = new THREE.Vector3(0, 1, 18);
  readonly velocity = new THREE.Vector3();
  yaw = Math.PI;
  grounded = true;
  swimming = false;
  inWater = false;
  inLava = false;
  lastHorizontalSpeed = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasGrounded = true;
  private onJumpCb?: () => void;
  private onLandCb?: (event: LandEvent) => void;
  private onFootstepCb?: () => void;
  private stepAccum = 0;

  constructor(callbacks?: { onJump?: () => void; onLand?: (event: LandEvent) => void; onFootstep?: () => void }) {
    this.onJumpCb = callbacks?.onJump;
    this.onLandCb = callbacks?.onLand;
    this.onFootstepCb = callbacks?.onFootstep;
  }

  resetTo(x: number, z: number, yaw: number, terrain: TerrainSystem): void {
    const y = Math.max(terrain.groundHeightAt(x, z), WATER_LEVEL - 0.6);
    this.position.set(x, y, z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.wasGrounded = true;
    this.swimming = false;
    this.inWater = false;
  }

  fixedStep(
    fixedDt: number,
    cameraYaw: number,
    terrain: TerrainSystem,
    spatialHash: SpatialHashGrid,
    weightRatio = 1.0,
    waterLevel = WATER_LEVEL
  ): FixedStepResult {
    this.prevPosition.copy(this.position);
    const keys = gameState.settings.controls.keys;
    const axes = input.getMoveAxes();
    const wantsSprint = input.isHeld(keys.sprint) && gameState.vitals.stamina > 6;

    if (input.consumeJustPressed(keys.jump)) {
      this.jumpBufferTimer = 0.12;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - fixedDt);
    }

    if (this.grounded || this.swimming) {
      this.coyoteTimer = 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - fixedDt);
    }

    _forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    _right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    _move.set(0, 0, 0).addScaledVector(_forward, -axes.z).addScaledVector(_right, axes.x);

    const hasInput = _move.lengthSq() > 0.001;
    if (hasInput) _move.normalize();

    const currentGroundY = terrain.groundHeightAt(this.position.x, this.position.z);
    const waterDepth = waterLevel - currentGroundY;
    const wading = waterDepth > 0.15 && waterDepth <= 1.15;
    this.swimming = waterDepth > 1.15;
    this.inWater = waterDepth > 0.15;

    const encumberMult = weightRatio > 1 ? Math.max(0.55, 1.35 - weightRatio * 0.35) : 1;
    const baseSpeed = (wantsSprint && hasInput ? 9.4 : 5.6) * encumberMult;
    const moveSpeed = this.swimming ? baseSpeed * 0.56 : wading ? baseSpeed * 0.74 : baseSpeed;

    const targetVx = _move.x * moveSpeed;
    const targetVz = _move.z * moveSpeed;
    const accel = this.grounded || this.swimming ? 14 : 6;
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, 1 - Math.exp(-accel * fixedDt));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, 1 - Math.exp(-accel * fixedDt));

    if ((wantsSprint || this.swimming) && hasInput) {
      gameState.vitals.stamina = Math.max(0, gameState.vitals.stamina - (this.swimming ? 12 : 18) * fixedDt);
    } else {
      gameState.vitals.stamina = Math.min(100, gameState.vitals.stamina + 14 * fixedDt);
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = this.swimming ? 5.2 : 8.4;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.onJumpCb?.();
    }

    this.velocity.y -= (this.swimming ? 7.5 : 21.5) * fixedDt;

    const prevX = this.position.x;
    const prevZ = this.position.z;

    let nextX = this.position.x + this.velocity.x * fixedDt;
    const nextY = this.position.y + this.velocity.y * fixedDt;
    let nextZ = this.position.z + this.velocity.z * fixedDt;

    // Slope blocking (>46°) & downhill slide (>52°) when walking uphill
    const candidateGroundY = terrain.groundHeightAt(nextX, nextZ);
    const stepDeltaY = candidateGroundY - currentGroundY;
    const slopeDeg = terrain.slopeDegreesAt(nextX, nextZ);

    if (this.grounded && stepDeltaY > 0.45 && slopeDeg > 46) {
      // Too steep to climb directly—deflect back along horizontal
      nextX = prevX;
      nextZ = prevZ;
    } else if (this.grounded && slopeDeg > 52) {
      // Slide slightly downhill
      const eps = 0.6;
      const gx = terrain.groundHeightAt(nextX + eps, nextZ) - terrain.groundHeightAt(nextX - eps, nextZ);
      const gz = terrain.groundHeightAt(nextX, nextZ + eps) - terrain.groundHeightAt(nextX, nextZ - eps);
      nextX -= gx * 3.2 * fixedDt;
      nextZ -= gz * 3.2 * fixedDt;
    }

    // Spatial hash obstacle collision resolution (smooth sliding around rocks, spires, shelters)
    const nearby = spatialHash.queryRadius(nextX, nextZ, 3.2);
    const slid = resolveCapsuleObstacles(nextX, nextY, nextZ, 0.45, 1.75, nearby);
    nextX = clamp(slid.x, -WORLD_HALF_EXTENT + 12, WORLD_HALF_EXTENT - 12);
    nextZ = clamp(slid.z, -WORLD_HALF_EXTENT + 12, WORLD_HALF_EXTENT - 12);

    this.position.set(nextX, nextY, nextZ);

    const newGroundY = terrain.groundHeightAt(this.position.x, this.position.z);
    const landingWaterDepth = waterLevel - newGroundY;
    const landedInWater = landingWaterDepth > 0.15;
    const landedImmersed = landingWaterDepth > 1.15;
    const swimSurfaceY = waterLevel - 0.85;
    const floorY = this.swimming ? Math.max(newGroundY, swimSurfaceY) : newGroundY;

    if (this.position.y <= floorY + 0.04 && this.velocity.y <= 0) {
      const impactSpeed = -this.velocity.y;
      if (!this.wasGrounded && impactSpeed > 4.2) {
        this.onLandCb?.({
          impactSpeed,
          inWater: landedInWater,
          immersed: landedImmersed,
        });
      }
      this.position.y = floorY;
      this.velocity.y = 0;
      this.grounded = !this.swimming;
    } else {
      this.grounded = false;
    }
    this.wasGrounded = this.grounded;
    this.inWater = landedInWater;

    const lavaDist = getDistanceToLava(this.position.x, this.position.z);
    this.inLava = lavaDist < 2.2 && this.position.y < 1.2;

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.lastHorizontalSpeed = horizSpeed;
    if (hasInput && horizSpeed > 0.35) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, 12 * fixedDt);
    }

    const distMoved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
    if ((this.grounded || wading) && distMoved > 0.01) {
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

    return {
      horizontalSpeed: horizSpeed,
      distanceMoved: distMoved,
      inLava: this.inLava,
      inWater: this.inWater,
      swimming: this.swimming,
    };
  }

  renderUpdate(
    alpha: number,
    dt: number,
    elapsed: number,
    rig: CharacterRig,
    animator: CharacterAnimator,
    showBreathVapor: boolean,
    lookAtOffsetYaw: number,
    glbHandle?: GlbExplorerHandle | null
  ): THREE.Vector3 {
    _interp.lerpVectors(this.prevPosition, this.position, clamp(alpha, 0, 1));
    rig.root.position.copy(_interp);
    rig.root.rotation.y = this.yaw;

    const buildScale =
      gameState.avatar.build === 'slim' ? 0.9 : gameState.avatar.build === 'athletic' ? 1.12 : 1.0;

    animator.update(
      rig,
      this.lastHorizontalSpeed,
      this.grounded,
      this.swimming,
      gameState.avatar.height,
      buildScale,
      dt,
      elapsed,
      showBreathVapor,
      lookAtOffsetYaw,
      glbHandle,
      this.velocity.y
    );

    return _interp;
  }
}
