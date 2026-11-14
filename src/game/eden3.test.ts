import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAwayReport, weatherForBlock, weatherAtTime, msUntilWeatherChange } from './data/eden';

const H = 3600 * 1000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

test('cuaca per blok deterministik', () => {
  assert.equal(weatherForBlock(123456), weatherForBlock(123456));
  const kinds = new Set(Array.from({ length: 400 }, (_, i) => weatherForBlock(i)));
  assert.equal(kinds.size, 5);
});

test('pergi < 5 menit: laporan kosong dan tidak mengubah apa pun', () => {
  const s = [{ type: 'water_collector', x: 0, z: 0, waterStored: 0 }];
  const r = buildAwayReport(at(2026, 11, 14), at(2026, 11, 14) + 60_000, s);
  assert.equal(r.entries.length, 0);
  assert.equal(s[0].waterStored, 0);
});

test('laporan sama untuk rentang waktu sama (deterministik)', () => {
  const mk = () => [{ type: 'water_collector', x: 0, z: 0, waterStored: 0 }];
  const a = buildAwayReport(at(2026, 11, 10), at(2026, 11, 12), mk());
  const b = buildAwayReport(at(2026, 11, 10), at(2026, 11, 12), mk());
  assert.deepEqual(a, b);
  assert.ok(a.entries.some((e) => e.text.startsWith('Hari berganti 2×')));
});

test('pergantian bulan: lapor bangunan di luar / di dalam zona jangkar', () => {
  const structs = [
    { type: 'terrain_anchor', x: 100, z: 100, anchorSeed: 'S' },
    { type: 'basic_shelter', x: 110, z: 100 },
    { type: 'basic_shelter', x: 900, z: 900 },
  ];
  const r = buildAwayReport(at(2026, 11, 30, 20), at(2026, 12, 1, 8), structs);
  const e = r.entries.find((x) => x.text.startsWith('Pergeseran Besar'));
  assert.ok(e && e.text.includes('Desember 2026'));
  assert.ok(e.text.includes('1 bangunan di luar zona Jangkar'));
  const all = buildAwayReport(at(2026, 11, 30, 20), at(2026, 12, 1, 8), structs.slice(0, 2));
  assert.ok(all.entries.some((x) => x.text.includes('Semua bangunan terlindungi')));
});

test('rentang dibatasi 30 hari dan istirahat dilaporkan', () => {
  const r = buildAwayReport(at(2025, 1, 1), at(2026, 11, 14), []);
  assert.equal(r.seconds, 30 * 24 * 3600);
  assert.ok(r.entries.some((x) => x.text.includes('beristirahat')));
  const short = buildAwayReport(at(2026, 11, 14, 10), at(2026, 11, 14, 10) + 2 * H, []);
  assert.ok(short.entries.some((x) => x.text.includes('beristirahat')));
});

test('cuaca saat bermain = kronik blok 6 jam (selaras dengan laporan)', () => {
  const t = at(2026, 11, 14, 9);
  const block = Math.floor(t / (6 * H));
  assert.equal(weatherAtTime(t), weatherForBlock(block));
  // Dalam satu blok cuaca konstan
  const start = block * 6 * H;
  assert.equal(weatherAtTime(start), weatherAtTime(start + 6 * H - 1));
});

test('sisa waktu ke pergantian cuaca selalu 1..6 jam dan jatuh tepat di batas blok', () => {
  for (const t of [0, 1, 6 * H - 1, 6 * H, at(2026, 11, 14, 9), -5]) {
    const left = msUntilWeatherChange(t);
    assert.ok(left >= 1 && left <= 6 * H);
    assert.equal((t + left) % (6 * H), 0);
  }
});
