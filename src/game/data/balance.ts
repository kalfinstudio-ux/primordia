// Semua angka keseimbangan survival PRIMORDIA ada di sini (tanpa import runtime agar mudah dites).
// Ubah angka di file ini saja; logika di stats.ts / survival.ts / events.ts / weather.ts hanya membaca.
import type { DifficultyLevel } from '../config';

export const BALANCE = {
  difficulty: {
    // Pengali tekanan survival per mode. Hadean tetap keras.
    multiplier: { explorer: 0.55, survivor: 1.0, hadean: 1.5 } as Record<DifficultyLevel, number>,
    defaultForNewPlayer: 'explorer' as DifficultyLevel,
  },

  hazard: {
    toxicLevelThreshold: 0.35, // >= ini dianggap gas pekat (status 'toxic')
    heatTempC: 48,
    radiationLevel: 0.4,
  },

  temperature: {
    base: 37.0,
    envFactor: 0.28,
    nightPenalty: 3.2,
    campfireBonus: 2.2,
    heatShieldFactor: 0.4,
    thermalCloakFactor: 0.5,
    lavaBonus: 14,
    minTarget: 31.0,
    maxTarget: 52.0,
    dampShelter: 0.45,
    dampOpen: 0.14,
    hotThreshold: 39.5,
    dangerHigh: 42.5,
    dangerLow: 33.0,
    dangerDamagePerSec: 5.5,
  },

  oxygen: {
    // Drain/dtk = toxicLevel * drainPerToxic (+ ashStormDrain) * pengali mode.
    // Toxic 0,5 + Survivor => 1,0/dtk => 100 dtk sebelum nol (dulu ±30 dtk).
    drainPerToxic: 2.0,
    ashStormDrain: 1.0,
    hazmatFactor: 0.45,
    regenClean: 24, // /dtk di udara bersih (dulu 14)
    regenWithFilter: 4,
    depletedAtPct: 1, // <= ini dianggap habis
    lowWarnPct: 40, // bar berkedip + toast + panah udara bersih
    lowWarnResetPct: 60, // peringatan bisa muncul lagi setelah naik di atas ini
  },

  filter: {
    maxDurability: 100,
    drainPerSec: 1.8,
  },

  suffocation: {
    // Status "sesak": 5 dtk sejak oksigen habis, baru nyawa turun.
    graceSec: 5,
    damagePerSec: 3.0, // dulu 8.0
    recoverAbovePct: 8, // timer sesak di-reset bila oksigen naik di atas ini
  },

  water: {
    drainOpen: 0.38,
    drainShelter: 0.15,
    hotFactor: 1.8,
    emptyAtPct: 1,
    damagePerSec: 4.5,
  },

  radiation: {
    inputFactor: 2.2,
    hazmatFactor: 0.3,
    decayPerSec: 0.35,
    dangerAtPct: 80,
    damagePerSec: 3.2,
  },

  fatigue: {
    drainPerSec: 0.18,
    shelterRegenPerSec: 6.5,
  },

  damage: {
    lavaPerSec: 28,
    burnPerSec: 2.2,
    woundPerSec: 1.8,
    acidRainPerSec: 1.4,
    acidRainCloakPerSec: 0.5,
    shelterHealPerSec: 4.5,
    shelterHealMinOxygen: 20,
    shelterHealMinWater: 10,
  },

  events: {
    toxicSurgeBonus: 0.35,
    superEruptionHeat: 8,
    initialCooldownSec: 75,
    cooldownMinSec: 85,
    cooldownRandomSec: 35,
    durationSec: 25,
  },

  safeStart: {
    // Masa aman awal (tanpa event dunia & tanpa cuaca berbahaya) + zona BEBAS gas di sekitar spawn.
    // 10 menit pertama: pemain baru belajar tanpa mati kehabisan oksigen (v11; dulu 180 dtk / radius 150 m).
    durationSec: 600,
    radiusM: 260, // mencakup kolam awal, kawah kristal, dan kolam gejser terdekat
    maxToxicLevel: 0, // udara bersih penuh: oksigen malah pulih di zona ini
    spawn: { x: 0, z: 18 },
    weatherClearAfterSec: 40, // jeda cerah setelah masa aman sebelum cuaca pertama berganti
    // Hadean tidak mendapat perlindungan ini.
    disabledOn: ['hadean'] as DifficultyLevel[],
  },

  earlyEase: {
    // Setelah masa aman: tekanan survival dikurangi bertahap sampai menit ke-25 (bukan langsung 100%).
    untilSec: 1500,
    multiplier: 0.6,
    disabledOn: ['hadean'] as DifficultyLevel[],
  },

  autoFilter: {
    // Filter Gas dipasang otomatis saat oksigen menipis (bila punya & sedang terpapar gas).
    belowOxygenPct: 30,
    disabledOn: ['hadean'] as DifficultyLevel[],
  },

  newPlayer: {
    // Jumlah gas_filter awal per mode (0 = tidak ada).
    gasFilterQty: { explorer: 2, survivor: 2, hadean: 0 } as Record<DifficultyLevel, number>,
    // Bekal darurat saat bangkit bila tidak punya filter.
    respawnFilterQty: { explorer: 1, survivor: 1, hadean: 0 } as Record<DifficultyLevel, number>,
  },

  cleanAir: {
    // Pencarian arah udara bersih terdekat untuk panah HUD.
    maxToxicLevel: 0.2,
    maxTempC: 46,
    maxRadiation: 0.3,
    stepM: 8,
    maxRadiusM: 160,
    directions: 16,
    shelterSearchM: 120,
    refreshSec: 0.6,
    avoidBiomes: ['shallow_ocean', 'lava_rift', 'volcanic_ridge'] as string[],
  },

  deathBag: {
    maxBags: 3, // kelebihan digabung ke kantong terbaru (barang tidak hilang)
    pickupRadiusM: 2.8,
    hudDistanceMaxM: 600,
  },

  respawn: {
    vitals: { health: 100, stamina: 100, temperature: 37.0, oxygen: 100, water: 85, fatigue: 100, radiationCap: 20 },
    offsetFromShelterM: 2.5,
  },
} as const;

export function getDifficultyMultiplier(diff: DifficultyLevel): number {
  return BALANCE.difficulty.multiplier[diff] ?? 1;
}

export function isSafeStartActive(diff: DifficultyLevel, playtimeSec: number): boolean {
  if ((BALANCE.safeStart.disabledOn as readonly DifficultyLevel[]).includes(diff)) return false;
  return playtimeSec < BALANCE.safeStart.durationSec;
}

/** Pengali tekanan survival tambahan untuk pemain baru (1 = normal). */
export function earlyEaseMultiplier(diff: DifficultyLevel, playtimeSec: number): number {
  if ((BALANCE.earlyEase.disabledOn as readonly DifficultyLevel[]).includes(diff)) return 1;
  if (isSafeStartActive(diff, playtimeSec)) return 1; // masa aman sudah menghapus gas sepenuhnya
  return playtimeSec < BALANCE.earlyEase.untilSec ? BALANCE.earlyEase.multiplier : 1;
}

/** Perlukah Filter Gas dipasang otomatis sekarang? */
export function shouldAutoEquipFilter(p: {
  oxygen: number;
  filterDurability: number;
  exposed: boolean;
  hasFilter: boolean;
  diff: DifficultyLevel;
}): boolean {
  if ((BALANCE.autoFilter.disabledOn as readonly DifficultyLevel[]).includes(p.diff)) return false;
  return p.exposed && p.hasFilter && p.filterDurability <= 0 && p.oxygen < BALANCE.autoFilter.belowOxygenPct;
}

/** Batasi kadar gas di sekitar spawn selama masa aman awal. */
export function capToxicLevelForSafeStart(
  toxicLevel: number,
  x: number,
  z: number,
  diff: DifficultyLevel,
  playtimeSec: number
): number {
  if (!isSafeStartActive(diff, playtimeSec)) return toxicLevel;
  const { spawn, radiusM, maxToxicLevel } = BALANCE.safeStart;
  const d = Math.hypot(x - spawn.x, z - spawn.z);
  return d <= radiusM ? Math.min(toxicLevel, maxToxicLevel) : toxicLevel;
}
