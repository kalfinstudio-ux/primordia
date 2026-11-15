/**
 * Bruk tingkat 2 (M3) — logika MURNI penempatan & konteks dunia (tanpa three), dites di brukWorld.test.ts.
 * `world/brukBody.ts` memakai ini untuk: memilih rumah di rim kawah, melacak api pertama yang DISAKSIKAN,
 * memilih tempat duduk/berjaga, dan melangkah menuju tempat itu.
 */
import type { WeatherType } from '../config';
import { shelterDoorWorld } from '../world/shelterLayout';
import { bearingTo, brukGuardSpot, brukSitSpot, wrapAngle, type BrukMode, type BrukSpot } from './brukBehavior';

/** Jarak rumah Bruk dari pusat kawah (rim kawah ada di 12,5 m; rumah di lereng luar yang lebih landai). */
export const BRUK_HOME_RADII: readonly number[] = [16, 19];
/** Sudut pencarian rumah relatif arah ke pemain (derajat). */
export const BRUK_HOME_OFFSETS_DEG: readonly number[] = [0, 20, -20, 40, -40, 60, -60, 80, -80];
/** Kecepatan jalan Bruk menuju api/shelter (m/dtk). */
export const BRUK_WALK_SPEED = 2.6;
/** Jarak duduk dari api (m). */
export const BRUK_SIT_RADIUS = 3.4;
/** Jarak berjaga dari pusat shelter, searah pintu (m). */
export const BRUK_GUARD_RADIUS = 3.6;
/** Api/shelter hanya diperhitungkan bila dalam jarak ini dari rumah (m). */
export const BRUK_TETHER = 120;
/** Radius tabrakan tubuh (m) — pemain tidak bisa menembus. */
export const BRUK_COLLIDER_RADIUS = 1.3;
/** Pemain dianggap berada di dalam shelter bila dalam jarak ini (m); sama dengan BrukSystem. */
export const BRUK_SHELTER_PLAYER_RADIUS = 4.5;

const STORM_WEATHER: ReadonlySet<string> = new Set<WeatherType>(['ash_storm', 'acid_rain', 'electrical_storm', 'meteor_shower']);
export function isStormWeather(w: string): boolean {
  return STORM_WEATHER.has(w);
}

export interface HomeSampler {
  height(x: number, z: number): number;
  slopeDeg(x: number, z: number): number;
}

export interface BrukHome {
  x: number;
  z: number;
  /** Arah hadap istirahat: menatap pusat kawah. */
  yaw: number;
}

/**
 * Pilih rumah Bruk: titik di lereng luar kawah yang paling landai, di sisi yang menghadap pemain.
 * Deterministik. Titik di air atau terlalu curam (>28°) dilewati; bila semua gagal, pakai arah langsung.
 */
export function pickBrukHome(
  crater: { x: number; z: number },
  toward: { x: number; z: number },
  sampler: HomeSampler,
  waterLevel: number
): BrukHome {
  const base = bearingTo(crater.x, crater.z, toward.x, toward.z);
  let best: { x: number; z: number; score: number } | null = null;
  for (const r of BRUK_HOME_RADII) {
    for (const deg of BRUK_HOME_OFFSETS_DEG) {
      const a = base + (deg * Math.PI) / 180;
      const x = crater.x + Math.sin(a) * r;
      const z = crater.z + Math.cos(a) * r;
      const h = sampler.height(x, z);
      const slope = sampler.slopeDeg(x, z);
      if (!Number.isFinite(h) || !Number.isFinite(slope) || h < waterLevel + 0.6 || slope > 28) continue;
      const score = slope + Math.abs(deg) * 0.08 + (r - BRUK_HOME_RADII[0]) * 0.3;
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  const x = best ? best.x : crater.x + Math.sin(base) * BRUK_HOME_RADII[0];
  const z = best ? best.z : crater.z + Math.cos(base) * BRUK_HOME_RADII[0];
  return { x, z, yaw: bearingTo(x, z, crater.x, crater.z) };
}

export interface PosLike {
  type: string;
  x: number;
  z: number;
}

/** Struktur bertipe tertentu yang terdekat dari (x,z) dalam `maxDist`; null bila tidak ada. */
export function nearestStruct<T extends PosLike>(structs: readonly T[], types: readonly string[], x: number, z: number, maxDist: number): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const s of structs) {
    if (!types.includes(s.type)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * Melacak api pertama yang DISAKSIKAN pemain. Api yang sudah ada saat dunia dimuat tidak dihitung
 * (tidak ada recoil untuk save yang dimuat); hanya transisi 0 → ≥1 selama sesi.
 */
export class FirstFireTracker {
  private prev: number | null = null;
  private at: number | null = null;

  reset(campfireCount: number): void {
    this.prev = campfireCount;
    this.at = null;
  }

  /** Detik sejak api pertama dipasang di sesi ini; null bila tidak disaksikan. */
  update(campfireCount: number, elapsed: number): number | null {
    if (this.prev === null) this.prev = campfireCount;
    if (this.prev === 0 && campfireCount > 0 && this.at === null) this.at = elapsed;
    this.prev = campfireCount;
    return this.at === null ? null : Math.max(0, elapsed - this.at);
  }
}

export interface ShelterPos extends PosLike {
  rotY: number;
}

/** Arah (rad) dari pusat shelter ke pintunya = arah hadap saat berjaga. */
export function shelterDoorFacing(s: ShelterPos): number {
  const d = shelterDoorWorld(s);
  return bearingTo(s.x, s.z, d.x, d.z);
}

export interface TargetSpotInput {
  mode: BrukMode;
  home: { x: number; z: number };
  fire: { x: number; z: number } | null;
  shelter: ShelterPos | null;
  guardFacing: number | null;
}

/** Posisi yang dituju Bruk menurut mode pose: duduk di dekat api, berjaga di pintu shelter, atau rumah. */
export function brukTargetSpot(inp: TargetSpotInput, out: BrukSpot = { x: 0, z: 0 }): BrukSpot {
  if (inp.mode === 'sit' && inp.fire) return brukSitSpot(inp.home.x, inp.home.z, inp.fire.x, inp.fire.z, BRUK_SIT_RADIUS, out);
  if (inp.mode === 'guard' && inp.shelter && inp.guardFacing !== null) {
    return brukGuardSpot(inp.shelter.x, inp.shelter.z, inp.guardFacing, BRUK_GUARD_RADIUS, out);
  }
  out.x = inp.home.x;
  out.z = inp.home.z;
  return out;
}

export interface StepResult {
  /** Jarak yang ditempuh langkah ini (m). */
  moved: number;
  /** Arah jalan (rad), hanya bermakna bila moved > 0. */
  heading: number;
  /** Sisa jarak ke target setelah langkah (m). */
  remaining: number;
}

/** Majukan `cur` menuju (tx,tz) dengan kecepatan tetap; tidak pernah melewati target. Aman untuk dt ≤ 0/NaN. */
export function stepToward(cur: BrukSpot, tx: number, tz: number, speed: number, dt: number, out: StepResult = { moved: 0, heading: 0, remaining: 0 }): StepResult {
  const dx = tx - cur.x;
  const dz = tz - cur.z;
  const dist = Math.hypot(dx, dz);
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dist, Math.max(0, speed) * Math.min(dt, 0.25)) : 0;
  if (dist > 1e-6 && step > 0) {
    cur.x += (dx / dist) * step;
    cur.z += (dz / dist) * step;
  }
  out.moved = step;
  out.heading = dist > 1e-6 ? wrapAngle(Math.atan2(dx, dz)) : 0;
  out.remaining = Math.max(0, dist - step);
  return out;
}
