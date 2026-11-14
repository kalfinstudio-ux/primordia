import { currentSeasonFx, perkEffects } from '../data/eden';
import type { HazardType, WeatherType, WorldEventType } from '../config';
import { gameState } from '../core/state';
import { getBiomeAt, type BiomeId } from '../world/biomes';
import { computeHazardState, isSuffocating, stepVitals } from '../player/stats';
import { hasItem } from './inventory';
import { distance2D } from '../utils/math';
import { eventBus } from '../core/eventBus';
import { t } from '../utils/i18n';
import { BALANCE, capToxicLevelForSafeStart } from '../data/balance';
import { handlePlayerDeath } from './deathBag';
import { findNearestCleanAir, type CleanAirTarget, type HeightSampler } from './cleanAir';

export class SurvivalSystem {
  currentHazard: HazardType = 'safe';
  currentBiomeId: BiomeId = 'black_basalt_plains';
  currentSurface: 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur' = 'basalt';
  nearWater = false;
  cleanAir: CleanAirTarget | null = null;
  private cleanAirTimer = 0;
  private lowOxygenWarned = false;
  private suffocationWarned = false;

  update(
    dt: number,
    groundY: number,
    weather: WeatherType,
    timeOfDay: number,
    inLava: boolean,
    inMeteorDanger: boolean,
    activeEvent: WorldEventType = 'none'
  ): void {
    if (gameState.screen !== 'hud') return;

    const px = gameState.playerPos.x;
    const pz = gameState.playerPos.z;
    const biome = getBiomeAt(px, pz, groundY);
    this.currentBiomeId = biome.id;
    this.currentSurface = biome.surfaceType;
    this.nearWater = biome.nearWater;

    const inShelter = gameState.placedStructures.some(
      (s) => (s.type === 'basic_shelter' || s.type === 'roof_panel') && distance2D(px, pz, s.x, s.z) < 4.5
    );
    const nearCampfire = gameState.placedStructures.some(
      (s) => s.type === 'campfire_kit' && distance2D(px, pz, s.x, s.z) < 6.0
    );

    const toxicSurgeBonus = activeEvent === 'toxic_surge' ? BALANCE.events.toxicSurgeBonus : 0;
    const heatSurgeBonus = activeEvent === 'super_eruption' ? BALANCE.events.superEruptionHeat : 0;
    const difficulty = gameState.settings.gameplay.difficulty;
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
      radiationLevel: biome.radiationLevel,
      weather,
      isNight,
      inShelter,
      nearCampfire,
      hasHeatShield: hasItem('heat_shield'),
      hasThermalCloak: hasItem('thermal_cloak'),
      hasHazmatLining: hasItem('hazmat_lining'),
      filterDrainMult: perkEffects(gameState.wisdomPerks).filterDrainMult,
      radiationMult: perkEffects(gameState.wisdomPerks).radiationMult,
      inLava,
      inMeteorDanger,
      difficulty,
    };

    // Progressive ash/soot grime during ash storms or volcanic zones (washed clean in water)
    if (biome.nearWater) {
      gameState.sootLevel = Math.max(0, gameState.sootLevel - dt * 0.4);
    } else if (weather === 'ash_storm' || biome.id === 'ash_dunes' || biome.id === 'volcanic_ridge') {
      gameState.sootLevel = Math.min(1, gameState.sootLevel + dt * 0.025);
    }

    this.currentHazard = computeHazardState(env);

    const result = stepVitals(gameState.vitals, env, dt);
    gameState.vitals = result.vitals;

    this.emitBreathingWarnings();

    if (result.deathReason) {
      handlePlayerDeath(result.deathReason);
    }
  }

  /** Toast bertahap: oksigen rendah, lalu sesak. Direset saat oksigen pulih. */
  private emitBreathingWarnings(): void {
    const v = gameState.vitals;
    if (!this.lowOxygenWarned && v.oxygen < BALANCE.oxygen.lowWarnPct) {
      this.lowOxygenWarned = true;
      eventBus.emit('toast:show', { text: t('survival.lowOxygen'), type: 'warn' });
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

  applyMeteorHit(dist: number): void {
    if (dist > 4.2 || gameState.screen !== 'hud') return;
    const dmg = Math.max(15, 65 * (1 - dist / 4.2));
    gameState.vitals.health = Math.max(0, gameState.vitals.health - dmg);
    gameState.vitals.woundTimer = Math.max(gameState.vitals.woundTimer, 8);
    if (gameState.vitals.health <= 0) {
      handlePlayerDeath('reasonMeteor');
    }
  }

  applyLightningHit(dist: number): void {
    if (dist > 3.6 || gameState.screen !== 'hud') return;
    gameState.vitals.health = Math.max(0, gameState.vitals.health - 28);
    gameState.vitals.burnTimer = Math.max(gameState.vitals.burnTimer, 6);
    if (gameState.vitals.health <= 0) {
      handlePlayerDeath('reasonTemp');
    }
  }
}
