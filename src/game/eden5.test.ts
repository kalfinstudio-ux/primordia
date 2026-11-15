// Kalender dunia = UTC (sama di semua zona waktu); bulan menjadi musim tanpa menggeser seed medan/kamar multiplayer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTHLY_TERRAIN_SHIFT, buildAwayReport, effectivePropSeed, effectiveTerrainSeed, getEdenCalendar,
  msUntilMonthShift, shiftWarning,
} from './data/eden';
import { roomName } from './net/multiplayerProtocol';

test('pergeseran medan bulanan mati secara bawaan (bulan = musim), dan shift=true tetap didukung jika diaktifkan', () => {
  assert.equal(MONTHLY_TERRAIN_SHIFT, false);
  const s = 'HADEAN-01';
  const nov = effectiveTerrainSeed(s, new Date('2026-11-05T00:00:00Z'));
  const dec = effectiveTerrainSeed(s, new Date('2026-12-20T00:00:00Z'));
  const next = effectiveTerrainSeed(s, new Date('2027-06-01T00:00:00Z'));
  assert.equal(nov, s);
  assert.equal(dec, s);
  assert.equal(next, s);
  assert.equal(effectiveTerrainSeed(s, new Date('2026-11-05T00:00:00Z'), true), 'HADEAN-01|Y2026|M11');
  assert.equal(effectiveTerrainSeed(s, new Date('2026-12-20T00:00:00Z'), true), 'HADEAN-01|Y2026|M12');
  assert.equal(effectiveTerrainSeed(s, new Date('2027-06-01T00:00:00Z'), true), 'HADEAN-01|Y2027|M6');
});

test('seed prop harian tetap berganti per hari UTC', () => {
  const a = effectivePropSeed('W', new Date('2026-11-05T10:00:00Z'));
  const b = effectivePropSeed('W', new Date('2026-11-06T10:00:00Z'));
  assert.notEqual(a, b);
});

test('kalender memakai UTC: pergantian hari/bulan jatuh pada 00:00 UTC, bukan jam lokal', () => {
  const lastSecond = getEdenCalendar(new Date('2026-11-30T23:59:59Z'));
  const firstSecond = getEdenCalendar(new Date('2026-12-01T00:00:00Z'));
  assert.deepEqual([lastSecond.year, lastSecond.month, lastSecond.day], [2026, 11, 30]);
  assert.deepEqual([firstSecond.year, firstSecond.month, firstSecond.day], [2026, 12, 1]);
  const nye = getEdenCalendar(new Date('2026-12-31T23:30:00Z'));
  assert.equal(nye.year, 2026);
  assert.equal(getEdenCalendar(new Date('2027-01-01T00:30:00Z')).year, 2027);
});

test('seed efektif sama untuk dua pemain di zona waktu berbeda pada instan yang sama', () => {
  const t = new Date('2026-11-30T20:00:00Z'); // 01 Des di Jakarta, 30 Nov di London/LA
  assert.equal(effectiveTerrainSeed('W', t), 'W');
  assert.equal(effectiveTerrainSeed('W', t, true), 'W|Y2026|M11');
});

test('peringatan Pergeseran Besar mati secara bawaan karena medan tidak bergeser bulanan (aktif jika enabled=true)', () => {
  const t = Date.parse('2026-11-30T23:45:00Z');
  assert.equal(shiftWarning(t).level, 'none');
  assert.equal(shiftWarning(t, true).level, 'imminent');
  assert.equal(shiftWarning(t, true).kind, 'month');
  assert.equal(msUntilMonthShift(t), 15 * 60 * 1000);
});

test('laporan "Saat kamu pergi" tidak menyebut Pergeseran Besar secara bawaan (bulan = musim), kecuali terrainShift=true', () => {
  const from = Date.parse('2026-11-30T20:00:00Z');
  const to = Date.parse('2026-12-01T08:00:00Z');
  const off = buildAwayReport(from, to, [{ type: 'storage_chest', x: 0, z: 0 }]);
  assert.equal(off.entries.some((e) => e.text.startsWith('Pergeseran Besar')), false);
  const on = buildAwayReport(from, to, [{ type: 'storage_chest', x: 0, z: 0 }], true);
  assert.equal(on.entries.some((e) => e.text.startsWith('Pergeseran Besar')), true);
});

test('nama kamar multiplayer stabil di semua bulan & tahun (bulan menjadi musim, bukan pemisah ruang)', () => {
  const nov = roomName(effectiveTerrainSeed('HADEAN-01', new Date('2026-11-05T00:00:00Z')), 0);
  const dec = roomName(effectiveTerrainSeed('HADEAN-01', new Date('2026-12-05T00:00:00Z')), 0);
  const nextYear = roomName(effectiveTerrainSeed('HADEAN-01', new Date('2027-03-05T00:00:00Z')), 0);
  assert.equal(nov, 'primordia:HADEAN-01:0');
  assert.equal(dec, 'primordia:HADEAN-01:0');
  assert.equal(nextYear, 'primordia:HADEAN-01:0');
});
