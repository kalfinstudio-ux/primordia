import {
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  RECIPES,
  type AvatarConfig,
  type GameSettings,
  type HazardType,
  type ScreenName,
  type WeatherType,
  type WorldEventType,
} from '../config';
import { eventBus } from './eventBus';
import { readStorage, writeStorage } from '../utils/storage';
import { recommendGraphicsPreset } from '../utils/device';
import { setLanguage } from '../utils/i18n';
import { BALANCE } from '../data/balance';

export interface InventorySlot {
  itemId: string;
  qty: number;
  durability?: number;
}

export interface PlayerVitals {
  health: number; // 0..100
  stamina: number; // 0..100
  temperature: number; // Celsius
  oxygen: number; // 0..100
  water: number; // 0..100
  radiation: number; // 0..100
  fatigue: number; // 0..100 (100 = rested, 0 = exhausted)
  filterDurability: number; // 0..100
  burnTimer: number; // seconds remaining
  woundTimer: number; // seconds remaining
  suffocationTimer: number; // seconds sejak oksigen habis (status sesak)
}

export interface DeathBag {
  id: string;
  x: number;
  y: number;
  z: number;
  createdAtSec: number;
  items: InventorySlot[];
}

export type StructureType =
  | 'basic_shelter'
  | 'campfire_kit'
  | 'workbench'
  | 'smelter_furnace'
  | 'research_station'
  | 'terrain_anchor'
  | 'storage_chest'
  | 'water_collector'
  | 'fast_beacon'
  | 'floor_tile'
  | 'wall_panel'
  | 'roof_panel'
  | 'door_frame';

export interface PlacedStructure {
  id: string;
  type: StructureType;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  waterStored?: number;
  label?: string;
  /** Hanya terrain_anchor: seed medan yang dibekukan. */
  anchorSeed?: string;
}

export interface DiscoveredPoi {
  id: string;
  kind: 'volcano' | 'geyser' | 'crater' | 'obsidian_crevasse' | 'meteor_site' | 'water_spring';
  x: number;
  z: number;
  labelKey: string;
}

export interface CustomWaypoint {
  id: string;
  x: number;
  z: number;
  label: string;
}

export interface DebugTelemetry {
  fps: number;
  activeChunks: number;
  pendingChunks: number;
  drawCalls: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  biomeId: string;
  hazard: HazardType;
}

export interface HudSnapshot {
  vitals: PlayerVitals;
  headingDeg: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  timeOfDay: number;
  weather: WeatherType;
  hazard: HazardType;
  biomeId: string;
  activeEvent: { type: WorldEventType; remainingSec: number };
  interactTarget: { id: string; actionKey: string } | null;
  activeQuestId: string | null;
  questProgressText: string;
  questsCompletedCount: number;
  hotbar: Array<InventorySlot | null>;
  selectedHotbarIdx: number;
  equippedToolId: string | null;
  carryWeight: number;
  maxCarryWeight: number;
  buildModeItem: StructureType | null;
  buildValid: boolean;
  distanceExplored: number;
  playtimeSec: number;
  tutorialHintKey: string | null;
  minimapNodes: Array<{ x: number; z: number; kind: 'water' | 'crystal' | 'shelter' | 'volcano' | 'beacon' | 'geyser' | 'player' }>;
  online: { status: 'off' | 'connecting' | 'online' | 'error'; players: number };
  cleanAir: { dist: number; relDeg: number; kind: 'shelter' | 'terrain' } | null;
  deathBag: { dist: number; relDeg: number } | null;
  debug: DebugTelemetry;
}

export interface UserSession {
  mode: 'guest' | 'authenticated';
  userId: string | null;
  email: string | null;
}

export interface RuntimeGameState {
  screen: ScreenName;
  previousScreen: ScreenName;
  onboardingDone: boolean;
  worldSeed: string;
  /** Waktu lahir (ms epoch, waktu nyata). Umur abadi dihitung dari sini dan tidak pernah direset. */
  bornAtMs: number;
  avatar: AvatarConfig;
  settings: GameSettings;
  user: UserSession;
  vitals: PlayerVitals;
  inventory: InventorySlot[];
  hotbarItemIds: Array<string | null>;
  selectedHotbarIdx: number;
  completedQuests: string[];
  activeQuestIdx: number;
  placedStructures: PlacedStructure[];
  deathBags: DeathBag[];
  storageInventories: Record<string, InventorySlot[]>;
  discoveredChunks: string[];
  discoveredPois: DiscoveredPoi[];
  customWaypoints: CustomWaypoint[];
  unlockedRecipes: string[];
  /** Perk kebijaksanaan yang sudah dibeli (dari umur abadi). */
  wisdomPerks: string[];
  learnedTutorials: string[];
  achievements: string[];
  journalUnlocked: string[];
  activeStorageId: string | null;
  buildModeItem: StructureType | null;
  buildRotOffset: number;
  debugOpen: boolean;
  newGamePlusCount: number;
  campaignComplete: boolean;
  sootLevel: number; // 0..1 ash accumulation on suit
  playtimeSec: number;
  distanceExplored: number;
  deathReason: string;
  activeWorldLoaded: boolean;
  waterCollectedCount: number;
  crystalsExtractedCount: number;
  obsidianCollectedCount: number;
  meteorIronCollectedCount: number;
  surveyContractsCleared: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  lastHudSnapshot: HudSnapshot | null;
}

function getDefaultUnlockedRecipes(): string[] {
  return RECIPES.filter((r) => r.discoveredByDefault).map((r) => r.id);
}

function loadInitialSettings(): GameSettings {
  const saved = readStorage<Partial<GameSettings>>('settings', {});
  const recommended = recommendGraphicsPreset();
  const merged: GameSettings = {
    graphics: {
      ...DEFAULT_SETTINGS.graphics,
      preset: recommended,
      shadows: recommended !== 'low',
      particles: recommended !== 'low',
      ...saved.graphics,
    },
    audio: { ...DEFAULT_SETTINGS.audio, ...saved.audio },
    controls: {
      ...DEFAULT_SETTINGS.controls,
      ...saved.controls,
      keys: { ...DEFAULT_SETTINGS.controls.keys, ...(saved.controls?.keys || {}) },
    },
    gameplay: { ...DEFAULT_SETTINGS.gameplay, ...saved.gameplay },
    language: saved.language || DEFAULT_SETTINGS.language,
  };
  setLanguage(merged.language);
  return merged;
}

export function createInitialVitals(): PlayerVitals {
  return {
    health: 100,
    stamina: 100,
    temperature: 37.0,
    oxygen: 100,
    water: 90,
    radiation: 0,
    fatigue: 100,
    filterDurability: 0,
    burnTimer: 0,
    woundTimer: 0,
    suffocationTimer: 0,
  };
}

export const gameState: RuntimeGameState = {
  screen: 'splash',
  previousScreen: 'menu',
  onboardingDone: readStorage<boolean>('onboarding_done', false),
  worldSeed: 'HADEAN-01',
  bornAtMs: Date.now(),
  avatar: { ...DEFAULT_AVATAR, ...readStorage<Partial<AvatarConfig>>('last_avatar', {}) },
  settings: loadInitialSettings(),
  user: { mode: 'guest', userId: null, email: null },
  vitals: createInitialVitals(),
  inventory: [],
  hotbarItemIds: ['stone_axe', 'water_vessel', 'heat_shield', 'basic_shelter', 'campfire_kit', null],
  selectedHotbarIdx: 0,
  completedQuests: [],
  activeQuestIdx: 0,
  placedStructures: [],
  deathBags: [],
  storageInventories: {},
  discoveredChunks: [],
  discoveredPois: [],
  customWaypoints: [],
  unlockedRecipes: getDefaultUnlockedRecipes(),
  wisdomPerks: [],
  learnedTutorials: readStorage<string[]>('learned_tutorials', []),
  achievements: readStorage<string[]>('achievements', []),
  journalUnlocked: ['j_basalt'],
  activeStorageId: null,
  buildModeItem: null,
  buildRotOffset: 0,
  debugOpen: false,
  newGamePlusCount: readStorage<number>('ng_plus_count', 0),
  campaignComplete: false,
  sootLevel: 0,
  playtimeSec: 0,
  distanceExplored: 0,
  deathReason: 'reasonGeneric',
  activeWorldLoaded: false,
  waterCollectedCount: 0,
  crystalsExtractedCount: 0,
  obsidianCollectedCount: 0,
  meteorIronCollectedCount: 0,
  surveyContractsCleared: 0,
  playerPos: { x: 0, y: 0, z: 18, yaw: Math.PI },
  lastHudSnapshot: null,
};

export function setScreen(next: ScreenName): void {
  if (gameState.screen !== next) {
    gameState.previousScreen = gameState.screen;
    gameState.screen = next;
  }
  if (typeof document !== 'undefined') {
    if (next === 'hud') {
      document.body.dataset.state = 'playing';
    } else if (['pause', 'inventory', 'map', 'journal', 'storage'].includes(next)) {
      document.body.dataset.state = 'paused';
    } else if (next === 'gameOver') {
      document.body.dataset.state = 'gameover';
    } else if (next === 'victory') {
      document.body.dataset.state = 'victory';
    } else if (next === 'menu') {
      document.body.dataset.state = 'title';
    } else {
      document.body.dataset.state = next;
    }
  }
  eventBus.emit('screen:changed', next);
}

export function saveSettingsToLocal(next: GameSettings): void {
  gameState.settings = next;
  setLanguage(next.language);
  writeStorage('settings', next);
  eventBus.emit('settings:updated', next);
}

export function resetRunState(seed: string, avatar: AvatarConfig, preserveKnowledge = false): void {
  gameState.worldSeed = seed || 'HADEAN-01';
  if (!preserveKnowledge) gameState.bornAtMs = Date.now();
  gameState.avatar = { ...DEFAULT_AVATAR, ...avatar };
  writeStorage('last_avatar', gameState.avatar);
  gameState.vitals = createInitialVitals();
  gameState.inventory = [{ itemId: 'basalt_rock', qty: 2 }];
  const filterQty = Math.max(
    BALANCE.newPlayer.gasFilterQty[gameState.settings.gameplay.difficulty] ?? 0,
    preserveKnowledge ? 1 : 0
  );
  if (filterQty > 0) gameState.inventory.push({ itemId: 'gas_filter', qty: filterQty });
  if (preserveKnowledge) {
    gameState.inventory.push({ itemId: 'stone_axe', qty: 1, durability: 60 });
  }
  gameState.deathBags = [];
  gameState.hotbarItemIds = ['stone_axe', 'water_vessel', 'heat_shield', 'basic_shelter', 'campfire_kit', null];
  gameState.selectedHotbarIdx = 0;
  gameState.completedQuests = [];
  gameState.activeQuestIdx = 0;
  gameState.placedStructures = [];
  gameState.storageInventories = {};
  gameState.discoveredChunks = [];
  gameState.discoveredPois = [];
  gameState.customWaypoints = [];
  if (!preserveKnowledge) {
    gameState.unlockedRecipes = getDefaultUnlockedRecipes();
    gameState.wisdomPerks = [];
    gameState.journalUnlocked = ['j_basalt'];
  }
  gameState.activeStorageId = null;
  gameState.buildModeItem = null;
  gameState.buildRotOffset = 0;
  gameState.campaignComplete = false;
  gameState.sootLevel = 0;
  gameState.playtimeSec = 0;
  gameState.distanceExplored = 0;
  gameState.deathReason = 'reasonGeneric';
  gameState.waterCollectedCount = 0;
  gameState.crystalsExtractedCount = 0;
  gameState.obsidianCollectedCount = 0;
  gameState.meteorIronCollectedCount = 0;
  gameState.surveyContractsCleared = 0;
  gameState.playerPos = { x: 0, y: 0, z: 18, yaw: Math.PI };
  gameState.activeWorldLoaded = true;
}
