import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERA_START_YEAR,
  buildAwayReport,
  dailyMicroDetails,
  effectiveWaterLevel,
  getEdenCalendar,
  getImmortalAge,
  getWorldAge,
  safeRelocatePlayer,
  safeRelocateStructures,
  sanitizeBornAt,
  sanitizeClockSample,
  shiftWarning,
} from './data/eden';
import { HANDCRAFTED_POIS } from './world/biomes';
import { WORLD_HALF_EXTENT } from './config';
import { monthlyPois } from './world/poiGen';
import { journalEntriesForAge, questsForAge } from './data/quests';
import { isQuestSatisfied, questText } from './systems/quests';
import { setLanguage } from './utils/i18n';

test('Zaman tahunan (World Age) berganti tepat 1 Januari pukul 00:00 UTC', () => {
  const nyeLastSec = getWorldAge(new Date('2026-12-31T23:59:59Z'));
  const nyFirstSec = getWorldAge(new Date('2027-01-01T00:00:00Z'));
  assert.equal(nyeLastSec.eraYear, 1);
  assert.equal(nyeLastSec.id, 'age_adam_eve');
  assert.equal(nyeLastSec.unlockedChapter, 6);
  assert.equal(nyFirstSec.eraYear, 2);
  assert.equal(nyFirstSec.id, 'age_rising_tides');
  assert.equal(nyFirstSec.unlockedChapter, 7);
  assert.ok(nyFirstSec.seaLevelOffsetM > nyeLastSec.seaLevelOffsetM);
});

test('Tahun kabisat (29 Feb 2028) & peralihan DST tetap konsisten di UTC', () => {
  const leap = getEdenCalendar(new Date('2028-02-29T23:59:59Z'));
  const mar1 = getEdenCalendar(new Date('2028-03-01T00:00:00Z'));
  const leapEnd = getEdenCalendar(new Date('2028-12-31T12:00:00Z'));
  assert.deepEqual([leap.year, leap.month, leap.day, leap.dayOfYear], [2028, 2, 29, 60]);
  assert.deepEqual([mar1.year, mar1.month, mar1.day, mar1.dayOfYear], [2028, 3, 1, 61]);
  assert.equal(leapEnd.dayOfYear, 366);

  // Instan DST AS/Eropa tidak menggandakan atau melewatkan hari UTC
  const dstBefore = getEdenCalendar(new Date('2026-03-08T06:59:59Z'));
  const dstAfter = getEdenCalendar(new Date('2026-03-08T08:00:00Z'));
  assert.equal(dstBefore.day, 8);
  assert.equal(dstAfter.day, 8);
  assert.equal(dstAfter.volcanoActivity, dstBefore.volcanoActivity);
});

test('sanitizeClockSample menolak manipulasi jam mundur (> 5 detik) dan sebelum era', () => {
  const prev = Date.UTC(2026, 10, 15, 12, 0, 0);
  // Mundur 1 jam -> ditolak, tetap di prev
  assert.equal(sanitizeClockSample(prev - 3600_000, prev), prev);
  // Maju normal 10 detik -> diterima
  assert.equal(sanitizeClockSample(prev + 10_000, prev), prev + 10_000);
  // Tanggal sebelum awal era (2020) -> dikembalikan ke awal era
  assert.equal(sanitizeClockSample(Date.UTC(2020, 0, 1), 0), Date.UTC(ERA_START_YEAR, 0, 1));
});

test('detail mikro harian & tinggi muka air efektif deterministik per tanggal UTC', () => {
  const d1 = dailyMicroDetails(new Date('2026-11-15T01:00:00Z'));
  const d1Later = dailyMicroDetails(new Date('2026-11-15T23:00:00Z'));
  const d2 = dailyMicroDetails(new Date('2026-11-16T01:00:00Z'));
  assert.deepEqual(d1, d1Later);
  assert.notEqual(d1.dayKey, d2.dayKey);
  assert.notEqual(d1.ashDriftStrength, d2.ashDriftStrength);

  const wYear1 = effectiveWaterLevel(-0.5, new Date('2026-06-15T12:00:00Z'));
  const wYear2 = effectiveWaterLevel(-0.5, new Date('2027-06-15T12:00:00Z'));
  assert.ok(wYear2 !== wYear1);
});

test('monthlyPois deterministik per bulan dan berganti saat bulan berganti', () => {
  const novDate = new Date('2026-11-15T00:00:00Z');
  const decDate = new Date('2026-12-15T00:00:00Z');
  const novA = monthlyPois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT, novDate);
  const novB = monthlyPois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT, novDate);
  const dec = monthlyPois(HANDCRAFTED_POIS, WORLD_HALF_EXTENT, decDate);
  assert.deepEqual(novA, novB);
  assert.ok(novA.length >= 4);
  assert.notDeepEqual(
    novA.map((p) => [p.x, p.z]),
    dec.map((p) => [p.x, p.z])
  );
  for (const p of novA) {
    assert.ok(Math.abs(p.x) <= WORLD_HALF_EXTENT - 170);
    assert.ok(Math.abs(p.z) <= WORLD_HALF_EXTENT - 170);
    assert.ok(Math.hypot(p.x, p.z - 18) >= 220);
  }
});

test('safeRelocateStructures & safeRelocatePlayer mencegah base dan pemain terkubur atau tenggelam', () => {
  const waterLevel = 1.0;
  const slopedTerrain = (x: number, z: number) => (Math.hypot(x, z) >= 8 ? 3.5 : -2.0);
  const structs = [
    { id: 's_submerged', type: 'workbench', x: 0, y: -1.5, z: 0 },
    { id: 's_anchored', type: 'terrain_anchor', x: 20, y: 3.5, z: 0, anchorSeed: 'HADEAN-01|Y2026|M11' },
    { id: 's_buried', type: 'storage_chest', x: 12, y: 1.0, z: 0 },
  ];
  const res = safeRelocateStructures(structs, slopedTerrain, waterLevel);
  assert.ok(res.relocatedCount >= 2);
  // Bangunan yang kebanjiran harus pindah ke tanah kering
  assert.ok(slopedTerrain(structs[0].x, structs[0].z) >= waterLevel + 0.15);
  assert.equal(structs[0].y, slopedTerrain(structs[0].x, structs[0].z));
  // Jangkar di tanah kering tetap di tempat
  assert.equal(structs[1].x, 20);
  assert.equal(structs[1].y, 3.5);
  // Bangunan yang terkubur diangkat ke permukaan baru
  assert.equal(structs[2].y, 3.5);

  // Pemain terjebak di air dalam atau di bawah tanah aman dipindahkan ke tempat kering
  const pTrapped = safeRelocatePlayer({ x: 0, y: -5, z: 0 }, slopedTerrain, waterLevel);
  assert.equal(pTrapped.relocated, true);
  assert.ok(slopedTerrain(pTrapped.x, pTrapped.z) >= waterLevel + 0.25);
  assert.ok(pTrapped.y >= slopedTerrain(pTrapped.x, pTrapped.z));
});

test('peringatan pergantian tahun menandai kind="year" sebelum 1 Januari UTC', () => {
  const nyeSoon = shiftWarning(Date.UTC(2026, 11, 31, 20, 0, 0), true);
  assert.equal(nyeSoon.level, 'soon');
  assert.equal(nyeSoon.kind, 'year');
  assert.equal(nyeSoon.key, '2027-1:year:soon');

  const novSoon = shiftWarning(Date.UTC(2026, 10, 30, 20, 0, 0), true);
  assert.equal(novSoon.kind, 'month');
  assert.equal(novSoon.key, '2026-12:soon');
});

test('laporan "Saat kamu pergi" mencatat Era berubah & Pergeseran Besar saat lintas tahun UTC', () => {
  const from = Date.UTC(2026, 11, 31, 18, 0, 0);
  const to = Date.UTC(2027, 0, 1, 6, 0, 0);
  const report = buildAwayReport(from, to, [{ type: 'storage_chest', x: 0, z: 0 }]);
  assert.ok(report.entries.some((e) => e.text.includes('Era berubah') && e.text.includes('Tahun 2')));
  assert.ok(report.entries.some((e) => e.text.includes('Pergeseran Besar') && e.text.includes('Januari 2027')));
});

test('umur abadi tidak pernah direset atau dibelokkan ke masa depan/sebelum era', () => {
  const bornAt = Date.UTC(2026, 5, 1, 0, 0, 0);
  const now = Date.UTC(2026, 5, 10, 12, 0, 0);
  const age = getImmortalAge(bornAt, now);
  assert.equal(age.days, 9);
  assert.equal(age.hours, 12);
  assert.equal(sanitizeBornAt(now + 100_000, now), now);
  assert.equal(sanitizeBornAt('1990-01-01T00:00:00Z', now), now);
});

test('misi & jurnal Bab 6-7 terbuka sesuai eraYear dan teks cerita mengikuti gender tanpa beda mekanik', () => {
  const y1 = questsForAge(1);
  const y2 = questsForAge(2);
  assert.equal(y1.length, 29);
  assert.equal(y2.length, 32);
  assert.equal(y1.filter((q) => q.chapter <= 5).length, 22);
  assert.equal(y1.filter((q) => q.chapter === 6).length, 7);
  assert.equal(y2.filter((q) => q.chapter === 7).length, 3);

  const j1 = journalEntriesForAge(1);
  const j2 = journalEntriesForAge(2);
  assert.ok(j1.some((j) => j.id === 'j_adam_eve'));
  assert.ok(!j1.some((j) => j.id === 'j_moon_tides'));
  assert.ok(j2.some((j) => j.id === 'j_moon_tides'));

  for (const lang of ['id', 'en'] as const) {
    setLanguage(lang);
    const maleDesc = questText('q23', 'desc', 'male');
    const femaleDesc = questText('q23', 'desc', 'female');
    assert.ok(maleDesc.length > 10 && femaleDesc.length > 10);
    assert.notEqual(maleDesc, femaleDesc);
  }
  setLanguage('id');

  const baseSnap = {
    waterCollectedCount: 1,
    basaltCount: 4,
    mineralCount: 2,
    obsidianCount: 2,
    meteorIronCount: 2,
    crystalsExtractedCount: 1,
    distanceExplored: 1300,
    discoveredPoiCount: 6,
    campaignComplete: true,
    hasItem: () => true,
    countItem: () => 5,
    structures: [
      { id: '1', type: 'campfire_kit' as const, x: 0, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
      { id: '2', type: 'campfire_kit' as const, x: 2, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
      { id: '3', type: 'basic_shelter' as const, x: 4, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
      { id: '4', type: 'basic_shelter' as const, x: 6, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
    ],
  };
  assert.equal(isQuestSatisfied('q23', baseSnap), true);
});

