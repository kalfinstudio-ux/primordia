import * as THREE from 'three';
import { createConfiguredGltfLoader } from '../core/gltfLoader';
import { WATER_LEVEL } from '../config';
import { eventBus } from '../core/eventBus';
import { gameState } from '../core/state';
import type { SpatialCollider, SpatialHashGrid } from '../core/spatialHash';
import { assetUrl } from '../data/assets';
import { BALANCE } from '../data/balance';
import {
  brukLevel,
  brukTrust,
  canTalkToBruk,
  recordBrukGift,
  recordBrukViolation,
} from '../data/bruk';
import {
  BRUK_CULL_DIST,
  angleDiff,
  bearingTo,
  brukPose,
  brukSitSpot,
  brukUpdateInterval,
  copyPose,
  crackGlowWithBreath,
  eyeLookYawOffset,
  makeInput,
  makePose,
  makeRoutineState,
  seededEyeBlink,
  smoothLevel,
  smoothPose,
  stepBrukRoutine,
  triggerRoutineInvestigate,
  triggerRoutineShock,
  wrapAngle,
  type BrukMode,
  type BrukPose,
  type BrukRoutineInput,
  type BrukSpot,
} from '../data/brukBehavior';
import {
  BRUK_COLLIDER_RADIUS,
  BRUK_SHELTER_PLAYER_RADIUS,
  BRUK_SIT_RADIUS,
  BRUK_TETHER,
  BRUK_WALK_SPEED,
  FirstFireTracker,
  brukTargetSpot,
  isStormWeather,
  nearestStruct,
  pickBrukHome,
  shelterDoorFacing,
  type BrukHome,
  type ShelterPos,
} from '../data/brukWorld';
import {
  BRUK_PLAYER_RADIUS,
  makeBrukNavState,
  makePushSeparationOut,
  makeSteerStepResult,
  resetBrukNavState,
  resolveBrukPlayerPush,
  steerBrukToward,
  type NavObstacle,
  type NavWaterSampler,
} from '../data/brukNav';
import { hashString } from '../utils/math';
import { CRYSTAL_CRATER, VOLCANO_MAIN, getDistanceToLava, getLavaRiverCenterX } from './biomes';
import { disposeObject3D } from './disposal';
import type { TerrainSystem } from './terrain';

export const BRUK_MODEL_FILE = 'primordia_bruk.glb';
const DEFAULT_SPAWN = { x: 0, z: 18 };
const COLLIDER_ID = 'bruk_body';
const LOGIC_EVERY_SEC = 0.5;
const CROUCH_DROP_M = 0.4;
const SIT_DROP_M = 0.8;
const SIT_LEG_X = -1.12;
const STRIDE_RAD_PER_M = 2.2;
const LEG_SWING = 0.46;

const FIRE_TYPES = ['campfire_kit'] as const;
const SHELTER_TYPES = ['basic_shelter'] as const;
const COVER_TYPES = ['basic_shelter', 'roof_panel'] as const;

export interface BrukFrameCtx {
  playerX: number;
  playerZ: number;
  camera: THREE.PerspectiveCamera;
  weather: string;
  stormWeight?: number;
  isNight?: boolean;
  lowGfx: boolean;
  onPlayerPush?: (nextPlayerX: number, nextPlayerZ: number) => void;
}

export interface BrukStatePayload {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  breath: number;
  glow: number;
  level: number;
  moving: boolean;
  mode: BrukMode;
  stepPhase: number;
}

interface Rig {
  scene: THREE.Object3D;
  bruk: THREE.Object3D;
  hips: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  eye: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  lava: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshStandardMaterial;
  hipsY0: number;
  eyeX0: number;
}

/**
 * Bruk tingkat 2–3: golem basal hidup di rim Kawah Kristal.
 * Memuat `primordia_bruk.glb` bila tersedia; logika rutinitas, navigasi, collider, dan dialog
 * tetap berjalan penuh meskipun model gagal dimuat.
 */
export class BrukBody {
  private rig: Rig | null = null;
  private loading = false;
  private terrain: TerrainSystem | null = null;
  private home: BrukHome | null = null;
  private placed = false;
  private wantVisible = false;
  private worldSeedNum = 101;

  private readonly pos: BrukSpot = { x: 0, z: 0 };
  private groundY = 0;
  private level = 0;
  private levelTarget = 0;
  private logicTimer = 0;
  private acc = 0;
  private movedAcc = 0;
  private movedDtAcc = 0;
  private currentSpeed = 0;
  private slopePitch = 0;
  private walkPhase = 0;
  private legAmp = 0;

  private fire: { x: number; z: number } | null = null;
  private shelter: ShelterPos | null = null;
  private inShelter = false;
  private guardFacing: number | null = null;
  private sitSpot: BrukSpot = { x: 0, z: 0 };
  private fireBearing: number | null = null;
  private fleeTarget: BrukSpot = { x: 0, z: 0 };

  private readonly fireTracker = new FirstFireTracker();
  private readonly routine = makeRoutineState();
  private readonly routineInput: BrukRoutineInput = {
    timeSec: 0,
    seed: 101,
    isNight: false,
    stormWeight: 0,
    playerDist: 999,
    inShelter: false,
    hasFire: false,
    canSitAtFire: false,
    guardFacing: null,
    sinceFirstFire: null,
    lavaDist: 999,
    violationCount: 0,
  };
  private readonly navState = makeBrukNavState();
  private readonly navSteerOut = makeSteerStepResult();
  private readonly pushOut = makePushSeparationOut();
  private readonly navObstacles: NavObstacle[] = [];
  private readonly playerObstacle: NavObstacle = { id: 'player', x: 0, z: 0, radius: BRUK_PLAYER_RADIUS + 0.35 };
  private readonly navSampler: NavWaterSampler = {
    groundHeightAt: (x, z) => (this.terrain ? this.terrain.groundHeightAt(x, z) : 0),
    waterLevel: WATER_LEVEL,
  };
  private colliderBuf: SpatialCollider[] = [];

  private readonly input = makeInput();
  private readonly target: BrukPose = makePose();
  private readonly cur: BrukPose = makePose();
  private readonly spot: BrukSpot = { x: 0, z: 0 };
  private moving = false;

  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private stateEmitAcc = 0;
  private wasVisibleEmitted = false;
  private lastEmittedMode: BrukMode = 'idle';
  private readonly statePayload: BrukStatePayload = {
    visible: false,
    x: 0,
    y: 0,
    z: 0,
    breath: 0.5,
    glow: 0.4,
    level: 0,
    moving: false,
    mode: 'idle',
    stepPhase: 0,
  };

  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly scene: THREE.Scene, private readonly spatial: SpatialHashGrid) {
    this.unsubs.push(
      eventBus.on<{ x?: number; z?: number }>('crystal:mined', (p) => {
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
        const dBruk = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
        const dCrater = Math.hypot(p.x - CRYSTAL_CRATER.x, p.z - CRYSTAL_CRATER.z);
        if (dBruk <= BALANCE.bruk.crystalViolationRadiusM || dCrater <= 32) {
          gameState.brukMemory = recordBrukViolation(gameState.brukMemory, gameState.playtimeSec);
          triggerRoutineShock(this.routine, 6.0, true);
        }
      }),
      eventBus.on<{ type?: string; x?: number; z?: number }>('structure:placed', (p) => {
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
        const dBruk = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
        if (dBruk <= BALANCE.bruk.perceptionRadiusM) {
          gameState.brukMemory = recordBrukGift(gameState.brukMemory);
          triggerRoutineInvestigate(this.routine, p.x, p.z, 8.0);
        }
      }),
      eventBus.on<{ intensity?: number }>('world:quake', (p) => {
        if ((p?.intensity ?? 0) >= 0.45 && this.wantVisible) {
          triggerRoutineShock(this.routine, 4.0, false);
        }
      })
    );
  }

  async load(): Promise<void> {
    if (this.rig || this.loading) return;
    this.loading = true;
    try {
      const gltf = await createConfiguredGltfLoader().loadAsync(assetUrl(BRUK_MODEL_FILE));
      const rig = this.buildRig(gltf.scene);
      if (!rig) {
        disposeObject3D(gltf.scene as unknown as Parameters<typeof disposeObject3D>[0]);
        return;
      }
      rig.scene.visible = false;
      this.scene.add(rig.scene);
      this.rig = rig;
    } catch (err) {
      console.warn('[Bruk] model 3D gagal dimuat; hanya logika & dialog yang aktif.', err);
    } finally {
      this.loading = false;
    }
  }

  private buildRig(root: THREE.Object3D): Rig | null {
    const get = (name: string) => root.getObjectByName(name);
    const bruk = get('Bruk');
    const hips = get('Hips');
    const legL = get('LegL');
    const legR = get('LegR');
    const torso = get('Torso');
    const head = get('Head');
    const eye = get('Eye');
    const armL = get('ArmL');
    const armR = get('ArmR');
    if (!bruk || !hips || !legL || !legR || !torso || !head || !eye || !armL || !armR) {
      console.warn('[Bruk] node model tidak sesuai kontrak (Bruk/Hips/LegL/LegR/Torso/Head/Eye/ArmL/ArmR).');
      return null;
    }
    const found: { lava: THREE.MeshStandardMaterial | null; eye: THREE.MeshStandardMaterial | null } = { lava: null, eye: null };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.name === 'Lava') found.lava = m as THREE.MeshStandardMaterial;
        else if (m.name === 'Eye') found.eye = m as THREE.MeshStandardMaterial;
      }
    });
    if (!found.lava || !found.eye) {
      console.warn('[Bruk] material Lava/Eye tidak ditemukan.');
      return null;
    }
    // Soften sharp low-poly silhouette angles via subtle scale adjustment only (no GLB edits)
    armL.scale.set(1.06, 0.96, 1.06);
    armR.scale.set(1.06, 0.96, 1.06);
    legL.scale.set(1.05, 0.98, 1.05);
    legR.scale.set(1.05, 0.98, 1.05);
    return {
      scene: root,
      bruk,
      hips,
      legL,
      legR,
      torso,
      head,
      eye,
      armL,
      armR,
      lava: found.lava,
      eyeMat: found.eye,
      hipsY0: hips.position.y,
      eyeX0: eye.position.x,
    };
  }

  /** Dipanggil saat dunia dimuat/permainan baru: pilih rumah, reset pelacak api dan navigasi. */
  reset(terrain: TerrainSystem): void {
    this.terrain = terrain;
    this.worldSeedNum = hashString(gameState.worldSeed || 'HADEAN-01') || 101;
    this.home = pickBrukHome(
      CRYSTAL_CRATER,
      DEFAULT_SPAWN,
      { height: (x, z) => terrain.groundHeightAt(x, z), slopeDeg: (x, z) => terrain.slopeDegreesAt(x, z) },
      WATER_LEVEL
    );
    this.pos.x = this.home.x;
    this.pos.z = this.home.z;
    this.groundY = terrain.groundHeightAt(this.pos.x, this.pos.z);
    this.placed = false;
    this.wantVisible = true;
    this.logicTimer = LOGIC_EVERY_SEC;
    this.acc = 0;
    this.movedAcc = 0;
    this.movedDtAcc = 0;
    this.currentSpeed = 0;
    this.slopePitch = 0;
    this.legAmp = 0;
    resetBrukNavState(this.navState, this.pos.x, this.pos.z);
    this.routine.mode = 'idle';
    this.routine.holdSec = 0;
    this.routine.investigateRemainingSec = 0;
    this.routine.shockRemainingSec = 0;
    this.routine.violationRemainingSec = 0;
    this.fireTracker.reset(this.countCampfires());
    this.syncCollider();
  }

  setVisible(v: boolean): void {
    this.wantVisible = v;
    if (this.rig && !v) this.rig.scene.visible = false;
    if (!v && this.wasVisibleEmitted) {
      this.emitBrukState(false);
    }
  }

  /** Current Bruk world position (used by Systems & Talk check even if GLB failed). */
  getWorldPos(): { x: number; y: number; z: number } {
    return { x: this.pos.x, y: this.groundY, z: this.pos.z };
  }

  getMode(): BrukMode {
    return this.cur.mode;
  }

  /** Check if player is within talk range (< 4 m) and facing Bruk. */
  isTalkable(playerX: number, playerZ: number, playerYaw: number): boolean {
    if (!this.wantVisible || !this.home) return false;
    return canTalkToBruk(playerX, playerZ, playerYaw, this.pos.x, this.pos.z);
  }

  /** Brief attentive turn when player initiates conversation. */
  notifyTalk(): void {
    triggerRoutineInvestigate(this.routine, gameState.playerPos.x, gameState.playerPos.z, 4.5);
  }

  /** Called when an explosion or meteor impact occurs in the world. */
  notifyDisturbance(x: number, z: number, hazardous = false): void {
    if (!this.wantVisible) return;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d <= 18 && hazardous) {
      triggerRoutineShock(this.routine, 4.5, false);
    } else if (d <= BALANCE.bruk.perceptionRadiusM) {
      triggerRoutineInvestigate(this.routine, x, z, 6.5);
    }
  }

  private countCampfires(): number {
    let n = 0;
    for (const s of gameState.placedStructures) if (s.type === 'campfire_kit') n++;
    return n;
  }

  private syncCollider(): void {
    this.spatial.insert({
      id: COLLIDER_ID,
      x: this.pos.x,
      z: this.pos.z,
      radius: BRUK_COLLIDER_RADIUS,
      yMin: this.groundY - 0.5,
      yMax: this.groundY + 3.2,
      kind: 'poi',
    });
  }

  private refreshContext(px: number, pz: number): void {
    const home = this.home;
    if (!home) return;
    const structs = gameState.placedStructures;
    this.levelTarget = brukLevel(brukTrust(gameState.brukMoments, gameState.completedQuests.length));

    this.fire = nearestStruct(structs, FIRE_TYPES, home.x, home.z, BRUK_TETHER);
    if (this.fire) {
      brukSitSpot(home.x, home.z, this.fire.x, this.fire.z, BRUK_SIT_RADIUS, this.sitSpot);
      this.fireBearing = bearingTo(this.sitSpot.x, this.sitSpot.z, this.fire.x, this.fire.z);
    } else {
      this.fireBearing = null;
    }

    const shelter = nearestStruct(structs, SHELTER_TYPES, px, pz, BRUK_SHELTER_PLAYER_RADIUS);
    this.shelter = shelter as ShelterPos | null;
    this.guardFacing = this.shelter ? shelterDoorFacing(this.shelter) : null;
    this.inShelter = shelter !== null || nearestStruct(structs, COVER_TYPES, px, pz, BRUK_SHELTER_PLAYER_RADIUS) !== null;
  }

  private populateObstacles(playerX: number, playerZ: number): void {
    this.navObstacles.length = 0;
    this.colliderBuf = this.spatial.queryRadius(this.pos.x, this.pos.z, 6.0);
    for (let i = 0; i < this.colliderBuf.length; i++) {
      const c = this.colliderBuf[i];
      if (c.id === COLLIDER_ID) continue;
      this.navObstacles.push(c);
    }
    this.playerObstacle.x = playerX;
    this.playerObstacle.z = playerZ;
    this.navObstacles.push(this.playerObstacle);
  }

  private computeFleeLavaSpot(home: BrukHome): BrukSpot {
    const riverX = getLavaRiverCenterX(this.pos.z);
    const dRiver = Math.abs(this.pos.x - riverX);
    const dVolcano = Math.hypot(this.pos.x - VOLCANO_MAIN.x, this.pos.z - VOLCANO_MAIN.z) - 6.5;
    if (dVolcano < dRiver) {
      const dx = this.pos.x - VOLCANO_MAIN.x;
      const dz = this.pos.z - VOLCANO_MAIN.z;
      const len = Math.hypot(dx, dz) || 1;
      this.fleeTarget.x = this.pos.x + (dx / len) * 9;
      this.fleeTarget.z = this.pos.z + (dz / len) * 9;
    } else {
      const sign = this.pos.x >= riverX ? 1 : -1;
      this.fleeTarget.x = this.pos.x + sign * 9;
      this.fleeTarget.z = home.z;
    }
    return this.fleeTarget;
  }

  update(dt: number, elapsed: number, ctx: BrukFrameCtx): void {
    const home = this.home;
    const terrain = this.terrain;
    if (!home || !terrain) return;

    const rig = this.rig;
    const sinceFirstFire = this.fireTracker.update(this.countCampfires(), elapsed);

    const dist = Math.hypot(ctx.playerX - this.pos.x, ctx.playerZ - this.pos.z);
    if (!this.wantVisible || dist > BRUK_CULL_DIST) {
      if (rig) rig.scene.visible = false;
      if (this.wasVisibleEmitted) this.emitBrukState(false);
      return;
    }

    this.logicTimer += dt;
    if (this.logicTimer >= LOGIC_EVERY_SEC) {
      this.logicTimer = 0;
      this.refreshContext(ctx.playerX, ctx.playerZ);
    }

    this.level = this.placed ? smoothLevel(this.level, this.levelTarget, dt) : this.levelTarget;

    // ── Mesin status rutinitas dengan histeresis (murni & deterministik) ──
    const stormFlag = isStormWeather(ctx.weather);
    const stormW = typeof ctx.stormWeight === 'number' ? ctx.stormWeight : stormFlag ? 1 : 0;
    const lavaDist = getDistanceToLava(this.pos.x, this.pos.z);
    const ri = this.routineInput;
    ri.timeSec = elapsed;
    ri.seed = this.worldSeedNum;
    ri.isNight = Boolean(ctx.isNight);
    ri.stormWeight = stormW;
    ri.playerDist = dist;
    ri.inShelter = this.inShelter;
    ri.hasFire = this.fire !== null;
    ri.canSitAtFire = this.fire !== null && gameState.brukMoments.includes('fire_third');
    ri.guardFacing = this.guardFacing;
    ri.sinceFirstFire = sinceFirstFire;
    ri.lavaDist = lavaDist;
    ri.violationCount = gameState.brukMemory.violationCount;

    const activeMode = stepBrukRoutine(this.routine, ri, dt);

    // ── Pose target (murni, tanpa alokasi) ──
    const inp = this.input;
    inp.level = this.level;
    inp.time = elapsed;
    inp.dist = dist;
    inp.bearing = bearingTo(this.pos.x, this.pos.z, ctx.playerX, ctx.playerZ);
    inp.baseYaw = home.yaw;
    inp.moments = gameState.brukMoments;
    inp.sinceFirstFire = sinceFirstFire;
    inp.fireBearing = this.fireBearing;
    inp.inShelter = this.inShelter;
    inp.storm = stormFlag;
    inp.guardFacing = this.guardFacing;
    inp.routineMode = activeMode;
    inp.investigateBearing =
      activeMode === 'investigate'
        ? bearingTo(this.pos.x, this.pos.z, this.routine.investigateX, this.routine.investigateZ)
        : null;
    inp.fleeBearing =
      activeMode === 'flee_lava'
        ? bearingTo(this.pos.x, this.pos.z, this.fleeTarget.x, this.fleeTarget.z)
        : null;
    brukPose(inp, this.target);

    // ── Target navigasi & kemudi menghindar rintangan/air > 0.6m ──
    const fleeSpot = activeMode === 'flee_lava' ? this.computeFleeLavaSpot(home) : null;
    brukTargetSpot(
      {
        mode: activeMode,
        home,
        fire: this.fire,
        shelter: this.shelter,
        guardFacing: this.guardFacing,
        crater: CRYSTAL_CRATER,
        timeSec: elapsed,
        seed: this.worldSeedNum,
        investigateTarget:
          activeMode === 'investigate'
            ? { x: this.routine.investigateX, z: this.routine.investigateZ }
            : null,
        fleeFromLavaTarget: fleeSpot,
      },
      this.spot
    );

    if (!this.placed) {
      copyPose(this.cur, this.target);
      this.cur.yaw = home.yaw;
      resetBrukNavState(this.navState, this.pos.x, this.pos.z);
    }

    const modeSpeed =
      activeMode === 'flee_lava'
        ? BRUK_WALK_SPEED * 1.25
        : activeMode === 'wander' || activeMode === 'rest'
          ? BRUK_WALK_SPEED * 0.68
          : BRUK_WALK_SPEED;

    this.populateObstacles(ctx.playerX, ctx.playerZ);
    steerBrukToward(
      this.navState,
      this.pos.x,
      this.pos.z,
      this.spot.x,
      this.spot.z,
      home.x,
      home.z,
      modeSpeed,
      dt,
      BRUK_COLLIDER_RADIUS,
      this.navObstacles,
      this.navSampler,
      this.navSteerOut
    );

    if (this.navSteerOut.moved > 0) {
      this.pos.x = this.navSteerOut.nextX;
      this.pos.z = this.navSteerOut.nextZ;
    }

    // ── Gentle mutual push if player & Bruk overlap (< combined radii) ──
    const minSep = BRUK_COLLIDER_RADIUS + BRUK_PLAYER_RADIUS;
    resolveBrukPlayerPush(this.pos.x, this.pos.z, ctx.playerX, ctx.playerZ, minSep, dt, this.pushOut);
    if (this.pushOut.separated) {
      const gh = terrain.groundHeightAt(this.pushOut.brukX, this.pushOut.brukZ);
      if (Number.isFinite(gh) && WATER_LEVEL - gh <= 0.6) {
        this.pos.x = this.pushOut.brukX;
        this.pos.z = this.pushOut.brukZ;
      }
      ctx.onPlayerPush?.(this.pushOut.playerX, this.pushOut.playerZ);
    }

    this.moving = this.navSteerOut.moved > 0 && this.navSteerOut.remaining > 0.06;
    if (this.navSteerOut.moved > 0 || this.pushOut.separated) {
      this.groundY = terrain.groundHeightAt(this.pos.x, this.pos.z);
      this.syncCollider();
      this.movedAcc += this.navSteerOut.moved;
    }
    if (dt > 0) {
      this.movedDtAcc += dt;
    }

    // Slope pitch along facing direction for terrain-adapted stance/walk
    const fx = Math.sin(this.cur.yaw);
    const fz = Math.cos(this.cur.yaw);
    const hFront = terrain.groundHeightAt(this.pos.x + fx * 0.9, this.pos.z + fz * 0.9);
    const hBack = terrain.groundHeightAt(this.pos.x - fx * 0.9, this.pos.z - fz * 0.9);
    if (Number.isFinite(hFront) && Number.isFinite(hBack)) {
      this.slopePitch = Math.max(-0.35, Math.min(0.35, Math.atan2(hFront - hBack, 1.8)));
    }

    // ── Audio event emission (always active, even without GLB) ──
    this.stateEmitAcc += dt;
    const enteringRecoil = this.target.mode === 'recoil' && this.lastEmittedMode !== 'recoil';
    const shouldEmitAudio = this.stateEmitAcc >= 0.1 || enteringRecoil || !this.wasVisibleEmitted;

    if (!rig) {
      smoothPose(this.cur, this.target, dt);
      if (this.moving) {
        const k = 1 - Math.exp(-4 * Math.min(dt, 0.5));
        this.cur.yaw = wrapAngle(this.cur.yaw + angleDiff(this.navSteerOut.heading, this.cur.yaw) * k);
      }
      this.walkPhase += this.movedAcc * STRIDE_RAD_PER_M;
      this.movedAcc = 0;
      this.movedDtAcc = 0;
      this.placed = true;
      if (shouldEmitAudio) this.emitBrukState(true);
      return;
    }

    // ── Penerapan ke model, dibatasi selang ──
    this.projView.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.sphere.center.set(this.pos.x, this.groundY + 1.6, this.pos.z);
    this.sphere.radius = 3.4;
    const onScreen = this.frustum.intersectsSphere(this.sphere);
    this.acc += dt;
    const interval = brukUpdateInterval(dist, onScreen, ctx.lowGfx);

    if (interval === Infinity) {
      rig.scene.visible = this.placed && this.wantVisible;
      if (shouldEmitAudio) this.emitBrukState(this.wantVisible);
      return;
    }
    if (this.placed && this.acc < interval) {
      if (shouldEmitAudio) this.emitBrukState(true);
      return;
    }

    const d = this.acc;
    this.acc = 0;
    const yawBefore = this.cur.yaw;
    smoothPose(this.cur, this.target, d);
    if (this.moving) {
      const k = 1 - Math.exp(-4 * Math.min(d, 0.5));
      this.cur.yaw = wrapAngle(yawBefore + angleDiff(this.navSteerOut.heading, yawBefore) * k);
    }
    this.applyPose(rig, this.cur, d, elapsed, dist, ctx.playerX, ctx.playerZ);
    rig.scene.visible = true;
    this.placed = true;
    if (shouldEmitAudio || (this.cur.mode === 'recoil' && this.lastEmittedMode !== 'recoil')) {
      this.emitBrukState(true);
    }
  }

  private emitBrukState(visible: boolean): void {
    this.stateEmitAcc = 0;
    this.wasVisibleEmitted = visible;
    this.lastEmittedMode = this.cur.mode;
    const p = this.statePayload;
    p.visible = visible;
    p.x = this.pos.x;
    p.y = this.groundY + 1.4;
    p.z = this.pos.z;
    p.breath = this.cur.breath;
    p.glow = crackGlowWithBreath(this.cur.glow, this.cur.breath, this.level);
    p.level = this.level;
    p.moving = this.moving;
    p.mode = this.cur.mode;
    p.stepPhase = this.walkPhase;
    eventBus.emit('bruk:state', p);
  }

  private applyPose(
    rig: Rig,
    p: BrukPose,
    d: number,
    elapsed: number,
    dist: number,
    playerX: number,
    playerZ: number
  ): void {
    // Langkah kaki & kecepatan sesungguhnya
    const safeDt = Math.max(1e-3, this.movedDtAcc > 0 ? this.movedDtAcc : d);
    const rawSpeed = this.movedAcc / safeDt;
    this.currentSpeed += (rawSpeed - this.currentSpeed) * (1 - Math.exp(-8 * Math.min(d, 0.5)));
    const speedRatio = Math.max(0, Math.min(1.4, this.currentSpeed / BRUK_WALK_SPEED));

    this.walkPhase += this.movedAcc * STRIDE_RAD_PER_M;
    const walking = this.movedAcc > 1e-4 ? Math.max(0.3, speedRatio) : 0;
    this.movedAcc = 0;
    this.movedDtAcc = 0;
    this.legAmp += (walking - this.legAmp) * (1 - Math.exp(-8 * Math.min(d, 0.5)));

    const swing = Math.sin(this.walkPhase) * LEG_SWING * this.legAmp * (1 - p.sit);
    const armWalkSwing = swing * 0.58 * (1 - p.arms * 0.4);

    // Mundur (recoil) berlawanan arah hadap.
    rig.bruk.position.set(this.pos.x - Math.sin(p.yaw) * p.back, this.groundY, this.pos.z - Math.cos(p.yaw) * p.back);
    rig.bruk.rotation.y = p.yaw;

    rig.hips.position.y = rig.hipsY0 - p.crouch * CROUCH_DROP_M - p.sit * SIT_DROP_M;
    // Slight uphill/downhill lean adaptation without exaggerated tipping
    rig.torso.rotation.x = p.lean + p.crouch * 0.14 - this.slopePitch * 0.25;
    rig.torso.scale.y = 1 + (p.breath - 0.5) * 0.032;
    rig.head.rotation.y = p.headYaw;

    // Seeded blinking + eye tracking within socket
    const blink = seededEyeBlink(elapsed, this.worldSeedNum);
    rig.eye.scale.y = Math.max(0.05, p.eyeOpen * blink);
    const bearing = bearingTo(this.pos.x, this.pos.z, playerX, playerZ);
    rig.eye.position.x = rig.eyeX0 + eyeLookYawOffset(bearing, p.yaw, p.headYaw, dist) * 0.14;

    // Soften resting arm angles & blend counter-swing with open-arms trust gesture
    const openPitch = -0.78 * p.arms;
    const openSpread = 0.14 + 0.22 * p.arms;
    rig.armL.rotation.set(openPitch - armWalkSwing, 0, openSpread);
    rig.armR.rotation.set(openPitch + armWalkSwing, 0, -openSpread);
    rig.legL.rotation.x = swing + SIT_LEG_X * p.sit;
    rig.legR.rotation.x = -swing + SIT_LEG_X * p.sit;

    rig.lava.emissive.setHex(p.crackColor);
    rig.lava.emissiveIntensity = crackGlowWithBreath(p.glow, p.breath, this.level);
    rig.eyeMat.emissive.setHex(p.eyeColor);
    rig.eyeMat.emissiveIntensity = p.eyeGlow;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    if (this.wasVisibleEmitted) this.emitBrukState(false);
    this.spatial.remove(COLLIDER_ID);
    if (this.rig) {
      this.scene.remove(this.rig.scene);
      disposeObject3D(this.rig.scene as unknown as Parameters<typeof disposeObject3D>[0]);
      this.rig = null;
    }
    this.terrain = null;
    this.home = null;
  }
}
