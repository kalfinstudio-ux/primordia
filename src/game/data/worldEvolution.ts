/**
 * Lapisan evolusi dunia per Era (tahunan UTC) dan Musim (bulanan UTC).
 * Modul murni (tanpa Three.js, tanpa DOM, tanpa alokasi berulang di jalur panas).
 *
 * Prinsip:
 * - Medan dasar (`sampleWorldHeight`) TETAP.
 * - Langkah 1 (aktif): perubahan visual & prop saja (colour grading, kerapatan vegetasi/prop, kabut, tint tanah).
 * - Langkah 2 (di balik `ERA_TERRAIN_DELTA = false`): delta ketinggian kecil & halus per `(seed, era, x, z)`
 *   yang turun ke TEPAT 0 di dalam radius perlindungan (`40 m` PLACEHOLDER) dari struktur/beacon/base pemain.
 */
import { clamp, smoothstep } from '../utils/math';
import { BALANCE } from './balance';
import type { EdenCalendar } from './eden';

export type WorldSeason = EdenCalendar['season'];

export interface PlayerFootprint {
  x: number;
  z: number;
}

export interface EraVisualProfile {
  eraYear: number;
  /** Pengali pengisian warna tanah [R, G, B] (1,1,1 = netral di Era 1). */
  groundTintMult: readonly [number, number, number];
  /** Pergeseran aditif ringan warna tanah [R, G, B]. */
  groundTintAdd: readonly [number, number, number];
  /** Kekuatan variasi lapisan spasial pada tint tanah (0 di Era 1). */
  groundLayerTintAmt: number;
  /** Warna semburat kabut & horizon khas era. */
  fogTintHex: string;
  /** Seberapa kuat semburat kabut era dicampur (0..1). */
  fogTintAmount: number;
  /** Pengali kepadatan kabut era. */
  fogDensityMult: number;
  /** Pengali tone-mapping exposure (colour grading). */
  exposureMult: number;
  /** Pengali kerapatan prop geologis (node sumber daya & menara batu). */
  propDensityMult: number;
  /** Jumlah klaster lumut/vegetasi per chunk (0 di Era 1; tumbuh di Era 2+). */
  vegClustersPerChunk: number;
  /** Pengali jumlah spire per chunk relatif terhadap 4 spire dasar. */
  spireDensityMult: number;
}

export interface SeasonVisualProfile {
  season: WorldSeason;
  /** Warna semburat langit & kabut musiman. */
  skyTintHex: string;
  /** Seberapa kuat semburat musiman dicampur ke horizon/tengah langit (0..1). */
  skyTintAmount: number;
  /** Pengali kepadatan kabut musiman. */
  fogDensityMult: number;
  /** Pengali tone-mapping exposure musiman. */
  exposureMult: number;
  /** Pengali warna tanah musiman [R, G, B]. */
  groundTintMult: readonly [number, number, number];
}

export interface CombinedVisualProfile {
  eraYear: number;
  season: WorldSeason;
  fogTintHex: string;
  fogTintAmount: number;
  fogDensityMult: number;
  exposureMult: number;
  groundTintMult: readonly [number, number, number];
  groundTintAdd: readonly [number, number, number];
  groundLayerTintAmt: number;
  propDensityMult: number;
  vegClustersPerChunk: number;
  spireDensityMult: number;
}

const ERA_PROFILES: readonly EraVisualProfile[] = [
  {
    // Era 1 (Tahun 1 — Era Adam & Hawa): palet dasar Hadean-Archean, belum ada vegetasi liar
    eraYear: 1,
    groundTintMult: [1.0, 1.0, 1.0],
    groundTintAdd: [0, 0, 0],
    groundLayerTintAmt: 0,
    fogTintHex: '#c94c16',
    fogTintAmount: 0,
    fogDensityMult: 1.0,
    exposureMult: 1.0,
    propDensityMult: 1.0,
    vegClustersPerChunk: 0,
    spireDensityMult: 1.0,
  },
  {
    // Era 2 (Tahun 2 — Era Pasang Pertama): udara lebih lembap, semburat kehijauan lumut awal & vegetasi perintis
    eraYear: 2,
    groundTintMult: [0.94, 1.05, 0.96],
    groundTintAdd: [-0.004, 0.009, 0.003],
    groundLayerTintAmt: 0.018,
    fogTintHex: '#5b8a78',
    fogTintAmount: 0.18,
    fogDensityMult: 1.08,
    exposureMult: 1.03,
    propDensityMult: 1.15,
    vegClustersPerChunk: 4,
    spireDensityMult: 1.0,
  },
  {
    // Era 3 (Tahun 3 — Era Mahkota Bara): bara keemasan & mineral lebih rapat, kontras hangat
    eraYear: 3,
    groundTintMult: [1.07, 0.97, 0.89],
    groundTintAdd: [0.008, 0.002, -0.004],
    groundLayerTintAmt: 0.022,
    fogTintHex: '#d96b27',
    fogTintAmount: 0.22,
    fogDensityMult: 1.12,
    exposureMult: 1.06,
    propDensityMult: 1.25,
    vegClustersPerChunk: 5,
    spireDensityMult: 1.25,
  },
  {
    // Era 4 (Tahun 4+ — Era Batu Hidup): batu berlumut subur, langit lebih bening & sejuk
    eraYear: 4,
    groundTintMult: [0.91, 1.07, 1.01],
    groundTintAdd: [-0.005, 0.012, 0.006],
    groundLayerTintAmt: 0.024,
    fogTintHex: '#4f7c8a',
    fogTintAmount: 0.2,
    fogDensityMult: 0.94,
    exposureMult: 1.05,
    propDensityMult: 1.35,
    vegClustersPerChunk: 8,
    spireDensityMult: 1.25,
  },
];

const SEASON_PROFILES: Record<WorldSeason, SeasonVisualProfile> = {
  kering: {
    season: 'kering',
    // Netral/hangat sebagai patokan agar kompatibel penuh dengan tampilan awal
    skyTintHex: '#d96524',
    skyTintAmount: 0.0,
    fogDensityMult: 1.0,
    exposureMult: 1.0,
    groundTintMult: [1.0, 1.0, 1.0],
  },
  hujan: {
    season: 'hujan',
    skyTintHex: '#4f6d6a',
    skyTintAmount: 0.24,
    fogDensityMult: 1.16,
    exposureMult: 0.95,
    groundTintMult: [0.93, 0.99, 1.02],
  },
  abu: {
    season: 'abu',
    skyTintHex: '#8c6952',
    skyTintAmount: 0.28,
    fogDensityMult: 1.24,
    exposureMult: 0.93,
    groundTintMult: [0.98, 0.95, 0.92],
  },
  dingin: {
    season: 'dingin',
    skyTintHex: '#5a6e8c',
    skyTintAmount: 0.22,
    fogDensityMult: 1.05,
    exposureMult: 0.97,
    groundTintMult: [0.93, 0.96, 1.05],
  },
};

export function eraVisuals(eraYear: number): EraVisualProfile {
  const safe = Math.max(1, Math.floor(Number.isFinite(eraYear) ? eraYear : 1));
  const template = ERA_PROFILES[(safe - 1) % ERA_PROFILES.length];
  if (template.eraYear === safe) return template;
  return { ...template, eraYear: safe };
}

export function seasonVisuals(season: WorldSeason): SeasonVisualProfile {
  return SEASON_PROFILES[season] ?? SEASON_PROFILES.kering;
}

export function combinedWorldVisuals(eraYear: number, season: WorldSeason): CombinedVisualProfile {
  const e = eraVisuals(eraYear);
  const s = seasonVisuals(season);
  const fogTintHex = s.skyTintAmount > e.fogTintAmount ? s.skyTintHex : e.fogTintHex;
  const fogTintAmount = clamp(Math.max(e.fogTintAmount, s.skyTintAmount) + Math.min(e.fogTintAmount, s.skyTintAmount) * 0.35, 0, 0.45);
  return {
    eraYear: e.eraYear,
    season: s.season,
    fogTintHex,
    fogTintAmount,
    fogDensityMult: e.fogDensityMult * s.fogDensityMult,
    exposureMult: e.exposureMult * s.exposureMult,
    groundTintMult: [
      e.groundTintMult[0] * s.groundTintMult[0],
      e.groundTintMult[1] * s.groundTintMult[1],
      e.groundTintMult[2] * s.groundTintMult[2],
    ],
    groundTintAdd: e.groundTintAdd,
    groundLayerTintAmt: e.groundLayerTintAmt,
    propDensityMult: e.propDensityMult,
    vegClustersPerChunk: e.vegClustersPerChunk,
    spireDensityMult: e.spireDensityMult,
  };
}

// ─────────────────────────────────────────────────────────────
// Lapisan spasial murni f(seed, era, x, z) & Langkah 2 (tinggi delta)
// ─────────────────────────────────────────────────────────────

export interface EraWaveParams {
  freq1: number;
  freq2: number;
  skew1: number;
  skew2: number;
  phase1: number;
  phase2: number;
  phase3: number;
}

function hashSeedEra(seed: string, era: number): number {
  let h1 = 0x811c9dc5 ^ (Math.floor(era) * 374761393);
  const str = `${seed || 'HADEAN-01'}#E${Math.max(1, Math.floor(era))}`;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 16777619);
  }
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 2246822507);
  h1 ^= h1 >>> 13;
  return h1 >>> 0;
}

const _waveCache = new Map<string, EraWaveParams>();

/** Parameter gelombang halus deterministik dari `(seed, era)` (di-cache per pasangan agar cepat per vertex). */
export function getEraWaveParams(seed: string, era: number): EraWaveParams {
  const safeEra = Math.max(1, Math.floor(Number.isFinite(era) ? era : 1));
  const safeSeed = seed || 'HADEAN-01';
  const key = `${safeSeed}#${safeEra}`;
  const hit = _waveCache.get(key);
  if (hit) return hit;

  let s = hashSeedEra(safeSeed, safeEra);
  const next01 = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const baseFreq = BALANCE.eraEvolution.spatialFreq;
  const params: EraWaveParams = {
    freq1: baseFreq * (0.85 + next01() * 0.35),
    freq2: baseFreq * (0.55 + next01() * 0.3),
    skew1: baseFreq * (0.3 + next01() * 0.45),
    skew2: baseFreq * (0.25 + next01() * 0.45),
    phase1: next01() * Math.PI * 2,
    phase2: next01() * Math.PI * 2,
    phase3: next01() * Math.PI * 2,
  };

  if (_waveCache.size > 48) _waveCache.clear();
  _waveCache.set(key, params);
  return params;
}

/** Evaluasi cepat lapisan era dalam rentang [-1, 1] tanpa alokasi. */
export function sampleEraLayerFromParams(p: EraWaveParams, x: number, z: number): number {
  const w1 = Math.sin(x * p.freq1 + z * p.skew1 + p.phase1);
  const w2 = Math.cos(x * p.skew2 - z * p.freq2 + p.phase2);
  const w3 = Math.sin((x + z) * (p.freq1 * 0.65) + p.phase3);
  return w1 * 0.5 + w2 * 0.35 + w3 * 0.15;
}

/**
 * Fungsi murni lapisan era `(seed, era, x, z)` -> [-1, 1].
 * Tanpa grid tersimpan; identik di seluruh klien dalam room multiplayer yang sama.
 */
export function sampleEraLayer(seed: string, era: number, x: number, z: number): number {
  return sampleEraLayerFromParams(getEraWaveParams(seed, era), x, z);
}

/**
 * Bobot pelindung jejak bangunan pemain:
 * - Tepat `0` di dalam `protectRadiusM` (bawaan PLACEHOLDER 40 m) dari struktur, beacon, atau base.
 * - Naik halus (`smoothstep`) menuju `1` pada `protectRadiusM + fadeWidthM`.
 */
export function footprintSuppressionWeight(
  x: number,
  z: number,
  footprints: ReadonlyArray<PlayerFootprint>,
  protectRadiusM: number = BALANCE.eraEvolution.structureProtectRadiusM,
  fadeWidthM: number = BALANCE.eraEvolution.structureFadeWidthM
): number {
  const len = footprints.length;
  if (len === 0) return 1;
  const innerSq = protectRadiusM * protectRadiusM;
  const outer = protectRadiusM + Math.max(0.01, fadeWidthM);
  const outerSq = outer * outer;
  let minSq = Infinity;
  for (let i = 0; i < len; i++) {
    const fp = footprints[i];
    const dx = x - fp.x;
    const dz = z - fp.z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= innerSq) return 0;
    if (dSq < minSq) minSq = dSq;
  }
  if (minSq >= outerSq) return 1;
  return smoothstep(protectRadiusM, outer, Math.sqrt(minSq));
}

/**
 * Saring daftar footprint untuk sebuah chunk agar loop per-vertex hanya memeriksa bangunan yang dekat chunk tsb.
 */
export function filterFootprintsForBounds(
  footprints: ReadonlyArray<PlayerFootprint>,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  marginM: number = BALANCE.eraEvolution.structureProtectRadiusM + BALANCE.eraEvolution.structureFadeWidthM + 2
): PlayerFootprint[] {
  if (footprints.length === 0) return [];
  const out: PlayerFootprint[] = [];
  for (let i = 0; i < footprints.length; i++) {
    const fp = footprints[i];
    if (fp.x >= minX - marginM && fp.x <= maxX + marginM && fp.z >= minZ - marginM && fp.z <= maxZ + marginM) {
      out.push(fp);
    }
  }
  return out;
}

/**
 * Langkah 2 (dikontrol `BALANCE.eraEvolution.eraTerrainDelta` / `ERA_TERRAIN_DELTA`):
 * Delta ketinggian kecil & halus per era.
 * - Jika `enabled === false`, selalu mengembalikan tepat `0`.
 * - Di dalam radius 40 m (PLACEHOLDER) dari struktur/beacon/base apa pun, selalu mengembalikan tepat `0`.
 */
export function sampleEraHeightDelta(
  seed: string,
  era: number,
  x: number,
  z: number,
  footprints: ReadonlyArray<PlayerFootprint> = [],
  enabled: boolean = BALANCE.eraEvolution.eraTerrainDelta
): number {
  if (!enabled) return 0;
  const w = footprintSuppressionWeight(x, z, footprints);
  if (w === 0) return 0;
  const raw = sampleEraLayer(seed, era, x, z) * BALANCE.eraEvolution.maxHeightDeltaM * w;
  return raw === 0 ? 0 : raw;
}

/** Kumpulkan semua koordinat bangunan, beacon, dan jangkar yang harus dilindungi dari delta tinggi medan. */
export function collectPlayerFootprints(
  structs: ReadonlyArray<{ x: number; z: number }>,
  extraBases: ReadonlyArray<PlayerFootprint> = []
): PlayerFootprint[] {
  const out: PlayerFootprint[] = [];
  for (let i = 0; i < structs.length; i++) {
    const s = structs[i];
    if (Number.isFinite(s.x) && Number.isFinite(s.z)) {
      out.push({ x: s.x, z: s.z });
    }
  }
  for (let i = 0; i < extraBases.length; i++) {
    const b = extraBases[i];
    if (Number.isFinite(b.x) && Number.isFinite(b.z)) {
      out.push({ x: b.x, z: b.z });
    }
  }
  return out;
}
