/**
 * Era Adam & Hawa — logika waktu nyata, umur abadi, dan peta yang berubah mengikuti kalender dunia nyata.
 * Semua fungsi murni (menerima `Date`) supaya mudah dites dan konsisten antar pemain.
 */

export const ERA_NAME = 'Era Adam & Hawa';
/** Tahun kalender nyata yang dianggap Tahun 1 era ini. */
export const ERA_START_YEAR = 2026;

export const ERA_LORE = [
  'Bumi baru saja mendingin. Tanah masih hangat, langit masih berasap.',
  'Kamu adalah salah satu manusia pertama dari era Adam & Hawa — tanpa tua, tanpa akhir.',
  'Waktu di dunia ini mengikuti waktu di dunia nyata. Peta pun berubah mengikuti hari, bulan, dan tahun.',
];

const NAMES_M = ['Adar', 'Kaelen', 'Tobar', 'Eshan', 'Nabu', 'Ravik', 'Oren', 'Dalan', 'Surel', 'Jaren', 'Mikal', 'Tamar'];
const NAMES_F = ['Hawa', 'Liora', 'Sera', 'Naima', 'Eleni', 'Maren', 'Ayla', 'Zuria', 'Talia', 'Wira', 'Sanna', 'Idris'];

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nama acak untuk karakter baru. Pemain bebas menggantinya. */
export function randomPrimordialName(rng: () => number = Math.random): string {
  const pool = rng() < 0.5 ? NAMES_M : NAMES_F;
  return pool[Math.floor(rng() * pool.length)];
}

export interface EdenCalendar {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  dayOfYear: number; // 1..366
  eraYear: number; // tahun ke-N era ini
  season: 'kering' | 'hujan' | 'abu' | 'dingin';
  /** 0..1, aktivitas gunung berapi harian (deterministik dari tanggal). */
  volcanoActivity: number;
  /** -0.4..+0.4 meter, pasang-surut air harian. */
  tideOffset: number;
  label: string;
}

function dayOfYearOf(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((cur - start) / 86400000);
}

export function getEdenCalendar(date: Date = new Date()): EdenCalendar {
  // Kalender dunia = UTC, sama untuk semua pemain di zona waktu mana pun (langit tetap memakai jam lokal).
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const doy = dayOfYearOf(date);
  const eraYear = Math.max(1, year - ERA_START_YEAR + 1);
  const seasons: EdenCalendar['season'][] = ['kering', 'hujan', 'abu', 'dingin'];
  const season = seasons[Math.floor(((month - 1) % 12) / 3)];
  const r = mulberry(year * 10000 + month * 100 + day);
  const volcanoActivity = Math.round(r() * 100) / 100;
  const tideOffset = Math.round((r() * 0.8 - 0.4) * 100) / 100;
  return {
    year, month, day, dayOfYear: doy, eraYear, season, volcanoActivity, tideOffset,
    label: `${ERA_NAME} · Tahun ${eraYear} · ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
  };
}

export interface WorldAge {
  eraYear: number;
  id: string;
  name: string;
  nameEn: string;
  seaLevelOffsetM: number;
  volcanoMult: number;
  resourceMult: number;
  unlockedChapter: number;
}

export const WORLD_AGES: readonly Omit<WorldAge, 'eraYear'>[] = [
  {
    id: 'age_adam_eve',
    name: 'Era Adam & Hawa',
    nameEn: 'Age of Adam & Eve',
    seaLevelOffsetM: 0,
    volcanoMult: 1.0,
    resourceMult: 1.0,
    unlockedChapter: 6,
  },
  {
    id: 'age_rising_tides',
    name: 'Era Pasang Pertama',
    nameEn: 'Age of Rising Tides',
    seaLevelOffsetM: 0.35,
    volcanoMult: 1.15,
    resourceMult: 1.15,
    unlockedChapter: 7,
  },
  {
    id: 'age_ember_crowns',
    name: 'Era Mahkota Bara',
    nameEn: 'Age of Ember Crowns',
    seaLevelOffsetM: 0.15,
    volcanoMult: 1.35,
    resourceMult: 1.25,
    unlockedChapter: 8,
  },
  {
    id: 'age_living_stone',
    name: 'Era Batu Hidup',
    nameEn: 'Age of Living Stone',
    seaLevelOffsetM: -0.15,
    volcanoMult: 0.9,
    resourceMult: 1.3,
    unlockedChapter: 9,
  },
];

/** Zaman tahunan: berganti setiap 1 Januari pukul 00:00 UTC. Tahun 1 = Era Adam & Hawa. */
export function getWorldAge(date: Date = new Date()): WorldAge {
  const eraYear = Math.max(1, date.getUTCFullYear() - ERA_START_YEAR + 1);
  const template = WORLD_AGES[(eraYear - 1) % WORLD_AGES.length];
  return { ...template, eraYear };
}

export interface DailyMicroDetails {
  dayKey: string;
  steamVentsPerChunk: number;
  ashDriftStrength: number;
  emberClusterCount: number;
  regrowthSeed: number;
}

/** Detail mikro harian yang deterministik dari tanggal UTC (uap panas, timbunan abu, titik sumber daya). */
export function dailyMicroDetails(date: Date = new Date()): DailyMicroDetails {
  const c = getEdenCalendar(date);
  const seed = c.year * 10000 + c.month * 100 + c.day;
  const r = mulberry(seed ^ 0x517cc1b7);
  return {
    dayKey: `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`,
    steamVentsPerChunk: r() < 0.55 ? 1 : 2,
    ashDriftStrength: Math.round((0.35 + r() * 0.65) * 100) / 100,
    emberClusterCount: c.volcanoActivity >= 0.6 ? 2 : 1,
    regrowthSeed: seed,
  };
}

/** Tinggi permukaan air efektif = dasar + pengubah zaman tahunan + pasang-surut harian. */
export function effectiveWaterLevel(baseWaterLevel: number, date: Date = new Date()): number {
  const age = getWorldAge(date);
  const cal = getEdenCalendar(date);
  return Math.round((baseWaterLevel + age.seaLevelOffsetM + cal.tideOffset * 0.25) * 100) / 100;
}

/**
 * Seed efektif untuk medan: berubah tiap BULAN dan tiap TAHUN (1 Januari UTC).
 * Props/sumber daya memakai seed harian, jadi vegetasi & batu tumbuh ulang tiap hari.
 * Dilindungi oleh Jangkar Medan (60 m) serta aturan relokasi aman agar base/pemain tidak pernah terkubur.
 */
export const MONTHLY_TERRAIN_SHIFT = true;

export function effectiveTerrainSeed(worldSeed: string, date: Date = new Date(), shift: boolean = MONTHLY_TERRAIN_SHIFT): string {
  if (!shift) return worldSeed;
  const c = getEdenCalendar(date);
  return `${worldSeed}|Y${c.year}|M${c.month}`;
}

export function effectivePropSeed(worldSeed: string, date: Date = new Date(), shift: boolean = MONTHLY_TERRAIN_SHIFT): string {
  const c = getEdenCalendar(date);
  return `${effectiveTerrainSeed(worldSeed, date, shift)}|D${c.day}`;
}

/** Fraksi hari dari jam lokal nyata: 0 = tengah malam, 0.5 = tengah hari (cocok dengan sky.ts). */
export function realTimeOfDay(date: Date = new Date()): number {
  const s = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
  return s / 86400;
}

export interface ImmortalAge {
  totalSeconds: number;
  years: number;
  days: number;
  hours: number;
  label: string;
}

/**
 * Umur abadi: terus bertambah mengikuti waktu nyata sejak `bornAtMs`, tidak pernah ada kematian karena usia,
 * dan TIDAK berhenti/reset ketika karakter mati oleh bahaya (hanya respawn).
 */
export function getImmortalAge(bornAtMs: number, nowMs: number = Date.now()): ImmortalAge {
  const total = Math.max(0, Math.floor((nowMs - bornAtMs) / 1000));
  const years = Math.floor(total / 31557600);
  const days = Math.floor((total % 31557600) / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  return { totalSeconds: total, years, days, hours, label: `${years} thn ${days} hr ${hours} jam (abadi)` };
}

/** Tanggal lahir yang boleh dipercaya: tidak di masa depan, tidak lebih awal dari awal era. */
export function sanitizeBornAt(value: unknown, nowMs: number = Date.now()): number {
  const n = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  if (!Number.isFinite(n) || n > nowMs || n < Date.UTC(ERA_START_YEAR, 0, 1)) return nowMs;
  return n;
}

/** Pelindung jam perangkat: cegah mundur waktu kalender > 5 dtk (anti-tamper DST/mundur jam). */
export function sanitizeClockSample(sampleMs: number, prevObservedMs: number = 0): number {
  const safe = Number.isFinite(sampleMs) ? sampleMs : Date.now();
  if (Number.isFinite(prevObservedMs) && prevObservedMs > 0 && safe < prevObservedMs - 5000) {
    return prevObservedMs;
  }
  return Math.max(Date.UTC(ERA_START_YEAR, 0, 1), safe);
}

// ─────────────────────────────────────────────────────────────
// 1) Jangkar Medan — bangunan yang mengunci medan saat peta berganti bulan
// ─────────────────────────────────────────────────────────────
export const ANCHOR_RADIUS = 60;

export interface AnchorSpec {
  x: number;
  z: number;
  r: number;
  /** Seed medan yang dibekukan saat jangkar dipasang. */
  seed: string;
}

export function collectAnchors(
  structs: ReadonlyArray<{ type: string; x: number; z: number; anchorSeed?: string }>
): AnchorSpec[] {
  const out: AnchorSpec[] = [];
  for (const s of structs) {
    if (s.type === 'terrain_anchor' && s.anchorSeed) out.push({ x: s.x, z: s.z, r: ANCHOR_RADIUS, seed: s.anchorSeed });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 2) Dunia berjalan saat offline
// ─────────────────────────────────────────────────────────────
export const OFFLINE_CAP_SEC = 24 * 3600;
export const OFFLINE_MIN_SEC = 300;
/** Laju isi penampung air saat offline (/dtk), jauh lebih lambat daripada saat main. */
export const OFFLINE_WATER_RATE = 0.02;

export interface OfflineReport {
  seconds: number;
  collectorsFilled: number;
  rested: boolean;
}

export function computeOfflineProgress(
  structs: Array<{ type: string; waterStored?: number }>,
  elapsedSec: number
): OfflineReport {
  const seconds = Math.max(0, Math.min(OFFLINE_CAP_SEC, Number.isFinite(elapsedSec) ? Math.floor(elapsedSec) : 0));
  const report: OfflineReport = { seconds, collectorsFilled: 0, rested: false };
  if (seconds < OFFLINE_MIN_SEC) return report;
  for (const s of structs) {
    if (s.type !== 'water_collector') continue;
    const before = s.waterStored || 0;
    const after = Math.min(100, before + OFFLINE_WATER_RATE * seconds);
    if (after > before) report.collectorsFilled++;
    s.waterStored = after;
  }
  report.rested = seconds >= 1800;
  return report;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} jam ${m} mnt` : `${m} mnt`;
}

// ─────────────────────────────────────────────────────────────
// 3) Kebijaksanaan dari umur abadi
// ─────────────────────────────────────────────────────────────
export const WISDOM_MILESTONES = [
  { days: 7, points: 1 },
  { days: 30, points: 2 },
  { days: 100, points: 3 },
  { days: 365, points: 5 },
] as const;

export interface WisdomPerk {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
  filterDrainMult?: number;
  radiationMult?: number;
  unlockRecipes?: string[];
}

export const WISDOM_PERKS: WisdomPerk[] = [
  { id: 'filter_awet', name: 'Filter Awet', desc: 'Filter gas 25% lebih awet.', cost: 1, filterDrainMult: 0.75 },
  { id: 'kulit_abu', name: 'Kulit Abu', desc: 'Radiasi yang masuk berkurang 25%.', cost: 2, radiationMult: 0.75 },
  { id: 'resep_leluhur', name: 'Resep Leluhur', desc: 'Resep Jangkar Medan terbuka tanpa perlu kristal inti.', cost: 3, unlockRecipes: ['recipe_terrain_anchor'] },
  { id: 'filter_awet_2', name: 'Filter Abadi', desc: 'Filter gas 50% lebih awet (butuh Filter Awet).', cost: 3, requires: 'filter_awet', filterDrainMult: 0.5 },
];

export function wisdomPointsEarned(ageSeconds: number): number {
  const days = Math.max(0, ageSeconds) / 86400;
  return WISDOM_MILESTONES.reduce((sum, m) => (days >= m.days ? sum + m.points : sum), 0);
}

export function wisdomPointsSpent(owned: readonly string[]): number {
  return WISDOM_PERKS.reduce((sum, p) => (owned.includes(p.id) ? sum + p.cost : sum), 0);
}

export function canBuyPerk(perkId: string, owned: readonly string[], ageSeconds: number): boolean {
  const perk = WISDOM_PERKS.find((p) => p.id === perkId);
  if (!perk || owned.includes(perkId)) return false;
  if (perk.requires && !owned.includes(perk.requires)) return false;
  return wisdomPointsEarned(ageSeconds) - wisdomPointsSpent(owned) >= perk.cost;
}

export function perkEffects(owned: readonly string[]): { filterDrainMult: number; radiationMult: number } {
  let filterDrainMult = 1;
  let radiationMult = 1;
  for (const p of WISDOM_PERKS) {
    if (!owned.includes(p.id)) continue;
    if (p.filterDrainMult !== undefined) filterDrainMult = Math.min(filterDrainMult, p.filterDrainMult);
    if (p.radiationMult !== undefined) radiationMult = Math.min(radiationMult, p.radiationMult);
  }
  return { filterDrainMult, radiationMult };
}

// ─────────────────────────────────────────────────────────────
// Laporan "Saat kamu pergi" — kronik dunia deterministik dari kalender nyata
// (semua pemain melihat kronik yang sama untuk rentang waktu yang sama)
// ─────────────────────────────────────────────────────────────
export type AwayWeather = 'clear_haze' | 'ash_storm' | 'acid_rain' | 'electrical_storm' | 'meteor_shower';

export const AWAY_BLOCK_MS = 6 * 3600 * 1000;
const AWAY_MAX_WINDOW_MS = 30 * 86400 * 1000;
const WEATHER_LABEL: Record<AwayWeather, { icon: string; name: string }> = {
  clear_haze: { icon: '🌫', name: 'Kabut oranye' },
  ash_storm: { icon: '🌋', name: 'Badai abu' },
  acid_rain: { icon: '☔', name: 'Hujan asam' },
  electrical_storm: { icon: '⚡', name: 'Badai petir' },
  meteor_shower: { icon: '☄', name: 'Hujan meteor' },
};
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Pengali peluang cuaca per musim: [cerah, badai abu, hujan asam, badai petir, hujan meteor]. */
const SEASON_WEATHER_MULT: Record<EdenCalendar['season'], [number, number, number, number, number]> = {
  kering: [1.3, 1, 0.5, 0.7, 1],
  hujan: [0.8, 0.6, 1.8, 1.5, 1],
  abu: [0.8, 2.0, 1, 1, 1],
  dingin: [1.2, 0.8, 0.8, 0.8, 1.5],
};
const BASE_WEATHER_P = [0.5, 0.2, 0.12, 0.1, 0.08];
const WEATHER_ORDER: AwayWeather[] = ['clear_haze', 'ash_storm', 'acid_rain', 'electrical_storm', 'meteor_shower'];

/** Musim pada sebuah blok cuaca (dari tanggal lokal awal blok). */
export function seasonOfBlock(blockIdx: number): EdenCalendar['season'] {
  return getEdenCalendar(new Date(blockIdx * AWAY_BLOCK_MS)).season;
}

export function weatherForBlock(blockIdx: number): AwayWeather {
  const mult = SEASON_WEATHER_MULT[seasonOfBlock(blockIdx)];
  const w = BASE_WEATHER_P.map((p, i) => p * mult[i]);
  const total = w.reduce((a, b) => a + b, 0);
  let r = mulberry(blockIdx * 2654435761 + 97)() * total;
  for (let i = 0; i < w.length; i++) {
    if (r < w[i]) return WEATHER_ORDER[i];
    r -= w[i];
  }
  return 'meteor_shower';
}

/** Cuaca dunia pada waktu nyata tertentu: sama untuk semua pemain & selaras dengan laporan "Saat kamu pergi". */
export function weatherAtTime(ms: number = Date.now()): AwayWeather {
  return weatherForBlock(Math.floor(ms / AWAY_BLOCK_MS));
}

/** Sisa milidetik sampai blok cuaca berikutnya dimulai (selalu 1..AWAY_BLOCK_MS). */
export function msUntilWeatherChange(ms: number = Date.now()): number {
  return AWAY_BLOCK_MS - (((ms % AWAY_BLOCK_MS) + AWAY_BLOCK_MS) % AWAY_BLOCK_MS);
}

// ─────────────────────────────────────────────────────────────
// Musim memengaruhi gameplay (Backlog #5)
// ─────────────────────────────────────────────────────────────
export interface SeasonEffects {
  label: string;
  /** Pengali laju isi penampung air. */
  waterFillMult: number;
  /** Pengali pertumbuhan kebun. */
  gardenMult: number;
  /** Selisih suhu lingkungan (°C). */
  tempOffsetC: number;
}

export const SEASON_FX: Record<EdenCalendar['season'], SeasonEffects> = {
  kering: { label: 'Musim Kering', waterFillMult: 0.6, gardenMult: 0.7, tempOffsetC: 2 },
  hujan: { label: 'Musim Hujan', waterFillMult: 1.5, gardenMult: 1.5, tempOffsetC: 0 },
  abu: { label: 'Musim Abu', waterFillMult: 1, gardenMult: 0.5, tempOffsetC: 1 },
  dingin: { label: 'Musim Dingin', waterFillMult: 1, gardenMult: 0.8, tempOffsetC: -3 },
};

export function seasonEffects(date: Date = new Date()): SeasonEffects {
  return SEASON_FX[getEdenCalendar(date).season];
}

let _fxCache: { minute: number; season: EdenCalendar['season'] } | null = null;
/** Musim saat ini (di-cache per menit; aman dipanggil tiap frame). */
export function currentSeason(nowMs: number = Date.now()): EdenCalendar['season'] {
  const minute = Math.floor(nowMs / 60000);
  if (!_fxCache || _fxCache.minute !== minute) _fxCache = { minute, season: getEdenCalendar(new Date(nowMs)).season };
  return _fxCache.season;
}
export function currentSeasonFx(nowMs: number = Date.now()): SeasonEffects {
  return SEASON_FX[currentSeason(nowMs)];
}

// ─────────────────────────────────────────────────────────────
// Peringatan Pergeseran Besar (pergantian bulan = medan berganti)
// ─────────────────────────────────────────────────────────────
export const SHIFT_WARN_SOON_MS = 6 * 3600 * 1000;
export const SHIFT_WARN_IMMINENT_MS = 30 * 60 * 1000;

/** Milidetik sampai tanggal 1 bulan berikutnya pukul 00:00 UTC. */
export function msUntilMonthShift(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - nowMs;
}

export interface ShiftWarning {
  level: 'none' | 'soon' | 'imminent';
  kind: 'month' | 'year';
  msLeft: number;
  /** Kunci unik per (bulan tujuan, level) agar toast tidak berulang. */
  key: string;
}

export function shiftWarning(nowMs: number = Date.now(), enabled: boolean = MONTHLY_TERRAIN_SHIFT): ShiftWarning {
  const msLeft = msUntilMonthShift(nowMs);
  const next = new Date(nowMs + msLeft);
  const kind: 'month' | 'year' = next.getUTCMonth() === 0 ? 'year' : 'month';
  const level = !enabled ? 'none' : msLeft <= SHIFT_WARN_IMMINENT_MS ? 'imminent' : msLeft <= SHIFT_WARN_SOON_MS ? 'soon' : 'none';
  const key = kind === 'year'
    ? `${next.getUTCFullYear()}-${next.getUTCMonth() + 1}:year:${level}`
    : `${next.getUTCFullYear()}-${next.getUTCMonth() + 1}:${level}`;
  return { level, kind, msLeft, key };
}

export function formatShiftCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

// ─────────────────────────────────────────────────────────────
// Relokasi aman: Pergeseran Besar / Zaman Baru tak pernah mengubur bangunan atau menjebak pemain
// ─────────────────────────────────────────────────────────────
export interface RelocatableStruct {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  anchorSeed?: string;
}

function findDrySpotNear(
  ox: number,
  oz: number,
  heightAt: (x: number, z: number) => number,
  minY: number,
  maxRadius = 64
): { x: number; y: number; z: number } | null {
  const y0 = heightAt(ox, oz);
  if (y0 >= minY) return { x: ox, y: y0, z: oz };
  for (let r = 4; r <= maxRadius; r += 4) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const cx = Math.round((ox + Math.cos(a) * r) * 10) / 10;
      const cz = Math.round((oz + Math.sin(a) * r) * 10) / 10;
      const cy = heightAt(cx, cz);
      if (cy >= minY) return { x: cx, y: cy, z: cz };
    }
  }
  return null;
}

/**
 * Pastikan bangunan di luar jangkar (atau yang terendam kenaikan laut Zaman baru)
 * dipindahkan ke permukaan tanah kering terdekat sehingga tidak terkubur atau melayang.
 */
export function safeRelocateStructures<T extends RelocatableStruct>(
  structs: T[],
  heightAt: (x: number, z: number) => number,
  waterLevel: number
): { structs: T[]; relocatedCount: number } {
  const minDryY = waterLevel + 0.15;
  const anchors = collectAnchors(structs);
  let relocatedCount = 0;

  for (const s of structs) {
    const anchored = anchors.some((a) => Math.hypot(s.x - a.x, s.z - a.z) <= a.r * 0.75);
    const curGround = heightAt(s.x, s.z);
    if (anchored && curGround >= minDryY && Math.abs(s.y - curGround) <= 0.35) continue;

    if (curGround >= minDryY) {
      if (Math.abs(s.y - curGround) > 0.12) {
        s.y = curGround;
        relocatedCount++;
      }
      continue;
    }

    const dry = findDrySpotNear(s.x, s.z, heightAt, minDryY, 72);
    if (dry) {
      s.x = dry.x;
      s.y = dry.y;
      s.z = dry.z;
      relocatedCount++;
    } else if (s.y < curGround) {
      s.y = curGround;
      relocatedCount++;
    }
  }
  return { structs, relocatedCount };
}

/** Pastikan posisi pemain tidak terjebak di bawah tanah/air setelah pergeseran peta atau pergantian Zaman. */
export function safeRelocatePlayer(
  pos: { x: number; y: number; z: number },
  heightAt: (x: number, z: number) => number,
  waterLevel: number
): { x: number; y: number; z: number; relocated: boolean } {
  const minSafeY = waterLevel + 0.25;
  const groundY = heightAt(pos.x, pos.z);
  if (groundY >= minSafeY && pos.y >= groundY - 0.15 && pos.y <= groundY + 18) {
    return { ...pos, y: Math.max(pos.y, groundY + 0.08), relocated: pos.y < groundY };
  }
  const dry = findDrySpotNear(pos.x, pos.z, heightAt, minSafeY, 96);
  if (dry) {
    return { x: dry.x, y: dry.y + 0.15, z: dry.z, relocated: true };
  }
  const spawnY = Math.max(minSafeY, heightAt(0, 18));
  return { x: 0, y: spawnY + 0.15, z: 18, relocated: true };
}

// ─────────────────────────────────────────────────────────────
// Anti-curang offline: server menjadi sumber kebenaran lama pergi
// ─────────────────────────────────────────────────────────────
export interface AwayWindow {
  fromMs: number;
  source: 'server' | 'local' | 'none';
}

/**
 * Tentukan awal jendela offline. Jika server menjawab (`last_seen_at`), HANYA server yang dipercaya —
 * mengubah `updatedAt` save lokal tidak menambah waktu pergi. Tanpa server (tamu/gagal jaringan)
 * dipakai waktu save lokal, tetapi waktu di masa depan ditolak (0 detik).
 */
export function resolveAwayWindow(savedMs: number, nowMs: number, serverAwaySec?: number | null): AwayWindow {
  if (typeof serverAwaySec === 'number' && Number.isFinite(serverAwaySec) && serverAwaySec >= 0) {
    return { fromMs: nowMs - Math.min(serverAwaySec, AWAY_MAX_WINDOW_MS / 1000) * 1000, source: 'server' };
  }
  if (Number.isFinite(savedMs) && savedMs <= nowMs) return { fromMs: savedMs, source: 'local' };
  return { fromMs: nowMs, source: 'none' };
}

// ─────────────────────────────────────────────────────────────
// Offline lanjutan (Backlog #4): kebun tumbuh, bor menambang, badai merusak
// ─────────────────────────────────────────────────────────────
export const GARDEN_GROWTH_PER_HOUR = 12.5; // 8 jam cerah = panen
export const GARDEN_WEATHER_MULT: Record<AwayWeather, number> = {
  clear_haze: 1, ash_storm: 0.3, acid_rain: 1.4, electrical_storm: 0.8, meteor_shower: 1,
};
export const DRILL_PER_HOUR = 6;
export const DRILL_CAP = 48;
/** Bor hanya bekerja saat cuaca ini. */
export const DRILL_WEATHER_OK: Record<AwayWeather, boolean> = {
  clear_haze: true, ash_storm: false, acid_rain: true, electrical_storm: false, meteor_shower: false,
};
/** HP hilang per jam badai (bangunan tanpa pelindung). */
export const STORM_DAMAGE_PER_HOUR: Record<AwayWeather, number> = {
  clear_haze: 0, ash_storm: 3, acid_rain: 0, electrical_storm: 5, meteor_shower: 6,
};
export const PROTECTED_DAMAGE_MULT = 0.25;
export const SHELTER_COVER_RADIUS = 6;
/** Bangunan tidak pernah hancur saat offline: HP tidak turun di bawah pecahan ini. */
export const MIN_HP_FRACTION = 0.1;
const STORM_EXEMPT = new Set(['terrain_anchor']);

export interface EconomyStruct {
  type: string;
  x: number;
  z: number;
  hp?: number;
  maxHp?: number;
  growth?: number;
  stored?: number;
}

/** Bangunan terlindungi bila ia sendiri tempat berteduh, atau ada tempat berteduh dalam radius. */
export function isStormProtected(s: EconomyStruct, all: readonly EconomyStruct[]): boolean {
  const cover = (t: string) => t === 'basic_shelter' || t === 'roof_panel';
  if (cover(s.type)) return true;
  return all.some((o) => o !== s && cover(o.type) && Math.hypot(o.x - s.x, o.z - s.z) <= SHELTER_COVER_RADIUS);
}

/** Majukan kebun/bor sebanyak `hours` jam pada cuaca & musim tertentu. Dipakai juga saat main (tickStructures). */
export function advanceProducer(
  s: EconomyStruct,
  hours: number,
  weather: AwayWeather,
  season: EdenCalendar['season']
): void {
  if (hours <= 0) return;
  if (s.type === 'garden_plot') {
    s.growth = Math.min(100, (s.growth || 0) + GARDEN_GROWTH_PER_HOUR * hours * GARDEN_WEATHER_MULT[weather] * SEASON_FX[season].gardenMult);
  } else if (s.type === 'auto_drill' && DRILL_WEATHER_OK[weather]) {
    s.stored = Math.min(DRILL_CAP, (s.stored || 0) + DRILL_PER_HOUR * hours);
  }
}

export interface EconomyReport {
  gardensReady: number;
  drillUnits: number;
  damaged: number;
  /** HP terendah (persen) di antara bangunan yang rusak. */
  worstHpPct: number;
}

/** Simulasi ekonomi offline per blok cuaca (maks 24 jam terakhir). Mengubah `structs`. */
export function simulateOfflineEconomy(structs: EconomyStruct[], startMs: number, endMs: number): EconomyReport {
  const rep: EconomyReport = { gardensReady: 0, drillUnits: 0, damaged: 0, worstHpPct: 100 };
  const from = Math.max(startMs, endMs - OFFLINE_CAP_SEC * 1000);
  if (!(endMs > from) || structs.length === 0) return rep;
  const protectedSet = new Set(structs.filter((x) => isStormProtected(x, structs)));
  const hpBefore = new Map(structs.map((x) => [x, x.hp ?? 0] as const));
  const storedBefore = structs.reduce((n, x) => n + (x.type === 'auto_drill' ? x.stored || 0 : 0), 0);

  for (let b = Math.floor(from / AWAY_BLOCK_MS); b <= Math.floor(endMs / AWAY_BLOCK_MS); b++) {
    const overlapMs = Math.min(endMs, (b + 1) * AWAY_BLOCK_MS) - Math.max(from, b * AWAY_BLOCK_MS);
    if (overlapMs <= 0) continue;
    const hours = overlapMs / 3600000;
    const weather = weatherForBlock(b);
    const season = seasonOfBlock(b);
    const dmgPerHour = STORM_DAMAGE_PER_HOUR[weather];
    for (const x of structs) {
      advanceProducer(x, hours, weather, season);
      if (dmgPerHour > 0 && !STORM_EXEMPT.has(x.type) && typeof x.hp === 'number' && typeof x.maxHp === 'number') {
        const loss = dmgPerHour * hours * (protectedSet.has(x) ? PROTECTED_DAMAGE_MULT : 1);
        x.hp = Math.max(Math.ceil(x.maxHp * MIN_HP_FRACTION), x.hp - loss);
      }
    }
  }
  for (const x of structs) {
    if (x.type === 'garden_plot' && (x.growth || 0) >= 100) rep.gardensReady++;
    const before = hpBefore.get(x) ?? 0;
    if (typeof x.hp === 'number' && typeof x.maxHp === 'number' && x.hp < before - 0.001) {
      rep.damaged++;
      rep.worstHpPct = Math.min(rep.worstHpPct, Math.round((x.hp / x.maxHp) * 100));
    }
  }
  rep.drillUnits = Math.round(structs.reduce((n, x) => n + (x.type === 'auto_drill' ? x.stored || 0 : 0), 0) - storedBefore);
  return rep;
}

export interface AwayEntry {
  icon: string;
  text: string;
}

export interface AwayReport {
  seconds: number;
  entries: AwayEntry[];
}

/** Gabungan efek offline (air terisi, istirahat) + kronik cuaca/kalender selama pemain pergi. */
export function buildAwayReport(
  fromMs: number,
  toMs: number,
  structs: Array<{ type: string; x: number; z: number; waterStored?: number; anchorSeed?: string; hp?: number; maxHp?: number; growth?: number; stored?: number }>,
  terrainShift: boolean = MONTHLY_TERRAIN_SHIFT
): AwayReport {
  const windowMs = Math.min(AWAY_MAX_WINDOW_MS, Math.max(0, toMs - fromMs));
  const start = toMs - windowMs;
  const report: AwayReport = { seconds: Math.floor(windowMs / 1000), entries: [] };
  if (report.seconds < OFFLINE_MIN_SEC) return report;

  // Cuaca: jam per jenis, dihitung dari irisan tiap blok 6 jam dengan jendela
  const hours: Record<AwayWeather, number> = { clear_haze: 0, ash_storm: 0, acid_rain: 0, electrical_storm: 0, meteor_shower: 0 };
  for (let b = Math.floor(start / AWAY_BLOCK_MS); b <= Math.floor(toMs / AWAY_BLOCK_MS); b++) {
    const overlap = Math.min(toMs, (b + 1) * AWAY_BLOCK_MS) - Math.max(start, b * AWAY_BLOCK_MS);
    if (overlap > 0) hours[weatherForBlock(b)] += overlap / 3600000;
  }
  const notable = (Object.keys(hours) as AwayWeather[])
    .filter((w) => w !== 'clear_haze' && hours[w] >= 1)
    .sort((a, b) => hours[b] - hours[a])
    .slice(0, 3);
  for (const w of notable) {
    report.entries.push({ icon: WEATHER_LABEL[w].icon, text: `${WEATHER_LABEL[w].name} sekitar ${Math.round(hours[w])} jam` });
  }

  // Air: efek offline dasar + bonus tiap ~6 jam hujan
  const fx = computeOfflineProgress(structs, Math.min(report.seconds, OFFLINE_CAP_SEC));
  const rainBlocks = Math.floor((hours.acid_rain + hours.electrical_storm) / 6);
  if (rainBlocks > 0) {
    for (const s of structs) if (s.type === 'water_collector') s.waterStored = Math.min(100, (s.waterStored || 0) + rainBlocks * 8);
  }
  const collectors = structs.filter((s) => s.type === 'water_collector').length;
  if (collectors > 0 && (fx.collectorsFilled > 0 || rainBlocks > 0)) {
    report.entries.push({ icon: '💧', text: `${collectors} penampung air terisi` });
  }

  // Ekonomi offline: kebun, bor, kerusakan badai
  const eco = simulateOfflineEconomy(structs, start, toMs);
  if (eco.gardensReady > 0) report.entries.push({ icon: '🌱', text: `${eco.gardensReady} kebun siap dipanen` });
  if (eco.drillUnits > 0) report.entries.push({ icon: '⛏', text: `Bor otomatis mengumpulkan ${eco.drillUnits} batu` });
  if (eco.damaged > 0) {
    report.entries.push({ icon: '🛠', text: `${eco.damaged} bangunan rusak oleh badai (terparah tersisa ${eco.worstHpPct}%). Bangun tempat berteduh di dekatnya` });
  }

  // Kalender: hari berganti, gunung berapi, pergeseran bulan
  const dFrom = new Date(start);
  const dTo = new Date(toMs);
  const dayKey = (d: Date) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  let days = 0;
  let maxVolcano = 0;
  let maxVolcanoDay: Date | null = null;
  for (let t = new Date(Date.UTC(dFrom.getUTCFullYear(), dFrom.getUTCMonth(), dFrom.getUTCDate())); t <= dTo; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1))) {
    if (dayKey(t) !== dayKey(dFrom)) days++;
    const va = getEdenCalendar(t).volcanoActivity;
    if (va > maxVolcano) { maxVolcano = va; maxVolcanoDay = t; }
  }
  if (days > 0) report.entries.push({ icon: '🌅', text: `Hari berganti ${days}×: vegetasi dan sumber daya tumbuh ulang` });
  if (maxVolcano >= 0.85 && maxVolcanoDay) {
    report.entries.push({ icon: '🔥', text: `Gunung berapi sangat aktif pada ${String(maxVolcanoDay.getUTCDate()).padStart(2, '0')}/${String(maxVolcanoDay.getUTCMonth() + 1).padStart(2, '0')}` });
  }
  if (dFrom.getUTCFullYear() !== dTo.getUTCFullYear()) {
    const newAge = getWorldAge(dTo);
    report.entries.push({
      icon: '⏳',
      text: `Era berubah: ${newAge.name} (Tahun ${newAge.eraYear}) dimulai!`,
    });
  }
  if (terrainShift && dFrom.getUTCFullYear() * 12 + dFrom.getUTCMonth() !== dTo.getUTCFullYear() * 12 + dTo.getUTCMonth()) {
    const anchors = collectAnchors(structs);
    const builds = structs.filter((s) => s.type !== 'terrain_anchor');
    const exposed = builds.filter((s) => !anchors.some((a) => Math.hypot(s.x - a.x, s.z - a.z) <= a.r)).length;
    const base = `Pergeseran Besar: peta berganti ke ${MONTH_NAMES[dTo.getUTCMonth()]} ${dTo.getUTCFullYear()}`;
    report.entries.push({
      icon: '🗺',
      text: builds.length === 0 ? base : exposed > 0 ? `${base}. ${exposed} bangunan di luar zona Jangkar Medan` : `${base}. Semua bangunan terlindungi Jangkar`,
    });
  }
  if (fx.rested) report.entries.push({ icon: '😴', text: 'Tubuhmu beristirahat penuh' });
  return report;
}
