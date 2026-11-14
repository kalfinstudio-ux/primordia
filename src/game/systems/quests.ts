import { STARTER_QUESTS } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import { getItemCount } from './inventory';
import { t } from '../utils/i18n';

export interface QuestEvalInput {
  waterCollectedCount: number;
  basaltCount: number;
  mineralCount: number;
  hasAxe: boolean;
  hasVessel: boolean;
  shelterCount: number;
  crystalsExtractedCount: number;
}

export function isQuestSatisfied(questId: string, snap: QuestEvalInput): boolean {
  switch (questId) {
    case 'q1':
      return snap.waterCollectedCount >= 1;
    case 'q2':
      return snap.basaltCount >= 4 && snap.mineralCount >= 2;
    case 'q3':
      return snap.hasAxe && snap.hasVessel;
    case 'q4':
      return snap.shelterCount >= 1;
    case 'q5':
      return snap.crystalsExtractedCount >= 1;
    default:
      return false;
  }
}

export function getQuestProgressLabel(questId: string, snap: QuestEvalInput): string {
  switch (questId) {
    case 'q1':
      return `${Math.min(1, snap.waterCollectedCount)}/1`;
    case 'q2':
      return `${Math.min(4, snap.basaltCount)}/4 · ${Math.min(2, snap.mineralCount)}/2`;
    case 'q3':
      return `${(snap.hasAxe ? 1 : 0) + (snap.hasVessel ? 1 : 0)}/2`;
    case 'q4':
      return `${Math.min(1, snap.shelterCount)}/1`;
    case 'q5':
      return `${Math.min(1, snap.crystalsExtractedCount)}/1`;
    default:
      return '';
  }
}

export function evaluateQuests(): { activeQuestId: string | null; progressText: string } {
  const snap: QuestEvalInput = {
    waterCollectedCount: gameState.waterCollectedCount,
    basaltCount: getItemCount('basalt_rock'),
    mineralCount: getItemCount('sulfur_mineral'),
    hasAxe: getItemCount('stone_axe') > 0,
    hasVessel: getItemCount('water_vessel') > 0,
    shelterCount: gameState.placedStructures.filter((s) => s.type === 'basic_shelter').length,
    crystalsExtractedCount: gameState.crystalsExtractedCount,
  };

  while (gameState.activeQuestIdx < STARTER_QUESTS.length) {
    const q = STARTER_QUESTS[gameState.activeQuestIdx];
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
    progressText: `${STARTER_QUESTS.length}/${STARTER_QUESTS.length}`,
  };
}
