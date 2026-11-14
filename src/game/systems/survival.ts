import type { HazardType, WeatherType } from '../config';
import { gameState, setScreen } from '../core/state';
import { getBiomeAt } from '../world/biomes';
import { computeHazardState, stepVitals } from '../player/stats';
import { hasItem } from './inventory';
import { distance2D } from '../utils/math';
import { eventBus } from '../core/eventBus';

export class SurvivalSystem {
  currentHazard: HazardType = 'safe';

  update(
    dt: number,
    groundY: number,
    weather: WeatherType,
    timeOfDay: number,
    inLava: boolean,
    inMeteorDanger: boolean
  ): void {
    if (gameState.screen !== 'hud') return;

    const px = gameState.playerPos.x;
    const pz = gameState.playerPos.z;
    const biome = getBiomeAt(px, pz, groundY);

    const inShelter = gameState.placedStructures.some(
      (s) => s.type === 'basic_shelter' && distance2D(px, pz, s.x, s.z) < 4.5
    );
    const nearCampfire = gameState.placedStructures.some(
      (s) => s.type === 'campfire_kit' && distance2D(px, pz, s.x, s.z) < 6.0
    );

    const isNight = timeOfDay < 0.18 || timeOfDay > 0.78;
    const env = {
      ambientTempC: biome.ambientTempC,
      toxicLevel: biome.toxicLevel,
      weather,
      isNight,
      inShelter,
      nearCampfire,
      hasHeatShield: hasItem('heat_shield'),
      inLava,
      inMeteorDanger,
      difficulty: gameState.settings.gameplay.difficulty,
    };

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
    if (gameState.vitals.health <= 0) {
      gameState.deathReason = 'reasonMeteor';
      eventBus.emit('audio:sfx', 'gameover');
      setScreen('gameOver');
    }
  }
}
