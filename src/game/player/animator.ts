import type { CharacterRig } from './character';
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

  update(rig: CharacterRig, speed: number, grounded: boolean, baseHeight: number, dt: number, elapsed: number): void {
    // Smoothly damp squash & stretch back to base height
    this.squashY = damp(this.squashY, 1, 14, dt);
    this.squashXZ = damp(this.squashXZ, 1, 14, dt);
    rig.bodyPivot.scale.set(baseHeight * this.squashXZ, baseHeight * this.squashY, baseHeight * this.squashXZ);

    // Distance-synced gait cycle (never skates)
    if (grounded && speed > 0.2) {
      this.walkPhase += speed * dt * 1.9;
      const swing = Math.sin(this.walkPhase) * Math.min(0.68, speed * 0.11);
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.75;
      if (this.interactTimer <= 0) {
        rig.rightArm.rotation.x = swing * 0.75;
      }
      rig.bodyPivot.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.055;
    } else {
      rig.leftLeg.rotation.x = damp(rig.leftLeg.rotation.x, grounded ? 0 : 0.3, 12, dt);
      rig.rightLeg.rotation.x = damp(rig.rightLeg.rotation.x, grounded ? 0 : -0.25, 12, dt);
      rig.leftArm.rotation.x = damp(rig.leftArm.rotation.x, grounded ? 0 : -0.45, 10, dt);
      if (this.interactTimer <= 0) {
        rig.rightArm.rotation.x = damp(rig.rightArm.rotation.x, grounded ? 0 : -0.45, 10, dt);
      }
      // Subtle idle breathing
      rig.bodyPivot.position.y = Math.sin(elapsed * 2.2) * 0.015;
    }

    if (this.interactTimer > 0) {
      this.interactTimer -= dt;
      const p = Math.sin((this.interactTimer / 0.35) * Math.PI);
      rig.rightArm.rotation.x = -p * 1.45;
    }
  }
}
