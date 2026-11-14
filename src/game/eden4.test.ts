import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceProducer, buildAwayReport, formatShiftCountdown, isStormProtected, msUntilMonthShift,
  resolveAwayWindow, seasonEffects, shiftWarning, simulateOfflineEconomy, weatherForBlock,
  DRILL_CAP, MIN_HP_FRACTION, AWAY_BLOCK_MS, type EconomyStruct,
} from './data/eden';

const H = 3600 * 1000;
const at = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

// ── #3 anti-curang ──
test('server menjadi sumber kebenaran: save lokal dimanipulasi tidak menambah waktu pergi', () => {
  const now = at(2026, 11, 14);
  const w = resolveAwayWindow(now - 20 * 86400000, now, 600); // klaim 20 hari, server bilang 10 menit
  assert.equal(w.source, 'server');
  assert.equal(now - w.fromMs, 600_000);
});
test('tanpa server: waktu lokal dipakai, waktu masa depan ditolak', () => {
  const now = at(2026, 11, 14);
  assert.deepEqual(resolveAwayWindow(now - 2 * H, now, null), { fromMs: now - 2 * H, source: 'local' });
  assert.deepEqual(resolveAwayWindow(now + 5 * H, now, undefined), { fromMs: now, source: 'none' });
  assert.deepEqual(resolveAwayWindow(NaN, now, -5), { fromMs: now, source: 'none' });
});
test('jawaban server dibatasi 30 hari', () => {
  const now = at(2026, 11, 14);
  assert.equal(now - resolveAwayWindow(0, now, 400 * 86400).fromMs, 30 * 86400000);
});

// ── #5 musim & peringatan ──
test('musim memengaruhi efek gameplay', () => {
  assert.equal(seasonEffects(new Date(2026, 4, 10)).label, 'Musim Hujan');
  assert.ok(seasonEffects(new Date(2026, 4, 10)).waterFillMult > seasonEffects(new Date(2026, 1, 10)).waterFillMult);
  assert.ok(seasonEffects(new Date(2026, 10, 14)).tempOffsetC < 0); // November = dingin
});
test('musim menggeser peluang cuaca (hujan asam lebih sering di musim hujan)', () => {
  const count = (startMs: number, kind: string) => {
    let n = 0;
    for (let b = Math.floor(startMs / AWAY_BLOCK_MS); b < Math.floor(startMs / AWAY_BLOCK_MS) + 2000; b++) if (weatherForBlock(b) === kind) n++;
    return n;
  };
  assert.ok(count(at(2026, 4, 1), 'acid_rain') > count(at(2026, 1, 1), 'acid_rain'));
  assert.equal(weatherForBlock(777777), weatherForBlock(777777));
});
test('peringatan Pergeseran Besar: none → soon (≤6j) → imminent (≤30m)', () => {
  assert.equal(shiftWarning(at(2026, 11, 20)).level, 'none');
  assert.equal(shiftWarning(at(2026, 11, 30, 19)).level, 'soon');
  assert.equal(shiftWarning(at(2026, 11, 30, 23, 45)).level, 'imminent');
  assert.equal(shiftWarning(at(2026, 11, 30, 19)).key, '2026-12:soon');
  assert.equal(msUntilMonthShift(at(2026, 12, 31, 23, 0)), H); // lintas tahun
  assert.equal(formatShiftCountdown(3 * H + 20 * 60000), '3j 20m');
  assert.equal(formatShiftCountdown(5 * 60000), '5m');
});

// ── #4 offline lanjutan ──
test('kebun tumbuh dan bor menambang (dibatasi kapasitas)', () => {
  const g: EconomyStruct = { type: 'garden_plot', x: 0, z: 0 };
  advanceProducer(g, 8, 'clear_haze', 'kering');
  assert.ok(g.growth! > 0 && g.growth! <= 100);
  const d: EconomyStruct = { type: 'auto_drill', x: 0, z: 0 };
  advanceProducer(d, 100, 'clear_haze', 'kering');
  assert.equal(d.stored, DRILL_CAP);
  const stormy: EconomyStruct = { type: 'auto_drill', x: 0, z: 0 };
  advanceProducer(stormy, 5, 'ash_storm', 'kering');
  assert.equal(stormy.stored ?? 0, 0); // bor berhenti saat badai
});
test('perlindungan: tempat berteduh melindungi bangunan di dekatnya', () => {
  const shelter: EconomyStruct = { type: 'basic_shelter', x: 0, z: 0 };
  const near: EconomyStruct = { type: 'workbench', x: 4, z: 0 };
  const far: EconomyStruct = { type: 'workbench', x: 30, z: 0 };
  const all = [shelter, near, far];
  assert.ok(isStormProtected(shelter, all) && isStormProtected(near, all) && !isStormProtected(far, all));
});
test('badai merusak bangunan tanpa pelindung lebih parah, tidak pernah menghancurkan, jangkar kebal', () => {
  const mk = (): EconomyStruct[] => [
    { type: 'basic_shelter', x: 0, z: 0, hp: 160, maxHp: 160 },
    { type: 'workbench', x: 3, z: 0, hp: 160, maxHp: 160 },
    { type: 'workbench', x: 50, z: 0, hp: 160, maxHp: 160 },
    { type: 'terrain_anchor', x: 80, z: 0, hp: 160, maxHp: 160 },
  ];
  const s = mk();
  const end = at(2026, 11, 14);
  simulateOfflineEconomy(s, end - 24 * H, end);
  assert.ok(s[2].hp! <= s[1].hp!); // tanpa pelindung ≥ rusaknya
  assert.equal(s[3].hp, 160);
  const long = mk();
  simulateOfflineEconomy(long, end - 24 * H, end);
  for (const x of long) assert.ok(x.hp! >= 160 * MIN_HP_FRACTION);
  // deterministik
  const a = mk(), b = mk();
  assert.deepEqual(simulateOfflineEconomy(a, end - 12 * H, end), simulateOfflineEconomy(b, end - 12 * H, end));
});
test('ekonomi offline dibatasi 24 jam & laporan menyebut kebun/bor', () => {
  const s: EconomyStruct[] = [{ type: 'garden_plot', x: 0, z: 0 }, { type: 'auto_drill', x: 5, z: 0 }];
  const end = at(2026, 5, 10);
  simulateOfflineEconomy(s, end - 30 * 86400000, end);
  assert.ok(s[1].stored! <= DRILL_CAP);
  const r = buildAwayReport(at(2026, 5, 9, 0), at(2026, 5, 10, 12), [{ type: 'garden_plot', x: 0, z: 0 }, { type: 'auto_drill', x: 5, z: 0 }]);
  assert.ok(r.entries.some((e) => e.text.includes('kebun siap dipanen')));
});
