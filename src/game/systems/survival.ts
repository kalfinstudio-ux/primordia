import type { HazardType, WeatherType, WorldEventType } from '../config';
import { gameState, setScreen } from '../core/state';
import { getBiomeAt, type BiomeId } from '../world/biomes';
import { computeHazardState, stepVitals } from '../player/stats';
import { hasItem } from './inventory';
import { distance2D } from '../utils/math';
import { eventBus } from '../core/eventBus';

export class SurvivalSystem {
  currentHazard: HazardType = 'safe';
  currentBiomeId: BiomeId = 'black_basalt_plains';
  currentSurface: 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur' = 'basalt';
  nearWater = false;

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

    const toxicSurgeBonus = activeEvent === 'toxic_surge' ? 0.35 : 0;
    const heatSurgeBonus = activeEvent === 'super_eruption' ? 8 : 0;
    const isNight = timeOfDay < 0.18 || timeOfDay > 0.78;

    const env = {
      ambientTempC: biome.ambientTempC + heatSurgeBonus,
      toxicLevel: Math.min(1, biome.toxicLevel + toxicSurgeBonus),
      radiationLevel: biome.radiationLevel,
      weather,
      isNight,
      inShelter,
      nearCampfire,
      hasHeatShield: hasItem('heat_shield'),
      hasThermalCloak: hasItem('thermal_cloak'),
      hasHazmatLining: hasItem('hazmat_lining'),
      inLava,
      inMeteorDanger,
      difficulty: gameState.settings.gameplay.difficulty,
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

    if (result.deathReason) {
      gameState.deathReason = result.deathReason;
      eventBus.emit('audio:sfx', 'gameover');
      setScreen('gameOver');
    }
  }

  applyMeteorHit(dist: number): void {
    if (dist > 4.2 || gameState.screen !== 'hud') return;
    const dmg = Math.max(15, 65 * (1 - dist / 4.2));
    gameState.vitals.health = Math.max(0, gameState.vitals.health - dmg);
    gameState.vitals.woundTimer = Math.max(gameState.vitals.woundTimer, 8);
    if (gameState.vitals.health <= 0) {
      gameState.deathReason = 'reasonMeteor';
      eventBus.emit('audio:sfx', 'gameover');
      setScreen('gameOver');
    }
  }

  applyLightningHit(dist: number): void {
    if (dist > 3.6 || gameState.screen !== 'hud') return;
    gameState.vitals.health = Math.max(0, gameState.vitals.health - 28);
    gameState.vitals.burnTimer = Math.max(gameState.vitals.burnTimer, 6);
    if (gameState.vitals.health <= 0) {
      gameState.deathReason = 'reasonTemp';
      eventBus.emit('audio:sfx', 'gameover');
      setScreen('gameOver');
    }
  }
}
