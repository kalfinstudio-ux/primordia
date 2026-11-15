// Semua angka keseimbangan survival PRIMORDIA ada di sini (tanpa import runtime agar mudah dites).
// Ubah angka di file ini saja; logika di stats.ts / survival.ts / events.ts / weather.ts hanya membaca.
import type { DifficultyLevel, SurvivalRatePreset } from '../config';

/**
 * Master switch Langkah 2 Peta Berevolusi: delta tinggi medan per era (bawaan OFF).
 * Saat false, tinggi medan dasar benar-benar identik dengan medan lama.
 */
export const ERA_TERRAIN_DELTA = false;

export const BALANCE = {
  difficulty: {
    // Pengali tekanan survival per mode. Hadean tetap keras.
    multiplier: { explorer: 0.55, survivor: 1.0, hadean: 1.5 } as Record<DifficultyLevel, number>,
    defaultForNewPlayer: 'explorer' as DifficultyLevel,
  },

  survivalRates: {
    // Pengaturan laju survival global (selalu berjalan pada detik nyata / real seconds, bukan jam dunia yang dipercepat).
    defaultPreset: 'normal' as SurvivalRatePreset,
    multiplier: {
      relaxed: 0.65, // Santai: laju kebutuhan & damage lingkungan lebih lambat
      normal: 1.0, // Normal: laju standar berimbang
      hard: 1.45, // Berat: kebutuhan turun lebih cepat & jatuhan lebih sakit
    } as Record<SurvivalRatePreset, number>,
  },

  survival: {
    // Sakelar utama (master switches) tiap mekanik — ubah ke false untuk mematikan mekanik sepenuhnya.
    switches: {
      wetness: true,
      wind: true,
      fallDamage: true,
      hunger: true,
      regionDanger: false, // Default OFF: pengubah dangerTier dari world/regions.ts (uji nanti)
    },
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
    ashCloakFactor: 0.65, // Insulasi dasar Tier 1 (Selimut Abu Hangat): memotong dingin 35%
    thermalCloakFactor: 0.5, // Insulasi lanjut Tier 3: memotong panas/dingin ekstrem 50%
    lavaBonus: 14,
    minTarget: 31.0,
    maxTarget: 52.0,
    dampShelter: 0.45,
    dampOpen: 0.14,
    hotThreshold: 39.5,
    coldWarnC: 35.5, // Ambang tampilkan indikator Dingin di HUD
    coldWarnBannerC: 34.5, // Peringatan dini kedinginan (toast + bar berkedip + panah sumber panas)
    coldWarnResetC: 35.2,
    heatWarnBannerC: 41.0, // Peringatan dini kepanasan (toast + bar berkedip)
    heatWarnResetC: 40.3,
    dangerHigh: 42.5,
    dangerLow: 33.0,
    safeMinC: 34.5, // Target suhu aman minimum selama safeStart & earlyEase (dangerLow + 1.5)
    safeMaxC: 41.0, // Target suhu aman maksimum selama safeStart & earlyEase (dangerHigh - 1.5)
    dangerRampWidthC: 2.0, // Gradien damage linear: 0 di ambang, 100% di +/-2.0°C (31.0°C / 44.5°C)
    dangerGraceSec: 15, // Jeda aman sebelum damage suhu ekstrem mulai turun
    dangerRecoverMarginC: 0.3, // Timer bahaya suhu di-reset setelah kembali di dalam ambang aman +/-0.3°C
    dangerDamagePerSec: 5.5,
    dangerousBiomes: ['lava_rift'] as string[],
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
    // Haus lebih mendesak daripada lapar. Berjalan pada detik nyata (dt).
    fullThresholdPct: 99.9,
    fullGraceSec: 45, // PLACEHOLDER: meter penuh tetap 100 selama jeda awal ini sebelum mulai turun
    drainOpen: 0.24, // Disesuaikan agar Explorer aman >10 menit tanpa minum sambil haus tetap kritis lebih cepat dari lapar
    drainShelter: 0.11,
    hotFactor: 1.45,
    criticalPct: 15,
    lowWarnPct: 25,
    lowWarnResetPct: 45,
    emptyAtPct: 1,
    damagePerSec: 4.5,
  },

  hunger: {
    // Lapar baru aktif di Era 2+ (ketika fauna & flora ada). Di Era 1 hanya udara, panas, dan haus.
    startsAtEra: 2,
    fullThresholdPct: 99.9,
    fullGraceSec: 60, // PLACEHOLDER: lebih longgar dari haus agar haus kritis duluan
    drainOpen: 0.16, // PLACEHOLDER: < water.drainOpen agar haus lebih mendesak
    drainShelter: 0.08, // PLACEHOLDER
    criticalPct: 15,
    emptyAtPct: 1,
    damagePerSec: 2.2, // PLACEHOLDER
  },

  wetness: {
    // Kebasahan & rendaman air mempercepat kehilangan panas tubuh (evaporasi & konduksi).
    rainGainPerSec: 0.08,
    wadingTarget: 0.75,
    wadingGainPerSec: 0.45,
    immersionGainPerSec: 0.85,
    baseDryPerSec: 0.03, // Pengeringan alami per detik
    shelterDryMult: 3.0, // Kering jauh lebih cepat di dalam shelter
    windDryBonusMax: 0.35, // Angin membantu pengeringan saat tidak hujan
    campfireDryMult: 7.5, // Pengeringan sangat cepat dekat api unggun (termasuk gerimis ringan)
    campfireLightRainMaxWeight: 0.65, // Gerimis sampai sedang tetap bisa dikeringkan api unggun
    heatLossMultAtFullWet: 2.35, // PLACEHOLDER: pengali hilang panas saat basah kuyup (perlu uji playtest)
    immersionHeatLossMult: 3.4, // PLACEHOLDER: terendam air mendinginkan jauh lebih cepat dari sekadar basah
    wetColdTargetDropC: 1.5, // PLACEHOLDER: efek dingin evaporatif terbatas saat basah di udara terbuka
    immersionColdTargetDropC: 3.0, // PLACEHOLDER: air dingin menarik suhu target tubuh lebih rendah
    maxColdTargetDropC: 3.0, // Batas atas penurunan target suhu akibat basah/terendam
    hudWetThreshold: 0.2, // Ambang munculnya ikon Basah di HUD
  },

  wind: {
    // Angin memberi pengali kecil (~10–15%) pada kehilangan panas tubuh saat terbuka.
    heatLossPctAtCalm: 0.10, // +10% hilang panas pada angin ringan
    heatLossPctAtStorm: 0.15, // +15% hilang panas pada angin badai
    calmThresholdSpeed: 2.2,
    stormThresholdSpeed: 8.5,
    hudWindySpeedThreshold: 4.8, // Ambang munculnya indikator Berangin di HUD
  },

  fallDamage: {
    // Damage jatuh berdasarkan KECEPATAN mendarat (m/s), bukan ketinggian.
    // Referensi rasa: g = 21.5 m/s² -> jatuh ~10 m ≈ 20.7 m/s, jatuh ~12–13 m ≈ 22.7–23.6 m/s.
    safeLandingSpeedMs: 19.8, // PLACEHOLDER: ambang aman (~9–10 m jatuh); di bawah ini = 0 damage
    lethalLandingSpeedMs: 24.4, // PLACEHOLDER: mendekati mematikan di atas ~12–13 m
    exponent: 1.35, // PLACEHOLDER: kurva halus meningkat setelah melewati ambang
    maxDamage: 100,
    waterShallowMult: 0.15, // PLACEHOLDER: jatuh ke air dangkal sangat mengurangi damage
    waterImmersedMult: 0, // PLACEHOLDER: jatuh ke air dalam membatalkan damage
    fallingHudSpeedMs: 12.0, // Kecepatan turun di udara untuk menampilkan peringatan Jatuh di HUD
  },

  campfire: {
    // PLACEHOLDER: durasi bakar api unggun per jenis bahan bakar (detik nyata; belum ada angka referensi baku)
    fuelBurnTimeSec: {
      plant_fiber: 25, // PLACEHOLDER
      ash_clay: 35, // PLACEHOLDER
      sulfur_mineral: 90, // PLACEHOLDER
      charcoal_core: 180, // PLACEHOLDER
      basalt_rock: 0, // Bukan bahan bakar
    } as Record<string, number>,
  },

  food: {
    // PLACEHOLDER: waktu pembusukan makanan per kategori/item (detik nyata; belum ada angka referensi baku)
    spoilageTimeSec: {
      raw_meat: 300, // PLACEHOLDER: 5 menit
      cooked_meat: 900, // PLACEHOLDER: 15 menit
      moss_ration: 1200, // PLACEHOLDER: 20 menit
      dried_jerky: 3600, // PLACEHOLDER: 60 menit
    } as Record<string, number>,
  },

  regionDanger: {
    // Pengait opsional per dangerTier dari world/regions.ts (dikontrol BALANCE.survival.switches.regionDanger = false).
    perTierMultiplier: 0.08, // PLACEHOLDER: +8% per tingkat bahaya wilayah saat diaktifkan
    maxMultiplier: 1.32, // PLACEHOLDER
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
    passiveRegenPerSec: 0.4, // Pemulihan lambat di luar shelter saat semua kebutuhan & suhu aman
    passiveRegenMinTempC: 34.5,
    passiveRegenMaxTempC: 41.0,
    passiveRegenMinWater: 35,
    passiveRegenMinOxygen: 50,
    passiveRegenMaxRadiation: 40,
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
    // Masa aman awal (tanpa event dunia & tanpa cuaca berbahaya) + zona BEBAS gas/radiasi di sekitar spawn.
    // 10 menit pertama: pemain baru belajar tanpa mati kehabisan oksigen/radiasi (v11; dulu 180 dtk / radius 150 m).
    durationSec: 600,
    radiusM: 260, // mencakup kolam awal, kawah kristal, dan kolam gejser terdekat
    maxToxicLevel: 0, // udara bersih penuh: oksigen malah pulih di zona ini
    maxRadiationLevel: 0, // zona aman awal bebas radiasi (termasuk POI meteor terdekat)
    minMeteorDistM: 24, // meteor tetap jatuh di kejauhan demi atmosfer tanpa mengenai pemain baru
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
    // Perapian awal agar slot 5 langsung siap pakai sejak menit pertama di Explorer/Survivor.
    starterCampfireQty: { explorer: 1, survivor: 1, hadean: 0 } as Record<DifficultyLevel, number>,
    // Bekal darurat saat bangkit bila tidak punya filter.
    respawnFilterQty: { explorer: 1, survivor: 1, hadean: 0 } as Record<DifficultyLevel, number>,
  },

  cleanAir: {
    // Pencarian arah udara bersih & sumber panas terdekat untuk panah HUD.
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
    vitals: { health: 100, stamina: 100, temperature: 37.0, oxygen: 100, water: 100, hunger: 100, fatigue: 100, radiationCap: 20 },
    offsetFromShelterM: 2.5,
    protectionSec: 60, // Perlindungan pasca-bangkit 60 detik agar aman mengambil kantong
  },

  bruk: {
    talkRangeM: 4.0,
    talkFacingMinDot: 0.42,
    longAbsenceSec: 180,
    perceptionRadiusM: 52,
    crystalViolationRadiusM: 48,
    stormSanctuaryRadiusM: 8.5,
    stormSanctuaryMinLevel: 3,
    stormSanctuaryDurationSec: { 3: 10, 4: 14 } as Record<number, number>,
    stormSanctuaryCooldownSec: 45,
    hintMinPlaytimeGapSec: 20,
  },

  fauna: {
    minSpawnDistM: 15,
    chunkPopCap: 4,
    capOvershootPct: 0.25,
    boidMaxNeighbors: 7,
    boidRadiusM: 12,
    respawnDelaySec: 420,
    maxActiveFauna: 96,
    maxSlopeDeg: 32,
    pitDepthLimitM: 2.2,
    minLavaClearanceM: 5.5,
    waterClearanceM: 0.22,
  },

  graphics: {
    // Ambang Auto Mode: turunkan bertahap bila rata-rata FPS tetap rendah; naikkan hanya setelah stabil lama (histeresis).
    // Semua angka awal (placeholder) bisa diukur dan disetel ulang di perangkat nyata lewat panel F3.
    auto: {
      stepDownWindowSec: 5,
      stepDownFps: 40, // PLACEHOLDER: di bawah 40 FPS selama 5 dtk
      stepUpWindowSec: 25, // jauh lebih lama dari step-down untuk mencegah osilasi
      stepUpFps: 54,
      stepUpMinFps: 48, // seluruh sampel di jendela naik harus di atas batas ini
      cooldownAfterDownSec: 20, // jeda minimum setelah turun sebelum boleh naik lagi
      cooldownAfterUpSec: 5,
      minStepDownSamples: 3,
      minStepUpSamples: 10,
      sampleHistorySec: 35,
    },
    bloom: {
      // Starting-point estimates; tune on target phones using F3 metrics
      resolutionScale: 0.5, // half resolution (~75% fewer pixels than full resolution)
      strength: 0.48,
      radius: 0.42,
      threshold: 0.65,
    },
    glowSprites: {
      textureSizePx: 64,
      opacity: 0.72,
    },
  },

  eraEvolution: {
    // Langkah 2 (opsional, bawaan OFF lewat ERA_TERRAIN_DELTA): delta tinggi medan kecil & halus per era.
    // Selalu 0 di dalam radius struktur/beacon/base pemain agar base tidak melayang atau tenggelam.
    eraTerrainDelta: ERA_TERRAIN_DELTA,
    maxHeightDeltaM: 1.25, // PLACEHOLDER: amplitudo maksimum delta ketinggian per era (meter)
    spatialFreq: 0.015, // PLACEHOLDER: frekuensi spasial utama (rad/m; panjang gelombang ~420 m, landai)
    structureProtectRadiusM: 40, // PLACEHOLDER: radius perlindungan wajib (delta = tepat 0 m) di sekitar bangunan/beacon/base
    structureFadeWidthM: 24, // PLACEHOLDER: lebar transisi halus di luar radius perlindungan (40..64 m)
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

export function isSafeTempActive(diff: DifficultyLevel, playtimeSec: number): boolean {
  if ((BALANCE.earlyEase.disabledOn as readonly DifficultyLevel[]).includes(diff)) return false;
  return playtimeSec < BALANCE.earlyEase.untilSec;
}

/** Batasi kadar radiasi di sekitar spawn selama masa aman awal agar POI dekat spawn tidak mematikan. */
export function capRadiationForSafeStart(
  radiationLevel: number,
  x: number,
  z: number,
  diff: DifficultyLevel,
  playtimeSec: number
): number {
  if (!isSafeStartActive(diff, playtimeSec)) return radiationLevel;
  const { spawn, radiusM, maxRadiationLevel } = BALANCE.safeStart;
  const d = Math.hypot(x - spawn.x, z - spawn.z);
  return d <= radiusM ? Math.min(radiationLevel, maxRadiationLevel) : radiationLevel;
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
