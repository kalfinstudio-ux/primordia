/**
 * Info Game (Pengaturan → Info Game): deskripsi, skema, misi, panduan, ketentuan, kebijakan.
 * Angka & daftar diambil dari data game sungguhan (item, resep, misi, balance, eden) supaya
 * teks tidak basi saat game berubah. Logika murni → mudah dites (gameInfo.test.ts).
 */
import {
  ACHIEVEMENTS,
  AUTOSAVE_INTERVAL_SEC,
  BASE_CARRY_WEIGHT,
  CAMPAIGN_QUESTS,
  CHUNK_SIZE,
  GAME_VERSION,
  ITEMS,
  JOURNAL_ENTRIES,
  RECIPES,
  WORLD_HALF_EXTENT,
} from '../config';
import { BALANCE } from './balance';
import {
  ANCHOR_RADIUS,
  DRILL_CAP,
  DRILL_PER_HOUR,
  ERA_NAME,
  GARDEN_GROWTH_PER_HOUR,
  OFFLINE_CAP_SEC,
  OFFLINE_MIN_SEC,
  SEASON_FX,
  WISDOM_MILESTONES,
  WISDOM_PERKS,
} from './eden';

export type InfoSectionId = 'about' | 'scheme' | 'missions' | 'guide' | 'terms' | 'privacy';
export const INFO_SECTIONS: readonly InfoSectionId[] = ['about', 'scheme', 'missions', 'guide', 'terms', 'privacy'];

/** Satu kartu teks: judul + (opsional) paragraf + (opsional) daftar butir. */
export interface InfoBlock {
  title: string;
  body?: string;
  items?: string[];
}

export const NUM_CHAPTERS = 7;

/** Nilai pengganti untuk {placeholder} di teks i18n bagian `info`. */
export function buildInfoVars(opts: { biomeCount: number; contactEmail?: string; ownerName?: string; updatedAt: string }): Record<string, string> {
  const m = BALANCE.difficulty.multiplier;
  const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  const tierCounts = [1, 2, 3, 4, 5].map((tier) => Object.values(ITEMS).filter((i) => i.tier === tier).length);
  return {
    version: GAME_VERSION,
    era: ERA_NAME,
    worldKm: String(Math.round((WORLD_HALF_EXTENT * 2) / 1000)),
    chunk: String(CHUNK_SIZE),
    biomes: String(opts.biomeCount),
    items: String(Object.keys(ITEMS).length),
    recipes: String(RECIPES.length),
    quests: String(CAMPAIGN_QUESTS.length),
    chapters: String(NUM_CHAPTERS),
    achievements: String(ACHIEVEMENTS.length),
    journal: String(JOURNAL_ENTRIES.length),
    tiers: '5',
    tierCounts: tierCounts.join(' / '),
    multExplorer: num(m.explorer),
    multSurvivor: num(m.survivor),
    multHadean: num(m.hadean),
    safeMin: String(Math.round(BALANCE.safeStart.durationSec / 60)),
    safeRadius: String(BALANCE.safeStart.radiusM),
    easeMin: String(Math.round(BALANCE.earlyEase.untilSec / 60)),
    easePct: String(Math.round((1 - BALANCE.earlyEase.multiplier) * 100)),
    autoFilterPct: String(BALANCE.autoFilter.belowOxygenPct),
    offlineMaxH: String(Math.round(OFFLINE_CAP_SEC / 3600)),
    offlineMinMin: String(Math.round(OFFLINE_MIN_SEC / 60)),
    anchorR: String(ANCHOR_RADIUS),
    gardenHours: String(Math.round(100 / GARDEN_GROWTH_PER_HOUR)),
    drillPerH: String(DRILL_PER_HOUR),
    drillCap: String(DRILL_CAP),
    carry: String(BASE_CARRY_WEIGHT),
    autosaveSec: String(AUTOSAVE_INTERVAL_SEC),
    wisdom: WISDOM_MILESTONES.map((w) => `${w.days} hari = ${w.points}`).join(', '),
    perks: WISDOM_PERKS.map((p) => p.name).join(', '),
    seasons: Object.values(SEASON_FX)
      .map((s) => s.label)
      .join(', '),
    updatedAt: opts.updatedAt,
    owner: opts.ownerName || '',
    contact: opts.contactEmail || '',
  };
}

/** Ganti {nama} dengan nilainya. Placeholder tak dikenal dibiarkan apa adanya (kelihatan saat dites). */
export function fillInfo(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

/** Validasi bentuk data dari i18n (bisa saja salah ketik di JSON) → array InfoBlock yang aman. */
export function parseBlocks(raw: unknown): InfoBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: InfoBlock[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.title !== 'string') continue;
    const block: InfoBlock = { title: o.title };
    if (typeof o.body === 'string') block.body = o.body;
    if (Array.isArray(o.items)) block.items = o.items.filter((x): x is string => typeof x === 'string');
    out.push(block);
  }
  return out;
}

/** Misi per bab, urut. */
export function questsByChapter(): Array<{ chapter: number; ids: string[] }> {
  const map = new Map<number, string[]>();
  for (const q of [...CAMPAIGN_QUESTS].sort((a, b) => a.order - b.order)) {
    const list = map.get(q.chapter) ?? [];
    list.push(q.id);
    map.set(q.chapter, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([chapter, ids]) => ({ chapter, ids }));
}

/** Nama tombol yang enak dibaca dari KeyboardEvent.code (KeyW → W, Space → Spasi). */
export function prettyKey(code: string): string {
  if (code === 'Space') return 'Spasi';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}
