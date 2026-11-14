import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHOR_RADIUS, canBuyPerk, collectAnchors, computeOfflineProgress, perkEffects,
  wisdomPointsEarned, wisdomPointsSpent,
} from './data/eden';
import { createNoise2D } from './world/noise';
import { sampleHeightAnchored, sampleWorldHeight } from './world/terrainHeight';

const DAY = 86400;

test('jangkar medan: dalam radius tetap medan lama, jauh ikut medan baru', () => {
  const oldN = createNoise2D('W|Y2026|M11');
  const newN = createNoise2D('W|Y2026|M12');
  const anchors = [{ x: 400, z: 400, r: ANCHOR_RADIUS, noise: oldN }];
  const inside = sampleHeightAnchored(newN, anchors, 405, 402);
  assert.ok(Math.abs(inside - sampleWorldHeight(oldN, 405, 402)) < 1e-9);
  const far = sampleHeightAnchored(newN, anchors, 400 + ANCHOR_RADIUS + 30, 400);
  assert.ok(Math.abs(far - sampleWorldHeight(newN, 400 + ANCHOR_RADIUS + 30, 400)) < 1e-9);
  // tanpa jangkar = perilaku lama
  assert.equal(sampleHeightAnchored(newN, [], 10, 10), sampleWorldHeight(newN, 10, 10));
});

test('jangkar medan: transisi halus (tidak ada lompatan tajam di tepi)', () => {
  const oldN = createNoise2D('A');
  const newN = createNoise2D('B');
  const anchors = [{ x: 0, z: 500, r: ANCHOR_RADIUS, noise: oldN }];
  let maxJump = 0;
  let prev = sampleHeightAnchored(newN, anchors, 0, 500 + 20);
  for (let d = 20.5; d <= 80; d += 0.5) {
    const h = sampleHeightAnchored(newN, anchors, 0, 500 + d);
    maxJump = Math.max(maxJump, Math.abs(h - prev));
    prev = h;
  }
  assert.ok(maxJump < 2.5, `lompatan terlalu besar: ${maxJump}`);
});

test('collectAnchors hanya mengambil terrain_anchor yang punya seed', () => {
  const list = collectAnchors([
    { type: 'terrain_anchor', x: 1, z: 2, anchorSeed: 'S' },
    { type: 'terrain_anchor', x: 3, z: 4 },
    { type: 'basic_shelter', x: 5, z: 6, anchorSeed: 'X' },
  ]);
  assert.deepEqual(list, [{ x: 1, z: 2, r: ANCHOR_RADIUS, seed: 'S' }]);
});

test('offline: < 5 menit tidak ada efek, lebih lama mengisi penampung, dibatasi 24 jam', () => {
  const a = [{ type: 'water_collector', waterStored: 0 }];
  assert.equal(computeOfflineProgress(a, 100).collectorsFilled, 0);
  assert.equal(a[0].waterStored, 0);
  const r = computeOfflineProgress(a, 1800);
  assert.equal(r.collectorsFilled, 1);
  assert.ok(r.rested);
  assert.equal(a[0].waterStored, 36);
  const b = [{ type: 'water_collector', waterStored: 0 }];
  const big = computeOfflineProgress(b, 30 * DAY);
  assert.equal(big.seconds, DAY); // dibatasi
  assert.equal(b[0].waterStored, 100);
  assert.equal(computeOfflineProgress([], Number.NaN).seconds, 0);
});

test('kebijaksanaan: poin dari umur, tidak bisa beli tanpa poin/prasyarat', () => {
  assert.equal(wisdomPointsEarned(6 * DAY), 0);
  assert.equal(wisdomPointsEarned(7 * DAY), 1);
  assert.equal(wisdomPointsEarned(30 * DAY), 3);
  assert.equal(wisdomPointsEarned(100 * DAY), 6);
  assert.equal(wisdomPointsEarned(365 * DAY), 11);
  assert.equal(canBuyPerk('filter_awet', [], 6 * DAY), false);
  assert.equal(canBuyPerk('filter_awet', [], 7 * DAY), true);
  assert.equal(canBuyPerk('filter_awet', ['filter_awet'], 365 * DAY), false);
  assert.equal(canBuyPerk('filter_awet_2', [], 365 * DAY), false); // butuh prasyarat
  assert.equal(canBuyPerk('filter_awet_2', ['filter_awet'], 100 * DAY), true);
  assert.equal(wisdomPointsSpent(['filter_awet', 'kulit_abu']), 3);
});

test('efek perk: tidak menumpuk melebihi yang terbaik', () => {
  assert.deepEqual(perkEffects([]), { filterDrainMult: 1, radiationMult: 1 });
  assert.equal(perkEffects(['filter_awet', 'filter_awet_2']).filterDrainMult, 0.5);
  assert.equal(perkEffects(['kulit_abu']).radiationMult, 0.75);
});
