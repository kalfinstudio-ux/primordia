import type { DifficultyLevel, HazardType, WeatherType } from '../config';
import type { PlayerVitals } from '../core/state';
import { clamp, damp } from '../utils/math';
import { BALANCE, getDifficultyMultiplier as balanceMultiplier } from '../data/balance';

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
  filterDrainMult?: number;
  radiationMult?: number;
  inLava: boolean;
  inMeteorDanger: boolean;
  difficulty: DifficultyLevel;
  /** Pengali tekanan tambahan untuk pemain baru (default 1). */
  easeMult?: number;
}

export function getDifficultyMultiplier(diff: DifficultyLevel): number {
  return balanceMultiplier(diff);
}

export function computeHazardState(env: SurvivalEnvironment): HazardType {
  if (env.inMeteorDanger) return 'meteor';
  if (env.inShelter) return 'sheltered';
  if (env.ambientTempC >= BALANCE.hazard.heatTempC || env.inLava) return 'heat';
  if ((env.radiationLevel || 0) >= BALANCE.hazard.radiationLevel) return 'radiation';
  if (env.toxicLevel >= BALANCE.hazard.toxicLevelThreshold || env.weather === 'ash_storm' || env.weather === 'acid_rain') return 'toxic';
  return 'safe';
}

export function stepVitals(
  current: PlayerVitals,
  env: SurvivalEnvironment,
  dt: number
): { vitals: PlayerVitals; deathReason: string | null } {
  const B = BALANCE;
  const mult = getDifficultyMultiplier(env.difficulty) * (env.easeMult ?? 1);
  const next: PlayerVitals = { ...current };
  if (typeof next.suffocationTimer !== 'number') next.suffocationTimer = 0;

  // 1. Body temperature with thermal cloak & heat shield insulation
  let targetBodyTemp: number = B.temperature.base;
  if (env.inShelter) {
    targetBodyTemp = B.temperature.base;
  } else {
    let envDelta = (env.ambientTempC - B.temperature.base) * B.temperature.envFactor;
    if (env.isNight && !env.nearCampfire) envDelta -= B.temperature.nightPenalty;
    if (env.nearCampfire) envDelta += B.temperature.campfireBonus;
    if (env.hasHeatShield && envDelta > 0) envDelta *= B.temperature.heatShieldFactor;
    if (env.hasThermalCloak) envDelta *= B.temperature.thermalCloakFactor;
    if (env.inLava) envDelta += B.temperature.lavaBonus;
    targetBodyTemp = clamp(B.temperature.base + envDelta, B.temperature.minTarget, B.temperature.maxTarget);
  }
  next.temperature = damp(
    next.temperature,
    targetBodyTemp,
    env.inShelter ? B.temperature.dampShelter : B.temperature.dampOpen,
    dt
  );

  // 2. Oxygen & active Gas Filter protection
  const rawToxic = env.inShelter
    ? 0
    : (env.toxicLevel * B.oxygen.drainPerToxic + (env.weather === 'ash_storm' ? B.oxygen.ashStormDrain : 0)) * mult;

  if (rawToxic > 0) {
    if (next.filterDurability > 0) {
      next.filterDurability = clamp(next.filterDurability - B.filter.drainPerSec * (env.filterDrainMult ?? 1) * dt, 0, B.filter.maxDurability);
      next.oxygen = clamp(next.oxygen + B.oxygen.regenWithFilter * dt, 0, 100);
    } else {
      const hazmatFactor = env.hasHazmatLining ? B.oxygen.hazmatFactor : 1.0;
      next.oxygen = clamp(next.oxygen - rawToxic * hazmatFactor * dt, 0, 100);
    }
  } else {
    next.oxygen = clamp(next.oxygen + B.oxygen.regenClean * dt, 0, 100);
  }

  // Status "sesak": oksigen habis -> timer jalan; nyawa baru turun setelah graceSec.
  if (next.oxygen <= B.oxygen.depletedAtPct) {
    next.suffocationTimer += dt;
  } else if (next.oxygen > B.suffocation.recoverAbovePct) {
    next.suffocationTimer = 0;
  }

  // 3. Hydration (faster drain when hot)
  const heatFactor = next.temperature > B.temperature.hotThreshold ? B.water.hotFactor : 1.0;
  const waterDrain = (env.inShelter ? B.water.drainShelter : B.water.drainOpen) * heatFactor * mult;
  next.water = clamp(next.water - waterDrain * dt, 0, 100);

  // 4. Radiation accumulation in meteorite zones
  const radInput = env.inShelter
    ? 0
    : (env.radiationLevel || 0) * (env.hasHazmatLining ? B.radiation.hazmatFactor : 1.0) * B.radiation.inputFactor * (env.radiationMult ?? 1) * mult;
  if (radInput > 0) {
    next.radiation = clamp(next.radiation + radInput * dt, 0, 100);
  } else {
    next.radiation = clamp(next.radiation - B.radiation.decayPerSec * dt, 0, 100);
  }

  // 5. Fatigue (rest meter): drains slowly awake, restores in shelter
  if (env.inShelter) {
    next.fatigue = clamp(next.fatigue + B.fatigue.shelterRegenPerSec * dt, 0, 100);
  } else {
    next.fatigue = clamp(next.fatigue - B.fatigue.drainPerSec * mult * dt, 0, 100);
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
    hpDelta -= B.damage.lavaPerSec * dt;
    deathReason = 'reasonTemp';
  } else if (next.temperature >= B.temperature.dangerHigh || next.temperature <= B.temperature.dangerLow) {
    hpDelta -= B.temperature.dangerDamagePerSec * mult * dt;
    deathReason = 'reasonTemp';
  }

  if (next.oxygen <= B.oxygen.depletedAtPct && next.suffocationTimer >= B.suffocation.graceSec) {
    hpDelta -= B.suffocation.damagePerSec * mult * dt;
    deathReason = 'reasonOxygen';
  }

  if (next.water <= B.water.emptyAtPct) {
    hpDelta -= B.water.damagePerSec * mult * dt;
    deathReason = 'reasonDehydration';
  }

  if (next.radiation >= B.radiation.dangerAtPct) {
    hpDelta -= B.radiation.damagePerSec * mult * dt;
    deathReason = 'reasonRadiation';
  }

  if (next.burnTimer > 0) {
    hpDelta -= B.damage.burnPerSec * dt;
    if (!deathReason) deathReason = 'reasonTemp';
  }
  if (next.woundTimer > 0) {
    hpDelta -= B.damage.woundPerSec * dt;
  }

  if (!env.inShelter && env.weather === 'acid_rain') {
    hpDelta -= (env.hasThermalCloak ? B.damage.acidRainCloakPerSec : B.damage.acidRainPerSec) * mult * dt;
  }

  if (
    env.inShelter &&
    next.oxygen > B.damage.shelterHealMinOxygen &&
    next.water > B.damage.shelterHealMinWater &&
    next.radiation < B.radiation.dangerAtPct
  ) {
    hpDelta += B.damage.shelterHealPerSec * dt;
  }

  next.health = clamp(next.health + hpDelta, 0, 100);
  if (next.health <= 0) {
    return { vitals: next, deathReason: deathReason || 'reasonGeneric' };
  }
  return { vitals: next, deathReason: null };
}

export function isSuffocating(v: Pick<PlayerVitals, 'oxygen' | 'suffocationTimer'>): boolean {
  return v.oxygen <= BALANCE.oxygen.depletedAtPct && (v.suffocationTimer || 0) > 0;
}
