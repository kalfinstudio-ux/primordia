import test from 'node:test';
import assert from 'node:assert/strict';
import { WATER_LEVEL } from './config';
import { BALANCE } from './data/balance';
import {
  FAUNA_SPECIES,
  FaunaSpatialGrid,
  faunaRateBucket,
  faunaUpdateInterval,
  generateChunkFauna,
  hashFaunaBorder,
  isFaunaKilled,
  isTerrainSuitableForSpawn,
  pickSpeciesForSite,
  pruneExpiredFaunaKills,
  recordFaunaKill,
  sanitizeKilledFauna,
  stepFaunaActor,
  type BoidObstacle,
  type BoidStepStats,
  type FaunaActor,
} from './data/fauna';
import { createNoise2D } from './world/noise';
import { sampleWorldHeight } from './world/terrainHeight';
import { migrateSaveData } from './systems/saveLoad';

const worldNoise = createNoise2D('HADEAN-01');
const worldHeight = (x: number, z: number) => sampleWorldHeight(worldNoise, x, z);

test('fauna: same chunk, seed, and era produce identical creature list across runs and symmetric border seed', () => {
  const params = {
    seed: 'FAUNA-SEED-1',
    chunkX: 2,
    chunkZ: -1,
    era: 1,
    playerX: 500,
    playerZ: 500,
    playtimeSec: 120,
    groundHeightAt: () => 2.2,
  };
  const run1 = generateChunkFauna(params);
  const run2 = generateChunkFauna(params);
  assert.deepEqual(run1, run2);
  assert.ok(run1.length > 0, 'flat dry chunk should spawn deterministic fauna');

  // Symmetric border hash regardless of chunk ordering (direction player arrives from)
  assert.equal(hashFaunaBorder('S1', 1, 2, 3, 3, 3), hashFaunaBorder('S1', 1, 3, 3, 2, 3));
  assert.equal(hashFaunaBorder('S1', 2, -4, 7, -4, 8), hashFaunaBorder('S1', 2, -4, 8, -4, 7));
});

test('fauna: different era produces a different creature list', () => {
  const listEra1 = generateChunkFauna({
    seed: 'FAUNA-ERA',
    chunkX: 3,
    chunkZ: 2,
    era: 1,
    playerX: -800,
    playerZ: -800,
    playtimeSec: 0,
    groundHeightAt: () => 2.5,
  });
  const listEra2 = generateChunkFauna({
    seed: 'FAUNA-ERA',
    chunkX: 3,
    chunkZ: 2,
    era: 2,
    playerX: -800,
    playerZ: -800,
    playtimeSec: 0,
    groundHeightAt: () => 2.5,
  });
  assert.notDeepEqual(
    listEra1.map((c) => c.id),
    listEra2.map((c) => c.id)
  );
});

test('fauna: 15 m minimum spawn distance from player and population cap (+25% overshoot) enforced', () => {
  const cap = BALANCE.fauna.chunkPopCap;
  const maxAllowed = Math.floor(cap * (1 + BALANCE.fauna.capOvershootPct));

  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const list = generateChunkFauna({
        seed: 'CAP-CHECK',
        chunkX: cx,
        chunkZ: cz,
        era: 1,
        playerX: 0,
        playerZ: 18,
        playtimeSec: 100,
        groundHeightAt: worldHeight,
      });
      assert.ok(list.length <= maxAllowed, `chunk (${cx},${cz}) exceeded cap+25%: ${list.length} > ${maxAllowed}`);
      for (const c of list) {
        const d = Math.hypot(c.x - 0, c.z - 18);
        assert.ok(d >= BALANCE.fauna.minSpawnDistM - 1e-6, `spawned too close to player: ${d}m`);
      }
    }
  }
});

test('fauna: rejects cliffs/pits, enforces aquatic-only in water, and selects species by biome + danger tier', () => {
  // Steep cliff check
  const cliffCheck = isTerrainSuitableForSpawn(10, 10, (x) => (x > 10.5 ? 12 : 0));
  assert.equal(cliffCheck.ok, false);

  // Deep pit check
  const pitCheck = isTerrainSuitableForSpawn(0, 0, (x, z) => (Math.hypot(x, z) < 0.8 ? -4.5 : 1.0));
  assert.equal(pitCheck.ok, false);

  // Calm species near spawn (tier 0) on dry basalt plains; never aggressive predators at tier 0
  for (let r = 0; r < 1; r += 0.1) {
    const sp = pickSpeciesForSite('black_basalt_plains', 0, 2.0, WATER_LEVEL, 40, r);
    assert.ok(sp !== null);
    assert.equal(sp.temperament, 'calm');
  }

  // Water site allows aquatic hydro_skimmer, never terrestrial grazers
  const waterSp = pickSpeciesForSite('shallow_ocean', 0, WATER_LEVEL - 0.5, WATER_LEVEL, 40, 0.5);
  assert.ok(waterSp && waterSp.habitat === 'aquatic');

  // Inside lava (< 2m from lava) rejects all species including magma_crawler
  assert.equal(pickSpeciesForSite('lava_rift', 4, 2.0, WATER_LEVEL, 1.2, 0.5), null);
  // Calm terrestrial species cannot spawn in sulfur_flats hazard biome
  assert.equal(pickSpeciesForSite('sulfur_flats', 0, 2.0, WATER_LEVEL, 30, 0.5), null);
  // Higher danger tier unlocks aggressive predators farther out
  const farVolcanic = pickSpeciesForSite('volcanic_ridge', 4, 5.0, WATER_LEVEL, 12, 0.5);
  assert.ok(farVolcanic && farVolcanic.temperament === 'aggressive');
});

test('fauna: activation slows with distance without freezing visible creatures inside loaded range', () => {
  const loadedMax = 160;
  assert.equal(faunaRateBucket(25, true, loadedMax), 'full');
  assert.equal(faunaRateBucket(65, true, loadedMax), 'medium');
  assert.equal(faunaRateBucket(135, true, loadedMax), 'coarse');
  // Distant visible animal at 200 m is still updated slowly (not frozen)
  assert.equal(faunaRateBucket(200, true, loadedMax), 'distant');
  assert.ok(Number.isFinite(faunaUpdateInterval(200, true, loadedMax, false)));
  // Only paused when out of view AND beyond loaded chunks
  assert.equal(faunaRateBucket(210, false, loadedMax), 'paused');
  assert.equal(faunaUpdateInterval(210, false, loadedMax, false), Infinity);
});

test('fauna: boids respects neighbor cap (6-8), computes valid velocities, and avoids obstacles strongly', () => {
  const count = 24;
  const actors: FaunaActor[] = [];
  for (let i = 0; i < count; i++) {
    actors.push({
      active: true,
      id: `b_${i}`,
      speciesId: 'ash_hopper',
      herdId: 'herd_test',
      chunkKey: '0,0',
      x: 40 + (i % 5) * 1.2,
      y: 2,
      z: 40 + Math.floor(i / 5) * 1.2,
      vx: 1.2,
      vz: 0.4,
      yaw: 0,
      scale: 0.72,
      tintIndex: 0,
      homeX: 42,
      homeZ: 42,
      phase: i * 0.3,
      stepAccum: 0,
      lastBucket: 'full',
    });
  }

  const grid = new FaunaSpatialGrid(count, 12);
  grid.rebuild(actors, count);

  const obstacles: BoidObstacle[] = [{ x: actors[0].x + 0.9, z: actors[0].z, radius: 1.0 }];
  const stats: BoidStepStats = { neighborsUsed: 0, avoidedObstacles: 0 };

  stepFaunaActor(
    0,
    actors,
    count,
    grid,
    0.1,
    obstacles,
    obstacles.length,
    500,
    500,
    () => 2.0,
    WATER_LEVEL,
    stats
  );

  assert.ok(
    stats.neighborsUsed > 0 && stats.neighborsUsed <= BALANCE.fauna.boidMaxNeighbors,
    `expected neighbor count in 1..${BALANCE.fauna.boidMaxNeighbors}, got ${stats.neighborsUsed}`
  );
  assert.ok(stats.avoidedObstacles >= 1, 'expected high-weight obstacle avoidance to trigger');
  assert.ok(actors[0].vx < 1.2, 'obstacle ahead on +X should push boid velocity toward -X');
  assert.ok(Number.isFinite(actors[0].x) && Number.isFinite(actors[0].z) && Number.isFinite(actors[0].yaw));
});

test('fauna: kill persistence prevents instant respawn on reload, expires after respawnDelaySec, and survives save migration', () => {
  const seed = 'KILL-TEST';
  const baseParams = {
    seed,
    chunkX: 2,
    chunkZ: 2,
    era: 1,
    playerX: 500,
    playerZ: 500,
    playtimeSec: 100,
    groundHeightAt: () => 2.0,
  };

  const initial = generateChunkFauna(baseParams);
  assert.ok(initial.length >= 1);
  const victim = initial[0];

  const killedMap: Record<string, Record<string, number>> = {};
  recordFaunaKill(killedMap, victim.chunkKey, victim.id, 100);
  assert.equal(isFaunaKilled(killedMap, victim.chunkKey, victim.id, 200), true);

  // Reloading chunk shortly after (t=200s < 100 + respawnDelaySec) suppresses victim
  const reloadedSoon = generateChunkFauna({ ...baseParams, playtimeSec: 200, killedFauna: killedMap });
  assert.equal(
    reloadedSoon.some((c) => c.id === victim.id),
    false,
    'killed creature must not respawn immediately on chunk reload'
  );

  // Save migration preserves valid killedFauna and sanitizes corrupt/legacy saves
  const migrated = migrateSaveData(
    {
      worldSeed: seed,
      killedFauna: killedMap,
    },
    'local'
  );
  assert.deepEqual(migrated.killedFauna, killedMap);

  const legacyMigrated = migrateSaveData({ worldSeed: seed }, 'local');
  assert.deepEqual(legacyMigrated.killedFauna, {});
  assert.deepEqual(sanitizeKilledFauna({ '2,2': { bad: -5, valid: 50 } }), { '2,2': { valid: 50 } });

  // After respawnDelaySec has elapsed, kill expires and creature can spawn again
  const afterDelay = 100 + BALANCE.fauna.respawnDelaySec + 5;
  const pruned = pruneExpiredFaunaKills(killedMap, afterDelay);
  assert.equal(pruned, 1);
  const reloadedLater = generateChunkFauna({ ...baseParams, playtimeSec: afterDelay, killedFauna: killedMap });
  assert.equal(
    reloadedLater.some((c) => c.id === victim.id),
    true,
    'creature should be eligible to respawn once respawnDelaySec passes'
  );
});
