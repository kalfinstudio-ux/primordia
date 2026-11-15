/**
 * Bruk tingkat 2 — perilaku tubuh (logika MURNI, tanpa three/react) → dites di brukBehavior.test.ts.
 *
 * Alur pemakaian (di BrukBody, M3), tanpa alokasi per frame:
 *   lv   = smoothLevel(lv, brukLevel(trust), dt)         // tampilan berubah halus (beberapa detik)
 *   brukPose(input, target)                              // tulis pose TARGET ke objek yang dipakai ulang
 *   smoothPose(pose, target, dt)                         // haluskan pose yang dirender
 *
 * Konvensi sudut (sama dengan controller.ts dan Object3D.rotation.y di three):
 *   yaw 0 = menghadap +Z; bearing dari A ke B = atan2(dx, dz); satuan radian.
 * Pemain TIDAK dihitung di sini; pemanggil mengisi `dist` dan `bearing`.
 */
import { clamp, damp, lerp, smoothstep } from '../utils/math';

export type BrukMode = 'idle' | 'watch' | 'recoil' | 'sit' | 'guard';

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
const CRACK_COLOR = [0x2a1410, 0x7a1c0c, 0xe0601a, 0xff8a1f, 0xffc04a] as const; // gelap → merah tua → oranye → oranye terang → kuning hangat
const CRACK_GLOW = [0.15, 0.5, 0.95, 1.5, 1.9] as const; // intensitas emissive
const EYE_COLOR = [0x8a5a14, 0xc88a22, 0xffb02e, 0xffc24a, 0xffd36e] as const; // amber redup → terang
const EYE_GLOW = [0.25, 0.7, 1.1, 1.6, 1.9] as const;
const EYE_OPEN = [0.35, 0.6, 0.85, 1, 1] as const; // 0.35 = sipit
const LEAN = [0.4, 0.3, 0.18, 0.1, 0.04] as const; // bungkuk ke depan (rad)
const FACE = [0, 0.35, 0.65, 1, 1] as const; // 0 = memalingkan badan, 1 = menghadap pemain
const HEAD_FOLLOW = [0.15, 1, 1, 1, 1] as const; // L0 hampir tak menoleh; L1 menoleh walau badan masih berpaling
const ARMS_OPEN = [0, 0, 0, 0, 1] as const; // tangan terbuka hanya di tingkat 4
const AWAY_ANGLE = Math.PI * 0.8; // sudut berpaling penuh (hampir membelakangi)

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
  /** 0..1 siklus napas (untuk skala dada). */
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
  /** Detik sejak api pertama dipasang SAAT sesi ini; null = tidak disaksikan (mis. memuat save). */
  sinceFirstFire: number | null;
  /** Arah dari tempat duduk ke api terdekat; null = tidak ada api. */
  fireBearing: number | null;
  /** Pemain sedang di dalam shelter. */
  inShelter: boolean;
  /** Badai sedang berlangsung. */
  storm: boolean;
  /** Arah hadap saat berjaga (keluar dari pintu shelter); null = tidak ada shelter. */
  guardFacing: number | null;
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

// ── Util kecil ──
const TWO_PI = Math.PI * 2;
const fin = (x: number, d: number): number => (Number.isFinite(x) ? x : d);

export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}
/** Selisih sudut terpendek a − b dalam [−π, π). */
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

/** Seperti lerpHex, tetapi tiap kanal minimal maju 1 langkah ke target (pembulatan tidak menahan warna di tengah jalan). */
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

/** Ambil nilai tabel pada tingkat pecahan (interpolasi linear antar tingkat). */
function sample(table: readonly number[], lv: number): number {
  const lo = Math.min(BRUK_MAX_LEVEL - 1, Math.floor(lv));
  return lerp(table[lo], table[lo + 1], lv - lo);
}
function sampleColor(table: readonly number[], lv: number): number {
  const lo = Math.min(BRUK_MAX_LEVEL - 1, Math.floor(lv));
  return lerpHex(table[lo], table[lo + 1], lv - lo);
}

/** Haluskan tingkat tampilan menuju tingkat sebenarnya (lerp beberapa detik, bukan melompat). */
export function smoothLevel(current: number, target: number, dt: number): number {
  const tgt = clamp(fin(target, 0), 0, BRUK_MAX_LEVEL);
  const cur = clamp(fin(current, tgt), 0, BRUK_MAX_LEVEL);
  const next = damp(cur, tgt, BRUK_LEVEL_LAMBDA, Math.max(0, fin(dt, 0)));
  return Math.abs(next - tgt) < 0.001 ? tgt : next;
}

/** Seberapa kuat Bruk memperhatikan pemain: 1 dekat, memudar ke 0 tepat di BRUK_WATCH_RANGE. */
export function watchFactor(dist: number): number {
  const d = Math.max(0, fin(dist, Infinity));
  return 1 - smoothstep(BRUK_WATCH_RANGE - BRUK_WATCH_FADE, BRUK_WATCH_RANGE, d);
}

/** Amplop mundur-mengerut: naik cepat, bertahan, turun pelan; 0 di luar [0, BRUK_RECOIL_SEC). */
export function recoilEnvelope(sinceFirstFire: number | null): number {
  if (sinceFirstFire === null || !Number.isFinite(sinceFirstFire)) return 0;
  if (sinceFirstFire < 0 || sinceFirstFire >= BRUK_RECOIL_SEC) return 0;
  return smoothstep(0, 0.5, sinceFirstFire) * (1 - smoothstep(3.5, BRUK_RECOIL_SEC, sinceFirstFire));
}

/** Menoleh sesekali: deterministik (tanpa acak), selalu dalam ±0.5 rad. */
function glance(t: number): number {
  const gate = smoothstep(0.55, 0.9, Math.sin(t * 0.23 + 1.3));
  return gate * Math.sin(t * 0.9) * 0.5;
}

/**
 * Hitung pose TARGET dari keadaan dunia. Fungsi murni: tanpa NaN untuk input apa pun,
 * menulis ke `out` (dipakai ulang) agar tidak ada alokasi per frame.
 * Prioritas mode: guard > recoil > sit > watch > idle.
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

  const mode: BrukMode = guarding ? 'guard' : env > 0 ? 'recoil' : sitting ? 'sit' : r > 0 ? 'watch' : 'idle';

  const face = sample(FACE, lv);
  const follow = sample(HEAD_FOLLOW, lv);
  const breath = Math.sin(t * 1.1) * 0.5 + 0.5;

  // ── Arah badan ──
  let yaw: number;
  if (mode === 'guard') {
    yaw = baseYaw + angleDiff(fin(inp.guardFacing as number, baseYaw), baseYaw);
  } else if (mode === 'sit') {
    yaw = baseYaw + angleDiff(fin(inp.fireBearing as number, baseYaw), baseYaw);
  } else {
    // Menuju pemain (atau berpaling, tergantung tingkat) hanya dalam jangkauan; memudar halus ke baseYaw.
    const toward = bearing + (1 - face) * AWAY_ANGLE;
    yaw = baseYaw + angleDiff(toward, baseYaw) * r;
  }

  // ── Kepala (relatif badan, dibatasi leher) ──
  let head: number;
  if (mode === 'guard') {
    head = Math.sin(t * 0.5) * 0.4; // menyapu pandang ke arah badai
  } else {
    const relaxed = mode === 'sit' ? 0.6 : 1;
    const toPlayer = clamp(angleDiff(bearing, yaw), -BRUK_HEAD_MAX, BRUK_HEAD_MAX) * follow * r * relaxed;
    head = toPlayer + glance(t) * (1 - r * follow);
  }
  head = clamp(head, -BRUK_HEAD_MAX, BRUK_HEAD_MAX);

  // ── Postur ──
  let lean = sample(LEAN, lv) + (breath - 0.5) * 0.03;
  let arms = sample(ARMS_OPEN, lv);
  if (mode === 'sit') { lean = lean * 0.5 + 0.06; arms *= 0.5; }
  if (mode === 'guard') { lean = 0.03; arms = 0; }
  lean += env * 0.2;
  arms *= 1 - env;

  // ── Cahaya ──
  const pulse = 1 + smoothstep(3, 4, lv) * 0.12 * Math.sin(t * 1.5); // tingkat 4: berdenyut pelan
  let glow = sample(CRACK_GLOW, lv) * pulse;
  let eyeOpen = sample(EYE_OPEN, lv);
  if (mode === 'guard') glow *= 1.1;
  glow *= 1 - 0.35 * env; // terkejut: meredup sesaat
  eyeOpen *= 1 - 0.3 * env;

  out.mode = mode;
  out.yaw = yaw;
  out.headYaw = head;
  out.lean = lean;
  out.glow = glow;
  out.eyeGlow = sample(EYE_GLOW, lv);
  out.eyeOpen = eyeOpen;
  out.crackColor = sampleColor(CRACK_COLOR, lv);
  out.eyeColor = sampleColor(EYE_COLOR, lv);
  out.breath = breath;
  out.arms = arms;
  out.crouch = env;
  out.back = env * BRUK_RECOIL_BACK_M;
  out.sit = mode === 'sit' ? 1 : 0;
  out.guard = mode === 'guard' ? 1 : 0;
  return out;
}

/**
 * Haluskan pose yang dirender (`cur`) menuju pose target (`tgt`). Mengubah `cur` di tempat.
 * Aman untuk dt 0, negatif, NaN, atau sangat besar.
 */
export function smoothPose(cur: BrukPose, tgt: BrukPose, dt: number): BrukPose {
  const d = clamp(fin(dt, 0), 0, 5);
  const k = (lambda: number): number => 1 - Math.exp(-lambda * d);
  cur.mode = tgt.mode;
  cur.yaw = cur.yaw + angleDiff(tgt.yaw, cur.yaw) * k(3); // jalur terpendek, tidak berputar penuh
  if (cur.yaw > Math.PI || cur.yaw < -Math.PI) cur.yaw = wrapAngle(cur.yaw); // cegah drift tak terbatas
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

/**
 * Selang antar pembaruan animasi (detik). Infinity = lewati total (terlalu jauh atau di luar layar).
 * Grafis rendah memperlebar selang.
 */
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

/** Tempat duduk: di sisi api yang menghadap rumah Bruk, radius `radius` dari api. */
export function brukSitSpot(homeX: number, homeZ: number, fireX: number, fireZ: number, radius: number, out: BrukSpot = { x: 0, z: 0 }): BrukSpot {
  let dx = homeX - fireX;
  let dz = homeZ - fireZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) { dx = 0; dz = 1; } else { dx /= len; dz /= len; }
  out.x = fireX + dx * radius;
  out.z = fireZ + dz * radius;
  return out;
}

/** Tempat berjaga: di depan pintu shelter, `radius` dari pusat searah `facing`. */
export function brukGuardSpot(shelterX: number, shelterZ: number, facing: number, radius: number, out: BrukSpot = { x: 0, z: 0 }): BrukSpot {
  out.x = shelterX + Math.sin(facing) * radius;
  out.z = shelterZ + Math.cos(facing) * radius;
  return out;
}
