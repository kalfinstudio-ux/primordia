import * as THREE from 'three';
import { createConfiguredGltfLoader } from '../core/gltfLoader';
import { WATER_LEVEL } from '../config';
import { gameState } from '../core/state';
import type { SpatialHashGrid } from '../core/spatialHash';
import { assetUrl } from '../data/assets';
import { brukLevel, brukTrust } from '../data/bruk';
import {
  BRUK_CULL_DIST,
  angleDiff,
  bearingTo,
  brukPose,
  brukSitSpot,
  brukUpdateInterval,
  copyPose,
  makeInput,
  makePose,
  smoothLevel,
  smoothPose,
  wrapAngle,
  type BrukPose,
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
  stepToward,
  type BrukHome,
  type ShelterPos,
  type StepResult,
} from '../data/brukWorld';
import { CRYSTAL_CRATER } from './biomes';
import { disposeObject3D } from './disposal';
import type { TerrainSystem } from './terrain';

export const BRUK_MODEL_FILE = 'primordia_bruk.glb';
/** Titik awal permainan baru: rumah Bruk dipilih menghadap ke sini agar tetap sama tiap sesi. */
const DEFAULT_SPAWN = { x: 0, z: 18 };
const COLLIDER_ID = 'bruk_body';
const LOGIC_EVERY_SEC = 0.5;
/** Seberapa jauh pinggul turun saat berjongkok penuh / duduk (m). */
const CROUCH_DROP_M = 0.4;
const SIT_DROP_M = 0.8;
const SIT_LEG_X = -1.4;
const STRIDE_RAD_PER_M = 2.2;
const LEG_SWING = 0.5;

const FIRE_TYPES = ['campfire_kit'] as const;
const SHELTER_TYPES = ['basic_shelter'] as const;
const COVER_TYPES = ['basic_shelter', 'roof_panel'] as const;

export interface BrukFrameCtx {
  playerX: number;
  playerZ: number;
  camera: THREE.PerspectiveCamera;
  weather: string;
  lowGfx: boolean;
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
}

/**
 * Bruk tingkat 2 (M3): golem basal di rim Kawah Kristal. Memuat `primordia_bruk.glb` sekali,
 * lalu tiap frame memetakan pose dari `brukPose`/`smoothPose` (logika murni M2) ke node model.
 * Tidak mengubah angka survival, save, atau peta. Bila model gagal dimuat, game berjalan seperti biasa
 * (dialog tingkat 1 tetap bekerja).
 */
export class BrukBody {
  private rig: Rig | null = null;
  private loading = false;
  private terrain: TerrainSystem | null = null;
  private home: BrukHome | null = null;
  private placed = false;
  private wantVisible = false;

  private readonly pos: BrukSpot = { x: 0, z: 0 };
  private groundY = 0;
  private level = 0;
  private levelTarget = 0;
  private logicTimer = 0;
  private acc = 0;
  private movedAcc = 0;
  private walkPhase = 0;
  private legAmp = 0;

  private fire: { x: number; z: number } | null = null;
  private shelter: ShelterPos | null = null;
  private inShelter = false;
  private guardFacing: number | null = null;
  private sitSpot: BrukSpot = { x: 0, z: 0 };
  private fireBearing: number | null = null;

  private readonly fireTracker = new FirstFireTracker();
  private readonly input = makeInput();
  private readonly target: BrukPose = makePose();
  private readonly cur: BrukPose = makePose();
  private readonly spot: BrukSpot = { x: 0, z: 0 };
  private readonly step: StepResult = { moved: 0, heading: 0, remaining: 0 };
  private moving = false;

  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor(private readonly scene: THREE.Scene, private readonly spatial: SpatialHashGrid) {}

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
      console.warn('[Bruk] model 3D gagal dimuat; hanya dialog yang aktif.', err);
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
    return { scene: root, bruk, hips, legL, legR, torso, head, eye, armL, armR, lava: found.lava, eyeMat: found.eye, hipsY0: hips.position.y };
  }

  /** Dipanggil saat dunia dimuat/permainan baru: pilih rumah, reset pelacak api dan penempatan. */
  reset(terrain: TerrainSystem): void {
    this.terrain = terrain;
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
    this.logicTimer = LOGIC_EVERY_SEC; // segera hitung konteks pada frame pertama
    this.acc = 0;
    this.movedAcc = 0;
    this.legAmp = 0;
    this.fireTracker.reset(this.countCampfires());
    this.syncCollider();
  }

  setVisible(v: boolean): void {
    this.wantVisible = v;
    if (this.rig && !v) this.rig.scene.visible = false;
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

  /** Konteks yang berubah pelan (api, shelter, tingkat): dihitung tiap LOGIC_EVERY_SEC, bukan tiap frame. */
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
    // Sama dengan BrukSystem: atap juga dihitung sebagai "di dalam shelter".
    this.inShelter = shelter !== null || nearestStruct(structs, COVER_TYPES, px, pz, BRUK_SHELTER_PLAYER_RADIUS) !== null;
  }

  update(dt: number, elapsed: number, ctx: BrukFrameCtx): void {
    const rig = this.rig;
    const home = this.home;
    const terrain = this.terrain;
    if (!rig || !home || !terrain) return;

    // Api pertama harus dipantau tiap frame (transisi 0→1), walau Bruk sedang jauh.
    const sinceFirstFire = this.fireTracker.update(this.countCampfires(), elapsed);

    const dist = Math.hypot(ctx.playerX - this.pos.x, ctx.playerZ - this.pos.z);
    if (!this.wantVisible || dist > BRUK_CULL_DIST) {
      rig.scene.visible = false;
      return;
    }

    this.logicTimer += dt;
    if (this.logicTimer >= LOGIC_EVERY_SEC) {
      this.logicTimer = 0;
      this.refreshContext(ctx.playerX, ctx.playerZ);
    }

    // Tingkat tampilan berubah halus (beberapa detik); pertama kali langsung sesuai tingkat sebenarnya.
    this.level = this.placed ? smoothLevel(this.level, this.levelTarget, dt) : this.levelTarget;

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
    inp.storm = isStormWeather(ctx.weather);
    inp.guardFacing = this.guardFacing;
    brukPose(inp, this.target);

    // ── Posisi: rumah, atau berjalan ke api/shelter sesuai mode ──
    brukTargetSpot({ mode: this.target.mode, home, fire: this.fire, shelter: this.shelter, guardFacing: this.guardFacing }, this.spot);
    if (!this.placed) {
      copyPose(this.cur, this.target); // tanpa transisi dari pose awal
      this.cur.yaw = home.yaw;
    }
    stepToward(this.pos, this.spot.x, this.spot.z, BRUK_WALK_SPEED, dt, this.step);
    this.moving = this.step.moved > 0 && this.step.remaining > 0.05;
    if (this.step.moved > 0) {
      this.groundY = terrain.groundHeightAt(this.pos.x, this.pos.z);
      this.syncCollider();
      this.movedAcc += this.step.moved;
    }

    // ── Penerapan ke model, dibatasi selang (jauh/di luar layar = lewati) ──
    this.projView.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.sphere.center.set(this.pos.x, this.groundY + 1.6, this.pos.z);
    this.sphere.radius = 3.4;
    const onScreen = this.frustum.intersectsSphere(this.sphere);
    this.acc += dt;
    const interval = brukUpdateInterval(dist, onScreen, ctx.lowGfx);
    if (interval === Infinity) {
      rig.scene.visible = this.placed && this.wantVisible; // tetap tergambar bila masih di tepi; GPU yang memangkas
      return;
    }
    if (this.placed && this.acc < interval) return;

    const d = this.acc;
    this.acc = 0;
    const yawBefore = this.cur.yaw;
    smoothPose(this.cur, this.target, d);
    if (this.moving) {
      // Saat berjalan, badan menghadap arah jalan (bukan arah api/pemain).
      const k = 1 - Math.exp(-4 * Math.min(d, 0.5));
      this.cur.yaw = wrapAngle(yawBefore + angleDiff(this.step.heading, yawBefore) * k);
    }
    this.applyPose(rig, this.cur, d);
    rig.scene.visible = true;
    this.placed = true;
  }

  private applyPose(rig: Rig, p: BrukPose, d: number): void {
    // Langkah kaki: fase mengikuti jarak tempuh; amplitudenya memudar saat berhenti.
    this.walkPhase += this.movedAcc * STRIDE_RAD_PER_M;
    const walking = this.movedAcc > 1e-4 ? 1 : 0;
    this.movedAcc = 0;
    this.legAmp += (walking - this.legAmp) * (1 - Math.exp(-8 * Math.min(d, 0.5)));
    const swing = Math.sin(this.walkPhase) * LEG_SWING * this.legAmp * (1 - p.sit);

    // Mundur (recoil) berlawanan arah hadap.
    rig.bruk.position.set(this.pos.x - Math.sin(p.yaw) * p.back, this.groundY, this.pos.z - Math.cos(p.yaw) * p.back);
    rig.bruk.rotation.y = p.yaw;

    rig.hips.position.y = rig.hipsY0 - p.crouch * CROUCH_DROP_M - p.sit * SIT_DROP_M;
    rig.torso.rotation.x = p.lean + p.crouch * 0.15;
    rig.torso.scale.y = 1 + (p.breath - 0.5) * 0.03;
    rig.head.rotation.y = p.headYaw;
    rig.eye.scale.y = Math.max(0.05, p.eyeOpen);
    rig.armL.rotation.set(-0.9 * p.arms, 0, 0.4 * p.arms);
    rig.armR.rotation.set(-0.9 * p.arms, 0, -0.4 * p.arms);
    rig.legL.rotation.x = swing + SIT_LEG_X * p.sit;
    rig.legR.rotation.x = -swing + SIT_LEG_X * p.sit;

    rig.lava.emissive.setHex(p.crackColor);
    rig.lava.emissiveIntensity = p.glow;
    rig.eyeMat.emissive.setHex(p.eyeColor);
    rig.eyeMat.emissiveIntensity = p.eyeGlow;
  }

  dispose(): void {
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
