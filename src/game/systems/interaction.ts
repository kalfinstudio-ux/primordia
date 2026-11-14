import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { ChunkManager } from '../world/chunkManager';
import type { WorldInteractable } from '../world/props';
import { addItem, hasItem } from './inventory';
import { t } from '../utils/i18n';

export function performInteraction(target: WorldInteractable, chunks: ChunkManager): void {
  const axeMult = hasItem('stone_axe') ? 2 : 1;

  if (target.kind === 'rock') {
    addItem('basalt_rock', 2 * axeMult);
    target.depleted = true;
    target.mesh.visible = false;
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+${2 * axeMult} ${t('items.basalt_rock.name')}`, type: 'info' });
  } else if (target.kind === 'mineral') {
    addItem('sulfur_mineral', 1 * axeMult);
    target.depleted = true;
    target.mesh.visible = false;
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+${1 * axeMult} ${t('items.sulfur_mineral.name')}`, type: 'info' });
  } else if (target.kind === 'crystal') {
    addItem('primordial_crystal', 1);
    gameState.crystalsExtractedCount += 1;
    target.depleted = true;
    target.mesh.visible = false;
    eventBus.emit('audio:sfx', 'crystal');
    eventBus.emit('toast:show', { text: `+1 ${t('items.primordial_crystal.name')}`, type: 'success' });
  } else if (target.kind === 'water') {
    gameState.vitals.water = 100;
    gameState.waterCollectedCount += 1;
    eventBus.emit('audio:sfx', 'water');
    eventBus.emit('toast:show', { text: `${t('hud.water')} 100%`, type: 'info' });
  } else if (target.kind === 'shelter') {
    gameState.vitals.health = Math.min(100, gameState.vitals.health + 35);
    gameState.vitals.oxygen = 100;
    gameState.vitals.temperature = 37.0;
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: t('hud.actions.rest_shelter'), type: 'success' });
  }

  // Respawn depleted basic rocks/minerals after 45s so world never soft-locks
  if (target.kind === 'rock' || target.kind === 'mineral') {
    setTimeout(() => {
      if (!chunks) return;
      target.depleted = false;
      target.mesh.visible = true;
    }, 45000);
  }
}
