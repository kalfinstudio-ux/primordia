import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_RING_DISTANCE,
  computeWantedChunks,
  diffChunks,
  radiusChunksForViewDistance,
  segmentsForChunkDistance,
} from './world/chunkScheduler';

test('radius chunk mengikuti view distance', () => {
  assert.equal(radiusChunksForViewDistance(70), 2);
  assert.equal(radiusChunksForViewDistance(95), 2);
  assert.equal(radiusChunksForViewDistance(135), 3);
  assert.equal(radiusChunksForViewDistance(200), 4);
});

test('LOD segmen turun seiring jarak', () => {
  assert.equal(segmentsForChunkDistance(0), 32);
  assert.equal(segmentsForChunkDistance(1.5), 32);
  assert.equal(segmentsForChunkDistance(2), 16);
  assert.equal(segmentsForChunkDistance(3), 8);
});

test('computeWantedChunks: radius 2 = 21 chunk, urut terdekat, 9 chunk di cincin sinkron', () => {
  const wanted = computeWantedChunks(5, -3, 2);
  assert.equal(wanted.length, 21);
  assert.equal(wanted[0].key, '5,-3');
  assert.equal(wanted[0].dist, 0);
  for (let i = 1; i < wanted.length; i++) assert.ok(wanted[i].dist >= wanted[i - 1].dist);
  assert.equal(wanted.filter((w) => w.dist <= SYNC_RING_DISTANCE).length, 9);
  assert.equal(wanted.filter((w) => w.segments === 32).length, 9);
  assert.equal(wanted.filter((w) => w.segments === 16).length, 12);
  assert.equal(new Set(wanted.map((w) => w.key)).size, wanted.length);
});

test('diffChunks: awal semua dibangun, tidak ada yang dibuang', () => {
  const wanted = computeWantedChunks(0, 0, 2);
  const { unload, build } = diffChunks(wanted, new Map(), new Map());
  assert.equal(unload.length, 0);
  assert.equal(build.length, wanted.length);
  assert.equal(build[0].key, '0,0');
});

test('diffChunks: pindah satu chunk membuang tepi lama dan membangun tepi baru terdekat dulu', () => {
  const before = computeWantedChunks(0, 0, 2);
  const loaded = new Map(before.map((w) => [w.key, w.segments]));
  const after = computeWantedChunks(1, 0, 2);
  const { unload, build } = diffChunks(after, loaded, new Map());

  assert.ok(unload.length > 0);
  assert.ok(unload.every((k) => !after.some((w) => w.key === k)));
  assert.ok(build.length > 0);
  for (let i = 1; i < build.length; i++) assert.ok(build[i].dist >= build[i - 1].dist);
  // chunk yang LOD-nya tidak berubah tidak dibangun ulang
  for (const b of build) assert.notEqual(loaded.get(b.key), b.segments);
});

test('diffChunks: tidak mengirim ulang job yang sedang berjalan dengan LOD sama', () => {
  const wanted = computeWantedChunks(0, 0, 2);
  const inflight = new Map<string, number>([[wanted[5].key, wanted[5].segments]]);
  const { build } = diffChunks(wanted, new Map(), inflight);
  assert.equal(build.length, wanted.length - 1);
  assert.ok(!build.some((b) => b.key === wanted[5].key));

  // LOD berbeda pada job berjalan -> tetap dijadwalkan ulang
  const stale = new Map<string, number>([[wanted[5].key, wanted[5].segments === 8 ? 16 : 8]]);
  assert.equal(diffChunks(wanted, new Map(), stale).build.length, wanted.length);
});

test('diffChunks: upgrade LOD saat pemain mendekat', () => {
  const wanted = computeWantedChunks(0, 0, 2);
  const loaded = new Map(wanted.map((w) => [w.key, 8]));
  const { unload, build } = diffChunks(wanted, loaded, new Map());
  assert.equal(unload.length, 0);
  assert.equal(build.length, wanted.length); // semua perlu naik dari 8 ke 16/32
});
