import type { DifficultyLevel, HazardType, WeatherType } from '../config';
import type { PlayerVitals } from '../core/state';
import { clamp, damp } from '../utils/math';

export interface SurvivalEnvironment {
  ambientTempC: number;
  toxicLevel: number;
  radiationLevel?: number;
  weather: WeatherType;
  isNight: boolean;
  inShelter: boolean;
  nearCampfire: boolean;
  hasHeatShield: boolean;
  hasThermalCloak?: boolean;
  hasHazmatLining?: boolean;
  inLava: boolean;
  inMeteorDanger: boolean;
  difficulty: DifficultyLevel;
}

export function getDifficultyMultiplier(diff: DifficultyLevel): number {
  if (diff === 'explorer') return 0.55;
  if (diff === 'hadean') return 1.5;
  return 1.0;
}

export function computeHazardState(env: SurvivalEnvironment): HazardType {
  if (env.inMeteorDanger) return 'meteor';
  if (env.inShelter) return 'sheltered';
  if (env.ambientTempC >= 48 || env.inLava) return 'heat';
  if ((env.radiationLevel || 0) >= 0.4) return 'radiation';
  if (env.toxicLevel >= 0.35 || env.weather === 'ash_storm' || env.weather === 'acid_rain') return 'toxic';
  return 'safe';
}

export function stepVitals(
  current: PlayerVitals,
  env: SurvivalEnvironment,
  dt: number
): { vitals: PlayerVitals; deathReason: string | null } {
  const mult = getDifficultyMultiplier(env.difficulty);
  const next: PlayerVitals = { ...current };

  // 1. Body temperature with thermal cloak & heat shield insulation
  let targetBodyTemp = 37.0;
  if (env.inShelter) {
    targetBodyTemp = 37.0;
  } else {
    let envDelta = (env.ambientTempC - 37.0) * 0.28;
    if (env.isNight && !env.nearCampfire) envDelta -= 3.2;
    if (env.nearCampfire) envDelta += 2.2;
    if (env.hasHeatShield && envDelta > 0) envDelta *= 0.4;
    if (env.hasThermalCloak) envDelta *= 0.5;
    if (env.inLava) envDelta += 14;
    targetBodyTemp = clamp(37.0 + envDelta, 31.0, 52.0);
  }
  next.temperature = damp(next.temperature, targetBodyTemp, env.inShelter ? 0.45 : 0.14, dt);

  // 2. Oxygen & active Gas Filter protection
  const rawToxic = env.inShelter
    ? 0
    : (env.toxicLevel * 6.5 + (env.weather === 'ash_storm' ? 3.2 : 0)) * mult;

  if (rawToxic > 0) {
    if (next.filterDurability > 0) {
      next.filterDurability = clamp(next.filterDurability - 1.8 * dt, 0, 100);
      next.oxygen = clamp(next.oxygen + 4 * dt, 0, 100);
    } else {
      const hazmatFactor = env.hasHazmatLining ? 0.45 : 1.0;
      next.oxygen = clamp(next.oxygen - rawToxic * hazmatFactor * dt, 0, 100);
    }
  } else {
    next.oxygen = clamp(next.oxygen + 14 * dt, 0, 100);
  }

  // 3. Hydration (faster drain when hot)
  const heatFactor = next.temperature > 39.5 ? 1.8 : 1.0;
  const waterDrain = (env.inShelter ? 0.15 : 0.38) * heatFactor * mult;
  next.water = clamp(next.water - waterDrain * dt, 0, 100);

  // 4. Radiation accumulation in meteorite zones
  const radInput = env.inShelter ? 0 : (env.radiationLevel || 0) * (env.hasHazmatLining ? 0.3 : 1.0) * 2.2 * mult;
  if (radInput > 0) {
    next.radiation = clamp(next.radiation + radInput * dt, 0, 100);
  } else {
    next.radiation = clamp(next.radiation - 0.35 * dt, 0, 100);
  }

  // 5. Fatigue (rest meter): drains slowly awake, restores in shelter
  if (env.inShelter) {
    next.fatigue = clamp(next.fatigue + 6.5 * dt, 0, 100);
  } else {
    next.fatigue = clamp(next.fatigue - 0.18 * mult * dt, 0, 100);
  }

  // 6. Status effects (burns & wounds)
  if (env.inLava) {
    next.burnTimer = Math.max(next.burnTimer, 5);
  } else {
    next.burnTimer = Math.max(0, next.burnTimer - dt);
  }
  next.woundTimer = Math.max(0, next.woundTimer - dt);

  // 7. Health delta & death checks
  let hpDelta = 0;
  let deathReason: string | null = null;

  if (env.inLava) {
    hpDelta -= 28 * dt;
    deathReason = 'reasonTemp';
  } else if (next.temperature >= 42.5 || next.temperature <= 33.0) {
    hpDelta -= 5.5 * mult * dt;
    deathReason = 'reasonTemp';
  }

  if (next.oxygen <= 1) {
    hpDelta -= 8.0 * mult * dt;
    deathReason = 'reasonOxygen';
  }

  if (next.water <= 1) {
    hpDelta -= 4.5 * mult * dt;
    deathReason = 'reasonDehydration';
  }

  if (next.radiation >= 80) {
    hpDelta -= 3.2 * mult * dt;
    deathReason = 'reasonRadiation';
  }

  if (next.burnTimer > 0) {
    hpDelta -= 2.2 * dt;
    if (!deathReason) deathReason = 'reasonTemp';
  }
  if (next.woundTimer > 0) {
    hpDelta -= 1.8 * dt;
  }

  if (!env.inShelter && env.weather === 'acid_rain') {
    hpDelta -= (env.hasThermalCloak ? 0.5 : 1.4) * mult * dt;
  }

  if (env.inShelter && next.oxygen > 20 && next.water > 10 && next.radiation < 80) {
    hpDelta += 4.5 * dt;
  }

  next.health = clamp(next.health + hpDelta, 0, 100);
  if (next.health <= 0) {
    return { vitals: next, deathReason: deathReason || 'reasonGeneric' };
  }
  return { vitals: next, deathReason: null };
}
