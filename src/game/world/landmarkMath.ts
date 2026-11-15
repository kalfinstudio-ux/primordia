import type { PoiKind } from './poiGen';

/** Jarak bidang siluet dari kamera (di dalam kubah langit r=280 dan far kamera 420). */
export const SIL_RADIUS = 235;
/** Siluet baru muncul bila landmark lebih jauh dari ini; memudar masuk sepanjang SIL_FADE_IN. */
export const SIL_FADE_IN = 120;
export const SIL_MAX_DIST = 1400;
export const SIL_FADE_OUT = 500;


/** Ukuran nyata landmark (meter): radius dasar & tinggi. */
/** Hanya jenis yang tinggi/terlihat dari jauh; jenis lain (kawah, tabung lava, dst.) tidak diberi siluet. */
export const LANDMARK_SIZE: Partial<Record<PoiKind, { r: number; h: number }>> = {
  volcano: { r: 110, h: 95 },
  geyser: { r: 6, h: 55 },
  obsidian_crevasse: { r: 40, h: 28 },
};

export function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Opasitas siluet menurut jarak nyata d ke landmark. 0 = disembunyikan. */
export function silhouetteOpacity(d: number): number {
  if (!(d > 0)) return 0;
  const fin = smooth01((d - SIL_RADIUS) / SIL_FADE_IN);
  const fout = 1 - smooth01((d - SIL_MAX_DIST) / SIL_FADE_OUT);
  return fin * fout;
}

export interface SilhouettePlacement {
  visible: boolean;
  opacity: number;
  /** Offset horizontal dari pusat kamera. */
  dx: number;
  dz: number;
  /** Skala perspektif (SIL_RADIUS / d). */
  k: number;
  dist: number;
}

/** Proyeksikan landmark nyata ke bidang siluet: titik pada garis pandang, ukuran diskalakan k. */
export function placeSilhouette(px: number, pz: number, lx: number, lz: number): SilhouettePlacement {
  const dx = lx - px;
  const dz = lz - pz;
  const dist = Math.hypot(dx, dz);
  const opacity = silhouetteOpacity(dist);
  if (opacity <= 0.01) return { visible: false, opacity: 0, dx: 0, dz: 0, k: 0, dist };
  const k = SIL_RADIUS / dist;
  return { visible: true, opacity, dx: dx * k, dz: dz * k, k, dist };
}
