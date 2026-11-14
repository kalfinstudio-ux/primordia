import type { AvatarConfig, DifficultyLevel } from '../config';
import { gameState, type InventorySlot, type PlacedStructure, type PlayerVitals } from '../core/state';
import { readStorage, writeStorage } from '../utils/storage';
import { eventBus } from '../core/eventBus';
import { saveToCloud, listCloudSaves, deleteCloudSave } from '../net/cloudSave';

export interface SaveSlotData {
  slot: number;
  source: 'local' | 'cloud';
  worldSeed: string;
  difficulty: DifficultyLevel;
  avatar: AvatarConfig;
  vitals: PlayerVitals;
  inventory: InventorySlot[];
  placedStructures: PlacedStructure[];
  completedQuests: string[];
  activeQuestIdx: number;
  waterCollectedCount: number;
  crystalsExtractedCount: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  playtimeSec: number;
  distanceExplored: number;
  updatedAt: string;
}

const LOCAL_SAVES_KEY = 'save_slots';

export function buildCurrentSaveSnapshot(slot: number): SaveSlotData {
  return {
    slot,
    source: 'local',
    worldSeed: gameState.worldSeed,
    difficulty: gameState.settings.gameplay.difficulty,
    avatar: { ...gameState.avatar },
    vitals: { ...gameState.vitals },
    inventory: gameState.inventory.map((s) => ({ ...s })),
    placedStructures: gameState.placedStructures.map((s) => ({ ...s })),
    completedQuests: [...gameState.completedQuests],
    activeQuestIdx: gameState.activeQuestIdx,
    waterCollectedCount: gameState.waterCollectedCount,
    crystalsExtractedCount: gameState.crystalsExtractedCount,
    playerPos: { ...gameState.playerPos },
    playtimeSec: Math.round(gameState.playtimeSec),
    distanceExplored: Math.round(gameState.distanceExplored),
    updatedAt: new Date().toISOString(),
  };
}

export function saveGameToSlot(slot = 1, syncCloud = true): SaveSlotData {
  const snapshot = buildCurrentSaveSnapshot(slot);
  const all = readStorage<Record<string, SaveSlotData>>(LOCAL_SAVES_KEY, {});
  all[String(slot)] = snapshot;
  writeStorage(LOCAL_SAVES_KEY, all);
  writeStorage('last_slot', slot);

  if (syncCloud && gameState.user.mode === 'authenticated') {
    void saveToCloud(snapshot);
  }
  eventBus.emit('save:completed', snapshot);
  return snapshot;
}

export function getLocalSaves(): SaveSlotData[] {
  const all = readStorage<Record<string, SaveSlotData>>(LOCAL_SAVES_KEY, {});
  return Object.values(all).sort((a, b) => a.slot - b.slot);
}

export function getLatestLocalSave(): SaveSlotData | null {
  const saves = getLocalSaves();
  if (saves.length === 0) return null;
  return [...saves].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export async function getAllAvailableSaves(): Promise<SaveSlotData[]> {
  const local = getLocalSaves();
  if (gameState.user.mode !== 'authenticated') return local;
  const cloud = await listCloudSaves();
  return [...local, ...cloud];
}

export async function deleteSaveSlot(slot: number, source: 'local' | 'cloud'): Promise<void> {
  if (source === 'local') {
    const all = readStorage<Record<string, SaveSlotData>>(LOCAL_SAVES_KEY, {});
    delete all[String(slot)];
    writeStorage(LOCAL_SAVES_KEY, all);
  } else {
    await deleteCloudSave(slot);
  }
}

export function applySaveDataToState(data: SaveSlotData): void {
  gameState.worldSeed = data.worldSeed;
  gameState.settings.gameplay.difficulty = data.difficulty;
  gameState.avatar = { ...data.avatar };
  gameState.vitals = { ...data.vitals };
  gameState.inventory = data.inventory.map((s) => ({ ...s }));
  gameState.placedStructures = data.placedStructures.map((s) => ({ ...s }));
  gameState.completedQuests = [...data.completedQuests];
  gameState.activeQuestIdx = data.activeQuestIdx;
  gameState.waterCollectedCount = data.waterCollectedCount || 0;
  gameState.crystalsExtractedCount = data.crystalsExtractedCount || 0;
  gameState.playerPos = { ...data.playerPos };
  gameState.playtimeSec = data.playtimeSec || 0;
  gameState.distanceExplored = data.distanceExplored || 0;
  gameState.activeWorldLoaded = true;
}
