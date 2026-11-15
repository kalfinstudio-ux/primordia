/**
 * Pembuang aset GPU (geometri/material) untuk objek three.js.
 * Murni berbasis duck-typing (tanpa import three) agar bisa dites dengan `tsx --test`.
 *
 * Aturan: sumber daya yang ditandai `userData.sharedResource = true` dipakai bersama
 * (material modul `props.ts`, geometri spire bersama) dan TIDAK PERNAH dibuang di sini.
 * Tekstur tidak pernah dibuang (milik ProceduralAssets, dipakai bersama banyak mesh).
 */

export interface DisposableLike {
  dispose?: () => void;
  userData?: Record<string, unknown>;
}

export interface Object3DLike {
  traverse: (cb: (obj: Object3DLike) => void) => void;
  geometry?: DisposableLike;
  material?: DisposableLike | DisposableLike[];
}

export interface DisposeStats {
  geometries: number;
  materials: number;
  skippedShared: number;
}

export function markShared<T extends DisposableLike>(res: T): T {
  if (!res.userData) res.userData = {};
  res.userData.sharedResource = true;
  return res;
}

export function isShared(res: DisposableLike | undefined | null): boolean {
  return !!res?.userData?.sharedResource;
}

/** Buang geometri & material milik pohon objek (kecuali yang ditandai bersama). Tiap objek dibuang sekali. */
export function disposeObject3D(root: Object3DLike): DisposeStats {
  const stats: DisposeStats = { geometries: 0, materials: 0, skippedShared: 0 };
  const seen = new Set<DisposableLike>();
  const handle = (res: DisposableLike | undefined, kind: 'geometries' | 'materials') => {
    if (!res || seen.has(res)) return;
    seen.add(res);
    if (isShared(res)) {
      stats.skippedShared++;
      return;
    }
    res.dispose?.();
    stats[kind]++;
  };
  root.traverse((obj) => {
    handle(obj.geometry, 'geometries');
    const mat = obj.material;
    if (Array.isArray(mat)) for (const m of mat) handle(m, 'materials');
    else handle(mat, 'materials');
  });
  return stats;
}
