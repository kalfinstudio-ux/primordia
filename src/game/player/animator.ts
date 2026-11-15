import * as THREE from 'three';
import type { CharacterRig } from './character';
import type { GlbExplorerHandle } from './glbCharacter';
import { damp } from '../utils/math';
import { ACTION_DURATION, HumanPoser, type ActionKind } from './pose';

export { actionKindFor, type ActionKind } from './pose';

/** Lama jongkok saat mendarat (detik). */
const LAND_TIME = 0.3;

export class CharacterAnimator {
  private readonly poser = new HumanPoser();
  private actionKind: ActionKind = 'use';
  private actionTimer = 0;
  private landTimer = 0;
  private squashY = 1;
  private squashXZ = 1;

  /** Mulai gerakan aksi (menambang, memungut, minum, membuka, membangun). */
  triggerInteract(kind: ActionKind = 'use'): void {
    this.actionKind = kind;
    this.actionTimer = ACTION_DURATION[kind];
  }

  triggerJump(): void {
    this.squashY = 1.18;
    this.squashXZ = 0.88;
  }

  triggerLand(): void {
    this.squashY = 0.9;
    this.squashXZ = 1.07;
    this.landTimer = LAND_TIME;
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
    glbHandle?: GlbExplorerHandle | null,
    verticalSpeed = 0
  ): void {
    const acting = this.actionTimer > 0;
    if (glbHandle) {
      const nextState = acting
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

    // Rig kode disembunyikan bila model GLB aktif: tidak perlu diposisikan.
    if (!glbHandle) {
      if (acting) this.actionTimer = Math.max(0, this.actionTimer - dt);
      this.landTimer = Math.max(0, this.landTimer - dt);
      const t = acting ? 1 - this.actionTimer / ACTION_DURATION[this.actionKind] : 0;
      this.poser.update(
        rig,
        {
          speed,
          grounded,
          swimming,
          verticalSpeed,
          lookYaw: lookAtOffsetYaw,
          heightScale: baseHeight,
          action: acting ? { kind: this.actionKind, t } : null,
          landWeight: this.landTimer / LAND_TIME,
        },
        dt,
        elapsed
      );
    } else if (acting) {
      this.actionTimer = Math.max(0, this.actionTimer - dt);
    }

    // Uap napas di udara beracun/dingin
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
