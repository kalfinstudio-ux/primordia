import { BALANCE } from '../data/balance';
import { getBiomeAt } from '../world/biomes';
import { distance2D } from '../utils/math';

export interface CleanAirTarget {
  x: number;
  z: number;
  dist: number;
  kind: 'shelter' | 'terrain';
}

export interface ShelterLike {
  type: string;
  x: number;
  z: number;
}

export type HeightSampler = (x: number, z: number) => number;

/** Apakah titik ini layak disebut "udara bersih" (tanpa gas pekat, panas, atau radiasi tinggi)? */
export function isCleanAirAt(x: number, z: number, sampleHeight: HeightSampler): boolean {
  const c = BALANCE.cleanAir;
  const b = getBiomeAt(x, z, sampleHeight(x, z));
  if (c.avoidBiomes.includes(b.id)) return false;
  return b.toxicLevel <= c.maxToxicLevel && b.ambientTempC <= c.maxTempC && b.radiationLevel <= c.maxRadiation;
}

/**
 * Cari udara bersih terdekat: shelter milik pemain dulu (kedap gas), lalu cincin sampel di sekeliling.
 * Murni (tanpa THREE) supaya bisa dites; dipanggil terbatas (~tiap 0,6 dtk) hanya saat oksigen rendah.
 */
export function findNearestCleanAir(
  px: number,
  pz: number,
  sampleHeight: HeightSampler,
  structures: readonly ShelterLike[] = [],
  weatherIsToxic = false
): CleanAirTarget | null {
  const c = BALANCE.cleanAir;

  let bestShelter: CleanAirTarget | null = null;
  for (const s of structures) {
    if (s.type !== 'basic_shelter' && s.type !== 'roof_panel') continue;
    const d = distance2D(px, pz, s.x, s.z);
    if (d <= c.shelterSearchM && (!bestShelter || d < bestShelter.dist)) {
      bestShelter = { x: s.x, z: s.z, dist: d, kind: 'shelter' };
    }
  }
  // Saat cuaca beracun, udara luar tidak bersih: shelter satu-satunya jawaban.
  if (weatherIsToxic) return bestShelter;

  if (isCleanAirAt(px, pz, sampleHeight)) return { x: px, z: pz, dist: 0, kind: 'terrain' };

  let bestTerrain: CleanAirTarget | null = null;
  for (let r = c.stepM; r <= c.maxRadiusM; r += c.stepM) {
    if (bestShelter && r > bestShelter.dist) break; // shelter sudah lebih dekat
    for (let i = 0; i < c.directions; i++) {
      const a = (i / c.directions) * Math.PI * 2;
      const x = px + Math.sin(a) * r;
      const z = pz - Math.cos(a) * r;
      if (isCleanAirAt(x, z, sampleHeight)) {
        bestTerrain = { x, z, dist: r, kind: 'terrain' };
        break;
      }
    }
    if (bestTerrain) break;
  }

  if (bestShelter && (!bestTerrain || bestShelter.dist <= bestTerrain.dist)) return bestShelter;
  return bestTerrain;
}

/** Sudut relatif (derajat, searah jarum jam, 0 = lurus ke depan) dari arah pandang ke target. */
export function relativeBearingDeg(px: number, pz: number, tx: number, tz: number, headingRad: number): number {
  // Utara = -z, timur = +x (sama dengan kompas HUD).
  const bearing = Math.atan2(tx - px, -(tz - pz));
  let rel = ((bearing - headingRad) * 180) / Math.PI;
  rel = ((rel % 360) + 540) % 360 - 180;
  return Math.round(rel);
}

/** Titik bangkit aman: shelter/beacon milik pemain terdekat dari lokasi mati, kalau tidak titik spawn. */
export function pickRespawnPoint(
  deathX: number,
  deathZ: number,
  structures: readonly ShelterLike[],
  sampleHeight: HeightSampler
): { x: number; z: number } {
  const spawn = BALANCE.safeStart.spawn;
  let best: { x: number; z: number } = { x: spawn.x, z: spawn.z };
  let bestD = Infinity;
  for (const s of structures) {
    if (s.type !== 'basic_shelter' && s.type !== 'fast_beacon') continue;
    const d = distance2D(deathX, deathZ, s.x, s.z);
    if (d < bestD) {
      bestD = d;
      best = { x: s.x + BALANCE.respawn.offsetFromShelterM, z: s.z };
    }
  }
  if (isCleanAirAt(best.x, best.z, sampleHeight)) return best;
  const alt = findNearestCleanAir(best.x, best.z, sampleHeight, [], false);
  return alt ? { x: alt.x, z: alt.z } : best;
}
