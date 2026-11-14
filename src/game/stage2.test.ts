import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_QUESTS, RECIPES, SAVE_VERSION } from './config';
import { SpatialHashGrid, resolveCapsuleObstacles } from './core/spatialHash';
import { createInitialVitals, type PlacedStructure } from './core/state';
import { createNoise2D } from './world/noise';
import { buildChunkGeometryData, sampleWorldHeight } from './world/terrainHeight';
import { stepVitals } from './player/stats';
import { addItemTo, computeCarryWeight, getMaxCarryWeightIn } from './systems/inventory';
import { canCraftIn } from './systems/crafting';
import { isQuestSatisfied, type QuestEvalInput } from './systems/quests';
import { detectSaveConflict, migrateSaveData } from './systems/saveLoad';

test('SpatialHashGrid and capsule solver slide player smoothly around obstacles', () => {
  const grid = new SpatialHashGrid(8);
  grid.insert({ id: 'rock_1', x: 10, z: 10, radius: 1.0, yMin: -1, yMax: 3, kind: 'rock' });
  const hits = grid.queryRadius(10.8, 10.2, 2.0);
  assert.equal(hits.length, 1);

  const solved = resolveCapsuleObstacles(10.5, 0, 10.2, 0.45, 1.75, hits);
  assert.equal(solved.collided, true);
  const distAfter = Math.hypot(solved.x - 10, solved.z - 10);
  assert.ok(distAfter >= 1.44);
});

test('4km world terrain sampling is deterministic and builds skirted LOD geometry', () => {
  const n1 = createNoise2D('HADEAN-01');
  const n2 = createNoise2D('HADEAN-01');
  for (const [x, z] of [
    [0, 18],
    [850, -620],
    [-1400, 1200],
  ]) {
    assert.equal(sampleWorldHeight(n1, x, z), sampleWorldHeight(n2, x, z));
  }

  for (const segs of [32, 16, 8]) {
    const data = buildChunkGeometryData('HADEAN-01', n1, 5, -4, 64, segs);
    const gridN = segs + 1;
    const expectedVerts = gridN * gridN + gridN * 4;
    assert.equal(data.positions.length, expectedVerts * 3);
    assert.equal(data.indices.length, (segs * segs + segs * 4) * 6);
  }
});

test('Stage 2 survival handles gas filters, radiation, thermal cloak, fatigue, and burns', () => {
  const vitals = { ...createInitialVitals(), filterDurability: 50, oxygen: 60, radiation: 10, burnTimer: 2 };
  const toxicRadEnv = {
    ambientTempC: 54,
    toxicLevel: 0.7,
    radiationLevel: 0.65,
    weather: 'ash_storm' as const,
    isNight: false,
    inShelter: false,
    nearCampfire: false,
    hasHeatShield: true,
    hasThermalCloak: true,
    hasHazmatLining: true,
    inLava: false,
    inMeteorDanger: false,
    difficulty: 'survivor' as const,
  };
  const step = stepVitals(vitals, toxicRadEnv, 2.0);
  assert.ok(step.vitals.filterDurability < 50);
  assert.ok(step.vitals.oxygen > 60); // Active gas filter protects oxygen
  assert.ok(step.vitals.radiation > 10);
  assert.ok(step.vitals.fatigue < 100);
  assert.equal(step.vitals.burnTimer, 0);
});

test('Inventory weight and 5-tier station crafting checks work across all tiers', () => {
  let bag = addItemTo([], 'basalt_rock', 5);
  assert.ok(computeCarryWeight(bag) > 0);
  assert.equal(getMaxCarryWeightIn(bag), 45);

  bag = addItemTo(bag, 'expedition_pack', 1);
  assert.equal(getMaxCarryWeightIn(bag), 80);

  const furnaceRecipe = RECIPES.find((r) => r.id === 'recipe_refined_iron')!;
  bag = addItemTo(bag, 'iron_slag', 3);
  bag = addItemTo(bag, 'sulfur_mineral', 1);
  assert.equal(canCraftIn(bag, furnaceRecipe, [], 0, 0, true), false);

  const structures: PlacedStructure[] = [
    { id: 'f1', type: 'smelter_furnace', x: 3, y: 0, z: 3, rotY: 0, hp: 160, maxHp: 160 },
  ];
  assert.equal(canCraftIn(bag, furnaceRecipe, structures, 0, 0, true), true);
});

test('All 22 campaign quests evaluate properly through Seed of Life completion', () => {
  const allItems = new Set([
    'stone_axe',
    'water_vessel',
    'obsidian_shard',
    'obsidian_pick',
    'gas_filter',
    'refined_iron',
    'thermal_cloak',
    'meteor_iron',
    'crystal_core',
    'amino_compound',
    'lipid_membrane',
    'seed_of_life',
  ]);
  const fullSnap: QuestEvalInput = {
    waterCollectedCount: 3,
    basaltCount: 10,
    mineralCount: 10,
    obsidianCount: 4,
    meteorIronCount: 4,
    crystalsExtractedCount: 3,
    distanceExplored: 1200,
    campaignComplete: true,
    hasItem: (id) => allItems.has(id),
    countItem: (id) => (allItems.has(id) ? 5 : 0),
    structures: [
      { id: 's1', type: 'basic_shelter', x: 0, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's2', type: 'workbench', x: 3, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's3', type: 'storage_chest', x: 6, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's4', type: 'smelter_furnace', x: 9, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's5', type: 'research_station', x: 12, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's6', type: 'fast_beacon', x: 15, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 'm1', type: 'floor_tile', x: 0, y: 0, z: 3, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm2', type: 'wall_panel', x: 0, y: 0, z: 6, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm3', type: 'roof_panel', x: 0, y: 0, z: 9, rotY: 0, hp: 250, maxHp: 250 },
    ],
  };

  for (const q of CAMPAIGN_QUESTS) {
    assert.equal(isQuestSatisfied(q.id, fullSnap), true, `Expected ${q.id} to be satisfied`);
  }
});

test('Save migration upgrades Stage 1 saves to v2 and detects cloud conflicts', () => {
  const v1Raw = {
    slot: 1,
    worldSeed: 'LEGACY-01',
    playtimeSec: 120,
    completedQuests: ['q1'],
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const migrated = migrateSaveData(v1Raw, 'local');
  assert.equal(migrated.saveVersion, SAVE_VERSION);
  assert.equal(migrated.vitals.radiation, 0);
  assert.equal(migrated.vitals.fatigue, 100);
  assert.ok(Array.isArray(migrated.discoveredChunks));

  const cloudNewer = migrateSaveData(
    { ...v1Raw, playtimeSec: 340, completedQuests: ['q1', 'q2'], updatedAt: '2025-01-01T00:05:00.000Z' },
    'cloud'
  );
  assert.equal(detectSaveConflict(migrated, cloudNewer), true);
});
