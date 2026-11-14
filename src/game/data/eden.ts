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
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((cur - start) / 86400000);
}

export function getEdenCalendar(date: Date = new Date()): EdenCalendar {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
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

/**
 * Seed efektif untuk medan: berubah tiap BULAN (dan otomatis tiap tahun).
 * Props/sumber daya memakai seed harian, jadi vegetasi & batu tumbuh ulang tiap hari.
 * Set `MONTHLY_TERRAIN_SHIFT=false` jika medan tidak boleh berubah (mis. saat banyak bangunan).
 */
export const MONTHLY_TERRAIN_SHIFT = true;

export function effectiveTerrainSeed(worldSeed: string, date: Date = new Date()): string {
  if (!MONTHLY_TERRAIN_SHIFT) return worldSeed;
  const c = getEdenCalendar(date);
  return `${worldSeed}|Y${c.year}|M${c.month}`;
}

export function effectivePropSeed(worldSeed: string, date: Date = new Date()): string {
  const c = getEdenCalendar(date);
  return `${effectiveTerrainSeed(worldSeed, date)}|D${c.day}`;
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
