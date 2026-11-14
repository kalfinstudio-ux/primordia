import * as THREE from 'three';
import type { CharacterRig } from './character';
import type { GlbExplorerHandle } from './glbCharacter';
import { damp } from '../utils/math';

export class CharacterAnimator {
  private walkPhase = 0;
  private interactTimer = 0;
  private squashY = 1;
  private squashXZ = 1;

  triggerInteract(): void {
    this.interactTimer = 0.35;
  }

  triggerJump(): void {
    this.squashY = 1.18;
    this.squashXZ = 0.88;
  }

  triggerLand(): void {
    this.squashY = 0.82;
    this.squashXZ = 1.14;
  }

  update(
    rig: CharacterRig,
    speed: number,
    grounded: boolean,
    swimming: boolean,
    baseHeight: number,
    buildScale: number,
    dt: number,
    elapsed: number,
    showBreathVapor = false,
    lookAtOffsetYaw = 0,
    glbHandle?: GlbExplorerHandle | null
  ): void {
    if (glbHandle) {
      const nextState = this.interactTimer > 0
        ? 'mine'
        : swimming
          ? 'swim'
          : !grounded
            ? 'jump'
            : speed > 6.8
              ? 'run'
              : speed > 0.35
                ? 'walk'
                : 'idle';
      glbHandle.setState(nextState);
      glbHandle.update(dt);
    }

    this.squashY = damp(this.squashY, 1, 14, dt);
    this.squashXZ = damp(this.squashXZ, 1, 14, dt);
    rig.bodyPivot.scale.set(
      baseHeight * buildScale * this.squashXZ,
      baseHeight * this.squashY,
      baseHeight * buildScale * this.squashXZ
    );

    if (swimming) {
      this.walkPhase += Math.max(2.5, speed * 1.4) * dt;
      rig.torsoGroup.rotation.x = damp(rig.torsoGroup.rotation.x, 0.65, 8, dt);
      rig.leftArm.rotation.x = Math.sin(this.walkPhase) * 0.9 - 0.8;
      rig.rightArm.rotation.x = -Math.sin(this.walkPhase) * 0.9 - 0.8;
      rig.leftLeg.rotation.x = Math.sin(this.walkPhase * 1.4) * 0.45;
      rig.rightLeg.rotation.x = -Math.sin(this.walkPhase * 1.4) * 0.45;
      rig.bodyPivot.position.y = Math.sin(elapsed * 3.2) * 0.06;
    } else if (grounded && speed > 0.2) {
      this.walkPhase += speed * dt * 1.9;
      const swing = Math.sin(this.walkPhase) * Math.min(0.72, speed * 0.11);
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.78;
      if (this.interactTimer <= 0) {
        rig.rightArm.rotation.x = swing * 0.78;
      }
      // Forward sprint lean
      const targetLean = speed > 6.6 ? 0.18 : 0.05;
      rig.torsoGroup.rotation.x = damp(rig.torsoGroup.rotation.x, targetLean, 10, dt);
      rig.bodyPivot.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.055;
    } else {
      rig.torsoGroup.rotation.x = damp(rig.torsoGroup.rotation.x, grounded ? 0 : 0.1, 10, dt);
      rig.leftLeg.rotation.x = damp(rig.leftLeg.rotation.x, grounded ? 0 : 0.3, 12, dt);
      rig.rightLeg.rotation.x = damp(rig.rightLeg.rotation.x, grounded ? 0 : -0.25, 12, dt);
      rig.leftArm.rotation.x = damp(rig.leftArm.rotation.x, grounded ? 0 : -0.45, 10, dt);
      if (this.interactTimer <= 0) {
        rig.rightArm.rotation.x = damp(rig.rightArm.rotation.x, grounded ? 0 : -0.45, 10, dt);
      }
      rig.bodyPivot.position.y = Math.sin(elapsed * 2.2) * 0.015;
    }

    // Subtle head look-at toward nearby interactable
    rig.headGroup.rotation.y = damp(rig.headGroup.rotation.y, THREE.MathUtils.clamp(lookAtOffsetYaw, -0.55, 0.55), 8, dt);

    if (this.interactTimer > 0) {
      this.interactTimer -= dt;
      const p = Math.sin((this.interactTimer / 0.35) * Math.PI);
      rig.rightArm.rotation.x = -p * 1.45;
    }

    // Breath vapor puff pulse in toxic/cold air
    const puffMat = rig.breathPuff.material as THREE.MeshBasicMaterial;
    if (showBreathVapor) {
      const cycle = (elapsed * 0.8) % 1;
      puffMat.opacity = Math.sin(cycle * Math.PI) * 0.35;
      rig.breathPuff.position.z = 0.24 + cycle * 0.25;
      rig.breathPuff.position.y = 0.16 + cycle * 0.12;
      rig.breathPuff.scale.setScalar(0.7 + cycle * 0.9);
    } else {
      puffMat.opacity = 0;
    }
  }
}
