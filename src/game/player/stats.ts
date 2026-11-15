import type { DifficultyLevel, HazardType, SurvivalRatePreset, WeatherType } from '../config';
import type { PlayerVitals } from '../core/state';
import { clamp, damp } from '../utils/math';
import { BALANCE, getDifficultyMultiplier as balanceMultiplier, isSafeTempActive } from '../data/balance';
import {
  computeHeatLossMultiplier,
  getRegionDangerMultiplier,
  getSurvivalRateMultiplier,
  resolveSurvivalSwitches,
  stepNeedMeter,
  type SurvivalSwitches,
} from '../data/survivalRates';

export interface SurvivalEnvironment {
  ambientTempC: number;
  toxicLevel: number;
  radiationLevel?: number;
  weather: WeatherType;
  isNight: boolean;
  inShelter: boolean;
  nearCampfire: boolean;
  hasHeatShield: boolean;
  hasStarterCloak?: boolean;
  hasThermalCloak?: boolean;
  hasHazmatLining?: boolean;
  filterDrainMult?: number;
  radiationMult?: number;
  inLava: boolean;
  inMeteorDanger: boolean;
  difficulty: DifficultyLevel;
  /** Pengali tekanan tambahan untuk pemain baru (default 1). */
  easeMult?: number;
  /** Total detik bermain saat ini (untuk jendela aman suhu safeStart/earlyEase bila diberikan). */
  playtimeSec?: number;
  /** ID bioma tempat pemain berada (agar lava_rift tetap berbahaya). */
  biomeId?: string;
  /** Global real-time survival rate preset (default 'normal'). */
  survivalRate?: SurvivalRatePreset;
  /** Tahun era saat ini (Era 2+ mengaktifkan lapar). Default 1. */
  eraYear?: number;
  /** Kebasahan tubuh pemain (0..1). */
  wetness?: number;
  /** True saat berdiri di air dangkal. */
  inWater?: boolean;
  /** True saat berenang / terendam air dalam. */
  immersed?: boolean;
  /** Kecepatan angin (m/s). */
  windStrength?: number;
  /** Tingkat bahaya wilayah dari regions.ts (hanya aktif bila switch regionDanger = true). */
  regionTier?: number;
  /** Opsional untuk uji unit: timpa sakelar utama tiap mekanik. */
  switches?: Partial<SurvivalSwitches>;
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
  const switches = resolveSurvivalSwitches(env.switches);
  const rateMult = getSurvivalRateMultiplier(env.survivalRate ?? B.survivalRates.defaultPreset);
  const regionMult = getRegionDangerMultiplier(env.regionTier ?? 0, switches.regionDanger);
  const mult = getDifficultyMultiplier(env.difficulty) * (env.easeMult ?? 1) * rateMult * regionMult;

  const next: PlayerVitals = { ...current };
  if (typeof next.suffocationTimer !== 'number') next.suffocationTimer = 0;
  if (typeof next.hunger !== 'number') next.hunger = 100;
  if (typeof next.waterGraceTimer !== 'number') next.waterGraceTimer = 0;
  if (typeof next.hungerGraceTimer !== 'number') next.hungerGraceTimer = 0;
  if (typeof next.tempDangerTimer !== 'number') next.tempDangerTimer = 0;
  if (typeof next.respawnGraceTimer !== 'number') next.respawnGraceTimer = 0;

  const hasRespawnGrace = next.respawnGraceTimer > 0;
  next.respawnGraceTimer = Math.max(0, next.respawnGraceTimer - dt);

  // 1. Body temperature with wetness, water immersion, wind chill, insulation & beginner safety floor
  const heatLoss = computeHeatLossMultiplier({
    wetness: env.wetness ?? 0,
    inWater: Boolean(env.inWater),
    immersed: Boolean(env.immersed),
    windStrength: env.windStrength ?? 0,
    inShelter: env.inShelter,
    wetnessEnabled: switches.wetness,
    windEnabled: switches.wind,
  });

  let targetBodyTemp: number = B.temperature.base;
  if (env.inShelter) {
    targetBodyTemp = env.nearCampfire ? Math.min(B.temperature.base + 1.0, B.temperature.maxTarget) : B.temperature.base;
  } else {
    let envDelta = (env.ambientTempC - B.temperature.base) * B.temperature.envFactor;
    if (env.isNight && !env.nearCampfire) envDelta -= B.temperature.nightPenalty;
    if (env.nearCampfire) envDelta += B.temperature.campfireBonus;
    if (env.hasHeatShield && envDelta > 0) envDelta *= B.temperature.heatShieldFactor;
    const cloakColdFactor = env.hasThermalCloak
      ? B.temperature.thermalCloakFactor
      : env.hasStarterCloak
        ? B.temperature.ashCloakFactor
        : 1.0;
    if (env.hasThermalCloak) {
      envDelta *= B.temperature.thermalCloakFactor;
    } else if (env.hasStarterCloak && envDelta < 0) {
      envDelta *= B.temperature.ashCloakFactor;
    }
    if (env.inLava) envDelta += B.temperature.lavaBonus;
    if (!env.nearCampfire && !env.inLava) {
      envDelta -= heatLoss.coldTargetDropC * cloakColdFactor;
    }
    targetBodyTemp = clamp(B.temperature.base + envDelta, B.temperature.minTarget, B.temperature.maxTarget);

    const isDangerousBiome = Boolean(env.biomeId && B.temperature.dangerousBiomes.includes(env.biomeId));
    const gentleTempActive =
      !env.inLava &&
      !isDangerousBiome &&
      (hasRespawnGrace || (env.playtimeSec !== undefined && isSafeTempActive(env.difficulty, env.playtimeSec)));
    if (gentleTempActive) {
      targetBodyTemp = clamp(targetBodyTemp, B.temperature.safeMinC, B.temperature.safeMaxC);
    }
  }
  const baseDamp = env.inShelter ? B.temperature.dampShelter : B.temperature.dampOpen;
  const tempDamp = targetBodyTemp < next.temperature ? baseDamp * heatLoss.rateMult : baseDamp;
  next.temperature = damp(next.temperature, targetBodyTemp, tempDamp, dt);

  if (!env.inLava && (next.temperature <= B.temperature.dangerLow || next.temperature >= B.temperature.dangerHigh)) {
    next.tempDangerTimer += dt;
  } else if (
    next.temperature >= B.temperature.dangerLow + B.temperature.dangerRecoverMarginC &&
    next.temperature <= B.temperature.dangerHigh - B.temperature.dangerRecoverMarginC
  ) {
    next.tempDangerTimer = 0;
  }
  if (hasRespawnGrace && !env.inLava) {
    next.tempDangerTimer = 0;
  }

  // 2. Oxygen & active Gas Filter protection
  const rawToxic =
    env.inShelter || (hasRespawnGrace && !env.inLava)
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

  // 3. Hydration (real-time rates + friendly full-meter grace period; more urgent than hunger)
  // Pemain baru (masa aman suhu): panas biome tidak mempercepat haus, supaya 10 menit pertama tanpa minum tetap aman
  // di Punggung Gunung Api/Musim Kering (dulu air habis ±520 dtk). Setelah masa itu hotFactor berlaku normal.
  const inSafeTempWindow = env.playtimeSec !== undefined && isSafeTempActive(env.difficulty, env.playtimeSec);
  const heatFactor = next.temperature > B.temperature.hotThreshold && !inSafeTempWindow ? B.water.hotFactor : 1.0;
  const waterDrain = (env.inShelter ? B.water.drainShelter : B.water.drainOpen) * heatFactor * mult;
  const waterStep = stepNeedMeter(next.water, next.waterGraceTimer, dt, {
    drainPerSec: waterDrain,
    fullThresholdPct: B.water.fullThresholdPct,
    fullGraceSec: B.water.fullGraceSec,
    active: true,
  });
  next.water = waterStep.value;
  next.waterGraceTimer = waterStep.graceTimer;

  // 4. Hunger (starts in Era 2+, gated by master switch)
  const hungerActive = switches.hunger && (env.eraYear ?? 1) >= B.hunger.startsAtEra;
  if (hungerActive) {
    const hungerDrain = (env.inShelter ? B.hunger.drainShelter : B.hunger.drainOpen) * mult;
    const hungerStep = stepNeedMeter(next.hunger, next.hungerGraceTimer, dt, {
      drainPerSec: hungerDrain,
      fullThresholdPct: B.hunger.fullThresholdPct,
      fullGraceSec: B.hunger.fullGraceSec,
      active: true,
    });
    next.hunger = hungerStep.value;
    next.hungerGraceTimer = hungerStep.graceTimer;
  } else {
    next.hunger = 100;
    next.hungerGraceTimer = B.hunger.fullGraceSec;
  }

  // 5. Radiation accumulation in meteorite zones
  const radInput =
    env.inShelter || hasRespawnGrace
      ? 0
      : (env.radiationLevel || 0) * (env.hasHazmatLining ? B.radiation.hazmatFactor : 1.0) * B.radiation.inputFactor * (env.radiationMult ?? 1) * mult;
  if (radInput > 0) {
    next.radiation = clamp(next.radiation + radInput * dt, 0, 100);
  } else {
    next.radiation = clamp(next.radiation - B.radiation.decayPerSec * dt, 0, 100);
  }

  // 6. Fatigue (rest meter): drains slowly awake, restores in shelter
  if (env.inShelter) {
    next.fatigue = clamp(next.fatigue + B.fatigue.shelterRegenPerSec * dt, 0, 100);
  } else {
    next.fatigue = clamp(next.fatigue - B.fatigue.drainPerSec * mult * dt, 0, 100);
  }

  // 7. Status effects (burns & wounds)
  if (env.inLava) {
    next.burnTimer = Math.max(next.burnTimer, 5);
  } else {
    next.burnTimer = Math.max(0, next.burnTimer - dt);
  }
  next.woundTimer = Math.max(0, next.woundTimer - dt);

  // 8. Health delta, gradual temperature damage & slow passive regen
  let hpDelta = 0;
  let deathReason: string | null = null;

  if (env.inLava) {
    hpDelta -= B.damage.lavaPerSec * dt;
    deathReason = 'reasonTemp';
  } else if (
    !hasRespawnGrace &&
    (next.temperature >= B.temperature.dangerHigh || next.temperature <= B.temperature.dangerLow) &&
    next.tempDangerTimer >= B.temperature.dangerGraceSec
  ) {
    const excess =
      next.temperature <= B.temperature.dangerLow
        ? B.temperature.dangerLow - next.temperature
        : next.temperature - B.temperature.dangerHigh;
    const ramp = clamp(excess / Math.max(0.1, B.temperature.dangerRampWidthC), 0, 1);
    if (ramp > 0) {
      hpDelta -= B.temperature.dangerDamagePerSec * ramp * mult * dt;
      deathReason = 'reasonTemp';
    }
  }

  if (!hasRespawnGrace && next.oxygen <= B.oxygen.depletedAtPct && next.suffocationTimer >= B.suffocation.graceSec) {
    hpDelta -= B.suffocation.damagePerSec * mult * dt;
    deathReason = 'reasonOxygen';
  }

  if (!hasRespawnGrace && next.water <= B.water.emptyAtPct) {
    hpDelta -= B.water.damagePerSec * mult * dt;
    deathReason = 'reasonDehydration';
  }

  if (!hasRespawnGrace && hungerActive && next.hunger <= B.hunger.emptyAtPct) {
    hpDelta -= B.hunger.damagePerSec * mult * dt;
    if (!deathReason) deathReason = 'reasonStarvation';
  }

  if (!hasRespawnGrace && next.radiation >= B.radiation.dangerAtPct) {
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

  if (!hasRespawnGrace && !env.inShelter && env.weather === 'acid_rain') {
    hpDelta -= (env.hasThermalCloak ? B.damage.acidRainCloakPerSec : B.damage.acidRainPerSec) * mult * dt;
  }

  if (
    env.inShelter &&
    next.oxygen > B.damage.shelterHealMinOxygen &&
    next.water > B.damage.shelterHealMinWater &&
    next.radiation < B.radiation.dangerAtPct
  ) {
    hpDelta += B.damage.shelterHealPerSec * dt;
  } else if (
    !env.inShelter &&
    !env.inLava &&
    !env.inMeteorDanger &&
    env.weather !== 'acid_rain' &&
    hpDelta >= 0 &&
    next.burnTimer <= 0 &&
    next.woundTimer <= 0 &&
    next.temperature >= B.damage.passiveRegenMinTempC &&
    next.temperature <= B.damage.passiveRegenMaxTempC &&
    next.water >= B.damage.passiveRegenMinWater &&
    next.oxygen >= B.damage.passiveRegenMinOxygen &&
    next.radiation <= B.damage.passiveRegenMaxRadiation
  ) {
    hpDelta += B.damage.passiveRegenPerSec * dt;
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
