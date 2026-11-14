import type { WeatherType, WorldEventType } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import { writeStorage } from '../utils/storage';
import { t } from '../utils/i18n';
import { BALANCE, isSafeStartActive } from '../data/balance';

export class WorldEventSystem {
  activeEvent: WorldEventType = 'none';
  remainingSec = 0;
  private cooldownSec: number = BALANCE.events.initialCooldownSec;

  update(dt: number, weather: WeatherType): { type: WorldEventType; remainingSec: number } {
    // Masa aman awal: tidak ada event dunia; cooldown tidak berjalan sampai masa aman selesai.
    if (isSafeStartActive(gameState.settings.gameplay.difficulty, gameState.playtimeSec)) {
      this.activeEvent = 'none';
      this.remainingSec = 0;
      this.cooldownSec = Math.max(this.cooldownSec, BALANCE.events.initialCooldownSec);
      return { type: 'none', remainingSec: 0 };
    }
    if (this.activeEvent !== 'none') {
      this.remainingSec -= dt;
      if (this.remainingSec <= 0) {
        this.activeEvent = 'none';
        this.remainingSec = 0;
        this.cooldownSec = BALANCE.events.cooldownMinSec + Math.random() * BALANCE.events.cooldownRandomSec;
      }
      return { type: this.activeEvent, remainingSec: Math.max(0, Math.ceil(this.remainingSec)) };
    }

    this.cooldownSec -= dt;
    if (this.cooldownSec <= 0) {
      const pool: WorldEventType[] =
        weather === 'meteor_shower'
          ? ['meteor_swarm', 'toxic_surge']
          : ['super_eruption', 'toxic_surge', 'meteor_swarm'];
      this.activeEvent = pool[Math.floor(Math.random() * pool.length)];
      this.remainingSec = BALANCE.events.durationSec;
      eventBus.emit('audio:sfx', 'event');
      eventBus.emit('toast:show', { text: t(`events.${this.activeEvent}`), type: 'warn' });
      if (this.activeEvent === 'super_eruption') {
        eventBus.emit('world:quake', { intensity: 0.75 });
      }
    }

    return { type: this.activeEvent, remainingSec: 0 };
  }
}

export function evaluateContextualTutorial(
  hazard: string,
  nearWater: boolean
): string | null {
  const learned = gameState.learnedTutorials;
  const markSeen = (key: string) => {
    if (!learned.includes(key)) {
      learned.push(key);
      writeStorage('learned_tutorials', learned);
    }
  };

  if (nearWater && gameState.waterCollectedCount === 0 && !learned.includes('tut_water')) {
    return 'tut_water';
  }
  if (gameState.waterCollectedCount > 0) markSeen('tut_water');

  if (hazard === 'toxic' && gameState.placedStructures.length === 0 && !learned.includes('tut_shelter')) {
    return 'tut_shelter';
  }
  if (gameState.placedStructures.length > 0) markSeen('tut_shelter');

  if (gameState.buildModeItem && !learned.includes('tut_build')) {
    return 'tut_build';
  }
  if (hazard === 'radiation' && !learned.includes('tut_radiation')) {
    return 'tut_radiation';
  }
  if (gameState.vitals.fatigue < 35 && !learned.includes('tut_fatigue')) {
    return 'tut_fatigue';
  }
  return null;
}

export function dismissTutorial(key: string): void {
  if (!gameState.learnedTutorials.includes(key)) {
    gameState.learnedTutorials.push(key);
    writeStorage('learned_tutorials', gameState.learnedTutorials);
  }
}
