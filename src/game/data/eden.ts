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
