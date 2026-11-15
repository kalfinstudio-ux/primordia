export type LanguageCode = 'id' | 'en';
export type DifficultyLevel = 'explorer' | 'survivor' | 'hadean';
export type GraphicsPreset = 'low' | 'medium' | 'high';
export type WeatherType = 'clear_haze' | 'ash_storm' | 'acid_rain' | 'electrical_storm' | 'meteor_shower';
export type HazardType = 'safe' | 'heat' | 'toxic' | 'meteor' | 'radiation' | 'sheltered';
export type WorldEventType = 'none' | 'super_eruption' | 'toxic_surge' | 'meteor_swarm';
export type HandMode = 'right' | 'left';
export type BodyBuild = 'slim' | 'standard' | 'athletic';
export type HairStyle = 'short' | 'ponytail' | 'buzz' | 'hood' | 'long' | 'bun' | 'braid';
export type Gender = 'male' | 'female';
export type PackStyle = 'o2_pack' | 'expedition' | 'scout';

export type ScreenName =
  | 'splash'
  | 'onboarding'
  | 'menu'
  | 'auth'
  | 'newGame'
  | 'settings'
  | 'hud'
  | 'pause'
  | 'inventory'
  | 'map'
  | 'journal'
  | 'storage'
  | 'victory'
  | 'gameOver'
  | 'credits'
  | 'assets';

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
  map: string;
  journal: string;
}

export interface GameSettings {
  graphics: {
    preset: GraphicsPreset;
    viewDistance: number; // 70 - 220
    shadows: boolean;
    particles: boolean;
    volumetricFog: boolean;
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
    joystickSize: number; // 0.8 - 1.8
    actionSize: number; // 0.8 - 1.8 (ukuran tombol aksi sentuh)
    hudScale: number; // 0.75 - 1.25
    buttonOpacity: number; // 0.45 - 1.0
    handMode: HandMode;
    preferLandscape: boolean;
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
  gender: Gender;
  height: number; // 0.9 - 1.15
  build: BodyBuild;
  skinTone: string;
  hairColor: string;
  hairStyle: HairStyle;
  suitColor: string;
  packStyle: PackStyle;
}

export * from './data/items';
export * from './data/recipes';
export * from './data/quests';

export const GAME_VERSION = '0.9.0-Archean';
export const SAVE_VERSION = 3;
export const WORLD_RADIUS = 115; // Legacy starter landmark zone radius
export const WORLD_HALF_EXTENT = 2048; // 4km x 4km open world (-2048..+2048)
export const CHUNK_SIZE = 64;
export const WATER_LEVEL = -1.2;
export const AUTOSAVE_INTERVAL_SEC = 60;
export const BASE_CARRY_WEIGHT = 45;

export const SUPABASE_CONFIG = {
  url: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '',
  anonKey: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '',
};

type ViteEnv = Record<string, string> | undefined;
const viteEnv = (): ViteEnv => (import.meta as unknown as { env?: Record<string, string> }).env;

/** Login Base44 (opsional). Kosongkan VITE_BASE44_APP_ID untuk mematikan tombolnya. */
export const BASE44_CONFIG = {
  appId: viteEnv()?.VITE_BASE44_APP_ID || '',
};

/** Info hukum yang tampil di Pengaturan → Info Game. Isi lewat .env agar tidak perlu ubah kode. */
export const LEGAL_CONFIG = {
  /** Tanggal terakhir teks Ketentuan & Kebijakan diperbarui (YYYY-MM-DD). */
  updatedAt: '2026-11-15',
  /** Email kontak pemilik game (VITE_CONTACT_EMAIL). Kosong = baris kontak disembunyikan. */
  contactEmail: viteEnv()?.VITE_CONTACT_EMAIL || '',
  /** Nama pemilik/pengelola game (VITE_OWNER_NAME). Kosong = memakai teks "pengelola PRIMORDIA". */
  ownerName: viteEnv()?.VITE_OWNER_NAME || 'Jurkon Studio',
};

export const DEFAULT_AVATAR: AvatarConfig = {
  name: 'Arka-01',
  gender: 'male',
  height: 1.0,
  build: 'standard',
  skinTone: '#c68b59',
  hairColor: '#1c1917',
  hairStyle: 'short',
  suitColor: '#ea580c',
  packStyle: 'o2_pack',
};

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    preset: 'medium',
    viewDistance: 135,
    shadows: true,
    particles: true,
    volumetricFog: true,
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
    actionSize: 1.15,
    hudScale: 1.0,
    buttonOpacity: 0.9,
    handMode: 'right',
    preferLandscape: false,
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
      map: 'KeyM',
      journal: 'KeyJ',
    },
  },
  gameplay: {
    difficulty: 'explorer',
    showHud: true,
    units: 'metric',
  },
  language: 'id',
};
