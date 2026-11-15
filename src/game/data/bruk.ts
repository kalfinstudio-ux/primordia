/**
 * Bruk, penjaga basal — NPC tingkat 1 (suara & kehadiran) + Memori, Dialog Kontekstual, & Hadiah Mekanis.
 * Logika murni (tanpa three/react) → dites di bruk.test.ts.
 *
 * Kepercayaan DIHITUNG dari fakta (momen yang sudah terjadi + jumlah misi selesai),
 * bukan disimpan sebagai angka terpisah → tidak bisa melenceng dari save, dan save lama
 * otomatis ikut.
 *
 * Nada cerita (keputusan pemilik): BERAT. Bruk berbicara pendek dan dingin di awal,
 * makin panjang dan makin terluka tiap bab; akhirnya ia melepas waktu dengan harga kehilangan.
 */
import { BALANCE } from './balance';
import { CAMPAIGN_QUESTS } from './quests';
import { CRYSTAL_CRATER, WORLD_POIS } from '../world/biomes';

export const BRUK_MAX_TRUST = 100;
/** Poin kepercayaan tiap misi selesai. */
export const BRUK_TRUST_PER_QUEST = 2;
/** Ambang tingkat 0..4 (tingkat = jumlah ambang yang terlewati − 1). */
export const BRUK_LEVEL_THRESHOLDS = [0, 10, 30, 55, 80] as const;
/** Detik berlindung di shelter selama badai agar dihitung "selamat dari badai". */
export const BRUK_STORM_SHELTER_SEC = 25;

/** Pilihan akhir bab 5: Bruk melepas waktu (Adam & Hawa menua) atau menahannya lagi. */
export type BrukChoice = 'release' | 'hold';

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
  /** Pilihan akhir; `ending` baru terpenuhi setelah pemain memilih. */
  brukChoice: BrukChoice | null;
}

export function isMomentMet(id: BrukMomentId, f: BrukFacts): boolean {
  switch (id) {
    case 'first_fire': return f.campfireCount >= 1;
    case 'fire_third': return f.campfireCount >= 3;
    case 'first_shelter': return f.hasShelter;
    case 'storm_survived': return f.stormSurvived;
    case 'ending': return f.campaignComplete && f.brukChoice !== null;
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

export function sanitizeBrukChoice(raw: unknown): BrukChoice | null {
  return raw === 'release' || raw === 'hold' ? raw : null;
}

/** Tandai momen `ending` saat pemain memilih (dipanggil dari layar kemenangan). */
export function withEndingMoment(moments: readonly string[]): string[] {
  return moments.includes('ending') ? [...moments] : [...moments, 'ending'];
}

/** Rapikan daftar momen dari save: hanya id dikenal, tanpa duplikat. */
export function sanitizeBrukMoments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(BRUK_MOMENTS.map((m) => m.id));
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && known.has(x)))];
}

// ── Bruk Memory (disimpan di SaveData dengan migrasi versi) ────────────────

export const BRUK_MEMORY_VERSION = 1;

export interface BrukMemory {
  version: number;
  violationCount: number;
  gifts: number;
  lastMeetingSec: number;
  lastViolationSec: number;
  talkCount: number;
  lastTalkKey: string | null;
  lastHintLevel: number;
  stormSanctuaryUntilSec: number;
  stormSanctuaryCooldownUntilSec: number;
}

export function createDefaultBrukMemory(): BrukMemory {
  return {
    version: BRUK_MEMORY_VERSION,
    violationCount: 0,
    gifts: 0,
    lastMeetingSec: -1,
    lastViolationSec: -999,
    talkCount: 0,
    lastTalkKey: null,
    lastHintLevel: 0,
    stormSanctuaryUntilSec: 0,
    stormSanctuaryCooldownUntilSec: 0,
  };
}

function clampInt(raw: unknown, def: number, min: number, max = 1_000_000): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return def;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function clampNum(raw: unknown, def: number, min: number, max = 1e9): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return def;
  return Math.max(min, Math.min(max, raw));
}

export function sanitizeBrukMemory(raw: unknown): BrukMemory {
  const def = createDefaultBrukMemory();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return def;
  const r = raw as Record<string, unknown>;
  return {
    version: BRUK_MEMORY_VERSION,
    violationCount: clampInt(r.violationCount, def.violationCount, 0),
    gifts: clampInt(r.gifts, def.gifts, 0),
    lastMeetingSec: clampNum(r.lastMeetingSec, def.lastMeetingSec, -1),
    lastViolationSec: clampNum(r.lastViolationSec, def.lastViolationSec, -9999),
    talkCount: clampInt(r.talkCount, def.talkCount, 0),
    lastTalkKey: typeof r.lastTalkKey === 'string' && r.lastTalkKey.startsWith('bruk.talk.') ? r.lastTalkKey : null,
    lastHintLevel: clampInt(r.lastHintLevel, def.lastHintLevel, 0, 4),
    stormSanctuaryUntilSec: clampNum(r.stormSanctuaryUntilSec, def.stormSanctuaryUntilSec, 0),
    stormSanctuaryCooldownUntilSec: clampNum(r.stormSanctuaryCooldownUntilSec, def.stormSanctuaryCooldownUntilSec, 0),
  };
}

export function recordBrukViolation(mem: BrukMemory, playtimeSec: number): BrukMemory {
  const t = Number.isFinite(playtimeSec) ? Math.max(0, playtimeSec) : 0;
  return {
    ...mem,
    violationCount: mem.violationCount + 1,
    lastViolationSec: t,
  };
}

export function recordBrukGift(mem: BrukMemory): BrukMemory {
  return {
    ...mem,
    gifts: mem.gifts + 1,
  };
}

export function isLongAbsenceReturn(mem: BrukMemory, playtimeSec: number): boolean {
  if (mem.lastMeetingSec < 0 || !Number.isFinite(playtimeSec)) return false;
  return playtimeSec - mem.lastMeetingSec >= BALANCE.bruk.longAbsenceSec;
}

// ── Talk Interaction & Contextual Layered Dialog ─────────────────────────────

export type BrukTalkContext =
  | 'violation'
  | 'injured'
  | 'storm'
  | 'fire_out'
  | 'long_return'
  | 'night'
  | 'trust_0'
  | 'trust_1'
  | 'trust_2'
  | 'trust_3'
  | 'trust_4';

export const BRUK_TALK_CONTEXTS: readonly BrukTalkContext[] = [
  'violation',
  'injured',
  'storm',
  'fire_out',
  'long_return',
  'night',
  'trust_0',
  'trust_1',
  'trust_2',
  'trust_3',
  'trust_4',
];

export const BRUK_TALK_VARIATIONS = 3;

export interface BrukTalkInput {
  level: number;
  isNight: boolean;
  storm: boolean;
  playerInjured: boolean;
  fireOut: boolean;
  playtimeSec: number;
  recentViolation: boolean;
}

/** Check whether player is within range (< 4 m) and facing Bruk. */
export function canTalkToBruk(
  playerX: number,
  playerZ: number,
  playerYaw: number,
  brukX: number,
  brukZ: number,
  maxDist = BALANCE.bruk.talkRangeM,
  minDot = BALANCE.bruk.talkFacingMinDot
): boolean {
  if (!Number.isFinite(playerX) || !Number.isFinite(playerZ) || !Number.isFinite(brukX) || !Number.isFinite(brukZ)) {
    return false;
  }
  const dx = brukX - playerX;
  const dz = brukZ - playerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > maxDist) return false;
  if (dist < 0.25) return true;
  const yaw = Number.isFinite(playerYaw) ? playerYaw : 0;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const dot = (fx * dx + fz * dz) / dist;
  return dot >= minDot;
}

export function pickBrukTalkContext(inp: BrukTalkInput, mem: BrukMemory): BrukTalkContext {
  const recentViol = inp.recentViolation || (mem.violationCount > 0 && inp.playtimeSec - mem.lastViolationSec < 90);
  if (recentViol) return 'violation';
  if (inp.playerInjured) return 'injured';
  if (inp.storm) return 'storm';
  if (isLongAbsenceReturn(mem, inp.playtimeSec)) return 'long_return';
  if (inp.fireOut) return 'fire_out';
  if (inp.isNight) return 'night';
  const lv = Math.max(0, Math.min(4, Math.floor(Number.isFinite(inp.level) ? inp.level : 0)));
  return (`trust_${lv}`) as BrukTalkContext;
}

/**
 * Deterministic contextual talk selector with 3 variations per context and no consecutive repeats.
 */
export function selectBrukTalkLine(
  inp: BrukTalkInput,
  mem: BrukMemory
): { key: string; context: BrukTalkContext; memory: BrukMemory } {
  const context = pickBrukTalkContext(inp, mem);
  const safeTime = Number.isFinite(inp.playtimeSec) ? Math.max(0, inp.playtimeSec) : 0;
  let idx = (mem.talkCount + Math.floor(safeTime / 11) + mem.gifts) % BRUK_TALK_VARIATIONS;
  let key = `bruk.talk.${context}.${idx}`;
  if (key === mem.lastTalkKey) {
    idx = (idx + 1) % BRUK_TALK_VARIATIONS;
    key = `bruk.talk.${context}.${idx}`;
  }
  const memory: BrukMemory = {
    ...mem,
    lastMeetingSec: safeTime,
    talkCount: mem.talkCount + 1,
    lastTalkKey: key,
  };
  return { key, context, memory };
}

// ── Mechanical Rewards (Map Resource Hints & Trust 3–4 Storm Sanctuary) ───────

export interface BrukResourceHint {
  id: string;
  level: number;
  kind: 'water' | 'crystal' | 'geyser' | 'obsidian' | 'meteor';
  x: number;
  z: number;
  labelKey: string;
}

const STARTER_POOL = { x: 16, z: 22 };

export function pickBrukResourceHint(level: number, playerX: number, playerZ: number): BrukResourceHint | null {
  const lv = Math.max(0, Math.min(4, Math.floor(Number.isFinite(level) ? level : 0)));
  if (lv <= 0) return null;

  const nearestPoi = (kind: string, fallback: { x: number; z: number }) => {
    let best = fallback;
    let bestDist = Infinity;
    for (const p of WORLD_POIS) {
      if (p.kind !== kind) continue;
      const d = Math.hypot(p.x - playerX, p.z - playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = { x: p.x, z: p.z };
      }
    }
    return best;
  };

  if (lv === 1) {
    return {
      id: 'bruk_hint_1',
      level: 1,
      kind: 'water',
      x: STARTER_POOL.x,
      z: STARTER_POOL.z,
      labelKey: 'hud.questGuide.water',
    };
  }
  if (lv === 2) {
    const pos = nearestPoi('crater', CRYSTAL_CRATER);
    return {
      id: 'bruk_hint_2',
      level: 2,
      kind: 'crystal',
      x: pos.x,
      z: pos.z,
      labelKey: 'hud.questGuide.crystal',
    };
  }
  if (lv === 3) {
    const pos = nearestPoi('obsidian_crevasse', { x: 145, z: -135 });
    return {
      id: 'bruk_hint_3',
      level: 3,
      kind: 'obsidian',
      x: pos.x,
      z: pos.z,
      labelKey: 'hud.questGuide.obsidian',
    };
  }
  const pos = nearestPoi('geyser', { x: -92, z: -64 });
  return {
    id: 'bruk_hint_4',
    level: 4,
    kind: 'geyser',
    x: pos.x,
    z: pos.z,
    labelKey: 'hud.questGuide.geyser',
  };
}

export interface StormSanctuaryInput {
  level: number;
  storm: boolean;
  playerDist: number;
  playtimeSec: number;
}

/**
 * Trust 3–4 mechanical reward: when near Bruk during a storm, Bruk briefly shelters
 * the player from storm toxicity and acid rain for a few seconds, with cooldown.
 */
export function stepBrukStormSanctuary(
  mem: BrukMemory,
  inp: StormSanctuaryInput
): { active: boolean; activatedNow: boolean; memory: BrukMemory } {
  const t = Number.isFinite(inp.playtimeSec) ? Math.max(0, inp.playtimeSec) : 0;
  const near = Number.isFinite(inp.playerDist) && inp.playerDist <= BALANCE.bruk.stormSanctuaryRadiusM;
  const lv = Math.floor(Number.isFinite(inp.level) ? inp.level : 0);

  if (!inp.storm || !near || lv < BALANCE.bruk.stormSanctuaryMinLevel) {
    return { active: false, activatedNow: false, memory: mem };
  }

  if (t < mem.stormSanctuaryUntilSec) {
    return { active: true, activatedNow: false, memory: mem };
  }

  if (t >= mem.stormSanctuaryCooldownUntilSec) {
    const dur = BALANCE.bruk.stormSanctuaryDurationSec[Math.min(4, lv)] ?? 10;
    const next: BrukMemory = {
      ...mem,
      stormSanctuaryUntilSec: t + dur,
      stormSanctuaryCooldownUntilSec: t + dur + BALANCE.bruk.stormSanctuaryCooldownSec,
    };
    return { active: true, activatedNow: true, memory: next };
  }

  return { active: false, activatedNow: false, memory: mem };
}
