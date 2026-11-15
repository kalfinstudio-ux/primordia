import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDCRAFTED_POIS, WORLD_POIS, getBiomeAt } from './world/biomes';
import { MAX_GENERATED, MIN_SEPARATION, SPAWN_CLEAR_RADIUS, WORLD_MARGIN, generatePois } from './world/poiGen';
import { MAX_TIER, SPAWN_POINT, dangerLevel, dangerTier, directionOf, getRegionAt, regionLabel } from './world/regions';
import { WORLD_HALF_EXTENT } from './config';
import idDict from '../i18n/id.json';
import enDict from '../i18n/en.json';

const tr = (d: unknown) => (key: string) => {
  let n: unknown = d;
  for (const part of key.split('.')) n = (n as Record<string, unknown>)?.[part];
  return typeof n === 'string' ? n : `??${key}`;
};

test('generator deterministik: dua kali jalan identik', () => {
  const a = generatePois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT);
  const b = generatePois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 25 && a.length <= MAX_GENERATED, `jumlah ${a.length}`);
});

test('POI generator valid: di dalam dunia, jauh dari spawn & sesamanya, id unik', () => {
  const all = WORLD_POIS;
  assert.ok(all.length >= 12 + 25);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length);
  const gen = all.filter((p) => p.id.startsWith('poi_gen_'));
  for (const p of gen) {
    assert.ok(Math.abs(p.x) <= WORLD_HALF_EXTENT - WORLD_MARGIN && Math.abs(p.z) <= WORLD_HALF_EXTENT - WORLD_MARGIN, p.id);
    assert.ok(Math.hypot(p.x - SPAWN_POINT.x, p.z - SPAWN_POINT.z) >= SPAWN_CLEAR_RADIUS, p.id);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].id.startsWith('poi_gen_') || all[j].id.startsWith('poi_gen_')) {
        assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) >= MIN_SEPARATION - 1, `${all[i].id} vs ${all[j].id}`);
      }
    }
  }
});

test('seed tata letak berbeda -> hasil berbeda (generator memang memakai seed)', () => {
  const a = generatePois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT, 'seed-a');
  const b = generatePois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT, 'seed-b');
  assert.notDeepEqual(a.map((p) => [p.x, p.z]), b.map((p) => [p.x, p.z]));
});

test('variasi jenis: ≥5 jenis, dan jauh lebih garang daripada dekat spawn', () => {
  const kinds = new Set(WORLD_POIS.map((p) => p.kind));
  assert.ok(kinds.size >= 5);
  const gen = WORLD_POIS.filter((p) => p.id.startsWith('poi_gen_'));
  const near = gen.filter((p) => dangerTier(p.x, p.z) <= 1);
  assert.ok(near.every((p) => !['volcano', 'lava_tube'].includes(p.kind)), 'tier 0-1 tanpa volcano/lava_tube');
});

test('tier bahaya & arah', () => {
  assert.equal(dangerTier(SPAWN_POINT.x, SPAWN_POINT.z), 0);
  assert.equal(dangerTier(500, 18), 1);
  assert.equal(dangerTier(1000, 18), 2);
  assert.equal(dangerTier(1700, 18), 3);
  assert.equal(dangerTier(2040, 2040), MAX_TIER);
  assert.equal(dangerLevel(MAX_TIER), 5);
  assert.equal(directionOf(0, -900), 'n');
  assert.equal(directionOf(900, 18), 'e');
  assert.equal(directionOf(0, 900), 's');
  assert.equal(directionOf(-900, 18), 'w');
  assert.equal(directionOf(700, -700), 'ne');
  assert.equal(getRegionAt(0, 18).dir, null);
});

test('nama wilayah ID/EN lengkap & terformat', () => {
  for (const d of [idDict, enDict]) {
    const f = tr(d);
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      for (const dir of [null, 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
        const name = regionLabel({ tier, dir: tier === 0 ? null : dir, key: '' }, f);
        assert.ok(!name.includes('??') && !name.includes('{'), name);
      }
    }
    assert.ok(!f('poiNames.lava_tube').includes('??') && !f('poiNames.hot_spring').includes('??'));
  }
  assert.equal(regionLabel({ tier: 1, dir: 'n', key: '' }, tr(idDict)), 'Dataran Perbatasan Utara');
  assert.equal(regionLabel({ tier: 1, dir: 'n', key: '' }, tr(enDict)), 'North Frontier Plains');
});

test('biome tetap deterministik & POI baru memengaruhi biome', () => {
  const hs = WORLD_POIS.find((p) => p.kind === 'hot_spring');
  if (hs) assert.equal(getBiomeAt(hs.x, hs.z, 3).id, 'geyser_basin');
  assert.deepEqual(getBiomeAt(10, 10, 2), getBiomeAt(10, 10, 2));
});
