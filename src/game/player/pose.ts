/**
 * Pose manusia untuk rig penjelajah buatan-kode (pemain lokal DAN pemain jauh).
 *
 * Kenapa file ini ada: animasi lama hanya memutar 4 anggota badan kaku (tanpa siku/lutut,
 * tanpa putaran badan, ayunan tangan ±0,56 rad) sehingga larinya seperti robot.
 * Di sini tiap sendi punya peran:
 *   - pinggul & dada berputar BERLAWANAN (kaki kiri maju -> bahu kanan maju)
 *   - paha, lutut, pergelangan kaki: lutut menekuk saat kaki mengayun, telapak mengikuti
 *   - bahu & siku: ayunan tangan lebar, siku menekuk makin dalam saat lari
 *   - kepala distabilkan (tidak ikut goyang), tinggi pinggul dihitung dari panjang kaki
 *     sehingga telapak tidak melayang/menembus tanah
 *   - idle bernapas + berpindah tumpuan + menoleh; lompat/jatuh/mendarat/renang punya pose sendiri
 *   - aksi (menambang, memungut, minum, membuka, membangun) = lapisan pose bertumpuk di atas gerak dasar
 *
 * Konvensi arah (nilai "alami", dikonversi ke rotation.x saat diterapkan):
 *   sh (bahu)  : + = lengan terangkat ke DEPAN       -> rotation.x = -sh
 *   elbow      : + = siku menekuk                      -> rotation.x = -elbow
 *   thigh      : + = paha maju                         -> rotation.x = -thigh
 *   knee       : + = lutut menekuk (betis ke belakang) -> rotation.x = +knee
 *   ankle      : + = ujung kaki turun                  -> rotation.x = +ankle
 *   shZ / thighZ : + = menjauh dari badan; shY : + = lengan memutar ke dalam
 *
 * Modul ini TIDAK mengimpor three: cukup objek berisi rotation/position, jadi bisa dites murni.
 */
import { clamp, damp, lerp, smoothstep } from '../utils/math';

interface Vec { x: number; y: number; z: number }
interface JointNode { rotation: Vec; position: Vec }

export interface PoseRig {
  bodyPivot: JointNode;
  torsoGroup: JointNode;
  chestGroup: JointNode;
  headGroup: JointNode;
  leftArm: JointNode;
  rightArm: JointNode;
  leftElbow: JointNode;
  rightElbow: JointNode;
  leftLeg: JointNode;
  rightLeg: JointNode;
  leftKnee: JointNode;
  rightKnee: JointNode;
  leftAnkle: JointNode;
  rightAnkle: JointNode;
  /** Opsional: 0 = mata terbuka, 1 = terpejam. */
  setBlink?: (amount: number) => void;
}

export type ActionKind = 'mine' | 'gather' | 'drink' | 'use' | 'build';

/** Lama tiap aksi (detik). */
export const ACTION_DURATION: Record<ActionKind, number> = {
  mine: 0.7,
  gather: 0.85,
  drink: 1.1,
  use: 0.7,
  build: 1.2,
};

/** Pilih gerakan yang cocok untuk jenis benda interaktif di dunia. */
export function actionKindFor(targetKind: string, hasTool: boolean): ActionKind {
  switch (targetKind) {
    case 'rock':
    case 'mineral':
    case 'obsidian':
    case 'meteor_iron':
    case 'crystal':
      return hasTool ? 'mine' : 'gather';
    case 'salt':
      return 'gather';
    case 'water':
    case 'geyser_pool':
      return 'drink';
    case 'garden_plot':
      return 'gather';
    default:
      return 'use';
  }
}

interface SidePose {
  sh: number;
  shZ: number;
  shY: number;
  elbow: number;
  thigh: number;
  thighZ: number;
  knee: number;
  ankle: number;
}

export interface Pose {
  hipsX: number; hipsY: number; hipsZ: number; hipsPX: number;
  chestX: number; chestY: number; chestZ: number;
  headX: number; headY: number; headZ: number;
  L: SidePose;
  R: SidePose;
}

const side = (): SidePose => ({ sh: 0, shZ: 0, shY: 0, elbow: 0, thigh: 0, thighZ: 0, knee: 0, ankle: 0 });
export const createPose = (): Pose => ({
  hipsX: 0, hipsY: 0, hipsZ: 0, hipsPX: 0,
  chestX: 0, chestY: 0, chestZ: 0,
  headX: 0, headY: 0, headZ: 0,
  L: side(), R: side(),
});

const SIDE_KEYS: (keyof SidePose)[] = ['sh', 'shZ', 'shY', 'elbow', 'thigh', 'thighZ', 'knee', 'ankle'];
const LOWER: ReadonlySet<keyof SidePose> = new Set(['thigh', 'thighZ', 'knee', 'ankle']);

/** a <- lerp(a, b): bobot terpisah untuk tubuh atas (lengan, dada, kepala, pinggul) dan kaki. */
function mix(a: Pose, b: Pose, wUpper: number, wLower: number): void {
  const u = clamp(wUpper, 0, 1);
  const l = clamp(wLower, 0, 1);
  a.hipsX = lerp(a.hipsX, b.hipsX, u); a.hipsY = lerp(a.hipsY, b.hipsY, u);
  a.hipsZ = lerp(a.hipsZ, b.hipsZ, u); a.hipsPX = lerp(a.hipsPX, b.hipsPX, u);
  a.chestX = lerp(a.chestX, b.chestX, u); a.chestY = lerp(a.chestY, b.chestY, u); a.chestZ = lerp(a.chestZ, b.chestZ, u);
  a.headX = lerp(a.headX, b.headX, u); a.headY = lerp(a.headY, b.headY, u); a.headZ = lerp(a.headZ, b.headZ, u);
  for (const s of ['L', 'R'] as const) {
    for (const k of SIDE_KEYS) a[s][k] = lerp(a[s][k], b[s][k], LOWER.has(k) ? l : u);
  }
}

function copyPose(dst: Pose, src: Pose): void {
  dst.hipsX = src.hipsX; dst.hipsY = src.hipsY; dst.hipsZ = src.hipsZ; dst.hipsPX = src.hipsPX;
  dst.chestX = src.chestX; dst.chestY = src.chestY; dst.chestZ = src.chestZ;
  dst.headX = src.headX; dst.headY = src.headY; dst.headZ = src.headZ;
  for (const s of ['L', 'R'] as const) for (const k of SIDE_KEYS) dst[s][k] = src[s][k];
}

type Key = readonly [number, number];
/** Interpolasi halus antar-kunci waktu (kecepatan nol di tiap kunci -> ayunan "berhenti sesaat" di puncak). */
function keys(t: number, k: readonly Key[]): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (u * u * (3 - 2 * u));
    }
  }
  return k[k.length - 1][1];
}

// ---------------------------------------------------------------- pose dasar

function idlePose(p: Pose, t: number, lookYaw: number): void {
  const breathe = Math.sin(t * 1.7);
  const shift = Math.sin(t * 0.45); // pindah tumpuan kaki pelan
  p.hipsX = 0.02; p.hipsY = 0; p.hipsZ = 0.03 * shift; p.hipsPX = 0.02 * shift;
  p.chestX = 0.015 * breathe; p.chestY = 0.03 * Math.sin(t * 0.3); p.chestZ = -0.6 * p.hipsZ;
  p.headX = 0.05 * Math.sin(t * 0.23);
  p.headY = lookYaw + 0.4 * Math.sin(t * 0.31) * Math.sin(t * 0.11 + 1);
  p.headZ = 0.02 * Math.sin(t * 0.19);
  const kL = 0.04 + 0.08 * Math.max(0, -shift);
  const kR = 0.04 + 0.08 * Math.max(0, shift);
  p.L.thigh = 0.03 + 0.2 * kL; p.R.thigh = 0.03 + 0.2 * kR;
  p.L.knee = kL; p.R.knee = kR;
  p.L.ankle = p.L.thigh - 0.5 * kL; p.R.ankle = p.R.thigh - 0.5 * kR;
  p.L.thighZ = 0.03; p.R.thighZ = 0.03;
  for (const [s, ph] of [[p.L, 0], [p.R, 1.4]] as const) {
    s.sh = 0.03 * breathe + 0.02 * shift * (ph ? -1 : 1);
    s.shZ = 0.09 + 0.01 * breathe;
    s.shY = 0.05;
    s.elbow = 0.16 + 0.03 * breathe;
  }
}

/** Jalan/lari. `run` 0..1 (jalan cepat -> sprint). Mengisi amplitudo penuh; pencampuran dengan idle di luar. */
function locoPose(p: Pose, phase: number, speed: number, run: number, lookYaw: number): void {
  const A = clamp(0.2 + 0.07 * speed, 0.2, 0.95);       // ayun paha
  const Sa = clamp(0.3 + 0.115 * speed, 0.3, 1.3);       // ayun bahu (lebar, mirip manusia)
  const kAmp = lerp(0.85, 1.75, run);                    // tekukan lutut saat mengayun
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  const legs: [SidePose, number, number][] = [[p.L, phase, 1], [p.R, phase + Math.PI, -1]];
  for (const [leg, ph, sg] of legs) {
    const f = A * sg * s + run * 0.22;
    const swingFlex = 0.5 + 0.5 * Math.cos(ph + 0.5);
    const k = 0.06 + run * 0.2 + kAmp * swingFlex * swingFlex;
    leg.thigh = f;
    leg.knee = k;
    leg.ankle = clamp(f - 0.5 * k, -0.35, 0.6);
    leg.thighZ = 0.03 + 0.02 * run;
  }

  // Tangan berlawanan dengan kaki di sisi yang sama
  p.L.sh = -Sa * s + run * 0.3;
  p.R.sh = Sa * s + run * 0.3;
  for (const arm of [p.L, p.R]) {
    const forward = clamp((arm.sh - run * 0.3) / Sa, 0, 1);
    arm.elbow = 0.2 + 0.85 * run + 0.35 * forward * (0.4 + 0.6 * run);
    arm.shZ = 0.06 + 0.05 * run;
    arm.shY = run * 0.25;
  }

  // Putaran badan berlawanan + sedikit goyang panggul
  const tw = 0.06 + 0.12 * run;
  p.hipsX = 0.04 + 0.22 * run;
  p.hipsY = tw * s;
  p.chestY = -1.6 * tw * s;
  p.hipsZ = 0.035 * c;
  p.chestZ = -0.7 * p.hipsZ;
  p.hipsPX = 0.02 * c;
  p.chestX = 0.03 + 0.06 * run;

  // Kepala tetap menghadap ke depan walau badan memutar
  p.headX = -(p.hipsX + p.chestX) * 0.85;
  p.headY = lookYaw - 0.8 * (p.hipsY + p.chestY);
  p.headZ = -0.7 * (p.hipsZ + p.chestZ);
}

function airPose(p: Pose, vy: number, lookYaw: number): void {
  const up = smoothstep(-1.5, 3.5, vy); // 1 = sedang naik, 0 = jatuh
  p.L.thigh = lerp(0.35, 0.95, up); p.L.knee = lerp(0.45, 1.25, up); p.L.ankle = lerp(0.35, 0.2, up);
  p.R.thigh = lerp(0.1, -0.3, up); p.R.knee = lerp(0.35, 0.75, up); p.R.ankle = lerp(0.4, 0.5, up);
  p.L.thighZ = 0.08; p.R.thighZ = 0.12;
  // Naik: tangan terangkat; jatuh: tangan terentang untuk keseimbangan
  p.L.sh = lerp(0.55, 1.6, up); p.R.sh = lerp(0.35, 1.45, up);
  p.L.shZ = lerp(1.0, 0.5, up); p.R.shZ = lerp(1.1, 0.6, up);
  p.L.shY = 0; p.R.shY = 0;
  p.L.elbow = lerp(0.2, 0.55, up); p.R.elbow = lerp(0.3, 0.45, up);
  p.hipsX = lerp(0.1, 0.02, up); p.hipsY = 0; p.hipsZ = 0; p.hipsPX = 0;
  p.chestX = lerp(0.05, -0.05, up); p.chestY = 0; p.chestZ = 0;
  p.headX = lerp(-0.1, -0.15, up); p.headY = lookYaw; p.headZ = 0;
}

function swimPose(p: Pose, ph: number, lookYaw: number): void {
  const arms: [SidePose, number][] = [[p.L, ph], [p.R, ph + Math.PI]];
  for (const [arm, a] of arms) {
    arm.sh = a;                                   // lingkaran penuh (renang gaya bebas)
    arm.elbow = 0.25 + 0.75 * Math.max(0, -Math.cos(a));
    arm.shZ = 0.12; arm.shY = 0;
  }
  const kick = ph * 1.7;
  p.L.thigh = -0.4 + 0.3 * Math.sin(kick); p.R.thigh = -0.4 - 0.3 * Math.sin(kick);
  p.L.knee = 0.3 + 0.25 * Math.sin(kick + 1); p.R.knee = 0.3 + 0.25 * Math.sin(kick + 1 + Math.PI);
  p.L.ankle = 0.5; p.R.ankle = 0.5;
  p.L.thighZ = 0.03; p.R.thighZ = 0.03;
  p.hipsX = 0.95; p.hipsY = 0.12 * Math.sin(ph); p.hipsZ = 0.1 * Math.sin(ph); p.hipsPX = 0;
  p.chestX = 0.15; p.chestY = -0.2 * Math.sin(ph); p.chestZ = -0.5 * p.hipsZ;
  p.headX = -0.88; p.headY = lookYaw * 0.3 + 0.35 * Math.sin(ph); p.headZ = 0;
}

/** Jongkok/mendarat: kedua kaki menekuk, badan condong, tangan terulur sedikit. c = 0..1 */
function squat(p: Pose, c: number): void {
  for (const leg of [p.L, p.R]) {
    leg.thigh = 0.9 * c; leg.knee = 1.5 * c; leg.ankle = -0.6 * c; leg.thighZ = 0.03 + 0.1 * c;
  }
  p.hipsX = 0.02 + 0.45 * c;
  p.chestX = 0.015 + 0.1 * c;
}

// ---------------------------------------------------------------- aksi (lapisan atas)

/** Mengisi pose aksi penuh pada `p` (nilai absolut); pemanggil mencampurnya dengan bobot. t = 0..1 */
function actionPose(p: Pose, kind: ActionKind, t: number): void {
  switch (kind) {
    case 'mine': {
      // Angkat kapak/beliung di atas kepala -> ayun cepat -> pulih. Dua tangan, badan melecut.
      p.R.sh = keys(t, [[0, 0.1], [0.42, 2.7], [0.55, 0.5], [1, 0.1]]);
      p.R.elbow = keys(t, [[0, 0.2], [0.42, 1.5], [0.55, 0.25], [1, 0.2]]);
      p.L.sh = keys(t, [[0, 0.1], [0.42, 2.3], [0.55, 0.7], [1, 0.1]]);
      p.L.elbow = keys(t, [[0, 0.2], [0.42, 1.3], [0.55, 0.3], [1, 0.2]]);
      p.L.shZ = keys(t, [[0, 0.09], [0.42, -0.25], [0.55, -0.2], [1, 0.09]]); // melewati badan = menyilang ke dalam
      p.R.shZ = keys(t, [[0, 0.09], [0.42, -0.1], [0.55, 0.1], [1, 0.09]]);
      p.hipsX = keys(t, [[0, 0.02], [0.42, -0.05], [0.55, 0.28], [1, 0.02]]);
      p.chestX = keys(t, [[0, 0.015], [0.42, -0.22], [0.55, 0.5], [1, 0.015]]);
      p.chestY = keys(t, [[0, 0], [0.42, 0.25], [0.55, -0.2], [1, 0]]);
      p.hipsY = keys(t, [[0, 0], [0.42, -0.1], [0.55, 0.12], [1, 0]]);
      p.headX = keys(t, [[0, 0], [0.42, -0.15], [0.55, 0.1], [1, 0]]);
      squat(p, keys(t, [[0, 0], [0.42, 0.1], [0.55, 0.45], [1, 0.05]]));
      break;
    }
    case 'gather': {
      // Jongkok, jangkau ke bawah, ambil, berdiri sambil membawa tangan ke dada.
      const c = keys(t, [[0, 0], [0.3, 1], [0.62, 1], [1, 0]]);
      squat(p, c * 0.9);
      p.chestX += 0.35 * c;
      p.R.sh = keys(t, [[0, 0.1], [0.3, 1.2], [0.5, 1.25], [0.7, 0.5], [1, 0.1]]);
      p.R.elbow = keys(t, [[0, 0.2], [0.3, 0.35], [0.5, 0.3], [0.7, 1.6], [1, 0.2]]);
      p.L.sh = 0.1 + 0.45 * c; p.L.elbow = 0.2 + 0.2 * c; p.L.shZ = 0.09 + 0.2 * c;
      p.headX = -0.3 * c;
      p.hipsY = 0.1 * c; p.chestY = -0.1 * c;
      break;
    }
    case 'drink': {
      // Jongkok di tepi air, cedok dengan kedua telapak, angkat ke mulut sambil mendongak.
      const c = keys(t, [[0, 0], [0.3, 0.8], [0.75, 0.8], [1, 0]]);
      squat(p, c);
      p.chestX += keys(t, [[0, 0], [0.3, 0.45], [0.75, 0.2], [1, 0]]);
      const sh = keys(t, [[0, 0.1], [0.3, 1.0], [0.5, 0.9], [0.75, 1.5], [1, 0.1]]);
      const el = keys(t, [[0, 0.2], [0.3, 0.2], [0.5, 0.3], [0.75, 2.1], [1, 0.2]]);
      for (const arm of [p.L, p.R]) { arm.sh = sh; arm.elbow = el; arm.shZ = 0.05; arm.shY = 0.35 * c; }
      p.headX = keys(t, [[0, 0], [0.3, -0.25], [0.5, -0.2], [0.75, -0.55], [1, 0]]);
      break;
    }
    case 'build': {
      // Berjongkok sedikit, palu tiga kali dengan tangan kanan, tangan kiri menahan.
      const c = keys(t, [[0, 0], [0.15, 0.35], [0.85, 0.35], [1, 0]]);
      squat(p, c);
      p.R.sh = keys(t, [[0, 0.1], [0.12, 1.9], [0.25, 0.8], [0.38, 1.9], [0.5, 0.8], [0.62, 1.9], [0.74, 0.8], [0.9, 0.9], [1, 0.1]]);
      p.R.elbow = keys(t, [[0, 0.2], [0.12, 1.2], [0.25, 0.4], [0.38, 1.2], [0.5, 0.4], [0.62, 1.2], [0.74, 0.4], [0.9, 0.5], [1, 0.2]]);
      const hold = c / 0.35; // 0..1
      p.L.sh = 0.1 + 0.9 * hold; p.L.elbow = 0.2 + 0.4 * hold; p.L.shZ = 0.05; p.L.shY = 0.2 * hold;
      p.chestX += 0.35 * c + 0.06 * Math.sin(t * Math.PI * 6);
      p.headX = -0.3 * c;
      break;
    }
    case 'use':
    default: {
      // Membuka/menekan sesuatu di depan: kedua tangan terulur, badan sedikit condong.
      const e = keys(t, [[0, 0], [0.3, 1], [0.65, 1], [1, 0]]);
      p.L.sh = 0.1 + 1.05 * e; p.R.sh = 0.1 + 1.1 * e;
      p.L.elbow = 0.2 + 0.15 * e; p.R.elbow = 0.2 + 0.2 * e;
      p.L.shZ = 0.09 + 0.06 * e; p.R.shZ = 0.09 + 0.06 * e;
      p.hipsX = 0.02 + 0.08 * e; p.chestX = 0.015 + 0.12 * e;
      p.headX = -0.1 * e;
      break;
    }
  }
}

// ---------------------------------------------------------------- penerap pose ke rig

export interface PoseInput {
  speed: number;
  grounded: boolean;
  swimming: boolean;
  verticalSpeed: number;
  lookYaw: number;
  /** Skala tinggi badan (agar penurunan pinggul ikut terskala). */
  heightScale: number;
  /** Aksi yang sedang berjalan; t = 0..1 (kemajuan). */
  action: { kind: ActionKind; t: number } | null;
  /** Bobot jongkok-mendarat 0..1 (dihitung pemanggil dari waktu sejak mendarat). */
  landWeight: number;
}

const LEG_UPPER = 0.44;
const LEG_LOWER = 0.46; // betis + telapak; total 0,90 = tinggi pinggul

export class HumanPoser {
  private phase = 0;
  private swimPhase = 0;
  private moveW = 0;
  private runW = 0;
  private bodyY = 0;
  private wasSwimming = false;
  private blinkIn = 2.5;
  private blinkT = -1;
  private readonly target = createPose();
  private readonly idle = createPose();
  private readonly loco = createPose();
  private readonly layer = createPose();

  /** Kembalikan ke posisi netral tanpa transisi (mis. setelah teleport / respawn). */
  reset(): void {
    this.moveW = 0;
    this.runW = 0;
    this.bodyY = 0;
  }

  update(rig: PoseRig, inp: PoseInput, dt: number, elapsed: number): void {
    const sp = inp.speed;
    this.moveW = damp(this.moveW, smoothstep(0.2, 1.0, sp), 9, dt);
    this.runW = damp(this.runW, smoothstep(4.6, 8.4, sp), 6, dt);
    const lookYaw = clamp(inp.lookYaw, -0.6, 0.6);
    const tg = this.target;

    // Keluar dari air: lengan renang sudah berputar berkali-kali; lipat ke sudut terdekat agar tidak berputar balik.
    if (this.wasSwimming && !inp.swimming) {
      for (const a of [rig.leftArm, rig.rightArm]) {
        a.rotation.x = ((((a.rotation.x + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      }
    }
    this.wasSwimming = inp.swimming;

    if (inp.swimming) {
      this.swimPhase += Math.max(2.4, sp * 1.5) * dt;
      swimPose(tg, this.swimPhase, lookYaw);
    } else if (!inp.grounded) {
      airPose(tg, inp.verticalSpeed, lookYaw);
    } else {
      if (sp > 0.25) this.phase += Math.PI * 2 * (0.9 + 0.2 * sp) * dt;
      idlePose(this.idle, elapsed, lookYaw);
      locoPose(this.loco, this.phase, Math.max(sp, 1.0), this.runW, lookYaw);
      copyPose(tg, this.idle);
      mix(tg, this.loco, this.moveW, this.moveW);

      if (inp.landWeight > 0.001) {
        const c = 0.7 * inp.landWeight;
        copyPose(this.layer, tg);
        squat(this.layer, c);
        this.layer.L.sh = lerp(tg.L.sh, 0.5, inp.landWeight); this.layer.R.sh = lerp(tg.R.sh, 0.5, inp.landWeight);
        this.layer.L.shZ = tg.L.shZ + 0.35 * inp.landWeight; this.layer.R.shZ = tg.R.shZ + 0.35 * inp.landWeight;
        this.layer.headX = -0.3 * c;
        const w = Math.min(1, inp.landWeight * 1.3);
        mix(tg, this.layer, w, w);
      }

      if (inp.action) {
        const t = clamp(inp.action.t, 0, 1);
        const env = smoothstep(0, 0.08, t) * (1 - smoothstep(0.92, 1, t));
        copyPose(this.layer, tg);
        actionPose(this.layer, inp.action.kind, t);
        mix(tg, this.layer, env, env * (1 - 0.75 * this.moveW)); // kaki tetap berlari kalau sambil bergerak
      }
    }

    this.apply(rig, tg, inp, dt, elapsed);
    this.blink(rig, dt);
  }

  /** Kedip acak tiap 2,5-6 dtk (sesekali dua kali berturut-turut); lama kedip 0,16 dtk. */
  private blink(rig: PoseRig, dt: number): void {
    if (!rig.setBlink) return;
    if (this.blinkT < 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) this.blinkT = 0;
      else return;
    }
    this.blinkT += dt;
    const u = this.blinkT / 0.16;
    if (u >= 1) {
      this.blinkT = -1;
      this.blinkIn = Math.random() < 0.2 ? 0.12 : 2.5 + Math.random() * 3.5;
      rig.setBlink(0);
      return;
    }
    rig.setBlink(Math.sin(u * Math.PI));
  }

  private apply(rig: PoseRig, p: Pose, inp: PoseInput, dt: number, elapsed: number): void {
    const rArm = 28; // tangan lincah
    const rLeg = 26;
    const rBody = 16;

    rig.torsoGroup.rotation.x = damp(rig.torsoGroup.rotation.x, p.hipsX, rBody, dt);
    rig.torsoGroup.rotation.y = damp(rig.torsoGroup.rotation.y, p.hipsY, rBody, dt);
    rig.torsoGroup.rotation.z = damp(rig.torsoGroup.rotation.z, p.hipsZ, rBody, dt);
    rig.torsoGroup.position.x = damp(rig.torsoGroup.position.x, p.hipsPX, rBody, dt);
    rig.chestGroup.rotation.x = damp(rig.chestGroup.rotation.x, p.chestX, rBody, dt);
    rig.chestGroup.rotation.y = damp(rig.chestGroup.rotation.y, p.chestY, rBody, dt);
    rig.chestGroup.rotation.z = damp(rig.chestGroup.rotation.z, p.chestZ, rBody, dt);
    rig.headGroup.rotation.x = damp(rig.headGroup.rotation.x, p.headX, 12, dt);
    rig.headGroup.rotation.y = damp(rig.headGroup.rotation.y, p.headY, 12, dt);
    rig.headGroup.rotation.z = damp(rig.headGroup.rotation.z, p.headZ, 12, dt);

    const arm = (shoulder: JointNode, elbow: JointNode, s: SidePose, sign: 1 | -1) => {
      shoulder.rotation.x = damp(shoulder.rotation.x, -s.sh, rArm, dt);
      shoulder.rotation.y = damp(shoulder.rotation.y, -sign * s.shY, rArm, dt);
      shoulder.rotation.z = damp(shoulder.rotation.z, sign * s.shZ, rArm, dt);
      elbow.rotation.x = damp(elbow.rotation.x, -s.elbow, rArm, dt);
    };
    // sign: kiri = -1 (sisi -x). "Menjauh": kiri rotation.z negatif; "ke dalam": kiri rotation.y positif.
    arm(rig.leftArm, rig.leftElbow, p.L, -1);
    arm(rig.rightArm, rig.rightElbow, p.R, 1);

    const leg = (hip: JointNode, knee: JointNode, ankle: JointNode, s: SidePose, sign: 1 | -1) => {
      hip.rotation.x = damp(hip.rotation.x, -s.thigh, rLeg, dt);
      hip.rotation.z = damp(hip.rotation.z, sign * s.thighZ, rLeg, dt);
      knee.rotation.x = damp(knee.rotation.x, s.knee, rLeg, dt);
      ankle.rotation.x = damp(ankle.rotation.x, s.ankle, rLeg, dt);
    };
    leg(rig.leftLeg, rig.leftKnee, rig.leftAnkle, p.L, -1);
    leg(rig.rightLeg, rig.rightKnee, rig.rightAnkle, p.R, 1);

    // Tinggi pinggul: turun secukupnya agar kaki yang menapak tetap menyentuh tanah.
    let targetY: number;
    if (inp.swimming) {
      targetY = Math.sin(elapsed * 3.2) * 0.06;
    } else if (!inp.grounded) {
      targetY = 0;
    } else {
      const ext = (hip: JointNode, knee: JointNode) =>
        LEG_UPPER * Math.cos(hip.rotation.x) + LEG_LOWER * Math.cos(hip.rotation.x + knee.rotation.x);
      const reach = Math.max(ext(rig.leftLeg, rig.leftKnee), ext(rig.rightLeg, rig.rightKnee));
      // Lari: ada fase melayang, pinggul naik sedikit saat kaki terentang.
      const flight = 0.07 * this.runW * Math.abs(Math.sin(this.phase));
      targetY = (reach - (LEG_UPPER + LEG_LOWER)) * inp.heightScale + flight;
    }
    this.bodyY = damp(this.bodyY, targetY, 30, dt);
    rig.bodyPivot.position.y = this.bodyY;
  }
}
