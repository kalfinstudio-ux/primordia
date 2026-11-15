/** Matematika tampilan peta (pan/zoom/ketuk). Murni, tanpa DOM, supaya bisa dites. */
export interface MapView {
  /** Pusat tampilan (koordinat dunia, meter). */
  cx: number;
  cz: number;
  /** Lebar dunia yang tampak di kanvas persegi (meter). Makin kecil = makin zoom. */
  span: number;
}

export const MIN_SPAN = 160;

export function maxSpan(half: number): number {
  return half * 2 * 1.12;
}

export function clampView(v: MapView, half: number): MapView {
  const span = Math.min(maxSpan(half), Math.max(MIN_SPAN, v.span));
  return {
    span,
    cx: Math.min(half, Math.max(-half, v.cx)),
    cz: Math.min(half, Math.max(-half, v.cz)),
  };
}

export function worldToScreen(v: MapView, size: number, x: number, z: number): { x: number; y: number } {
  const k = size / v.span;
  return { x: size / 2 + (x - v.cx) * k, y: size / 2 + (z - v.cz) * k };
}

export function screenToWorld(v: MapView, size: number, sx: number, sy: number): { x: number; z: number } {
  const k = v.span / size;
  return { x: v.cx + (sx - size / 2) * k, z: v.cz + (sy - size / 2) * k };
}

/** Ubah skala; titik dunia di bawah (sx,sy) tetap diam. factor<1 = zoom in. */
export function zoomAt(v: MapView, size: number, sx: number, sy: number, factor: number, half: number): MapView {
  const before = screenToWorld(v, size, sx, sy);
  const span = Math.min(maxSpan(half), Math.max(MIN_SPAN, v.span * factor));
  const k = span / size;
  return clampView({ span, cx: before.x - (sx - size / 2) * k, cz: before.z - (sy - size / 2) * k }, half);
}

export function panBy(v: MapView, size: number, dxPx: number, dyPx: number, half: number): MapView {
  const k = v.span / size;
  return clampView({ ...v, cx: v.cx - dxPx * k, cz: v.cz - dyPx * k }, half);
}

/** Jarak garis grid (meter) agar jarak antar garis ≥ minPx piksel. */
export function gridStep(span: number, size: number, minPx = 44): number {
  const steps = [32, 64, 128, 256, 512, 1024, 2048];
  const pxPerM = size / span;
  for (const s of steps) if (s * pxPerM >= minPx) return s;
  return steps[steps.length - 1];
}

/** Panjang batang skala (meter) yang muat ≤ maxPx piksel. */
export function scaleBarMeters(span: number, size: number, maxPx: number): number {
  const options = [2000, 1000, 500, 200, 100, 50, 20];
  const pxPerM = size / span;
  for (const m of options) if (m * pxPerM <= maxPx) return m;
  return options[options.length - 1];
}

export interface MapTarget {
  id: string;
  x: number;
  z: number;
}

/** Target terdekat dalam radius piksel dari titik ketuk; null bila tidak ada. */
export function pickTarget<T extends MapTarget>(
  v: MapView,
  size: number,
  sx: number,
  sy: number,
  targets: readonly T[],
  radiusPx: number
): T | null {
  let best: T | null = null;
  let bestD = radiusPx;
  for (const tg of targets) {
    const p = worldToScreen(v, size, tg.x, tg.z);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= bestD) {
      bestD = d;
      best = tg;
    }
  }
  return best;
}

export function clampToWorld(x: number, z: number, half: number): { x: number; z: number } {
  return {
    x: Math.round(Math.min(half, Math.max(-half, x))),
    z: Math.round(Math.min(half, Math.max(-half, z))),
  };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
