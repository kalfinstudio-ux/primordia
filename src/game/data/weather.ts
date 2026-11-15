import type { WeatherType } from '../config';

export const WEATHER_TYPES: readonly WeatherType[] = [
  'clear_haze',
  'ash_storm',
  'acid_rain',
  'electrical_storm',
  'meteor_shower',
];

/** In-game speed of sound for thunder propagation (meters/second). */
export const THUNDER_SPEED_OF_SOUND_M_S = 120;

export const DEFAULT_WEATHER_TRANSITION_SEC = 30;

export type WeatherWeights = Record<WeatherType, number>;

export interface WindVector {
  x: number;
  z: number;
  strength: number;
}

export function createWeatherWeights(active: WeatherType = 'clear_haze'): WeatherWeights {
  return {
    clear_haze: active === 'clear_haze' ? 1 : 0,
    ash_storm: active === 'ash_storm' ? 1 : 0,
    acid_rain: active === 'acid_rain' ? 1 : 0,
    electrical_storm: active === 'electrical_storm' ? 1 : 0,
    meteor_shower: active === 'meteor_shower' ? 1 : 0,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function smoothstep01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * Pure weather crossfade state machine.
 * Computes monotonic 0..1 crossfade weights summing to 1 between weather states.
 */
export class WeatherBlend {
  private from: WeatherType;
  private to: WeatherType;
  private progress: number;
  readonly transitionSec: number;

  constructor(initial: WeatherType = 'clear_haze', transitionSec = DEFAULT_WEATHER_TRANSITION_SEC) {
    this.from = initial;
    this.to = initial;
    this.progress = 1;
    this.transitionSec = Number.isFinite(transitionSec) && transitionSec > 0 ? transitionSec : DEFAULT_WEATHER_TRANSITION_SEC;
  }

  get currentTarget(): WeatherType {
    return this.to;
  }

  get currentFrom(): WeatherType {
    return this.from;
  }

  get normalizedProgress(): number {
    return this.progress;
  }

  /** Switch to a new target weather (or snap immediately when starting mid-cycle). */
  setTarget(next: WeatherType, immediate = false): void {
    if (immediate) {
      this.from = next;
      this.to = next;
      this.progress = 1;
      return;
    }
    if (next === this.to) return;
    if (this.progress >= 1) {
      this.from = this.to;
      this.to = next;
      this.progress = 0;
      return;
    }
    // Mid-transition retarget: anchor `from` to current dominant state cleanly
    this.from = this.progress >= 0.5 ? this.to : this.from;
    this.to = next;
    this.progress = this.from === next ? 1 : 0;
  }

  /** Advance transition by `dt` seconds. Ignores zero, negative, or non-finite values. */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.progress >= 1) {
      this.from = this.to;
      return;
    }
    this.progress = clamp01(this.progress + dt / this.transitionSec);
    if (this.progress >= 1) {
      this.from = this.to;
    }
  }

  dominant(): WeatherType {
    return this.progress >= 0.5 ? this.to : this.from;
  }

  /** Fill an existing weight map with zero heap allocations. */
  fillWeights(out: WeatherWeights): WeatherWeights {
    out.clear_haze = 0;
    out.ash_storm = 0;
    out.acid_rain = 0;
    out.electrical_storm = 0;
    out.meteor_shower = 0;

    if (this.from === this.to || this.progress >= 1) {
      out[this.to] = 1;
      return out;
    }
    const w = smoothstep01(this.progress);
    out[this.from] = 1 - w;
    out[this.to] = w;
    return out;
  }

  weights(): WeatherWeights {
    const w = createWeatherWeights(this.to);
    return this.fillWeights(w);
  }
}

const WIND_BASE_STRENGTH: Record<WeatherType, number> = {
  clear_haze: 1.8,
  meteor_shower: 3.4,
  acid_rain: 4.6,
  electrical_storm: 6.4,
  ash_storm: 8.8,
};

/**
 * Deterministic global wind vector derived from UTC timestamp and weather weights.
 * Smoothly shifts direction and gusts without Math.random so all players experience identical wind.
 */
export function windVector(
  nowMs: number,
  weatherOrWeights: WeatherType | WeatherWeights,
  out: WindVector = { x: 0, z: 0, strength: 0 }
): WindVector {
  const safeSec = Number.isFinite(nowMs) ? nowMs / 1000 : 0;

  let baseStrength = 0;
  if (typeof weatherOrWeights === 'string') {
    baseStrength = WIND_BASE_STRENGTH[weatherOrWeights] ?? 1.8;
  } else {
    let wSum = 0;
    for (const k of WEATHER_TYPES) {
      const w = Number.isFinite(weatherOrWeights[k]) ? Math.max(0, weatherOrWeights[k]) : 0;
      baseStrength += (WIND_BASE_STRENGTH[k] ?? 1.8) * w;
      wSum += w;
    }
    if (wSum <= 0) baseStrength = 1.8;
    else baseStrength /= wSum;
  }

  // Slowly rotating global wind direction + bounded deterministic gusts
  const angle =
    Math.sin(safeSec * 0.0043) * 1.45 +
    Math.cos(safeSec * 0.0017) * 0.85 +
    safeSec * 0.00025;
  const gust = 0.82 + 0.18 * Math.sin(safeSec * 0.19) + 0.08 * Math.cos(safeSec * 0.41);
  const strength = Math.max(0.8, Math.min(11.0, baseStrength * gust));

  out.x = Math.cos(angle) * strength;
  out.z = Math.sin(angle) * strength;
  out.strength = strength;
  return out;
}

/** Thunder delay in seconds from strike distance in meters at 120 m/s. */
export function thunderDelaySec(distM: number): number {
  if (!Number.isFinite(distM) || distM <= 0) return 0;
  return distM / THUNDER_SPEED_OF_SOUND_M_S;
}

/**
 * Advance ground wetness (0..1) around the player: increases during acid/electrical rain
 * and dries gradually otherwise.
 */
export function stepWetness(current: number, rainWeight: number, dt: number): number {
  const cur = clamp01(current);
  if (!Number.isFinite(dt) || dt <= 0) return cur;
  const rw = clamp01(rainWeight);
  const next = rw > 0.05 ? cur + dt * 0.085 * rw : cur - dt * 0.028;
  return clamp01(next);
}
