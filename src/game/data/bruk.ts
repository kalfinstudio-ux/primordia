/**
 * Bruk, penjaga basal — NPC tingkat 1 (suara & kehadiran).
 * Logika murni (tanpa three/react) → dites di bruk.test.ts.
 *
 * Kepercayaan DIHITUNG dari fakta (momen yang sudah terjadi + jumlah misi selesai),
 * bukan disimpan sebagai angka terpisah → tidak bisa melenceng dari save, dan save lama
 * otomatis ikut. Yang disimpan hanya daftar id momen yang sudah diucapkan (`brukMoments`).
 *
 * Nada cerita (keputusan pemilik): BERAT. Bruk berbicara pendek dan dingin di awal,
 * makin panjang dan makin terluka tiap bab; akhirnya ia melepas waktu dengan harga kehilangan.
 */
import { CAMPAIGN_QUESTS } from './quests';

export const BRUK_MAX_TRUST = 100;
/** Poin kepercayaan tiap misi selesai. */
export const BRUK_TRUST_PER_QUEST = 2;
/** Ambang tingkat 0..4 (tingkat = jumlah ambang yang terlewati − 1). */
export const BRUK_LEVEL_THRESHOLDS = [0, 10, 30, 55, 80] as const;
/** Detik berlindung di shelter selama badai agar dihitung "selamat dari badai". */
export const BRUK_STORM_SHELTER_SEC = 25;

export type BrukMomentId =
  | 'first_fire'
  | 'first_shelter'
  | 'storm_survived'
  | 'fire_third'
  | 'chapter_1'
  | 'chapter_2'
  | 'chapter_3'
  | 'chapter_4'
  | 'ending';

export interface BrukMoment {
  id: BrukMomentId;
  /** Poin kepercayaan sekali dapat. Teks: kunci i18n `bruk.lines.<id>`. */
  trust: number;
}

/** Urutan = prioritas ucapan bila beberapa momen terpenuhi sekaligus (yang terakhir menang). */
export const BRUK_MOMENTS: readonly BrukMoment[] = [
  { id: 'first_fire', trust: 10 },
  { id: 'first_shelter', trust: 10 },
  { id: 'storm_survived', trust: 15 },
  { id: 'fire_third', trust: 5 },
  { id: 'chapter_1', trust: 5 },
  { id: 'chapter_2', trust: 5 },
  { id: 'chapter_3', trust: 5 },
  { id: 'chapter_4', trust: 5 },
  { id: 'ending', trust: 10 },
];

/** Misi terakhir tiap bab → momen bab. Bab 5 berakhir di momen `ending`. */
const CHAPTER_LAST_QUEST: Record<string, BrukMomentId> = {
  q5: 'chapter_1',
  q10: 'chapter_2',
  q14: 'chapter_3',
  q18: 'chapter_4',
};

export interface BrukFacts {
  completedQuests: string[];
  campfireCount: number;
  hasShelter: boolean;
  /** Sudah bertahan satu badai di dalam shelter (dihitung oleh systems/bruk.ts). */
  stormSurvived: boolean;
  campaignComplete: boolean;
}

export function isMomentMet(id: BrukMomentId, f: BrukFacts): boolean {
  switch (id) {
    case 'first_fire': return f.campfireCount >= 1;
    case 'fire_third': return f.campfireCount >= 3;
    case 'first_shelter': return f.hasShelter;
    case 'storm_survived': return f.stormSurvived;
    case 'ending': return f.campaignComplete;
    default: {
      const lastQ = Object.keys(CHAPTER_LAST_QUEST).find((q) => CHAPTER_LAST_QUEST[q] === id);
      return !!lastQ && f.completedQuests.includes(lastQ);
    }
  }
}

export function brukTrust(moments: readonly string[], completedQuestCount: number): number {
  const fromMoments = BRUK_MOMENTS.filter((m) => moments.includes(m.id)).reduce((a, m) => a + m.trust, 0);
  const fromQuests = Math.min(CAMPAIGN_QUESTS.length, Math.max(0, completedQuestCount)) * BRUK_TRUST_PER_QUEST;
  return Math.min(BRUK_MAX_TRUST, fromMoments + fromQuests);
}

export function brukLevel(trust: number): number {
  let lvl = 0;
  BRUK_LEVEL_THRESHOLDS.forEach((th, i) => {
    if (trust >= th) lvl = i;
  });
  return lvl;
}

export interface BrukResult {
  /** Daftar momen yang sudah ditandai (termasuk yang baru). */
  moments: string[];
  /** Kunci i18n yang diucapkan, berurutan (maks 2: satu momen + satu petunjuk tingkat). */
  lines: string[];
  trust: number;
  level: number;
}

/**
 * Evaluasi momen baru. Semua momen yang terpenuhi ditandai, tetapi hanya SATU yang diucapkan
 * (yang terakhir menurut urutan) supaya save lama tidak membanjiri layar dengan dialog.
 * Naik tingkat → tambah satu baris petunjuk untuk tingkat SEKARANG (bukan tiap tingkat yang terlewat).
 */
export function evaluateBruk(prevMoments: readonly string[], facts: BrukFacts): BrukResult {
  const prevTrust = brukTrust(prevMoments, facts.completedQuests.length);
  const prevLevelBase = brukLevel(prevTrust);
  const moments = [...prevMoments];
  const fresh: BrukMomentId[] = [];
  for (const m of BRUK_MOMENTS) {
    if (!moments.includes(m.id) && isMomentMet(m.id, facts)) {
      moments.push(m.id);
      fresh.push(m.id);
    }
  }
  const trust = brukTrust(moments, facts.completedQuests.length);
  const level = brukLevel(trust);
  const lines: string[] = [];
  if (fresh.length > 0) lines.push(`bruk.lines.${fresh[fresh.length - 1]}`);
  // Petunjuk hanya saat tingkat benar-benar naik karena momen baru (bukan sekadar memuat save lama).
  if (fresh.length > 0 && level > prevLevelBase && level >= 1) lines.push(`bruk.hints.level${level}`);
  return { moments, lines, trust, level };
}

/** Rapikan daftar momen dari save: hanya id dikenal, tanpa duplikat. */
export function sanitizeBrukMoments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(BRUK_MOMENTS.map((m) => m.id));
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && known.has(x)))];
}
