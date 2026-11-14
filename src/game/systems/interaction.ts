import { gameState, setScreen } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { ChunkManager } from '../world/chunkManager';
import type { WorldInteractable } from '../world/props';
import { addItem, damageToolDurability, getBestMiningToolId, hasItem, removeItem } from './inventory';
import { t } from '../utils/i18n';
import type { SkySystem } from '../world/sky';

export function performInteraction(target: WorldInteractable, chunks: ChunkManager, sky?: SkySystem): void {
  const toolId = getBestMiningToolId();
  const mult = toolId === 'meteor_drill' ? 4 : toolId === 'obsidian_pick' ? 3 : toolId === 'stone_axe' ? 2 : 1;

  if (target.kind === 'rock') {
    addItem('basalt_rock', 2 * mult);
    if (Math.random() < 0.75) addItem('ash_clay', 1 * Math.max(1, Math.floor(mult / 2)));
    if (toolId) damageToolDurability(toolId, 1);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+${2 * mult} ${t('items.basalt_rock.name')}`, type: 'info' });
  } else if (target.kind === 'mineral') {
    addItem('sulfur_mineral', 1 * mult);
    if (Math.random() < 0.65) addItem('iron_slag', 1);
    if (toolId) damageToolDurability(toolId, 1);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+${1 * mult} ${t('items.sulfur_mineral.name')}`, type: 'info' });
  } else if (target.kind === 'obsidian') {
    addItem('obsidian_shard', 1 * Math.max(1, mult - 1));
    gameState.obsidianCollectedCount += 1;
    if (toolId) damageToolDurability(toolId, 2);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+${Math.max(1, mult - 1)} ${t('items.obsidian_shard.name')}`, type: 'info' });
  } else if (target.kind === 'salt') {
    addItem('thermal_salt', 2);
    addItem('silicate_sand', 2);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+2 ${t('items.thermal_salt.name')}`, type: 'info' });
  } else if (target.kind === 'meteor_iron') {
    addItem('meteor_iron', toolId === 'meteor_drill' ? 2 : 1);
    gameState.meteorIronCollectedCount += 1;
    if (toolId) damageToolDurability(toolId, 2);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'gather');
    eventBus.emit('toast:show', { text: `+1 ${t('items.meteor_iron.name')}`, type: 'success' });
  } else if (target.kind === 'crystal') {
    addItem('primordial_crystal', 1);
    gameState.crystalsExtractedCount += 1;
    if (toolId) damageToolDurability(toolId, 2);
    target.depleted = true;
    target.mesh.visible = false;
    chunks.spatialHash.remove(`col_${target.id}`);
    eventBus.emit('audio:sfx', 'crystal');
    eventBus.emit('toast:show', { text: `+1 ${t('items.primordial_crystal.name')}`, type: 'success' });
  } else if (target.kind === 'water') {
    gameState.vitals.water = 100;
    gameState.waterCollectedCount += 1;
    gameState.sootLevel = Math.max(0, gameState.sootLevel - 0.5);
    eventBus.emit('audio:sfx', 'water');
    eventBus.emit('toast:show', { text: `${t('hud.water')} 100%`, type: 'info' });
  } else if (target.kind === 'geyser_pool') {
    if (hasItem('seed_of_life')) {
      removeItem('seed_of_life', 1);
      gameState.campaignComplete = true;
      if (!gameState.achievements.includes('ach_seed_of_life')) {
        gameState.achievements.push('ach_seed_of_life');
      }
      eventBus.emit('audio:sfx', 'victory');
      setScreen('victory');
    } else {
      gameState.vitals.water = 100;
      gameState.waterCollectedCount += 1;
      addItem('thermal_salt', 1);
      eventBus.emit('audio:sfx', 'water');
      eventBus.emit('toast:show', { text: `+1 ${t('items.thermal_salt.name')}`, type: 'info' });
    }
  } else if (target.kind === 'storage_chest') {
    gameState.activeStorageId = target.id;
    setScreen('storage');
  } else if (target.kind === 'water_collector') {
    const struct = gameState.placedStructures.find((s) => s.id === target.id);
    if (struct && (struct.waterStored || 0) >= 20) {
      struct.waterStored = 0;
      addItem('purified_water', 1);
      eventBus.emit('audio:sfx', 'water');
      eventBus.emit('toast:show', { text: `+1 ${t('items.purified_water.name')}`, type: 'success' });
    } else {
      gameState.vitals.water = Math.min(100, gameState.vitals.water + 15);
      eventBus.emit('audio:sfx', 'water');
    }
  } else if (target.kind === 'garden_plot') {
    const struct = gameState.placedStructures.find((s) => s.id === target.id);
    if (struct && (struct.growth || 0) >= 100) {
      struct.growth = 0;
      addItem('ash_clay', 3);
      gameState.vitals.health = Math.min(100, gameState.vitals.health + 15);
      gameState.vitals.radiation = Math.max(0, gameState.vitals.radiation - 10);
      eventBus.emit('audio:sfx', 'gather');
      eventBus.emit('toast:show', { text: `+3 ${t('items.ash_clay.name')}`, type: 'success' });
    } else {
      eventBus.emit('toast:show', { text: `${t('hud.actions.garden_not_ready')} (${Math.round(struct?.growth || 0)}%)`, type: 'info' });
    }
  } else if (target.kind === 'auto_drill') {
    const struct = gameState.placedStructures.find((s) => s.id === target.id);
    const n = Math.floor(struct?.stored || 0);
    if (struct && n > 0) {
      struct.stored = 0;
      addItem('basalt_rock', n);
      if (n >= 8) addItem('iron_slag', Math.floor(n / 8));
      eventBus.emit('audio:sfx', 'gather');
      eventBus.emit('toast:show', { text: `+${n} ${t('items.basalt_rock.name')}`, type: 'success' });
    } else {
      eventBus.emit('toast:show', { text: t('hud.actions.drill_empty'), type: 'info' });
    }
  } else if (target.kind === 'fast_beacon') {
    setScreen('map');
  } else if (target.kind === 'shelter') {
    gameState.vitals.health = Math.min(100, gameState.vitals.health + 40);
    gameState.vitals.oxygen = 100;
    gameState.vitals.temperature = 37.0;
    gameState.vitals.fatigue = 100;
    if (sky && (sky.getTimeOfDay() > 0.72 || sky.getTimeOfDay() < 0.2)) {
      sky.setTimeOfDay(0.28); // Sleep safely until morning
    }
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: t('hud.actions.rest_shelter'), type: 'success' });
  }

  // Respawn basic resource nodes after 45s
  if (['rock', 'mineral', 'obsidian', 'salt'].includes(target.kind)) {
    setTimeout(() => {
      if (!chunks) return;
      target.depleted = false;
      target.mesh.visible = true;
    }, 45000);
  }
}
