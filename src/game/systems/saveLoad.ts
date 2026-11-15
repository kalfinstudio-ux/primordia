import { buildAwayReport, resolveAwayWindow, sanitizeBornAt } from '../data/eden';
import { fetchAwaySeconds, startPresenceHeartbeat } from '../net/presence';
import { setAwayReport } from './awayReport';
import { DEFAULT_AVATAR, ITEMS, RECIPES, SAVE_VERSION, type AvatarConfig, type DifficultyLevel } from '../config';
import {
  type DeathBag,
  createInitialVitals,
  gameState,
  type CustomWaypoint,
  type DiscoveredPoi,
  type InventorySlot,
  type PlacedStructure,
  type PlayerVitals,
} from '../core/state';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';
import { eventBus } from '../core/eventBus';
import { saveToCloud, fetchCloudSave } from '../net/cloudSave';

/** Satu simpanan permainan (lokal atau cloud). Sejak save v3 tidak ada lagi slot. */
export interface SaveData {
  saveVersion: number;
  source: 'local' | 'cloud';
  worldSeed: string;
  difficulty: DifficultyLevel;
  avatar: AvatarConfig;
  vitals: PlayerVitals;
  inventory: InventorySlot[];
  placedStructures: PlacedStructure[];
  deathBags: DeathBag[];
  storageInventories: Record<string, InventorySlot[]>;
  completedQuests: string[];
  activeQuestIdx: number;
  discoveredChunks: string[];
  discoveredPois: DiscoveredPoi[];
  customWaypoints: CustomWaypoint[];
  unlockedRecipes: string[];
  wisdomPerks?: string[];
  journalUnlocked: string[];
  campaignComplete: boolean;
  waterCollectedCount: number;
  crystalsExtractedCount: number;
  obsidianCollectedCount: number;
  meteorIronCollectedCount: number;
  playerPos: { x: number; y: number; z: number; yaw: number };
  playtimeSec: number;
  bornAtMs?: number;
  distanceExplored: number;
  updatedAt: string;
}

/** Kunci simpanan tunggal (awalan `primordia_` ditambahkan oleh utils/storage). */
const SAVE_KEY = 'save';
/** Kunci lama (save v1/v2 dengan Slot 1–3). Hanya dibaca untuk migrasi lalu dihapus. */
const LEGACY_SLOTS_KEY = 'save_slots';
const LEGACY_LAST_SLOT_KEY = 'last_slot';
/** Baris cloud memakai satu slot tetap agar skema Supabase (user_id, slot) tidak perlu diubah. */
export const CLOUD_SAVE_SLOT = 1;
const CLOUD_TIMEOUT_MS = 4000;

/** Buang entri inventaris rusak: barang tak dikenal, jumlah bukan angka/<=0. Durability dijaga bila valid. */
export function sanitizeSlots(raw: unknown): InventorySlot[] {
  if (!Array.isArray(raw)) return [];
  const out: InventorySlot[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Partial<InventorySlot>;
    if (typeof e.itemId !== 'string' || !ITEMS[e.itemId]) continue;
    const qty = Math.floor(Number(e.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const slot: InventorySlot = { itemId: e.itemId, qty };
    if (typeof e.durability === 'number' && Number.isFinite(e.durability)) slot.durability = Math.max(0, e.durability);
    out.push(slot);
  }
  return out;
}

/** Vital bukan angka berhingga (mis. NaN tersimpan sebagai null) diganti nilai awal agar tidak merambat. */
function sanitizeVitals(raw: Partial<PlayerVitals>, defaults: PlayerVitals): PlayerVitals {
  const out = { ...defaults } as unknown as Record<string, number>;
  const def = defaults as unknown as Record<string, number>;
  for (const key of Object.keys(def)) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out as unknown as PlayerVitals;
}

export function migrateSaveData(raw: Record<string, unknown>, source: 'local' | 'cloud' = 'local'): SaveData {
  const defaultVitals = createInitialVitals();
  const rawVitals = (raw.vitals || {}) as Partial<PlayerVitals>;
  const rawAvatar = (raw.avatar || {}) as Partial<AvatarConfig>;
  const rawStructures = Array.isArray(raw.placedStructures) ? raw.placedStructures : [];
  const defaultRecipes = RECIPES.filter((r) => r.discoveredByDefault).map((r) => r.id);

  return {
    saveVersion: SAVE_VERSION,
    source: (raw.source as 'local' | 'cloud') || source,
    worldSeed: String(raw.worldSeed || 'HADEAN-01'),
    difficulty: (raw.difficulty as DifficultyLevel) || 'survivor',
    avatar: { ...DEFAULT_AVATAR, ...rawAvatar },
    vitals: sanitizeVitals(rawVitals, defaultVitals),
    inventory: sanitizeSlots(raw.inventory),
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
        growth: typeof item.growth === 'number' ? item.growth : undefined,
        stored: typeof item.stored === 'number' ? item.stored : undefined,
        label: item.label,
        anchorSeed: typeof item.anchorSeed === 'string' ? item.anchorSeed : undefined,
      };
    }),
    deathBags: (Array.isArray(raw.deathBags) ? (raw.deathBags as Partial<DeathBag>[]) : []).map((b, i) => ({
      id: String(b.id || `bag_migrated_${i}`),
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      z: Number(b.z) || 0,
      createdAtSec: Number(b.createdAtSec) || 0,
      items: sanitizeSlots(b.items),
    })),
    storageInventories: Object.fromEntries(
      Object.entries(isPlainObject(raw.storageInventories) ? raw.storageInventories : {}).map(([id, slots]) => [id, sanitizeSlots(slots)])
    ),
    completedQuests: Array.isArray(raw.completedQuests) ? (raw.completedQuests as string[]) : [],
    activeQuestIdx: Number(raw.activeQuestIdx) || 0,
    discoveredChunks: Array.isArray(raw.discoveredChunks) ? (raw.discoveredChunks as string[]) : ['0,0'],
    discoveredPois: Array.isArray(raw.discoveredPois) ? (raw.discoveredPois as DiscoveredPoi[]) : [],
    customWaypoints: Array.isArray(raw.customWaypoints) ? (raw.customWaypoints as CustomWaypoint[]) : [],
    unlockedRecipes: Array.isArray(raw.unlockedRecipes) ? (raw.unlockedRecipes as string[]) : defaultRecipes,
    wisdomPerks: Array.isArray(raw.wisdomPerks) ? (raw.wisdomPerks as string[]) : [],
    journalUnlocked: Array.isArray(raw.journalUnlocked) ? (raw.journalUnlocked as string[]) : ['j_basalt'],
    campaignComplete: Boolean(raw.campaignComplete),
    waterCollectedCount: Number(raw.waterCollectedCount) || 0,
    crystalsExtractedCount: Number(raw.crystalsExtractedCount) || 0,
    obsidianCollectedCount: Number(raw.obsidianCollectedCount) || 0,
    meteorIronCollectedCount: Number(raw.meteorIronCollectedCount) || 0,
    playerPos: (raw.playerPos as SaveData['playerPos']) || { x: 0, y: 0, z: 18, yaw: Math.PI },
    playtimeSec: Number(raw.playtimeSec) || 0,
    bornAtMs: raw.bornAtMs === undefined ? undefined : sanitizeBornAt(raw.bornAtMs),
    distanceExplored: Number(raw.distanceExplored) || 0,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

export function detectSaveConflict(local: SaveData, cloud: SaveData): boolean {
  const timeDiffMs = Math.abs(Date.parse(local.updatedAt) - Date.parse(cloud.updatedAt));
  return (
    timeDiffMs > 15000 &&
    (local.playtimeSec !== cloud.playtimeSec ||
      local.worldSeed !== cloud.worldSeed ||
      local.completedQuests.length !== cloud.completedQuests.length)
  );
}

export function buildCurrentSaveSnapshot(): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    source: 'local',
    worldSeed: gameState.worldSeed,
    difficulty: gameState.settings.gameplay.difficulty,
    avatar: { ...gameState.avatar },
    vitals: { ...gameState.vitals },
    inventory: gameState.inventory.map((s) => ({ ...s })),
    placedStructures: gameState.placedStructures.map((s) => ({ ...s })),
    deathBags: JSON.parse(JSON.stringify(gameState.deathBags)),
    storageInventories: JSON.parse(JSON.stringify(gameState.storageInventories)),
    completedQuests: [...gameState.completedQuests],
    activeQuestIdx: gameState.activeQuestIdx,
    discoveredChunks: [...gameState.discoveredChunks],
    discoveredPois: gameState.discoveredPois.map((p) => ({ ...p })),
    customWaypoints: gameState.customWaypoints.map((w) => ({ ...w })),
    unlockedRecipes: [...gameState.unlockedRecipes],
    wisdomPerks: [...gameState.wisdomPerks],
    journalUnlocked: [...gameState.journalUnlocked],
    campaignComplete: gameState.campaignComplete,
    waterCollectedCount: gameState.waterCollectedCount,
    crystalsExtractedCount: gameState.crystalsExtractedCount,
    obsidianCollectedCount: gameState.obsidianCollectedCount,
    meteorIronCollectedCount: gameState.meteorIronCollectedCount,
    playerPos: { ...gameState.playerPos },
    playtimeSec: Math.round(gameState.playtimeSec),
    bornAtMs: gameState.bornAtMs,
    distanceExplored: Math.round(gameState.distanceExplored),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Simpan permainan (satu simpanan). Mengembalikan null bila tidak ada dunia aktif
 * (mis. dipanggil dari menu utama: jangan menimpa simpanan nyata dengan keadaan kosong)
 * atau bila penyimpanan lokal gagal. Akun login juga disinkronkan ke cloud.
 */
export function saveGame(syncCloud = true): SaveData | null {
  if (!gameState.activeWorldLoaded) return null;
  const snapshot = buildCurrentSaveSnapshot();
  const localOk = writeStorage(SAVE_KEY, snapshot);

  if (syncCloud && gameState.user.mode === 'authenticated') {
    void saveToCloud(snapshot);
  }
  if (!localOk) return null;
  eventBus.emit('save:completed', snapshot);
  return snapshot;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Simpanan lokal saat ini, atau null. Tidak menyentuh data lama (lihat `migrateLegacySlots`). */
export function getLocalSave(): SaveData | null {
  const raw = readStorage<unknown>(SAVE_KEY, null);
  return isPlainObject(raw) ? migrateSaveData(raw, 'local') : null;
}

function saveFingerprint(s: SaveData): string {
  return `${s.worldSeed}|${s.updatedAt}|${s.playtimeSec}`;
}

/**
 * Migrasi dari sistem Slot 1/2/3 (save v1/v2) ke satu simpanan, tanpa menghilangkan progres.
 * - Tepat satu simpanan lama dan belum ada simpanan baru: dipindahkan diam-diam, kunci lama dihapus.
 * - Lebih dari satu simpanan berbeda: TIDAK ada yang dihapus; daftar pilihan dikembalikan (terbaru dulu)
 *   agar pemain memilih sekali lewat `resolveLegacyChoice`.
 * - Kunci lama hanya dihapus setelah penulisan kunci baru berhasil.
 */
export function migrateLegacySlots(): SaveData[] {
  const legacyRaw = readStorage<unknown>(LEGACY_SLOTS_KEY, null);
  if (legacyRaw === null) {
    removeStorage(LEGACY_LAST_SLOT_KEY);
    return [];
  }
  const legacy: SaveData[] = isPlainObject(legacyRaw)
    ? Object.values(legacyRaw)
        .filter(isPlainObject)
        .map((raw) => migrateSaveData(raw, 'local'))
    : [];
  const current = getLocalSave();

  const unique = new Map<string, SaveData>();
  for (const sv of [...(current ? [current] : []), ...legacy]) {
    if (!unique.has(saveFingerprint(sv))) unique.set(saveFingerprint(sv), sv);
  }
  const candidates = [...unique.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  if (candidates.length <= 1) {
    if (candidates.length === 1 && !current) {
      if (!writeStorage(SAVE_KEY, { ...candidates[0], source: 'local' })) return [];
    }
    removeStorage(LEGACY_SLOTS_KEY);
    removeStorage(LEGACY_LAST_SLOT_KEY);
    return [];
  }
  return candidates;
}

/** Pemain memilih satu simpanan dari `migrateLegacySlots`: jadikan simpanan utama, buang sisanya. */
export function resolveLegacyChoice(chosen: SaveData): boolean {
  if (!writeStorage(SAVE_KEY, { ...chosen, source: 'local' })) return false;
  removeStorage(LEGACY_SLOTS_KEY);
  removeStorage(LEGACY_LAST_SLOT_KEY);
  return true;
}

export type ContinueDecision =
  | { kind: 'none' }
  | { kind: 'load'; save: SaveData }
  | { kind: 'conflict'; local: SaveData; cloud: SaveData };

/** Murni: tentukan apa yang terjadi saat menekan "Lanjutkan" dengan simpanan lokal dan/atau cloud. */
export function decideContinue(local: SaveData | null, cloud: SaveData | null): ContinueDecision {
  if (!local && !cloud) return { kind: 'none' };
  if (local && !cloud) return { kind: 'load', save: local };
  if (!local && cloud) return { kind: 'load', save: cloud };
  return detectSaveConflict(local!, cloud!) ? { kind: 'conflict', local: local!, cloud: cloud! } : { kind: 'load', save: local! };
}

async function cloudSaveOrNull(): Promise<SaveData | null> {
  if (gameState.user.mode !== 'authenticated') return null;
  try {
    return await Promise.race([
      fetchCloudSave(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/** Siapkan "Lanjutkan": bandingkan simpanan lokal dengan cloud (bila login dan server menjawab). */
export async function resolveContinue(): Promise<ContinueDecision> {
  return decideContinue(getLocalSave(), await cloudSaveOrNull());
}

/** Selesaikan konflik: 'local' menimpa cloud, 'cloud' menimpa simpanan lokal. Mengembalikan simpanan terpilih. */
export async function applyConflictChoice(choice: 'local' | 'cloud', local: SaveData, cloud: SaveData): Promise<SaveData> {
  if (choice === 'local') {
    await saveToCloud(local);
    return local;
  }
  writeStorage(SAVE_KEY, { ...cloud, source: 'local' });
  return cloud;
}

export function applySaveDataToState(raw: SaveData): void {
  const data = migrateSaveData(raw as unknown as Record<string, unknown>, raw.source);
  gameState.worldSeed = data.worldSeed;
  gameState.settings.gameplay.difficulty = data.difficulty;
  gameState.avatar = { ...data.avatar };
  gameState.vitals = { ...data.vitals };
  gameState.inventory = data.inventory.map((s) => ({ ...s }));
  gameState.placedStructures = data.placedStructures.map((s) => ({ ...s }));
  gameState.deathBags = JSON.parse(JSON.stringify(data.deathBags));
  gameState.storageInventories = JSON.parse(JSON.stringify(data.storageInventories));
  gameState.completedQuests = [...data.completedQuests];
  gameState.activeQuestIdx = data.activeQuestIdx;
  gameState.discoveredChunks = [...data.discoveredChunks];
  gameState.discoveredPois = [...data.discoveredPois];
  gameState.customWaypoints = [...data.customWaypoints];
  gameState.unlockedRecipes = [...data.unlockedRecipes];
  gameState.wisdomPerks = [...(data.wisdomPerks || [])];
  gameState.journalUnlocked = [...data.journalUnlocked];
  gameState.campaignComplete = data.campaignComplete;
  gameState.waterCollectedCount = data.waterCollectedCount;
  gameState.crystalsExtractedCount = data.crystalsExtractedCount;
  gameState.obsidianCollectedCount = data.obsidianCollectedCount;
  gameState.meteorIronCollectedCount = data.meteorIronCollectedCount;
  gameState.playerPos = { ...data.playerPos };
  gameState.playtimeSec = data.playtimeSec;
  applyOfflineProgress(data.updatedAt);
  gameState.bornAtMs = sanitizeBornAt(data.bornAtMs);
  gameState.distanceExplored = data.distanceExplored;
  gameState.activeWorldLoaded = true;
}

/**
 * Dunia berjalan saat kamu pergi (efek maks 24 jam): air, kebun, bor, kerusakan badai, istirahat, dan laporan.
 * Akun login: lama pergi dihitung SERVER (`presence_ping`); save lokal hanya cadangan bila server tidak menjawab.
 */
function applyOfflineProgress(updatedAt: string | undefined): void {
  const savedMs = Date.parse(updatedAt || '');
  const structs = gameState.placedStructures;
  void (async () => {
    const serverSec = await fetchAwaySeconds();
    startPresenceHeartbeat();
    const nowMs = Date.now();
    const win = resolveAwayWindow(savedMs, nowMs, serverSec);
    if (win.source === 'none') return;
    // Pemain bisa memuat save lain sementara menunggu server: hanya terapkan ke dunia yang sama.
    if (gameState.placedStructures !== structs) return;
    const report = buildAwayReport(win.fromMs, nowMs, structs);
    if (report.seconds < 300) return;
    if (report.seconds >= 1800) gameState.vitals.fatigue = 100;
    setTimeout(() => setAwayReport(report), 1500);
  })();
}
