import { DEFAULT_AVATAR, RECIPES, SAVE_VERSION, type AvatarConfig, type DifficultyLevel } from '../config';
import {
  createInitialVitals,
  gameState,
  type CustomWaypoint,
  type DiscoveredPoi,
  type InventorySlot,
  type PlacedStructure,
  type PlayerVitals,
} from '../core/state';
import { readStorage, writeStorage } from '../utils/storage';
import { eventBus } from '../core/eventBus';
import { saveToCloud, listCloudSaves, deleteCloudSave } from '../net/cloudSave';

export interface SaveSlotData {
  saveVersion: number;
  slot: number;
  source: 'local' | 'cloud';
  worldSeed: string;
  difficulty: DifficultyLevel;
  avatar: AvatarConfig;
  vitals: PlayerVitals;
  inventory: InventorySlot[];
  placedStructures: PlacedStructure[];
  storageInventories: Record<string, InventorySlot[]>;
  completedQuests: string[];
  activeQuestIdx: number;
  discoveredChunks: string[];
  discoveredPois: DiscoveredPoi[];
  customWaypoints: CustomWaypoint[];
  unlockedRecipes: string[];
  journalUnlocked: string[];
  campaignComplete: boolean;
  waterCollectedCount: number;
  crystalsExtractedCount: number;
  obsidianCollectedCount: number;
  meteorIronCollectedCount: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  playtimeSec: number;
  distanceExplored: number;
  updatedAt: string;
}

const LOCAL_SAVES_KEY = 'save_slots';

export function migrateSaveData(raw: Record<string, unknown>, source: 'local' | 'cloud' = 'local'): SaveSlotData {
  const defaultVitals = createInitialVitals();
  const rawVitals = (raw.vitals || {}) as Partial<PlayerVitals>;
  const rawAvatar = (raw.avatar || {}) as Partial<AvatarConfig>;
  const rawStructures = Array.isArray(raw.placedStructures) ? raw.placedStructures : [];
  const defaultRecipes = RECIPES.filter((r) => r.discoveredByDefault).map((r) => r.id);

  return {
    saveVersion: SAVE_VERSION,
    slot: Number(raw.slot) || 1,
    source: (raw.source as 'local' | 'cloud') || source,
    worldSeed: String(raw.worldSeed || 'HADEAN-01'),
    difficulty: (raw.difficulty as DifficultyLevel) || 'survivor',
    avatar: { ...DEFAULT_AVATAR, ...rawAvatar },
    vitals: { ...defaultVitals, ...rawVitals },
    inventory: Array.isArray(raw.inventory) ? (raw.inventory as InventorySlot[]) : [],
    placedStructures: rawStructures.map((s) => {
      const item = s as Partial<PlacedStructure>;
      return {
        id: String(item.id || `struct_${Math.random()}`),
        type: (item.type as PlacedStructure['type']) || 'basic_shelter',
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        z: Number(item.z) || 0,
        rotY: Number(item.rotY) || 0,
        hp: Number(item.hp) || 160,
        maxHp: Number(item.maxHp) || 160,
        waterStored: item.waterStored,
        label: item.label,
      };
    }),
    storageInventories: (raw.storageInventories as Record<string, InventorySlot[]>) || {},
    completedQuests: Array.isArray(raw.completedQuests) ? (raw.completedQuests as string[]) : [],
    activeQuestIdx: Number(raw.activeQuestIdx) || 0,
    discoveredChunks: Array.isArray(raw.discoveredChunks) ? (raw.discoveredChunks as string[]) : ['0,0'],
    discoveredPois: Array.isArray(raw.discoveredPois) ? (raw.discoveredPois as DiscoveredPoi[]) : [],
    customWaypoints: Array.isArray(raw.customWaypoints) ? (raw.customWaypoints as CustomWaypoint[]) : [],
    unlockedRecipes: Array.isArray(raw.unlockedRecipes) ? (raw.unlockedRecipes as string[]) : defaultRecipes,
    journalUnlocked: Array.isArray(raw.journalUnlocked) ? (raw.journalUnlocked as string[]) : ['j_basalt'],
    campaignComplete: Boolean(raw.campaignComplete),
    waterCollectedCount: Number(raw.waterCollectedCount) || 0,
    crystalsExtractedCount: Number(raw.crystalsExtractedCount) || 0,
    obsidianCollectedCount: Number(raw.obsidianCollectedCount) || 0,
    meteorIronCollectedCount: Number(raw.meteorIronCollectedCount) || 0,
    playerPos: (raw.playerPos as SaveSlotData['playerPos']) || { x: 0, y: 0, z: 18, yaw: Math.PI },
    playtimeSec: Number(raw.playtimeSec) || 0,
    distanceExplored: Number(raw.distanceExplored) || 0,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

export function detectSaveConflict(local: SaveSlotData, cloud: SaveSlotData): boolean {
  const timeDiffMs = Math.abs(Date.parse(local.updatedAt) - Date.parse(cloud.updatedAt));
  return (
    timeDiffMs > 15000 &&
    (local.playtimeSec !== cloud.playtimeSec ||
      local.worldSeed !== cloud.worldSeed ||
      local.completedQuests.length !== cloud.completedQuests.length)
  );
}

export function buildCurrentSaveSnapshot(slot: number): SaveSlotData {
  return {
    saveVersion: SAVE_VERSION,
    slot,
    source: 'local',
    worldSeed: gameState.worldSeed,
    difficulty: gameState.settings.gameplay.difficulty,
    avatar: { ...gameState.avatar },
    vitals: { ...gameState.vitals },
    inventory: gameState.inventory.map((s) => ({ ...s })),
    placedStructures: gameState.placedStructures.map((s) => ({ ...s })),
    storageInventories: JSON.parse(JSON.stringify(gameState.storageInventories)),
    completedQuests: [...gameState.completedQuests],
    activeQuestIdx: gameState.activeQuestIdx,
    discoveredChunks: [...gameState.discoveredChunks],
    discoveredPois: gameState.discoveredPois.map((p) => ({ ...p })),
    customWaypoints: gameState.customWaypoints.map((w) => ({ ...w })),
    unlockedRecipes: [...gameState.unlockedRecipes],
    journalUnlocked: [...gameState.journalUnlocked],
    campaignComplete: gameState.campaignComplete,
    waterCollectedCount: gameState.waterCollectedCount,
    crystalsExtractedCount: gameState.crystalsExtractedCount,
    obsidianCollectedCount: gameState.obsidianCollectedCount,
    meteorIronCollectedCount: gameState.meteorIronCollectedCount,
    playerPos: { ...gameState.playerPos },
    playtimeSec: Math.round(gameState.playtimeSec),
    distanceExplored: Math.round(gameState.distanceExplored),
    updatedAt: new Date().toISOString(),
  };
}

export function saveGameToSlot(slot = 1, syncCloud = true): SaveSlotData {
  const snapshot = buildCurrentSaveSnapshot(slot);
  const all = readStorage<Record<string, Record<string, unknown>>>(LOCAL_SAVES_KEY, {});
  all[String(slot)] = snapshot as unknown as Record<string, unknown>;
  writeStorage(LOCAL_SAVES_KEY, all);
  writeStorage('last_slot', slot);

  if (syncCloud && gameState.user.mode === 'authenticated') {
    void saveToCloud(snapshot);
  }
  eventBus.emit('save:completed', snapshot);
  return snapshot;
}

export function getLocalSaves(): SaveSlotData[] {
  const all = readStorage<Record<string, Record<string, unknown>>>(LOCAL_SAVES_KEY, {});
  return Object.values(all)
    .map((raw) => migrateSaveData(raw, 'local'))
    .sort((a, b) => a.slot - b.slot);
}

export function getLatestLocalSave(): SaveSlotData | null {
  const saves = getLocalSaves();
  if (saves.length === 0) return null;
  return [...saves].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export async function getAllAvailableSaves(): Promise<{
  saves: SaveSlotData[];
  conflicts: Array<{ slot: number; local: SaveSlotData; cloud: SaveSlotData }>;
}> {
  const local = getLocalSaves();
  if (gameState.user.mode !== 'authenticated') {
    return { saves: local, conflicts: [] };
  }
  const cloud = await listCloudSaves();
  const conflicts: Array<{ slot: number; local: SaveSlotData; cloud: SaveSlotData }> = [];
  for (const l of local) {
    const match = cloud.find((c) => c.slot === l.slot);
    if (match && detectSaveConflict(l, match)) {
      conflicts.push({ slot: l.slot, local: l, cloud: match });
    }
  }
  return { saves: [...local, ...cloud], conflicts };
}

export async function deleteSaveSlot(slot: number, source: 'local' | 'cloud'): Promise<void> {
  if (source === 'local') {
    const all = readStorage<Record<string, Record<string, unknown>>>(LOCAL_SAVES_KEY, {});
    delete all[String(slot)];
    writeStorage(LOCAL_SAVES_KEY, all);
  } else {
    await deleteCloudSave(slot);
  }
}

export function applySaveDataToState(raw: SaveSlotData): void {
  const data = migrateSaveData(raw as unknown as Record<string, unknown>, raw.source);
  gameState.worldSeed = data.worldSeed;
  gameState.settings.gameplay.difficulty = data.difficulty;
  gameState.avatar = { ...data.avatar };
  gameState.vitals = { ...data.vitals };
  gameState.inventory = data.inventory.map((s) => ({ ...s }));
  gameState.placedStructures = data.placedStructures.map((s) => ({ ...s }));
  gameState.storageInventories = JSON.parse(JSON.stringify(data.storageInventories));
  gameState.completedQuests = [...data.completedQuests];
  gameState.activeQuestIdx = data.activeQuestIdx;
  gameState.discoveredChunks = [...data.discoveredChunks];
  gameState.discoveredPois = [...data.discoveredPois];
  gameState.customWaypoints = [...data.customWaypoints];
  gameState.unlockedRecipes = [...data.unlockedRecipes];
  gameState.journalUnlocked = [...data.journalUnlocked];
  gameState.campaignComplete = data.campaignComplete;
  gameState.waterCollectedCount = data.waterCollectedCount;
  gameState.crystalsExtractedCount = data.crystalsExtractedCount;
  gameState.obsidianCollectedCount = data.obsidianCollectedCount;
  gameState.meteorIronCollectedCount = data.meteorIronCollectedCount;
  gameState.playerPos = { ...data.playerPos };
  gameState.playtimeSec = data.playtimeSec;
  gameState.distanceExplored = data.distanceExplored;
  gameState.activeWorldLoaded = true;
}
