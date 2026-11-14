import { CAMPAIGN_QUESTS } from '../config';
import { gameState, type PlacedStructure } from '../core/state';
import { eventBus } from '../core/eventBus';
import { getItemCount } from './inventory';
import { writeStorage } from '../utils/storage';
import { t } from '../utils/i18n';

export interface QuestEvalInput {
  waterCollectedCount: number;
  basaltCount: number;
  mineralCount: number;
  obsidianCount: number;
  meteorIronCount: number;
  crystalsExtractedCount: number;
  distanceExplored: number;
  campaignComplete: boolean;
  hasItem: (id: string) => boolean;
  countItem: (id: string) => number;
  structures: PlacedStructure[];
}

const MODULAR_SET = new Set(['floor_tile', 'wall_panel', 'roof_panel', 'door_frame']);

export function isQuestSatisfied(questId: string, snap: QuestEvalInput): boolean {
  const countStruct = (type: string) => snap.structures.filter((s) => s.type === type).length;
  const modularCount = snap.structures.filter((s) => MODULAR_SET.has(s.type)).length;

  switch (questId) {
    case 'q1': return snap.waterCollectedCount >= 1;
    case 'q2': return snap.basaltCount >= 4 && snap.mineralCount >= 2;
    case 'q3': return snap.hasItem('stone_axe') && snap.hasItem('water_vessel');
    case 'q4': return countStruct('basic_shelter') >= 1;
    case 'q5': return snap.crystalsExtractedCount >= 1;
    case 'q6': return countStruct('workbench') >= 1;
    case 'q7': return snap.obsidianCount >= 2 || snap.countItem('obsidian_shard') >= 2;
    case 'q8': return snap.hasItem('obsidian_pick');
    case 'q9': return snap.hasItem('gas_filter');
    case 'q10': return countStruct('storage_chest') >= 1;
    case 'q11': return countStruct('smelter_furnace') >= 1;
    case 'q12': return snap.countItem('refined_iron') >= 2;
    case 'q13': return modularCount >= 3;
    case 'q14': return snap.hasItem('thermal_cloak') || snap.hasItem('expedition_pack');
    case 'q15': return countStruct('research_station') >= 1;
    case 'q16': return snap.meteorIronCount >= 2 || snap.countItem('meteor_iron') >= 2;
    case 'q17': return snap.hasItem('crystal_core');
    case 'q18': return countStruct('fast_beacon') >= 1 && snap.distanceExplored >= 600;
    case 'q19': return snap.hasItem('amino_compound');
    case 'q20': return snap.hasItem('lipid_membrane');
    case 'q21': return snap.hasItem('seed_of_life') || snap.campaignComplete;
    case 'q22': return snap.campaignComplete;
    default: return false;
  }
}

export function getQuestProgressLabel(questId: string, snap: QuestEvalInput): string {
  const countStruct = (type: string) => snap.structures.filter((s) => s.type === type).length;
  const modularCount = snap.structures.filter((s) => MODULAR_SET.has(s.type)).length;

  switch (questId) {
    case 'q1': return `${Math.min(1, snap.waterCollectedCount)}/1`;
    case 'q2': return `${Math.min(4, snap.basaltCount)}/4 · ${Math.min(2, snap.mineralCount)}/2`;
    case 'q3': return `${(snap.hasItem('stone_axe') ? 1 : 0) + (snap.hasItem('water_vessel') ? 1 : 0)}/2`;
    case 'q4': return `${Math.min(1, countStruct('basic_shelter'))}/1`;
    case 'q5': return `${Math.min(1, snap.crystalsExtractedCount)}/1`;
    case 'q7': return `${Math.min(2, Math.max(snap.obsidianCount, snap.countItem('obsidian_shard')))}/2`;
    case 'q12': return `${Math.min(2, snap.countItem('refined_iron'))}/2`;
    case 'q13': return `${Math.min(3, modularCount)}/3`;
    case 'q16': return `${Math.min(2, Math.max(snap.meteorIronCount, snap.countItem('meteor_iron')))}/2`;
    case 'q18': return `${Math.min(1, countStruct('fast_beacon'))}/1 · ${Math.min(600, Math.round(snap.distanceExplored))}/600m`;
    default: return isQuestSatisfied(questId, snap) ? '1/1' : '0/1';
  }
}

function evaluateAchievementsAndJournal(biomeId: string): void {
  const unlockAch = (id: string) => {
    if (!gameState.achievements.includes(id)) {
      gameState.achievements.push(id);
      writeStorage('achievements', gameState.achievements);
      eventBus.emit('toast:show', { text: `${t(`achievements.${id}.name`)} ★`, type: 'success' });
    }
  };
  const unlockJournal = (id: string) => {
    if (!gameState.journalUnlocked.includes(id)) {
      gameState.journalUnlocked.push(id);
    }
  };

  if (gameState.waterCollectedCount >= 1) unlockAch('ach_first_water');
  if (gameState.placedStructures.some((s) => s.type === 'basic_shelter')) unlockAch('ach_first_shelter');
  if (gameState.crystalsExtractedCount >= 1) {
    unlockAch('ach_crystal_finder');
    unlockJournal('j_crystal');
  }
  if (gameState.distanceExplored >= 1000) unlockAch('ach_biome_walker');
  if (getItemCount('refined_iron') > 0) unlockAch('ach_metallurgist');
  if (gameState.placedStructures.filter((s) => MODULAR_SET.has(s.type)).length >= 5) unlockAch('ach_modular_architect');
  if (gameState.placedStructures.some((s) => s.type === 'fast_beacon')) unlockAch('ach_beacon_network');
  if (gameState.campaignComplete) unlockAch('ach_seed_of_life');

  if (getItemCount('meteor_iron') > 0) unlockJournal('j_meteor_iron');
  if (getItemCount('thermal_salt') > 0) unlockJournal('j_thermal_salt');

  const biomeMap: Record<string, string> = {
    shallow_ocean: 'j_ocean',
    volcanic_ridge: 'j_volcano',
    sulfur_flats: 'j_sulfur',
    obsidian_fields: 'j_obsidian',
    geyser_basin: 'j_geyser',
    crystal_crater: 'j_crater',
    meteor_impact: 'j_meteor',
  };
  if (biomeMap[biomeId]) unlockJournal(biomeMap[biomeId]);
}

export function evaluateQuests(biomeId = 'black_basalt_plains'): { activeQuestId: string | null; progressText: string } {
  evaluateAchievementsAndJournal(biomeId);

  const snap: QuestEvalInput = {
    waterCollectedCount: gameState.waterCollectedCount,
    basaltCount: getItemCount('basalt_rock'),
    mineralCount: getItemCount('sulfur_mineral'),
    obsidianCount: gameState.obsidianCollectedCount,
    meteorIronCount: gameState.meteorIronCollectedCount,
    crystalsExtractedCount: gameState.crystalsExtractedCount,
    distanceExplored: gameState.distanceExplored,
    campaignComplete: gameState.campaignComplete,
    hasItem: (id) => getItemCount(id) > 0,
    countItem: getItemCount,
    structures: gameState.placedStructures,
  };

  while (gameState.activeQuestIdx < CAMPAIGN_QUESTS.length) {
    const q = CAMPAIGN_QUESTS[gameState.activeQuestIdx];
    if (isQuestSatisfied(q.id, snap)) {
      if (!gameState.completedQuests.includes(q.id)) {
        gameState.completedQuests.push(q.id);
        eventBus.emit('audio:sfx', 'quest');
        eventBus.emit('toast:show', {
          text: `${t(`quests.${q.id}.title`)} ✓`,
          type: 'success',
        });
      }
      gameState.activeQuestIdx++;
    } else {
      return {
        activeQuestId: q.id,
        progressText: getQuestProgressLabel(q.id, snap),
      };
    }
  }

  return {
    activeQuestId: null,
    progressText: `${CAMPAIGN_QUESTS.length}/${CAMPAIGN_QUESTS.length}`,
  };
}
