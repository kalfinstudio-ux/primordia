// Pure survival rate, wetness, wind-chill, fall-damage, and food/fire tuning helpers (no Three.js imports).
import type { SurvivalRatePreset } from '../config';
import { clamp } from '../utils/math';
import { BALANCE } from './balance';

export interface SurvivalSwitches {
  wetness: boolean;
  wind: boolean;
  fallDamage: boolean;
  hunger: boolean;
  regionDanger: boolean;
}

export function resolveSurvivalSwitches(overrides?: Partial<SurvivalSwitches>): SurvivalSwitches {
  const base: SurvivalSwitches = BALANCE.survival.switches;
  if (!overrides) return base;
  return {
    wetness: overrides.wetness ?? base.wetness,
    wind: overrides.wind ?? base.wind,
    fallDamage: overrides.fallDamage ?? base.fallDamage,
    hunger: overrides.hunger ?? base.hunger,
    regionDanger: overrides.regionDanger ?? base.regionDanger,
  };
}

export function getSurvivalRateMultiplier(preset: SurvivalRatePreset = BALANCE.survivalRates.defaultPreset): number {
  return BALANCE.survivalRates.multiplier[preset] ?? 1.0;
}

/**
 * Optional per-danger-tier modifier from world/regions.ts.
 * Always returns 1.0 while BALANCE.survival.switches.regionDanger is false (default OFF).
 */
export function getRegionDangerMultiplier(tier: number, enabledOverride?: boolean): number {
  const enabled = enabledOverride ?? BALANCE.survival.switches.regionDanger;
  if (!enabled) return 1.0;
  const safeTier = Math.max(0, Number.isFinite(tier) ? tier : 0);
  const raw = 1 + safeTier * BALANCE.regionDanger.perTierMultiplier;
  return Math.min(BALANCE.regionDanger.maxMultiplier, raw);
}

/**
 * Advance a need meter (water or hunger) in real seconds (dt).
 * When a meter starts/refills to full (>= fullThresholdPct) and graceTimer > 0,
 * it stays full at 100 until the grace period expires, then drains at drainPerSec.
 */
export function stepNeedMeter(
  currentValue: number,
  currentGraceSec: number,
  dt: number,
  opts: {
    drainPerSec: number;
    fullThresholdPct: number;
    fullGraceSec: number;
    active: boolean;
  }
): { value: number; graceTimer: number } {
  if (!opts.active) {
    return {
      value: clamp(currentValue, 0, 100),
      graceTimer: Math.max(0, currentGraceSec),
    };
  }
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let value = clamp(Number.isFinite(currentValue) ? currentValue : 100, 0, 100);
  let grace = Math.max(0, Number.isFinite(currentGraceSec) ? currentGraceSec : 0);

  if (safeDt <= 0) {
    return { value, graceTimer: grace };
  }

  let effectiveDt = safeDt;
  if (value >= opts.fullThresholdPct && grace > 0) {
    if (safeDt <= grace) {
      grace -= safeDt;
      return { value: 100, graceTimer: grace };
    }
    effectiveDt = safeDt - grace;
    grace = 0;
  }

  value = clamp(value - Math.max(0, opts.drainPerSec) * effectiveDt, 0, 100);
  return { value, graceTimer: grace };
}

/**
 * Update player wetness (0..1) in real seconds.
 * - Swimming/immersed wets immediately & rapidly to 1.0
 * - Wading in shallow water wets toward wadingTarget
 * - Rain wets when unsheltered
 * - Otherwise dries over time, faster near campfire & aided by shelter/breeze
 */
export function stepPlayerWetness(
  currentWetness: number,
  dt: number,
  env: {
    rainWeight: number;
    inWater: boolean;
    immersed: boolean;
    inShelter: boolean;
    nearCampfire: boolean;
    windStrength: number;
    enabled?: boolean;
  }
): number {
  const enabled = env.enabled ?? BALANCE.survival.switches.wetness;
  if (!enabled) return 0;

  const cur = clamp(Number.isFinite(currentWetness) ? currentWetness : 0, 0, 1);
  if (!Number.isFinite(dt) || dt <= 0) return cur;

  const W = BALANCE.wetness;
  if (env.immersed) {
    return clamp(cur + W.immersionGainPerSec * dt, 0, 1);
  }
  if (env.inWater) {
    if (cur < W.wadingTarget) {
      return Math.min(W.wadingTarget, cur + W.wadingGainPerSec * dt);
    }
    return cur;
  }

  const rainW = clamp(Number.isFinite(env.rainWeight) ? env.rainWeight : 0, 0, 1);
  const campfireDryingInLightRain = env.nearCampfire && rainW <= W.campfireLightRainMaxWeight;
  if (!env.inShelter && !campfireDryingInLightRain && rainW > 0.05) {
    return clamp(cur + W.rainGainPerSec * rainW * dt, 0, 1);
  }

  // Drying over time, accelerated near fire (even in light rain) & inside shelter
  let dryRate = W.baseDryPerSec;
  if (env.inShelter) dryRate *= W.shelterDryMult;
  if (env.nearCampfire) dryRate *= W.campfireDryMult;
  if (campfireDryingInLightRain && rainW > 0.05) {
    dryRate *= 1 - rainW * 0.35;
  }
  if (!env.inShelter && env.windStrength > 0) {
    const windShare = clamp(env.windStrength / BALANCE.wind.stormThresholdSpeed, 0, 1);
    dryRate *= 1 + windShare * W.windDryBonusMax;
  }
  return clamp(cur - dryRate * dt, 0, 1);
}

/**
 * Small wind multiplier on body heat loss (~10–15% when exposed to noticeable wind).
 */
export function computeWindHeatLossMultiplier(
  windStrength: number,
  inShelter: boolean,
  enabled: boolean = BALANCE.survival.switches.wind
): number {
  if (!enabled || inShelter) return 1.0;
  const spd = Number.isFinite(windStrength) ? Math.max(0, windStrength) : 0;
  if (spd <= 0.1) return 1.0;
  const W = BALANCE.wind;
  const t = clamp((spd - W.calmThresholdSpeed) / Math.max(0.1, W.stormThresholdSpeed - W.calmThresholdSpeed), 0, 1);
  const pct = W.heatLossPctAtCalm + (W.heatLossPctAtStorm - W.heatLossPctAtCalm) * t;
  return 1.0 + pct;
}

/**
 * Combined heat loss rate multiplier from wetness, water immersion, and wind chill.
 */
export function computeHeatLossMultiplier(opts: {
  wetness: number;
  inWater: boolean;
  immersed: boolean;
  windStrength: number;
  inShelter: boolean;
  wetnessEnabled?: boolean;
  windEnabled?: boolean;
}): {
  rateMult: number;
  coldTargetDropC: number;
} {
  const wetOn = opts.wetnessEnabled ?? BALANCE.survival.switches.wetness;
  const windOn = opts.windEnabled ?? BALANCE.survival.switches.wind;
  const W = BALANCE.wetness;

  let wetMult = 1.0;
  let coldTargetDropC = 0;

  if (wetOn) {
    const w = clamp(Number.isFinite(opts.wetness) ? opts.wetness : 0, 0, 1);
    if (opts.immersed) {
      wetMult = W.immersionHeatLossMult;
      coldTargetDropC = W.immersionColdTargetDropC;
    } else if (opts.inWater) {
      const surfaceMult = 1 + w * (W.heatLossMultAtFullWet - 1);
      wetMult = Math.max(surfaceMult, (W.heatLossMultAtFullWet + W.immersionHeatLossMult) * 0.5);
      coldTargetDropC = (W.wetColdTargetDropC + W.immersionColdTargetDropC) * 0.5;
    } else if (w > 0.01) {
      wetMult = 1 + w * (W.heatLossMultAtFullWet - 1);
      coldTargetDropC = w * W.wetColdTargetDropC;
    }
    coldTargetDropC = Math.min(coldTargetDropC, W.maxColdTargetDropC);
  }

  const windMult = computeWindHeatLossMultiplier(opts.windStrength, opts.inShelter, windOn);
  return {
    rateMult: wetMult * windMult,
    coldTargetDropC,
  };
}

/**
 * Fall damage calculated purely from downward landing speed (m/s), not height.
 * Zero below safeLandingSpeedMs; scales smoothly & monotonically above it.
 * Water landing greatly reduces (wading) or cancels (immersed) damage.
 */
export function computeFallDamage(
  landingSpeedMs: number,
  opts: {
    inWater?: boolean;
    immersed?: boolean;
    survivalRate?: SurvivalRatePreset;
    enabled?: boolean;
  } = {}
): number {
  const enabled = opts.enabled ?? BALANCE.survival.switches.fallDamage;
  if (!enabled) return 0;
  if (!Number.isFinite(landingSpeedMs) || landingSpeedMs <= 0) return 0;

  const F = BALANCE.fallDamage;
  if (landingSpeedMs <= F.safeLandingSpeedMs) return 0;

  const span = Math.max(0.1, F.lethalLandingSpeedMs - F.safeLandingSpeedMs);
  const t = clamp((landingSpeedMs - F.safeLandingSpeedMs) / span, 0, 1.5);
  let dmg = Math.pow(t, F.exponent) * F.maxDamage;

  if (opts.immersed) {
    dmg *= F.waterImmersedMult;
  } else if (opts.inWater) {
    dmg *= F.waterShallowMult;
  }

  dmg *= getSurvivalRateMultiplier(opts.survivalRate);
  return clamp(Math.round(dmg * 10) / 10, 0, F.maxDamage);
}

export function isFallingFast(
  grounded: boolean,
  swimming: boolean,
  velocityY: number,
  enabled: boolean = BALANCE.survival.switches.fallDamage
): boolean {
  if (!enabled || grounded || swimming) return false;
  return velocityY <= -BALANCE.fallDamage.fallingHudSpeedMs;
}

export function getCampfireBurnTimeSec(fuelId: string): number {
  const map = BALANCE.campfire.fuelBurnTimeSec as Record<string, number>;
  return map[fuelId] ?? 0;
}

export function getFoodSpoilageTimeSec(foodId: string): number {
  const map = BALANCE.food.spoilageTimeSec as Record<string, number>;
  return map[foodId] ?? 0;
}
