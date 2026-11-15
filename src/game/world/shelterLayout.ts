/**
 * Tata letak pondok basal (basic_shelter). Murni (tanpa three.js) agar bisa dites dengan `tsx --test`.
 *
 * Koordinat lokal model: pintu menghadap -Z lokal (ke arah pemain saat dipasang, karena pemain
 * berdiri di sisi -Z dari bangunan yang ditaruh di depannya). Dinding = cincin 8 slot; slot pintu kosong.
 */
export const SHELTER_WALL_SLOTS = 8;
/** Slot pintu (indeks 6 = sudut 270° = -Z lokal). */
export const SHELTER_DOOR_SLOT = 6;
/** Jari-jari cincin dinding (pusat tiap tiang dinding). */
export const SHELTER_WALL_RING_R = 1.9;
/** Jari-jari collider tiap segmen dinding. Celah pintu = 2·R·sin(45°) − 2·r ≈ 1,29 m (> 2×0,45 kapsul pemain). */
export const SHELTER_WALL_COLLIDER_R = 0.7;
/** Ruang dalam: pemain dianggap "di dalam" pondok bila lebih dekat dari ini ke pusat. */
export const SHELTER_INTERIOR_R = 1.45;
/** Perlindungan visual (partikel cuaca) memudar sampai jarak ini dari pusat. */
export const SHELTER_COVER_FADE_R = 3.3;

export interface ShelterLike {
  type: string;
  x: number;
  z: number;
  rotY: number;
}

export interface Disc { x: number; z: number; radius: number }

/** Posisi lokal pusat slot dinding ke-i (sudut i·45°). */
export function wallSlotLocal(i: number): { x: number; z: number; angle: number } {
  const angle = (i / SHELTER_WALL_SLOTS) * Math.PI * 2;
  return { x: Math.cos(angle) * SHELTER_WALL_RING_R, z: Math.sin(angle) * SHELTER_WALL_RING_R, angle };
}

/** Putar titik lokal ke dunia (konvensi three.js rotation.y). */
export function localToWorld(s: { x: number; z: number; rotY: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(s.rotY);
  const n = Math.sin(s.rotY);
  return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c };
}

/** Collider dinding dunia: 7 silinder, celah di sisi pintu. */
export function shelterColliders(s: ShelterLike): Disc[] {
  const out: Disc[] = [];
  for (let i = 0; i < SHELTER_WALL_SLOTS; i++) {
    if (i === SHELTER_DOOR_SLOT) continue;
    const l = wallSlotLocal(i);
    const w = localToWorld(s, l.x, l.z);
    out.push({ x: w.x, z: w.z, radius: SHELTER_WALL_COLLIDER_R });
  }
  return out;
}

/** Jari-jari pusat rusuk model 3D (4 rusuk di sudut 45°+k·90°, lihat props.ts) dan collider tiap rusuk. */
export const SHELTER_RIB_RING_R = 1.45;
export const SHELTER_RIB_COLLIDER_R = 0.4;

/**
 * Collider yang dipakai di dunia: HANYA 4 rusuk model (pondok berpilar, sisi-sisinya terbuka).
 * Sebelumnya satu silinder padat r=2,1 di tengah menahan pemain 2,5 m dari pusat, sehingga tidak bisa masuk.
 * Celah antar rusuk ≈ 2,05 − 0,8 = 1,25 m (> 2 × 0,45 kapsul pemain).
 */
export function shelterRibColliders(s: ShelterLike): Disc[] {
  const out: Disc[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const w = localToWorld(s, Math.cos(a) * SHELTER_RIB_RING_R, Math.sin(a) * SHELTER_RIB_RING_R);
    out.push({ x: w.x, z: w.z, radius: SHELTER_RIB_COLLIDER_R });
  }
  return out;
}

/** Titik tengah pintu di dunia (untuk uji/petunjuk). */
export function shelterDoorWorld(s: ShelterLike): { x: number; z: number } {
  const l = wallSlotLocal(SHELTER_DOOR_SLOT);
  return localToWorld(s, l.x, l.z);
}

export function isInsideShelter(px: number, pz: number, s: ShelterLike): boolean {
  return Math.hypot(px - s.x, pz - s.z) < SHELTER_INTERIOR_R;
}

/**
 * Seberapa tertutup pemain oleh pondok (0..1): 1 di dalam, memudar linear sampai SHELTER_COVER_FADE_R.
 * Hanya `basic_shelter`. Dipakai untuk meredam partikel cuaca; TIDAK memengaruhi vital (itu pakai jarak 4,5 m di survival.ts).
 */
export function shelterCover(px: number, pz: number, structures: readonly ShelterLike[]): number {
  let best = 0;
  for (const s of structures) {
    if (s.type !== 'basic_shelter') continue;
    const d = Math.hypot(px - s.x, pz - s.z);
    let f: number;
    if (d < SHELTER_INTERIOR_R) f = 1;
    else if (d >= SHELTER_COVER_FADE_R) f = 0;
    else f = 1 - (d - SHELTER_INTERIOR_R) / (SHELTER_COVER_FADE_R - SHELTER_INTERIOR_R);
    if (f > best) best = f;
  }
  return best;
}
