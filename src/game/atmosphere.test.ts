import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_ATMOSPHERE, atmosphereFor } from './data/atmosphere';
import {
  LANDMARK_SIZE,
  SIL_MAX_DIST,
  SIL_RADIUS,
  placeSilhouette,
  silhouetteOpacity,
} from './world/landmarkMath';
import { WORLD_POIS } from './world/biomes';

test('semua biome punya atmosfer valid', () => {
  for (const [id, a] of Object.entries(BIOME_ATMOSPHERE)) {
    assert.ok(a.fogMult >= 0.5 && a.fogMult <= 2, id);
    assert.ok(a.amount >= 0 && a.amount <= 1, id);
    assert.match(a.tint, /^#[0-9a-f]{6}$/i, id);
  }
  assert.equal(atmosphereFor('nope' as never).amount, 0);
});

test('siluet tersembunyi dekat, muncul bertahap, hilang sangat jauh', () => {
  assert.equal(silhouetteOpacity(50), 0);
  assert.equal(silhouetteOpacity(SIL_RADIUS), 0);
  assert.ok(silhouetteOpacity(SIL_RADIUS + 60) > 0 && silhouetteOpacity(SIL_RADIUS + 60) < 1);
  assert.equal(silhouetteOpacity(900), 1);
  assert.equal(silhouetteOpacity(SIL_MAX_DIST + 600), 0);
});

test('proyeksi siluet: pada garis pandang & jarak bidang tetap', () => {
  const p = placeSilhouette(0, 0, 600, 800); // d = 1000
  assert.ok(p.visible);
  assert.ok(Math.abs(Math.hypot(p.dx, p.dz) - SIL_RADIUS) < 1e-6);
  assert.ok(Math.abs(p.dx / p.dz - 600 / 800) < 1e-9);
  assert.ok(Math.abs(p.k - SIL_RADIUS / 1000) < 1e-9);
  assert.equal(placeSilhouette(10, 10, 10, 10).visible, false);
});

test('siluet hanya untuk jenis tinggi, dan ada minimal satu landmark', () => {
  const withSil = WORLD_POIS.filter((p) => LANDMARK_SIZE[p.kind]);
  assert.ok(withSil.length >= 3);
  assert.equal(LANDMARK_SIZE.hot_spring, undefined);
});
