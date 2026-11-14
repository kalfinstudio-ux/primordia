export type LanguageCode = 'id' | 'en';
export type DifficultyLevel = 'explorer' | 'survivor' | 'hadean';
export type GraphicsPreset = 'low' | 'medium' | 'high';
export type WeatherType = 'clear_haze' | 'ash_storm' | 'acid_rain' | 'electrical_storm' | 'meteor_shower';
export type HazardType = 'safe' | 'heat' | 'toxic' | 'meteor' | 'sheltered';
export type ScreenName =
  | 'splash'
  | 'onboarding'
  | 'menu'
  | 'auth'
  | 'newGame'
  | 'loadGame'
  | 'settings'
  | 'hud'
  | 'pause'
  | 'inventory'
  | 'gameOver'
  | 'credits';

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  jump: string;
  sprint: string;
  interact: string;
  inventory: string;
  build: string;
}

export interface GameSettings {
  graphics: {
    preset: GraphicsPreset;
    viewDistance: number; // 70 - 180
    shadows: boolean;
    particles: boolean;
    fpsLimit: number; // 30 | 60 | 120
  };
  audio: {
    master: number; // 0 - 1
    music: number;
    sfx: number;
    ambient: number;
    muted: boolean;
  };
  controls: {
    sensitivity: number; // 0.3 - 2.0
    joystickSize: number; // 0.8 - 1.4
    keys: KeyBindings;
  };
  gameplay: {
    difficulty: DifficultyLevel;
    showHud: boolean;
    units: 'metric' | 'imperial';
  };
  language: LanguageCode;
}

export interface AvatarConfig {
  name: string;
  height: number; // 0.9 - 1.15
  skinTone: string;
  hairColor: string;
  suitColor: string;
}

export interface ItemDefinition {
  id: string;
  category: 'resource' | 'tool' | 'consumable' | 'structure';
  stackable: boolean;
  maxStack: number;
  iconType: string;
  color: string;
}

export interface CraftingRecipe {
  id: string;
  outputId: string;
  outputQty: number;
  ingredients: Array<{ itemId: string; qty: number }>;
}

export interface QuestDefinition {
  id: string;
  order: number;
  targetType: 'collect_water' | 'gather_materials' | 'craft_gear' | 'place_shelter' | 'extract_crystal';
}

export const GAME_VERSION = '0.4.2-Archean';
export const WORLD_RADIUS = 115;
export const WATER_LEVEL = -1.2;
export const AUTOSAVE_INTERVAL_SEC = 60;

export const SUPABASE_CONFIG = {
  url: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '',
  anonKey: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '',
};

export const DEFAULT_AVATAR: AvatarConfig = {
  name: 'Arka-01',
  height: 1.0,
  skinTone: '#c68b59',
  hairColor: '#1c1917',
  suitColor: '#ea580c',
};

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    preset: 'medium',
    viewDistance: 120,
    shadows: true,
    particles: true,
    fpsLimit: 60,
  },
  audio: {
    master: 0.7,
    music: 0.45,
    sfx: 0.75,
    ambient: 0.6,
    muted: false,
  },
  controls: {
    sensitivity: 1.0,
    joystickSize: 1.0,
    keys: {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      sprint: 'ShiftLeft',
      interact: 'KeyE',
      inventory: 'KeyI',
      build: 'KeyB',
    },
  },
  gameplay: {
    difficulty: 'survivor',
    showHud: true,
    units: 'metric',
  },
  language: 'id',
};

export const ITEMS: Record<string, ItemDefinition> = {
  basalt_rock: {
    id: 'basalt_rock',
    category: 'resource',
    stackable: true,
    maxStack: 50,
    iconType: 'rock',
    color: '#78716c',
  },
  sulfur_mineral: {
    id: 'sulfur_mineral',
    category: 'resource',
    stackable: true,
    maxStack: 50,
    iconType: 'mineral',
    color: '#eab308',
  },
  primordial_crystal: {
    id: 'primordial_crystal',
    category: 'resource',
    stackable: true,
    maxStack: 20,
    iconType: 'crystal',
    color: '#fb923c',
  },
  stone_axe: {
    id: 'stone_axe',
    category: 'tool',
    stackable: false,
    maxStack: 1,
    iconType: 'axe',
    color: '#a8a29e',
  },
  water_vessel: {
    id: 'water_vessel',
    category: 'consumable',
    stackable: false,
    maxStack: 1,
    iconType: 'vessel',
    color: '#38bdf8',
  },
  heat_shield: {
    id: 'heat_shield',
    category: 'tool',
    stackable: false,
    maxStack: 1,
    iconType: 'shield',
    color: '#f97316',
  },
  basic_shelter: {
    id: 'basic_shelter',
    category: 'structure',
    stackable: true,
    maxStack: 5,
    iconType: 'shelter',
    color: '#d6d3d1',
  },
  campfire_kit: {
    id: 'campfire_kit',
    category: 'structure',
    stackable: true,
    maxStack: 5,
    iconType: 'fire',
    color: '#ef4444',
  },
};

export const RECIPES: CraftingRecipe[] = [
  {
    id: 'recipe_stone_axe',
    outputId: 'stone_axe',
    outputQty: 1,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_water_vessel',
    outputId: 'water_vessel',
    outputQty: 1,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
    ],
  },
  {
    id: 'recipe_heat_shield',
    outputId: 'heat_shield',
    outputQty: 1,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 2 },
    ],
  },
  {
    id: 'recipe_basic_shelter',
    outputId: 'basic_shelter',
    outputQty: 1,
    ingredients: [
      { itemId: 'basalt_rock', qty: 4 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_campfire_kit',
    outputId: 'campfire_kit',
    outputQty: 1,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
];

export const STARTER_QUESTS: QuestDefinition[] = [
  { id: 'q1', order: 1, targetType: 'collect_water' },
  { id: 'q2', order: 2, targetType: 'gather_materials' },
  { id: 'q3', order: 3, targetType: 'craft_gear' },
  { id: 'q4', order: 4, targetType: 'place_shelter' },
  { id: 'q5', order: 5, targetType: 'extract_crystal' },
];
