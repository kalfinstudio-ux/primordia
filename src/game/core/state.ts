import {
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  type AvatarConfig,
  type GameSettings,
  type HazardType,
  type ScreenName,
  type WeatherType,
} from '../config';
import { eventBus } from './eventBus';
import { readStorage, writeStorage } from '../utils/storage';
import { recommendGraphicsPreset } from '../utils/device';
import { setLanguage } from '../utils/i18n';

export interface InventorySlot {
  itemId: string;
  qty: number;
}

export interface PlayerVitals {
  health: number; // 0..100
  stamina: number; // 0..100
  temperature: number; // Celsius: normal 37, cold <34, hot >41, lethal >48
  oxygen: number; // 0..100
  water: number; // 0..100
}

export interface PlacedStructure {
  id: string;
  type: 'basic_shelter' | 'campfire_kit';
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface HudSnapshot {
  vitals: PlayerVitals;
  headingDeg: number;
  playerX: number;
  playerZ: number;
  timeOfDay: number; // 0..1
  weather: WeatherType;
  hazard: HazardType;
  interactTarget: {
    id: string;
    actionKey: string;
  } | null;
  activeQuestId: string | null;
  questProgressText: string;
  questsCompletedCount: number;
  hotbar: Array<InventorySlot | null>;
  selectedHotbarIdx: number;
  distanceExplored: number;
  playtimeSec: number;
  minimapNodes: Array<{ x: number; z: number; kind: 'water' | 'crystal' | 'shelter' | 'volcano' }>;
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
  playtimeSec: number;
  distanceExplored: number;
  deathReason: string;
  activeWorldLoaded: boolean;
  waterCollectedCount: number;
  crystalsExtractedCount: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  lastHudSnapshot: HudSnapshot | null;
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

export const gameState: RuntimeGameState = {
  screen: 'splash',
  previousScreen: 'menu',
  onboardingDone: readStorage<boolean>('onboarding_done', false),
  worldSeed: 'HADEAN-01',
  avatar: readStorage<AvatarConfig>('last_avatar', { ...DEFAULT_AVATAR }),
  settings: loadInitialSettings(),
  user: { mode: 'guest', userId: null, email: null },
  vitals: {
    health: 100,
    stamina: 100,
    temperature: 37.0,
    oxygen: 100,
    water: 88,
  },
  inventory: [],
  hotbarItemIds: ['stone_axe', 'water_vessel', 'heat_shield', 'basic_shelter', 'campfire_kit', null],
  selectedHotbarIdx: 0,
  completedQuests: [],
  activeQuestIdx: 0,
  placedStructures: [],
  playtimeSec: 0,
  distanceExplored: 0,
  deathReason: 'reasonGeneric',
  activeWorldLoaded: false,
  waterCollectedCount: 0,
  crystalsExtractedCount: 0,
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
    } else if (next === 'pause' || next === 'inventory') {
      document.body.dataset.state = 'paused';
    } else if (next === 'gameOver') {
      document.body.dataset.state = 'gameover';
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

export function resetRunState(seed: string, avatar: AvatarConfig): void {
  gameState.worldSeed = seed || 'HADEAN-01';
  gameState.avatar = { ...avatar };
  writeStorage('last_avatar', gameState.avatar);
  gameState.vitals = {
    health: 100,
    stamina: 100,
    temperature: 37.0,
    oxygen: 100,
    water: 90,
  };
  gameState.inventory = [
    { itemId: 'basalt_rock', qty: 2 },
  ];
  gameState.hotbarItemIds = ['stone_axe', 'water_vessel', 'heat_shield', 'basic_shelter', 'campfire_kit', null];
  gameState.selectedHotbarIdx = 0;
  gameState.completedQuests = [];
  gameState.activeQuestIdx = 0;
  gameState.placedStructures = [];
  gameState.playtimeSec = 0;
  gameState.distanceExplored = 0;
  gameState.deathReason = 'reasonGeneric';
  gameState.waterCollectedCount = 0;
  gameState.crystalsExtractedCount = 0;
  gameState.playerPos = { x: 0, y: 0, z: 18, yaw: Math.PI };
  gameState.activeWorldLoaded = true;
}
