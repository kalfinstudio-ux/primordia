import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, ERA_TERRAIN_DELTA } from './data/balance';
import { MONTHLY_TERRAIN_SHIFT, effectiveTerrainSeed, getEdenCalendar } from './data/eden';
import {
  collectPlayerFootprints,
  combinedWorldVisuals,
  eraVisuals,
  footprintSuppressionWeight,
  sampleEraHeightDelta,
  sampleEraLayer,
  seasonVisuals,
} from './data/worldEvolution';
import { roomName } from './net/multiplayerProtocol';
import { getBiomeAt } from './world/biomes';
import { createNoise2D } from './world/noise';
import { buildChunkGeometryData, sampleHeightAnchored, sampleTerrainColor, sampleWorldHeight } from './world/terrainHeight';

test('Sakelar peta berevolusi berada di posisi aman: ERA_TERRAIN_DELTA=false & MONTHLY_TERRAIN_SHIFT=false', () => {
  assert.equal(ERA_TERRAIN_DELTA, false);
  assert.equal(BALANCE.eraEvolution.eraTerrainDelta, false);
  assert.equal(MONTHLY_TERRAIN_SHIFT, false);
});

test('Lapisan era adalah fungsi murni deterministik dari (seed, era, x, z)', () => {
  const pts: Array<[number, number]> = [
    [0, 18],
    [125, -440],
    [-810, 620],
    [1500, 1500],
  ];
  for (const [x, z] of pts) {
    assert.equal(sampleEraLayer('HADEAN-01', 2, x, z), sampleEraLayer('HADEAN-01', 2, x, z));
    assert.equal(
      sampleEraHeightDelta('HADEAN-01', 2, x, z, [], true),
      sampleEraHeightDelta('HADEAN-01', 2, x, z, [], true)
    );
  }
});

test('Era berbeda menghasilkan lapisan dan profil visual yang berbeda; seed berbeda juga berbeda', () => {
  const pts: Array<[number, number]> = [
    [120, 80],
    [-310, 240],
    [600, -450],
  ];
  let eraDiffCount = 0;
  let seedDiffCount = 0;
  for (const [x, z] of pts) {
    if (sampleEraLayer('HADEAN-01', 1, x, z) !== sampleEraLayer('HADEAN-01', 2, x, z)) eraDiffCount++;
    if (sampleEraLayer('HADEAN-01', 2, x, z) !== sampleEraLayer('HADEAN-01', 3, x, z)) eraDiffCount++;
    if (sampleEraLayer('HADEAN-01', 2, x, z) !== sampleEraLayer('OTHER-SEED', 2, x, z)) seedDiffCount++;
  }
  assert.ok(eraDiffCount >= 4);
  assert.ok(seedDiffCount >= 2);

  // Langkah 1 visual & prop berbeda antar era
  assert.equal(eraVisuals(1).vegClustersPerChunk, 0);
  assert.ok(eraVisuals(2).vegClustersPerChunk > 0);
  assert.ok(eraVisuals(4).vegClustersPerChunk > eraVisuals(2).vegClustersPerChunk);
  assert.notDeepEqual(eraVisuals(1).groundTintMult, eraVisuals(2).groundTintMult);
  assert.notDeepEqual(eraVisuals(2).groundTintMult, eraVisuals(3).groundTintMult);
  assert.notEqual(eraVisuals(1).exposureMult, eraVisuals(3).exposureMult);
});

test('Jejak struktur, beacon, dan base menolkan delta tinggi era hingga TEPAT 0 dalam radius 40 m', () => {
  const protectR = BALANCE.eraEvolution.structureProtectRadiusM;
  assert.equal(protectR, 40);

  const structs = [
    { type: 'basic_shelter', x: 180, z: -220 },
    { type: 'fast_beacon', x: -410, z: 95 },
    { type: 'terrain_anchor', x: 640, z: 510 },
  ];
  const footprints = collectPlayerFootprints(structs, [{ x: 920, z: -610 }]);
  assert.equal(footprints.length, 4);

  // Tepat di pusat dan tepat di tepi radius 40 m -> TEPAT 0
  for (const fp of footprints) {
    for (const [dx, dz] of [
      [0, 0],
      [12, -18],
      [protectR, 0],
      [0, -protectR],
      [protectR * 0.7, protectR * 0.7], // ~39.6 m <= 40 m
    ]) {
      const x = fp.x + dx;
      const z = fp.z + dz;
      assert.equal(footprintSuppressionWeight(x, z, footprints), 0);
      assert.equal(sampleEraHeightDelta('HADEAN-01', 2, x, z, footprints, true), 0);
      assert.equal(sampleEraHeightDelta('HADEAN-01', 3, x, z, footprints, true), 0);
    }
  }

  // Di luar radius perlindungan + lebar transisi -> penuh & halus (tanpa lompatan tajam)
  const farX = 180 + protectR + BALANCE.eraEvolution.structureFadeWidthM + 10;
  const farZ = -220;
  assert.equal(footprintSuppressionWeight(farX, farZ, footprints), 1);
  const farDelta = sampleEraHeightDelta('HADEAN-01', 2, farX, farZ, footprints, true);
  assert.ok(Math.abs(farDelta) <= BALANCE.eraEvolution.maxHeightDeltaM + 1e-9);
  assert.ok(Math.abs(farDelta) > 0);

  // Periksa kehalusan transisi 35 m .. 75 m
  let prev = sampleEraHeightDelta('HADEAN-01', 2, 180 + 35, -220, footprints, true);
  for (let d = 36; d <= 75; d++) {
    const cur = sampleEraHeightDelta('HADEAN-01', 2, 180 + d, -220, footprints, true);
    assert.ok(Math.abs(cur - prev) < 0.15, `Delta melonjak di d=${d}: ${prev} -> ${cur}`);
    prev = cur;
  }
});

test('Saat ERA_TERRAIN_DELTA = false, tinggi & normal medan SAMA PERSIS dengan medan lama di semua era', () => {
  const noise = createNoise2D('HADEAN-01');
  const seed = 'HADEAN-01';
  const legacyChunk = buildChunkGeometryData(seed, noise, 2, -3, 64, 16, []);

  for (const eraYear of [1, 2, 3, 4]) {
    const evoChunk = buildChunkGeometryData(seed, noise, 2, -3, 64, 16, [], {
      eraYear,
      season: 'hujan',
      eraTerrainDelta: false,
      footprints: [],
    });

    // Tinggi vertex Y dan normal 100% identik bit-per-bit
    for (let i = 0; i < legacyChunk.positions.length; i++) {
      assert.equal(evoChunk.positions[i], legacyChunk.positions[i], `positions[${i}] berubah pada era ${eraYear}`);
      assert.equal(evoChunk.normals[i], legacyChunk.normals[i], `normals[${i}] berubah pada era ${eraYear}`);
    }
    assert.deepEqual(evoChunk.indices, legacyChunk.indices);

    // sampleHeightAnchored default (tanpa delta) identik dengan sampleWorldHeight
    for (const [x, z] of [
      [0, 18],
      [250, -180],
      [-740, 512],
    ]) {
      assert.equal(
        sampleHeightAnchored(noise, [], x, z, { seed, eraYear, enabled: false }),
        sampleWorldHeight(noise, x, z)
      );
    }
  }

  // Pada Era 2+, tint tanah (colors) berubah sebagai Langkah 1 visual tanpa mengubah posisi medan
  const era2Chunk = buildChunkGeometryData(seed, noise, 2, -3, 64, 16, [], {
    eraYear: 2,
    season: 'kering',
    eraTerrainDelta: false,
  });
  let colorChanged = false;
  for (let i = 0; i < legacyChunk.colors.length; i++) {
    if (era2Chunk.colors[i] !== legacyChunk.colors[i]) {
      colorChanged = true;
      break;
    }
  }
  assert.equal(colorChanged, true);

  // Warna tetap valid [0..1]
  const c = sampleTerrainColor(noise, 240, -160, 4, 0.1, { seed, eraYear: 3, season: 'dingin' });
  for (const ch of c) assert.ok(ch >= 0 && ch <= 1 && Number.isFinite(ch));
});

test('Bulan menjadi musim (cuaca/langit/warna), kamar multiplayer tetap sama, bioma bebas dari seed pemain', () => {
  const jan = new Date('2026-01-15T12:00:00Z'); // kering
  const may = new Date('2026-05-15T12:00:00Z'); // hujan
  const aug = new Date('2026-08-15T12:00:00Z'); // abu
  const nov = new Date('2026-11-15T12:00:00Z'); // dingin

  const sJan = getEdenCalendar(jan).season;
  const sMay = getEdenCalendar(may).season;
  const sAug = getEdenCalendar(aug).season;
  const sNov = getEdenCalendar(nov).season;
  assert.deepEqual([sJan, sMay, sAug, sNov], ['kering', 'hujan', 'abu', 'dingin']);

  // Seed medan & nama kamar multiplayer sama persis untuk semua bulan & tahun
  const roomA = roomName(effectiveTerrainSeed('ROOM-77', jan), 0);
  const roomB = roomName(effectiveTerrainSeed('ROOM-77', may), 0);
  const roomNextEra = roomName(effectiveTerrainSeed('ROOM-77', new Date('2027-05-15T12:00:00Z')), 0);
  assert.equal(roomA, roomB);
  assert.equal(roomA, roomNextEra);

  // Musim memengaruhi profil langit/kabut/warna
  assert.notEqual(seasonVisuals('kering').skyTintHex, seasonVisuals('hujan').skyTintHex);
  assert.ok(seasonVisuals('abu').fogDensityMult > seasonVisuals('kering').fogDensityMult);
  assert.notDeepEqual(combinedWorldVisuals(1, 'kering'), combinedWorldVisuals(1, 'dingin'));

  // Bioma tidak bergantung pada seed pemain
  assert.deepEqual(getBiomeAt(350, -280, 3.2), getBiomeAt(350, -280, 3.2));
});
