export interface SpatialCollider {
  id: string;
  x: number;
  z: number;
  radius: number;
  yMin: number;
  yMax: number;
  kind: 'rock' | 'mineral' | 'crystal' | 'spire' | 'structure' | 'poi';
}

export class SpatialHashGrid {
  private readonly cellSize: number;
  private buckets = new Map<string, SpatialCollider[]>();
  private byId = new Map<string, { col: SpatialCollider; key: string }>();

  constructor(cellSize = 8) {
    this.cellSize = cellSize;
  }

  private cellKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  insert(col: SpatialCollider): void {
    if (this.byId.has(col.id)) this.remove(col.id);
    const cx = Math.floor(col.x / this.cellSize);
    const cz = Math.floor(col.z / this.cellSize);
    const key = this.cellKey(cx, cz);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(col);
    this.byId.set(col.id, { col, key });
  }

  remove(id: string): void {
    const rec = this.byId.get(id);
    if (!rec) return;
    const bucket = this.buckets.get(rec.key);
    if (bucket) {
      const idx = bucket.indexOf(rec.col);
      if (idx !== -1) bucket.splice(idx, 1);
      if (bucket.length === 0) this.buckets.delete(rec.key);
    }
    this.byId.delete(id);
  }

  clear(): void {
    this.buckets.clear();
    this.byId.clear();
  }

  queryRadius(x: number, z: number, radius: number): SpatialCollider[] {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    const results: SpatialCollider[] = [];
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.buckets.get(this.cellKey(cx, cz));
        if (!bucket) continue;
        for (const c of bucket) {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d <= radius + c.radius) {
            results.push(c);
          }
        }
      }
    }
    return results;
  }

  /** Zero-allocation radius query writing matching colliders into caller-owned buffer. */
  queryRadiusInto(x: number, z: number, radius: number, out: SpatialCollider[]): number {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.buckets.get(this.cellKey(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          const dx = c.x - x;
          const dz = c.z - z;
          const rSum = radius + c.radius;
          if (dx * dx + dz * dz <= rSum * rSum) {
            out.push(c);
          }
        }
      }
    }
    return out.length;
  }
}

export function resolveCapsuleObstacles(
  x: number,
  y: number,
  z: number,
  playerRadius: number,
  playerHeight: number,
  colliders: SpatialCollider[]
): { x: number; z: number; collided: boolean } {
  let rx = x;
  let rz = z;
  let collided = false;
  const pTop = y + playerHeight;

  for (let pass = 0; pass < 2; pass++) {
    for (const col of colliders) {
      if (pTop < col.yMin || y > col.yMax) continue;
      const dx = rx - col.x;
      const dz = rz - col.z;
      const distSq = dx * dx + dz * dz;
      const minDist = playerRadius + col.radius;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = minDist - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
        collided = true;
      }
    }
  }
  return { x: rx, z: rz, collided };
}
