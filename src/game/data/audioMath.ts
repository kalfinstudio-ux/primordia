import type { WeatherType, WorldEventType } from '../config';

export type SpatialAmbientKind = 'lava' | 'geyser' | 'water' | 'campfire' | 'bruk';
export type AudioSurface = 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur';
export type FootstepSpeedMode = 'crouch' | 'walk' | 'run';
export type MusicMode = 'calm' | 'alert' | 'danger' | 'shelter' | 'night';

export interface SpatialSourceSpec {
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

export const SPATIAL_SOURCE_SPECS: Record<SpatialAmbientKind | 'sfx', SpatialSourceSpec> = {
  lava: { refDistance: 4.5, maxDistance: 48, rolloffFactor: 1.35 },
  geyser: { refDistance: 3.2, maxDistance: 36, rolloffFactor: 1.4 },
  water: { refDistance: 2.8, maxDistance: 28, rolloffFactor: 1.45 },
  campfire: { refDistance: 2.0, maxDistance: 22, rolloffFactor: 1.55 },
  bruk: { refDistance: 3.2, maxDistance: 44, rolloffFactor: 1.25 },
  sfx: { refDistance: 2.5, maxDistance: 68, rolloffFactor: 1.2 },
};

export const SHELTER_LOWPASS_HZ = 1200;
export const UNDERWATER_LOWPASS_HZ = 500;
export const OPEN_LOWPASS_HZ = 20000;
export const SHELTER_EXTERIOR_SUPPRESSION = 0.7; // 70% wind/rain reduction inside shelter
export const ENV_FILTER_TRANSITION_SEC = 0.4;
export const ENV_FILTER_TIME_CONSTANT = 0.14; // ~95% settled in 0.42s

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * Pure inverse-clamped spatial attenuation with smooth fade-out to zero at maxDistance.
 * Returns 0 when out of range (> maxDistance) so callers can cleanly disable distant sources.
 */
export function computeSpatialAttenuation(
  distance: number,
  kind: SpatialAmbientKind | 'sfx',
  spatialEnvMix = 1.0
): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  const mix = clamp01(spatialEnvMix);
  if (mix <= 0) return 0;
  const spec = SPATIAL_SOURCE_SPECS[kind] ?? SPATIAL_SOURCE_SPECS.sfx;
  if (distance >= spec.maxDistance) return 0;
  const d = Math.max(distance, spec.refDistance);
  const inv = spec.refDistance / (spec.refDistance + spec.rolloffFactor * (d - spec.refDistance));
  // Smooth boundary rolloff in the final 20% of maxDistance so disabling at maxDistance has no pop
  const edgeStart = spec.maxDistance * 0.8;
  const edgeFade =
    distance <= edgeStart
      ? 1
      : 1 - clamp01((distance - edgeStart) / Math.max(0.001, spec.maxDistance - edgeStart));
  return clamp01(inv * edgeFade * mix);
}

export interface SpatialCandidate {
  kind: SpatialAmbientKind;
  x: number;
  y: number;
  z: number;
  distance: number;
  gain: number;
}

/**
 * Select top-N nearest active spatial ambient sources within range, enforcing quality caps.
 * On 'low' graphics preset, total ambient sources (including global wind/rain) stay <= 4.
 */
export function selectActiveSpatialSources(
  candidates: ReadonlyArray<{ kind: SpatialAmbientKind; x: number; y: number; z: number; distance: number }>,
  maxTotalAmbientSources: number,
  globalAmbientCount: number,
  spatialEnvMix: number
): SpatialCandidate[] {
  const maxSpatial = Math.max(0, Math.floor(maxTotalAmbientSources) - Math.max(0, Math.floor(globalAmbientCount)));
  if (maxSpatial <= 0 || clamp01(spatialEnvMix) <= 0) return [];

  const active: SpatialCandidate[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) continue;
    const gain = computeSpatialAttenuation(c.distance, c.kind, spatialEnvMix);
    if (gain > 0.004) {
      active.push({
        kind: c.kind,
        x: c.x,
        y: c.y,
        z: c.z,
        distance: c.distance,
        gain,
      });
    }
  }

  active.sort((a, b) => b.gain - a.gain || a.distance - b.distance);
  if (active.length > maxSpatial) active.length = maxSpatial;
  return active;
}

export interface EnvFilterTarget {
  cutoffHz: number;
  exteriorWeatherMult: number;
}

/**
 * Compute master lowpass cutoff & exterior wind/rain multiplier for shelter and underwater states.
 * Underwater takes precedence (500 Hz); inside shelter applies ~1.2 kHz lowpass and ~70% exterior reduction
 * scaled by the user's indoorMuffling setting (0..1).
 */
export function computeEnvFilterTarget(
  inShelter: boolean,
  swimming: boolean,
  indoorMuffling = 1.0
): EnvFilterTarget {
  if (swimming) {
    return {
      cutoffHz: UNDERWATER_LOWPASS_HZ,
      exteriorWeatherMult: 0.25,
    };
  }
  const muffle = clamp01(indoorMuffling);
  if (inShelter && muffle > 0) {
    // Logarithmic interpolation in Hz space feels perceptually linear from 20 kHz down to 1.2 kHz
    const logOpen = Math.log(OPEN_LOWPASS_HZ);
    const logClosed = Math.log(SHELTER_LOWPASS_HZ);
    const cutoffHz = Math.exp(logOpen + (logClosed - logOpen) * muffle);
    const exteriorWeatherMult = 1 - SHELTER_EXTERIOR_SUPPRESSION * muffle;
    return { cutoffHz, exteriorWeatherMult };
  }
  return {
    cutoffHz: OPEN_LOWPASS_HZ,
    exteriorWeatherMult: 1,
  };
}

export interface RainLayerMix {
  roofTap: number;
  groundHiss: number;
  waterSplash: number;
  filterType: 'bandpass' | 'highpass';
  filterFreqHz: number;
  filterQ: number;
}

/**
 * Compute rain acoustic layer weights and filter parameters based on impact surface:
 * shelter roof -> tapping, open ground -> hiss, water/shore -> splashes.
 */
export function selectRainLayers(
  rainWeight: number,
  inShelter: boolean,
  surface: AudioSurface,
  nearWater: boolean
): RainLayerMix {
  const rw = clamp01(rainWeight);
  if (rw <= 0.005) {
    return {
      roofTap: 0,
      groundHiss: 0,
      waterSplash: 0,
      filterType: 'highpass',
      filterFreqHz: 3200,
      filterQ: 0.7,
    };
  }
  if (inShelter) {
    return {
      roofTap: rw,
      groundHiss: rw * 0.15,
      waterSplash: 0,
      filterType: 'bandpass',
      filterFreqHz: 1150,
      filterQ: 2.1,
    };
  }
  if (surface === 'water' || nearWater) {
    return {
      roofTap: 0,
      groundHiss: rw * 0.25,
      waterSplash: rw,
      filterType: 'bandpass',
      filterFreqHz: 1650,
      filterQ: 1.35,
    };
  }
  return {
    roofTap: 0,
    groundHiss: rw,
    waterSplash: 0,
    filterType: 'highpass',
    filterFreqHz: 3200,
    filterQ: 0.7,
  };
}

/**
 * Deterministic LCG step (no Math.random in hot path). Returns [nextSeed, unitFloat in [0, 1)].
 */
export function nextAudioSeed(seed: number): { seed: number; value: number } {
  const s = (Math.imul((seed | 0) || 1337, 1664525) + 1013904223) >>> 0;
  return { seed: s, value: s / 4294967296 };
}

export function classifyFootstepSpeed(horizontalSpeed: number): FootstepSpeedMode {
  if (!Number.isFinite(horizontalSpeed) || horizontalSpeed <= 3.6) return 'crouch';
  if (horizontalSpeed >= 7.0) return 'run';
  return 'walk';
}

export interface FootstepParams {
  noteIndex: number;
  nextSeed: number;
  pitchMult: number;
  gainMult: number;
  brightnessHz: number;
  wetBlend: number;
  speedMode: FootstepSpeedMode;
}

const STEP_PITCH_VARIANTS = [0.89, 0.94, 0.985, 1.02, 1.07, 1.13] as const;

/**
 * Seeded non-repeating footstep picker: guarantees `noteIndex !== prevNoteIndex`
 * while varying pitch, volume, brightness, and wet splash blend by speed & ground wetness.
 */
export function pickFootstepVariation(
  seed: number,
  prevNoteIndex: number,
  surface: AudioSurface,
  horizontalSpeed: number,
  wetness: number
): FootstepParams {
  const count = STEP_PITCH_VARIANTS.length;
  const r1 = nextAudioSeed(seed);
  let idx = Math.floor(r1.value * count) % count;
  if (idx === prevNoteIndex) {
    const r2 = nextAudioSeed(r1.seed);
    const offset = 1 + (Math.floor(r2.value * (count - 1)) % (count - 1));
    idx = (idx + offset) % count;
    seed = r2.seed;
  } else {
    seed = r1.seed;
  }

  const speedMode = classifyFootstepSpeed(horizontalSpeed);
  const wet = clamp01(wetness);

  const speedGain = speedMode === 'run' ? 1.28 : speedMode === 'crouch' ? 0.56 : 1.0;
  const speedPitch = speedMode === 'run' ? 1.08 : speedMode === 'crouch' ? 0.86 : 1.0;
  const speedBright = speedMode === 'run' ? 1.22 : speedMode === 'crouch' ? 0.72 : 1.0;

  const baseBright =
    surface === 'obsidian'
      ? 2400
      : surface === 'crystal'
        ? 1900
        : surface === 'sulfur'
          ? 1700
          : surface === 'water'
            ? 1400
            : surface === 'ash'
              ? 680
              : 950;

  // Wet ground adds splash energy on non-water surfaces & slightly softens dry crunch
  const wetBlend = surface === 'water' ? 1.0 : wet * 0.75;

  return {
    noteIndex: idx,
    nextSeed: seed,
    pitchMult: STEP_PITCH_VARIANTS[idx] * speedPitch,
    gainMult: speedGain,
    brightnessHz: baseBright * speedBright * (1 - wet * 0.15),
    wetBlend,
    speedMode,
  };
}

/** Scale Bruk's vocal/presence audio gain smoothly across trust levels 0..4. */
export function brukTrustGain(level: number): number {
  const lv = clamp(level, 0, 4);
  return 0.44 + (lv / 4) * 0.56;
}

export interface MusicModeInput {
  inShelter: boolean;
  health: number;
  hazard: string;
  stormWeight: number;
  activeEvent: WorldEventType;
  isNight: boolean;
  inMeteorDanger?: boolean;
}

export function selectMusicMode(input: MusicModeInput): MusicMode {
  if (
    input.health < 30 ||
    input.inMeteorDanger ||
    input.activeEvent !== 'none'
  ) {
    return 'danger';
  }
  if (
    input.stormWeight >= 0.45 ||
    input.hazard === 'toxic' ||
    input.hazard === 'heat' ||
    input.hazard === 'radiation'
  ) {
    return 'alert';
  }
  if (input.inShelter) return 'shelter';
  if (input.isNight) return 'night';
  return 'calm';
}

export interface MusicModeProfile {
  freqA: number;
  freqB: number;
  filterHz: number;
  padGain: number;
  allowBells: boolean;
}

export const MUSIC_MODE_PROFILES: Record<MusicMode, MusicModeProfile> = {
  calm: { freqA: 55.0, freqB: 82.41, filterHz: 240, padGain: 0.95, allowBells: true }, // warm A1 + E2 fifth
  shelter: { freqA: 65.41, freqB: 98.0, filterHz: 280, padGain: 0.85, allowBells: false }, // cozy C2 + G2
  night: { freqA: 49.0, freqB: 77.78, filterHz: 185, padGain: 0.78, allowBells: false }, // deep G1 + Eb2
  alert: { freqA: 55.0, freqB: 73.42, filterHz: 320, padGain: 0.58, allowBells: false }, // tense A1 + D2
  danger: { freqA: 46.25, freqB: 65.41, filterHz: 390, padGain: 0.42, allowBells: false }, // dark Gb1 + C2 tritone
};

export function computeDuckingGain(activeDuckTargets: ReadonlyArray<number>): number {
  let minMult = 1;
  for (let i = 0; i < activeDuckTargets.length; i++) {
    const v = clamp(activeDuckTargets[i], 0.1, 1);
    if (v < minMult) minMult = v;
  }
  return minMult;
}

export function extractRainAndStormWeights(
  weatherOrWeights: WeatherType | Partial<Record<WeatherType, number>> | string
): { clearW: number; rainW: number; stormW: number } {
  if (typeof weatherOrWeights === 'string') {
    return {
      clearW: weatherOrWeights === 'clear_haze' ? 1 : 0,
      rainW: weatherOrWeights === 'acid_rain' ? 1 : weatherOrWeights === 'electrical_storm' ? 0.8 : 0,
      stormW: weatherOrWeights === 'ash_storm' || weatherOrWeights === 'electrical_storm' ? 1 : 0,
    };
  }
  const clearW = clamp01(weatherOrWeights.clear_haze ?? 0);
  const rainW = clamp01((weatherOrWeights.acid_rain ?? 0) + (weatherOrWeights.electrical_storm ?? 0) * 0.8);
  const stormW = clamp01((weatherOrWeights.ash_storm ?? 0) + (weatherOrWeights.electrical_storm ?? 0));
  return { clearW, rainW, stormW };
}
