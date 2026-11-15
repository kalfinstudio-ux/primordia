/**
 * Bruk tingkat 2 — perilaku tubuh & mesin status rutinitas (logika MURNI, tanpa three/react)
 * → dites di brukBehavior.test.ts.
 *
 * Alur pemakaian (di BrukBody, M3), tanpa alokasi per frame:
 *   lv   = smoothLevel(lv, brukLevel(trust), dt)         // tampilan berubah halus (beberapa detik)
 *   stepBrukRoutine(routine, routineInput, dt)           // pilih mode rutinitas berhisteresis
 *   brukPose(input, target)                              // tulis pose TARGET ke objek yang dipakai ulang
 *   smoothPose(pose, target, dt)                         // haluskan pose yang dirender
 *
 * Konvensi sudut (sama dengan controller.ts dan Object3D.rotation.y di three):
 *   yaw 0 = menghadap +Z; bearing dari A ke B = atan2(dx, dz); satuan radian.
 */
import { clamp, damp, lerp, smoothstep } from '../utils/math';

export type BrukMode =
  | 'idle'
  | 'watch'
  | 'recoil'
  | 'sit'
  | 'guard'
  | 'patrol'
  | 'rest'
  | 'wander'
  | 'investigate'
  | 'flee_lava';

/** Tinggi Bruk (m); manusia 1,8 m. Dipakai pembangun model dan penempatan. */
export const BRUK_HEIGHT_M = 3.2;
/** Kepala mulai mengikuti pemain di bawah jarak ini (m). */
export const BRUK_WATCH_RANGE = 40;
/** Pengikutan memudar mulus di rentang ini sebelum batas (tidak ada lompatan di 40 m). */
export const BRUK_WATCH_FADE = 10;
/** Batas putar leher terhadap badan (rad, ±63°): tidak pernah memutar 360°. */
export const BRUK_HEAD_MAX = 1.1;
/** Lama kejadian mundur-mengerut saat api pertama dipasang (detik). */
export const BRUK_RECOIL_SEC = 7;
/** Mundur satu langkah kecil (m), berlawanan arah hadap. */
export const BRUK_RECOIL_BACK_M = 0.8;
/** Di atas jarak ini animasi dilewati sama sekali (m). */
export const BRUK_CULL_DIST = 120;
/** Laju penghalusan tingkat (1/detik): ±95% tercapai dalam ±5 detik. */
export const BRUK_LEVEL_LAMBDA = 0.6;
export const BRUK_MAX_LEVEL = 4;

// ── Tabel tampilan per tingkat (satu model, lima tampilan). Indeks = tingkat 0..4. ──
const CRACK_COLOR = [0x2a1410, 0x7a1c0c, 0xe0601a, 0xff8a1f, 0xffc04a] as const;
const CRACK_GLOW = [0.15, 0.5, 0.95, 1.5, 1.9] as const;
const EYE_COLOR = [0x8a5a14, 0xc88a22, 0xffb02e, 0xffc24a, 0xffd36e] as const;
const EYE_GLOW = [0.25, 0.7, 1.1, 1.6, 1.9] as const;
const EYE_OPEN = [0.35, 0.6, 0.85, 1, 1] as const;
const LEAN = [0.4, 0.3, 0.18, 0.1, 0.04] as const;
const FACE = [0, 0.35, 0.65, 1, 1] as const;
const HEAD_FOLLOW = [0.15, 1, 1, 1, 1] as const;
const ARMS_OPEN = [0, 0, 0, 0, 1] as const;
const AWAY_ANGLE = Math.PI * 0.8;

export interface BrukPose {
  mode: BrukMode;
  /** Arah hadap badan (rad). Selalu dalam ±π dari `baseYaw`. */
  yaw: number;
  /** Putar kepala RELATIF badan, dibatasi ±BRUK_HEAD_MAX. */
  headYaw: number;
  /** Bungkuk ke depan (rad). */
  lean: number;
  /** Intensitas emissive retakan lava. */
  glow: number;
  eyeGlow: number;
  /** 0 sipit … 1 terbuka. */
  eyeOpen: number;
  crackColor: number;
  eyeColor: number;
  /** 0..1 siklus napas (untuk skala dada & denyut lava). */
  breath: number;
  /** 0..1 tangan terbuka. */
  arms: number;
  /** 0..1 mengerut (menurunkan tinggi/bahu). */
  crouch: number;
  /** Meter mundur dari posisi dasar, berlawanan arah hadap. */
  back: number;
  /** 0..1 duduk. */
  sit: number;
  /** 0..1 siaga di pintu. */
  guard: number;
}

export interface BrukPoseInput {
  /** Tingkat tampilan 0..4, boleh pecahan (hasil smoothLevel). */
  level: number;
  /** Waktu animasi (detik, terus naik). */
  time: number;
  /** Jarak Bruk → pemain (m). */
  dist: number;
  /** Arah dari Bruk ke pemain (rad). */
  bearing: number;
  /** Arah hadap istirahat Bruk (rad). */
  baseYaw: number;
  /** `gameState.brukMoments`. */
  moments: readonly string[];
  /** Detik sejak api pertama dipasang SAAT sesi ini; null = tidak disaksikan. */
  sinceFirstFire: number | null;
  /** Arah dari tempat duduk ke api terdekat; null = tidak ada api. */
  fireBearing: number | null;
  /** Pemain sedang di dalam shelter. */
  inShelter: boolean;
  /** Badai sedang berlangsung. */
  storm: boolean;
  /** Arah hadap saat berjaga (keluar dari pintu shelter); null = tidak ada shelter. */
  guardFacing: number | null;
  /** Mode rutinitas dari `stepBrukRoutine` (opsional; menjaga kompatibilitas mundur). */
  routineMode?: BrukMode;
  /** Arah titik yang sedang diselidiki (mode `investigate`). */
  investigateBearing?: number | null;
  /** Arah menjauh dari bahaya lava (mode `flee_lava`). */
  fleeBearing?: number | null;
}

export function makePose(): BrukPose {
  return {
    mode: 'idle', yaw: 0, headYaw: 0, lean: LEAN[0], glow: CRACK_GLOW[0], eyeGlow: EYE_GLOW[0], eyeOpen: EYE_OPEN[0],
    crackColor: CRACK_COLOR[0], eyeColor: EYE_COLOR[0], breath: 0.5, arms: 0, crouch: 0, back: 0, sit: 0, guard: 0,
  };
}

export function makeInput(): BrukPoseInput {
  return {
    level: 0, time: 0, dist: Infinity, bearing: 0, baseYaw: 0, moments: [], sinceFirstFire: null,
    fireBearing: null, inShelter: false, storm: false, guardFacing: null,
  };
}

export function copyPose(dst: BrukPose, src: BrukPose): BrukPose {
  dst.mode = src.mode; dst.yaw = src.yaw; dst.headYaw = src.headYaw; dst.lean = src.lean; dst.glow = src.glow;
  dst.eyeGlow = src.eyeGlow; dst.eyeOpen = src.eyeOpen; dst.crackColor = src.crackColor; dst.eyeColor = src.eyeColor;
  dst.breath = src.breath; dst.arms = src.arms; dst.crouch = src.crouch; dst.back = src.back; dst.sit = src.sit; dst.guard = src.guard;
  return dst;
}

const TWO_PI = Math.PI * 2;
const fin = (x: number, d: number): number => (Number.isFinite(x) ? x : d);

export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}

export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b);
}

export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

export function lerpHex(a: number, b: number, t: number): number {
  const k = clamp(fin(t, 0), 0, 1);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k));
  const bl = Math.round(lerp(a & 255, b & 255, k));
  return (r << 16) | (g << 8) | bl;
}

function approachHex(cur: number, tgt: number, t: number): number {
  const k = clamp(fin(t, 0), 0, 1);
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const a = (cur >> shift) & 255;
    const b = (tgt >> shift) & 255;
    let v = Math.round(lerp(a, b, k));
    if (k > 0 && v === a && a !== b) v = a + (b > a ? 1 : -1);
    out |= v << shift;
  }
  return out;
}

function sample(table: readonly number[], lv: number): number {
  const lo = Math.min(BRUK_MAX_LEVEL - 1, Math.floor(lv));
  return lerp(table[lo], table[lo + 1], lv - lo);
}

function sampleColor(table: readonly number[], lv: number): number {
  const lo = Math.min(BRUK_MAX_LEVEL - 1, Math.floor(lv));
  return lerpHex(table[lo], table[lo + 1], lv - lo);
}

export function smoothLevel(current: number, target: number, dt: number): number {
  const tgt = clamp(fin(target, 0), 0, BRUK_MAX_LEVEL);
  const cur = clamp(fin(current, tgt), 0, BRUK_MAX_LEVEL);
  const next = damp(cur, tgt, BRUK_LEVEL_LAMBDA, Math.max(0, fin(dt, 0)));
  return Math.abs(next - tgt) < 0.001 ? tgt : next;
}

export function watchFactor(dist: number): number {
  const d = Math.max(0, fin(dist, Infinity));
  return 1 - smoothstep(BRUK_WATCH_RANGE - BRUK_WATCH_FADE, BRUK_WATCH_RANGE, d);
}

export function recoilEnvelope(sinceFirstFire: number | null): number {
  if (sinceFirstFire === null || !Number.isFinite(sinceFirstFire)) return 0;
  if (sinceFirstFire < 0 || sinceFirstFire >= BRUK_RECOIL_SEC) return 0;
  return smoothstep(0, 0.5, sinceFirstFire) * (1 - smoothstep(3.5, BRUK_RECOIL_SEC, sinceFirstFire));
}

function glance(t: number): number {
  const gate = smoothstep(0.55, 0.9, Math.sin(t * 0.23 + 1.3));
  return gate * Math.sin(t * 0.9) * 0.5;
}

/** Deterministic integer hash helper (no Math.random). */
function hashUnit(n: number, seed: number): number {
  let x = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

/**
 * Deterministic seeded eye blink multiplier (0.06 = closed, 1 = open).
 * Blinks occur every ~4..6.2 s for ~0.16 s.
 */
export function seededEyeBlink(timeSec: number, seed = 101): number {
  const t = Math.max(0, fin(timeSec, 0));
  if (t <= 0.05) return 1;
  const period = 4.2;
  const slot = Math.floor(t / period);
  const local = t - slot * period;
  const blinkAt = 1.1 + hashUnit(slot, seed) * 2.2;
  const halfDur = 0.09;
  const d = Math.abs(local - blinkAt);
  if (d >= halfDur) return 1;
  const k = d / halfDur;
  return 0.06 + 0.94 * (k * k);
}

/** Lava crack emissive synchronized smoothly with chest breathing cycle. */
export function crackGlowWithBreath(baseGlow: number, breath: number, level: number): number {
  const g = Math.max(0, fin(baseGlow, 0));
  const b = clamp(fin(breath, 0.5), 0, 1);
  const lv = clamp(fin(level, 0), 0, BRUK_MAX_LEVEL);
  const amp = 0.06 + (lv / BRUK_MAX_LEVEL) * 0.14;
  return g * (1 + (b - 0.5) * 2 * amp);
}

/** Eye socket horizontal tracking angle relative to head (clamped ±0.26 rad). */
export function eyeLookYawOffset(bearing: number, bodyYaw: number, headYaw: number, dist: number): number {
  const wf = watchFactor(dist);
  if (wf <= 0.01) return 0;
  const totalYaw = wrapAngle(fin(bodyYaw, 0) + fin(headYaw, 0));
  const rem = angleDiff(fin(bearing, totalYaw), totalYaw);
  return clamp(rem * 0.35 * wf, -0.26, 0.26);
}

// ── Routine State Machine with Hysteresis (Pure & Deterministic) ─────────────

export interface BrukRoutineState {
  mode: BrukMode;
  holdSec: number;
  investigateX: number;
  investigateZ: number;
  investigateRemainingSec: number;
  shockRemainingSec: number;
  violationRemainingSec: number;
  /** Deterministic slot counter for patrol/wander phases. */
  phaseTick: number;
}

export interface BrukRoutineInput {
  timeSec: number;
  seed: number;
  isNight: boolean;
  /** 0..1 combined storm intensity (from WeatherSystem weights or 1 if storming). */
  stormWeight: number;
  playerDist: number;
  inShelter: boolean;
  hasFire: boolean;
  canSitAtFire: boolean;
  guardFacing: number | null;
  sinceFirstFire: number | null;
  lavaDist: number;
  violationCount: number;
}

export function makeRoutineState(): BrukRoutineState {
  return {
    mode: 'idle',
    holdSec: 0,
    investigateX: 0,
    investigateZ: 0,
    investigateRemainingSec: 0,
    shockRemainingSec: 0,
    violationRemainingSec: 0,
    phaseTick: 0,
  };
}

export function triggerRoutineInvestigate(state: BrukRoutineState, x: number, z: number, durationSec = 7.5): void {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  state.investigateX = x;
  state.investigateZ = z;
  state.investigateRemainingSec = Math.max(state.investigateRemainingSec, durationSec);
}

export function triggerRoutineShock(state: BrukRoutineState, durationSec = 5.0, violation = false): void {
  state.shockRemainingSec = Math.max(state.shockRemainingSec, durationSec);
  if (violation) {
    state.violationRemainingSec = Math.max(state.violationRemainingSec, durationSec + 3.0);
  }
}

const MIN_HOLD_BY_MODE: Record<BrukMode, number> = {
  flee_lava: 1.5,
  recoil: 2.0,
  guard: 4.0,
  investigate: 4.0,
  sit: 5.0,
  watch: 2.8,
  rest: 6.0,
  patrol: 6.0,
  wander: 5.0,
  idle: 3.5,
};

/**
 * Deterministic routine state machine with hysteresis:
 * Emergency modes (`flee_lava`, `recoil`, `guard`) override calm hold timers.
 * Normal transitions respect per-mode minimum hold duration & entry/exit thresholds.
 */
export function stepBrukRoutine(state: BrukRoutineState, inp: BrukRoutineInput, dt: number): BrukMode {
  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;
  state.holdSec += safeDt;
  if (state.investigateRemainingSec > 0) state.investigateRemainingSec = Math.max(0, state.investigateRemainingSec - safeDt);
  if (state.shockRemainingSec > 0) state.shockRemainingSec = Math.max(0, state.shockRemainingSec - safeDt);
  if (state.violationRemainingSec > 0) state.violationRemainingSec = Math.max(0, state.violationRemainingSec - safeDt);

  const stormW = clamp(fin(inp.stormWeight, 0), 0, 1);
  const lavaD = fin(inp.lavaDist, 999);
  const playerD = fin(inp.playerDist, 999);
  const firstFireActive = recoilEnvelope(inp.sinceFirstFire) > 0;

  // 1. Emergency: lava proximity (enter < 6.5m, exit > 10.5m)
  const wantFleeLava = state.mode === 'flee_lava' ? lavaD < 10.5 : lavaD < 6.5;
  if (wantFleeLava) {
    if (state.mode !== 'flee_lava') {
      state.mode = 'flee_lava';
      state.holdSec = 0;
    }
    return state.mode;
  }

  // 2. Emergency / shock: first fire or crystal violation / nearby quake shock
  if (firstFireActive || state.shockRemainingSec > 0) {
    if (state.mode !== 'recoil') {
      state.mode = 'recoil';
      state.holdSec = 0;
    }
    return state.mode;
  }

  // 3. Storm shelter guard (hysteresis: enter > 0.45, stay > 0.25)
  const stormGuarding =
    inp.inShelter &&
    inp.guardFacing !== null &&
    Number.isFinite(inp.guardFacing) &&
    (state.mode === 'guard' ? stormW >= 0.25 : stormW >= 0.45);
  if (stormGuarding) {
    if (state.mode !== 'guard') {
      state.mode = 'guard';
      state.holdSec = 0;
    }
    return state.mode;
  }

  // Check minimum hold time before switching calm modes
  const minHold = MIN_HOLD_BY_MODE[state.mode] ?? 3.5;
  if (state.holdSec < minHold) {
    return state.mode;
  }

  // 4. Determine desired calm/reactive mode with hysteresis
  let desired: BrukMode = 'idle';

  if (state.investigateRemainingSec > 0) {
    desired = 'investigate';
  } else {
    // Watch vs non-watch hysteresis (enter < 24 m, exit > 30 m; if violated recently, keep watching farther)
    const watchEnter = state.violationRemainingSec > 0 ? 32 : 24;
    const watchExit = state.violationRemainingSec > 0 ? 38 : 30;
    const closeWatch = state.mode === 'watch' ? playerD <= watchExit : playerD <= watchEnter;

    if (inp.canSitAtFire && inp.hasFire && (!closeWatch || playerD > 6)) {
      desired = 'sit';
    } else if (closeWatch && (!inp.isNight || playerD < 15 || state.violationRemainingSec > 0)) {
      desired = 'watch';
    } else if (inp.isNight && playerD > 16) {
      // At night without close player, mostly rest quietly near home/fire with occasional patrol
      const nightBucket = Math.floor(Math.max(0, fin(inp.timeSec, 0)) / 18);
      const roll = hashUnit(nightBucket, inp.seed + 71);
      desired = roll < 0.25 ? 'patrol' : 'rest';
    } else {
      // Deterministic daytime rhythm between idle, wander near home, and rim patrol
      const dayBucket = Math.floor(Math.max(0, fin(inp.timeSec, 0)) / 16);
      const roll = hashUnit(dayBucket, inp.seed + 19);
      if (roll < 0.36) desired = 'patrol';
      else if (roll < 0.68) desired = 'wander';
      else desired = 'idle';
    }
  }

  if (desired !== state.mode) {
    state.mode = desired;
    state.holdSec = 0;
    state.phaseTick += 1;
  }
  return state.mode;
}

/**
 * Hitung pose TARGET dari keadaan dunia. Fungsi murni: tanpa NaN untuk input apa pun,
 * menulis ke `out` (dipakai ulang) agar tidak ada alokasi per frame.
 * Saat `inp.routineMode` tidak diisi, prioritas tepat sama: guard > recoil > sit > watch > idle.
 */
export function brukPose(inp: BrukPoseInput, out: BrukPose = makePose()): BrukPose {
  const lv = clamp(fin(inp.level, 0), 0, BRUK_MAX_LEVEL);
  const t = fin(inp.time, 0);
  const baseYaw = fin(inp.baseYaw, 0);
  const bearing = fin(inp.bearing, baseYaw);
  const r = watchFactor(inp.dist);

  const env = recoilEnvelope(inp.sinceFirstFire);
  const guarding = inp.storm && inp.inShelter && inp.guardFacing !== null && Number.isFinite(inp.guardFacing);
  const sitting = !guarding && env === 0 && inp.fireBearing !== null && Number.isFinite(inp.fireBearing) && inp.moments.includes('fire_third');

  const legacyMode: BrukMode = guarding ? 'guard' : env > 0 ? 'recoil' : sitting ? 'sit' : r > 0 ? 'watch' : 'idle';
  const mode: BrukMode = inp.routineMode ?? legacyMode;

  const face = sample(FACE, lv);
  const follow = sample(HEAD_FOLLOW, lv);
  const breathRate = mode === 'rest' ? 0.72 : mode === 'flee_lava' ? 1.65 : 1.1;
  const breath = Math.sin(t * breathRate) * 0.5 + 0.5;

  // ── Arah badan ──
  let yaw: number;
  if (mode === 'guard' && inp.guardFacing !== null) {
    yaw = baseYaw + angleDiff(fin(inp.guardFacing, baseYaw), baseYaw);
  } else if (mode === 'sit' && inp.fireBearing !== null) {
    yaw = baseYaw + angleDiff(fin(inp.fireBearing, baseYaw), baseYaw);
  } else if (mode === 'investigate' && inp.investigateBearing !== null && inp.investigateBearing !== undefined) {
    yaw = baseYaw + angleDiff(fin(inp.investigateBearing, baseYaw), baseYaw);
  } else if (mode === 'flee_lava' && inp.fleeBearing !== null && inp.fleeBearing !== undefined) {
    yaw = baseYaw + angleDiff(fin(inp.fleeBearing, baseYaw), baseYaw);
  } else {
    const toward = bearing + (1 - face) * AWAY_ANGLE;
    yaw = baseYaw + angleDiff(toward, baseYaw) * r;
  }

  // ── Kepala (relatif badan, dibatasi leher) ──
  let head: number;
  if (mode === 'guard') {
    head = Math.sin(t * 0.5) * 0.4;
  } else if (mode === 'rest') {
    head = Math.sin(t * 0.35) * 0.14;
  } else {
    const relaxed = mode === 'sit' ? 0.6 : mode === 'patrol' || mode === 'wander' ? 0.75 : 1;
    const toPlayer = clamp(angleDiff(bearing, yaw), -BRUK_HEAD_MAX, BRUK_HEAD_MAX) * follow * r * relaxed;
    head = toPlayer + glance(t) * (1 - r * follow);
  }
  head = clamp(head, -BRUK_HEAD_MAX, BRUK_HEAD_MAX);

  // ── Postur ──
  let lean = sample(LEAN, lv) + (breath - 0.5) * 0.03;
  let arms = sample(ARMS_OPEN, lv);
  if (mode === 'sit') {
    lean = lean * 0.5 + 0.06;
    arms *= 0.5;
  } else if (mode === 'rest') {
    lean = lean * 0.7 + 0.18;
    arms = 0;
  } else if (mode === 'guard') {
    lean = 0.03;
    arms = 0;
  } else if (mode === 'investigate') {
    lean = Math.max(0.08, lean + 0.08);
  } else if (mode === 'flee_lava') {
    lean = 0.28;
    arms = 0.25;
  }
  const shockCrouch = env > 0 ? env : mode === 'recoil' ? 0.65 : 0;
  lean += shockCrouch * 0.2;
  arms *= 1 - shockCrouch;

  // ── Cahaya ──
  const pulse = 1 + smoothstep(3, 4, lv) * 0.12 * Math.sin(t * 1.5);
  let glow = sample(CRACK_GLOW, lv) * pulse;
  let eyeOpen = sample(EYE_OPEN, lv);
  if (mode === 'guard') glow *= 1.1;
  if (mode === 'rest') {
    glow *= 0.72;
    eyeOpen *= 0.45;
  }
  glow *= 1 - 0.35 * shockCrouch;
  eyeOpen *= 1 - 0.3 * shockCrouch;

  out.mode = mode;
  out.yaw = yaw;
  out.headYaw = head;
  out.lean = lean;
  out.glow = glow;
  out.eyeGlow = mode === 'rest' ? sample(EYE_GLOW, lv) * 0.6 : sample(EYE_GLOW, lv);
  out.eyeOpen = eyeOpen;
  out.crackColor = sampleColor(CRACK_COLOR, lv);
  out.eyeColor = sampleColor(EYE_COLOR, lv);
  out.breath = breath;
  out.arms = arms;
  out.crouch = mode === 'rest' ? Math.max(0.35, shockCrouch) : shockCrouch;
  out.back = env * BRUK_RECOIL_BACK_M;
  out.sit = mode === 'sit' ? 1 : 0;
  out.guard = mode === 'guard' ? 1 : 0;
  return out;
}

export function smoothPose(cur: BrukPose, tgt: BrukPose, dt: number): BrukPose {
  const d = clamp(fin(dt, 0), 0, 5);
  const k = (lambda: number): number => 1 - Math.exp(-lambda * d);
  cur.mode = tgt.mode;
  cur.yaw = cur.yaw + angleDiff(tgt.yaw, cur.yaw) * k(3);
  if (cur.yaw > Math.PI || cur.yaw < -Math.PI) cur.yaw = wrapAngle(cur.yaw);
  cur.headYaw = damp(cur.headYaw, tgt.headYaw, 3, d);
  cur.lean = damp(cur.lean, tgt.lean, 2, d);
  cur.glow = damp(cur.glow, tgt.glow, 2, d);
  cur.eyeGlow = damp(cur.eyeGlow, tgt.eyeGlow, 2, d);
  cur.eyeOpen = damp(cur.eyeOpen, tgt.eyeOpen, 2, d);
  cur.crackColor = approachHex(cur.crackColor, tgt.crackColor, k(2));
  cur.eyeColor = approachHex(cur.eyeColor, tgt.eyeColor, k(2));
  cur.breath = tgt.breath;
  cur.arms = damp(cur.arms, tgt.arms, 1.5, d);
  cur.crouch = damp(cur.crouch, tgt.crouch, 4, d);
  cur.back = damp(cur.back, tgt.back, 4, d);
  cur.sit = damp(cur.sit, tgt.sit, 1.5, d);
  cur.guard = damp(cur.guard, tgt.guard, 1.5, d);
  return cur;
}

export function brukUpdateInterval(dist: number, onScreen: boolean, lowGfx: boolean): number {
  const d = fin(dist, Infinity);
  if (!onScreen || d > BRUK_CULL_DIST) return Infinity;
  if (d <= 40) return lowGfx ? 1 / 30 : 0;
  if (d <= 80) return lowGfx ? 1 / 15 : 1 / 30;
  return lowGfx ? 1 / 10 : 1 / 15;
}

export interface BrukSpot {
  x: number;
  z: number;
}

export function brukSitSpot(homeX: number, homeZ: number, fireX: number, fireZ: number, radius: number, out: BrukSpot = { x: 0, z: 0 }): BrukSpot {
  let dx = homeX - fireX;
  let dz = homeZ - fireZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) { dx = 0; dz = 1; } else { dx /= len; dz /= len; }
  out.x = fireX + dx * radius;
  out.z = fireZ + dz * radius;
  return out;
}

export function brukGuardSpot(shelterX: number, shelterZ: number, facing: number, radius: number, out: BrukSpot = { x: 0, z: 0 }): BrukSpot {
  out.x = shelterX + Math.sin(facing) * radius;
  out.z = shelterZ + Math.cos(facing) * radius;
  return out;
}
