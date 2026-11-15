import { currentSeasonFx, getWorldAge, perkEffects } from '../data/eden';
import { WATER_LEVEL, type HazardType, type WeatherType, type WorldEventType } from '../config';
import { gameState } from '../core/state';
import { getBiomeAt, type BiomeId } from '../world/biomes';
import { dangerTier } from '../world/regions';
import { computeHazardState, isSuffocating, stepVitals } from '../player/stats';
import { hasItem, removeItem } from './inventory';
import { distance2D } from '../utils/math';
import { eventBus } from '../core/eventBus';
import { t } from '../utils/i18n';
import {
  BALANCE,
  capRadiationForSafeStart,
  capToxicLevelForSafeStart,
  earlyEaseMultiplier,
  isSafeStartActive,
  shouldAutoEquipFilter,
} from '../data/balance';
import { computeFallDamage, stepPlayerWetness } from '../data/survivalRates';
import { handlePlayerDeath } from './deathBag';
import { findNearestCleanAir, findNearestHeatSource, type CleanAirTarget, type HeatSourceTarget, type HeightSampler } from './cleanAir';

export interface SurvivalFrameContext {
  rainWeight?: number;
  windStrength?: number;
  inWater?: boolean;
  immersed?: boolean;
  eraYear?: number;
  waterLevel?: number;
}

export class SurvivalSystem {
  currentHazard: HazardType = 'safe';
  currentBiomeId: BiomeId = 'black_basalt_plains';
  currentSurface: 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur' = 'basalt';
  nearWater = false;
  inShelter = false;
  nearCampfire = false;
  inWater = false;
  immersed = false;
  cleanAir: CleanAirTarget | null = null;
  heatSource: HeatSourceTarget | null = null;
  private cleanAirTimer = 0;
  private heatSourceTimer = 0;
  private lowOxygenWarned = false;
  private suffocationWarned = false;
  private coldWarned = false;
  private heatWarned = false;
  private lowWaterWarned = false;

  update(
    dt: number,
    groundY: number,
    weather: WeatherType,
    timeOfDay: number,
    inLava: boolean,
    inMeteorDanger: boolean,
    activeEvent: WorldEventType = 'none',
    ctx?: SurvivalFrameContext
  ): void {
    if (gameState.screen !== 'hud') return;

    const px = gameState.playerPos.x;
    const pz = gameState.playerPos.z;
    const biome = getBiomeAt(px, pz, groundY);
    this.currentBiomeId = biome.id;
    this.currentSurface = biome.surfaceType;
    this.nearWater = biome.nearWater;

    const inShelter =
      gameState.placedStructures.some(
        (s) => (s.type === 'basic_shelter' || s.type === 'roof_panel') && distance2D(px, pz, s.x, s.z) < 4.5
      ) || Boolean(gameState.stormSanctuaryActive);
    this.inShelter = inShelter;
    const nearCampfire = gameState.placedStructures.some(
      (s) => s.type === 'campfire_kit' && distance2D(px, pz, s.x, s.z) < 6.0
    );
    this.nearCampfire = nearCampfire;

    const waterLevel = ctx?.waterLevel ?? WATER_LEVEL;
    const waterDepth = waterLevel - groundY;
    const inWater = ctx?.inWater ?? waterDepth > 0.15;
    const immersed = ctx?.immersed ?? waterDepth > 1.15;
    this.inWater = inWater;
    this.immersed = immersed;

    const rainWeight = ctx?.rainWeight ?? (weather === 'acid_rain' || weather === 'electrical_storm' ? 1 : 0);
    const windStrength = ctx?.windStrength ?? gameState.wind.strength;
    const eraYear = ctx?.eraYear ?? getWorldAge().eraYear;

    gameState.wetness = stepPlayerWetness(gameState.wetness, dt, {
      rainWeight,
      inWater,
      immersed,
      inShelter,
      nearCampfire,
      windStrength,
    });

    const toxicSurgeBonus = activeEvent === 'toxic_surge' ? BALANCE.events.toxicSurgeBonus : 0;
    const heatSurgeBonus = activeEvent === 'super_eruption' ? BALANCE.events.superEruptionHeat : 0;
    const difficulty = gameState.settings.gameplay.difficulty;
    const survivalRate = gameState.settings.gameplay.survivalRate ?? BALANCE.survivalRates.defaultPreset;
    const isNight = timeOfDay < 0.18 || timeOfDay > 0.78;

    const env = {
      ambientTempC: biome.ambientTempC + heatSurgeBonus + currentSeasonFx().tempOffsetC,
      toxicLevel: capToxicLevelForSafeStart(
        Math.min(1, biome.toxicLevel + toxicSurgeBonus),
        px,
        pz,
        difficulty,
        gameState.playtimeSec
      ),
      radiationLevel: capRadiationForSafeStart(biome.radiationLevel, px, pz, difficulty, gameState.playtimeSec),
      weather,
      isNight,
      inShelter,
      nearCampfire,
      hasHeatShield: hasItem('heat_shield'),
      hasStarterCloak: hasItem('ash_cloak'),
      hasThermalCloak: hasItem('thermal_cloak'),
      hasHazmatLining: hasItem('hazmat_lining'),
      filterDrainMult: perkEffects(gameState.wisdomPerks).filterDrainMult,
      radiationMult: perkEffects(gameState.wisdomPerks).radiationMult,
      inLava,
      inMeteorDanger,
      difficulty,
      survivalRate,
      easeMult: earlyEaseMultiplier(difficulty, gameState.playtimeSec),
      playtimeSec: gameState.playtimeSec,
      biomeId: biome.id,
      eraYear,
      wetness: gameState.wetness,
      inWater,
      immersed,
      windStrength,
      regionTier: dangerTier(px, pz),
    };

    // Progressive ash/soot grime during ash storms or volcanic zones (washed clean in water)
    if (biome.nearWater || inWater) {
      gameState.sootLevel = Math.max(0, gameState.sootLevel - dt * 0.4);
    } else if (weather === 'ash_storm' || biome.id === 'ash_dunes' || biome.id === 'volcanic_ridge') {
      gameState.sootLevel = Math.min(1, gameState.sootLevel + dt * 0.025);
    }

    this.currentHazard = computeHazardState(env);

    // Pemain baru: pasang Filter Gas otomatis sebelum oksigen habis (bila punya filter).
    if (
      shouldAutoEquipFilter({
        oxygen: gameState.vitals.oxygen,
        filterDurability: gameState.vitals.filterDurability,
        exposed: !inShelter && (env.toxicLevel > 0 || weather === 'ash_storm'),
        hasFilter: hasItem('gas_filter'),
        diff: difficulty,
      })
    ) {
      removeItem('gas_filter', 1);
      gameState.vitals.filterDurability = BALANCE.filter.maxDurability;
      eventBus.emit('audio:sfx', 'craft');
      eventBus.emit('toast:show', { text: t('survival.autoFilter'), type: 'success' });
    }

    const result = stepVitals(gameState.vitals, env, dt);
    gameState.vitals = result.vitals;

    this.emitBreathingWarnings(weather);
    this.emitTempAndWaterWarnings();

    if (result.deathReason) {
      handlePlayerDeath(result.deathReason);
    }
  }

  /** Apply fall damage calculated from downward landing speed (m/s), reduced/canceled on water landings. */
  applyFallDamage(landingSpeedMs: number, inWater: boolean, immersed: boolean): void {
    if (gameState.screen !== 'hud') return;
    const dmg = computeFallDamage(landingSpeedMs, {
      inWater,
      immersed,
      survivalRate: gameState.settings.gameplay.survivalRate ?? BALANCE.survivalRates.defaultPreset,
    });
    if (dmg <= 0) return;

    gameState.vitals.health = Math.max(0, gameState.vitals.health - dmg);
    if (dmg >= 25) {
      gameState.vitals.woundTimer = Math.max(gameState.vitals.woundTimer, 6);
    }
    eventBus.emit('audio:sfx', 'hurt');
    eventBus.emit('toast:show', { text: t('survival.fallHurt').replace('{dmg}', String(Math.round(dmg))), type: 'warn' });
    if (gameState.vitals.health <= 0) {
      handlePlayerDeath('reasonFall');
    }
  }

  /** Toast bertahap: oksigen rendah, lalu sesak. Direset saat oksigen pulih. */
  private emitBreathingWarnings(weather: WeatherType): void {
    const v = gameState.vitals;
    if (!this.lowOxygenWarned && v.oxygen < BALANCE.oxygen.lowWarnPct) {
      this.lowOxygenWarned = true;
      const stormNoShelter =
        (weather === 'ash_storm' || weather === 'acid_rain') &&
        !gameState.placedStructures.some((s) => s.type === 'basic_shelter' || s.type === 'roof_panel');
      eventBus.emit('toast:show', { text: t(stormNoShelter ? 'survival.noRefuge' : 'survival.lowOxygen'), type: 'warn' });
    } else if (this.lowOxygenWarned && v.oxygen > BALANCE.oxygen.lowWarnResetPct) {
      this.lowOxygenWarned = false;
    }
    if (!this.suffocationWarned && isSuffocating(v)) {
      this.suffocationWarned = true;
      eventBus.emit('toast:show', { text: t('survival.suffocating'), type: 'warn' });
    } else if (this.suffocationWarned && v.suffocationTimer === 0) {
      this.suffocationWarned = false;
    }
  }

  /** Peringatan dini untuk suhu dingin, suhu panas, dan hidrasi rendah. */
  private emitTempAndWaterWarnings(): void {
    const v = gameState.vitals;
    if (!this.coldWarned && v.temperature <= BALANCE.temperature.coldWarnBannerC) {
      this.coldWarned = true;
      eventBus.emit('toast:show', { text: t('survival.coldWarning'), type: 'warn' });
    } else if (this.coldWarned && v.temperature >= BALANCE.temperature.coldWarnResetC) {
      this.coldWarned = false;
    }

    if (!this.heatWarned && v.temperature >= BALANCE.temperature.heatWarnBannerC) {
      this.heatWarned = true;
      eventBus.emit('toast:show', { text: t('survival.heatWarning'), type: 'warn' });
    } else if (this.heatWarned && v.temperature <= BALANCE.temperature.heatWarnResetC) {
      this.heatWarned = false;
    }

    if (!this.lowWaterWarned && v.water <= BALANCE.water.lowWarnPct) {
      this.lowWaterWarned = true;
      eventBus.emit('toast:show', { text: t('survival.lowWater'), type: 'warn' });
    } else if (this.lowWaterWarned && v.water >= BALANCE.water.lowWarnResetPct) {
      this.lowWaterWarned = false;
    }
  }

  /** Perbarui target udara bersih (dibatasi waktu) hanya saat oksigen rendah. */
  updateCleanAir(dt: number, sampleHeight: HeightSampler, weather: WeatherType): void {
    if (gameState.screen !== 'hud') return;
    if (gameState.vitals.oxygen >= BALANCE.oxygen.lowWarnPct) {
      this.cleanAir = null;
      this.cleanAirTimer = 0;
      return;
    }
    this.cleanAirTimer -= dt;
    if (this.cleanAirTimer > 0) return;
    this.cleanAirTimer = BALANCE.cleanAir.refreshSec;
    const p = gameState.playerPos;
    this.cleanAir = findNearestCleanAir(
      p.x,
      p.z,
      sampleHeight,
      gameState.placedStructures,
      weather === 'ash_storm' || weather === 'acid_rain'
    );
  }

  /** Cari sumber panas terdekat saat suhu tubuh mulai dingin. */
  updateHeatSource(dt: number, geysers: ReadonlyArray<{ x: number; z: number }>): void {
    if (gameState.screen !== 'hud') return;
    if (gameState.vitals.temperature > BALANCE.temperature.coldWarnBannerC || this.inShelter || this.nearCampfire) {
      this.heatSource = null;
      this.heatSourceTimer = 0;
      return;
    }
    this.heatSourceTimer -= dt;
    if (this.heatSourceTimer > 0) return;
    this.heatSourceTimer = BALANCE.cleanAir.refreshSec;
    const p = gameState.playerPos;
    this.heatSource = findNearestHeatSource(p.x, p.z, gameState.placedStructures, geysers);
  }

  applyMeteorHit(dist: number): void {
    if (dist > 4.2 || gameState.screen !== 'hud') return;
    const diff = gameState.settings.gameplay.difficulty;
    if (gameState.vitals.respawnGraceTimer > 0 || isSafeStartActive(diff, gameState.playtimeSec)) return;
    const dmg = Math.max(15, 65 * (1 - dist / 4.2));
    gameState.vitals.health = Math.max(0, gameState.vitals.health - dmg);
    gameState.vitals.woundTimer = Math.max(gameState.vitals.woundTimer, 8);
    if (gameState.vitals.health <= 0) {
      handlePlayerDeath('reasonMeteor');
    }
  }

  applyLightningHit(dist: number): void {
    if (dist > 3.6 || gameState.screen !== 'hud') return;
    if (gameState.vitals.respawnGraceTimer > 0) return;
    gameState.vitals.health = Math.max(0, gameState.vitals.health - 28);
    gameState.vitals.burnTimer = Math.max(gameState.vitals.burnTimer, 6);
    if (gameState.vitals.health <= 0) {
      handlePlayerDeath('reasonTemp');
    }
  }
}
