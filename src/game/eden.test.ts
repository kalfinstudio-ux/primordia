import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePropSeed, effectiveTerrainSeed, getEdenCalendar, getImmortalAge,
  randomPrimordialName, realTimeOfDay, sanitizeBornAt, mulberry,
} from './data/eden';

test('kalender deterministik dan berubah per hari', () => {
  const a = getEdenCalendar(new Date(Date.UTC(2026, 10, 14)));
  const b = getEdenCalendar(new Date(Date.UTC(2026, 10, 14)));
  const c = getEdenCalendar(new Date(Date.UTC(2026, 10, 15)));
  assert.deepEqual(a, b);
  assert.notEqual(a.volcanoActivity + a.tideOffset, c.volcanoActivity + c.tideOffset);
  assert.equal(a.eraYear, 1);
  assert.equal(getEdenCalendar(new Date(Date.UTC(2028, 0, 1))).eraYear, 3);
});

test('seed medan berubah per bulan, props per hari', () => {
  const s = 'HADEAN-01';
  assert.equal(effectiveTerrainSeed(s, new Date(Date.UTC(2026, 10, 1)), true), effectiveTerrainSeed(s, new Date(Date.UTC(2026, 10, 28)), true));
  assert.notEqual(effectiveTerrainSeed(s, new Date(Date.UTC(2026, 10, 1)), true), effectiveTerrainSeed(s, new Date(Date.UTC(2026, 11, 1)), true));
  assert.notEqual(effectiveTerrainSeed(s, new Date(Date.UTC(2026, 10, 1)), true), effectiveTerrainSeed(s, new Date(Date.UTC(2027, 10, 1)), true));
  assert.notEqual(effectivePropSeed(s, new Date(Date.UTC(2026, 10, 1)), true), effectivePropSeed(s, new Date(Date.UTC(2026, 10, 2)), true));
});

test('jam nyata → fraksi hari', () => {
  assert.equal(realTimeOfDay(new Date(2026, 0, 1, 0, 0, 0)), 0);
  assert.equal(realTimeOfDay(new Date(2026, 0, 1, 12, 0, 0)), 0.5);
});

test('umur abadi terus naik dan tidak negatif', () => {
  const born = Date.UTC(2026, 0, 1);
  assert.equal(getImmortalAge(born, born - 5000).totalSeconds, 0);
  const age = getImmortalAge(born, born + 400 * 86400 * 1000);
  assert.equal(age.years, 1);
  assert.ok(age.days >= 30);
});

test('bornAt tidak bisa dipalsukan ke masa depan / sebelum era', () => {
  const now = Date.UTC(2026, 10, 14);
  assert.equal(sanitizeBornAt(now + 1e9, now), now);
  assert.equal(sanitizeBornAt(0, now), now);
  assert.equal(sanitizeBornAt(Date.UTC(2026, 5, 1), now), Date.UTC(2026, 5, 1));
});

test('nama acak valid', () => {
  const n = randomPrimordialName(mulberry(7));
  assert.ok(n.length >= 3);
});
