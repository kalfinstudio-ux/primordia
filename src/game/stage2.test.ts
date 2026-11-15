import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_QUESTS, RECIPES, SAVE_VERSION } from './config';
import { questsForAge } from './data/quests';
import { SpatialHashGrid, resolveCapsuleObstacles } from './core/spatialHash';
import { createInitialVitals, type PlacedStructure } from './core/state';
import { createNoise2D } from './world/noise';
import { buildChunkGeometryData, sampleWorldHeight } from './world/terrainHeight';
import { stepVitals } from './player/stats';
import { addItemTo, computeCarryWeight, getMaxCarryWeightIn } from './systems/inventory';
import { canCraftIn } from './systems/crafting';
import { isQuestSatisfied, type QuestEvalInput } from './systems/quests';
import { decideContinue, detectSaveConflict, getLocalSave, migrateLegacySlots, migrateSaveData, resolveLegacyChoice, saveGame } from './systems/saveLoad';
import { gameState } from './core/state';

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

test('All campaign quests (Archean Dawn + Adam & Eve + later eras) evaluate properly', () => {
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
    'hazmat_lining',
    'meteor_drill',
  ]);
  const fullSnap: QuestEvalInput = {
    waterCollectedCount: 3,
    basaltCount: 10,
    mineralCount: 10,
    obsidianCount: 4,
    meteorIronCount: 4,
    crystalsExtractedCount: 3,
    distanceExplored: 2200,
    discoveredPoiCount: 8,
    campaignComplete: true,
    hasItem: (id) => allItems.has(id),
    countItem: (id) => (allItems.has(id) ? 5 : 0),
    structures: [
      { id: 's1', type: 'basic_shelter', x: 0, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's1b', type: 'basic_shelter', x: 25, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 'f1', type: 'campfire_kit', x: 2, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
      { id: 'f2', type: 'campfire_kit', x: 27, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 },
      { id: 's2', type: 'workbench', x: 3, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's3', type: 'storage_chest', x: 6, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's4', type: 'smelter_furnace', x: 9, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's5', type: 'research_station', x: 12, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's6', type: 'fast_beacon', x: 15, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's7', type: 'fast_beacon', x: 35, y: 0, z: 0, rotY: 0, hp: 160, maxHp: 160 },
      { id: 's8', type: 'garden_plot', x: 18, y: 0, z: 0, rotY: 0, hp: 120, maxHp: 120 },
      { id: 's9', type: 'water_collector', x: 21, y: 0, z: 0, rotY: 0, hp: 120, maxHp: 120 },
      { id: 's10', type: 'auto_drill', x: 24, y: 0, z: 0, rotY: 0, hp: 140, maxHp: 140 },
      { id: 's11', type: 'terrain_anchor', x: 30, y: 0, z: 0, rotY: 0, hp: 200, maxHp: 200 },
      { id: 's12', type: 'terrain_anchor', x: 90, y: 0, z: 0, rotY: 0, hp: 200, maxHp: 200 },
      { id: 'm1', type: 'floor_tile', x: 0, y: 0, z: 3, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm2', type: 'wall_panel', x: 0, y: 0, z: 6, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm3', type: 'roof_panel', x: 0, y: 0, z: 9, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm4', type: 'floor_tile', x: 3, y: 0, z: 3, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm5', type: 'wall_panel', x: 3, y: 0, z: 6, rotY: 0, hp: 250, maxHp: 250 },
      { id: 'm6', type: 'door_frame', x: 3, y: 0, z: 9, rotY: 0, hp: 250, maxHp: 250 },
    ],
  };

  for (const q of CAMPAIGN_QUESTS) {
    assert.equal(isQuestSatisfied(q.id, fullSnap), true, `Expected ${q.id} to be satisfied`);
  }
  assert.equal(questsForAge(1).length, 29);
  assert.equal(questsForAge(2).length, 32);
});

test('Save migration upgrades Stage 1 saves to v2 and detects cloud conflicts', () => {
  const v1Raw = {
    slot: 1, // campuran: save lama masih membawa field slot, harus diabaikan
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

// ── Simpanan tunggal (pengganti Slot 1/2/3) ─────────────────────────────
function installFakeStorage(): Map<string, string> {
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    },
  };
  return mem;
}

const legacySlot = (seed: string, playtimeSec: number, updatedAt: string) => ({
  worldSeed: seed,
  playtimeSec,
  completedQuests: [],
  updatedAt,
});

test('migrasi: satu slot lama dipindah diam-diam ke simpanan tunggal, kunci lama dihapus', () => {
  const mem = installFakeStorage();
  mem.set('primordia_save_slots', JSON.stringify({ '1': legacySlot('A-1', 600, '2026-01-01T00:00:00.000Z') }));
  mem.set('primordia_last_slot', '1');
  assert.deepEqual(migrateLegacySlots(), []);
  assert.equal(getLocalSave()?.worldSeed, 'A-1');
  assert.equal(getLocalSave()?.playtimeSec, 600);
  assert.equal(mem.has('primordia_save_slots'), false);
  assert.equal(mem.has('primordia_last_slot'), false);
  assert.deepEqual(migrateLegacySlots(), []); // idempoten
  assert.equal(getLocalSave()?.worldSeed, 'A-1');
});

test('migrasi: slot 2/3 berbeda tidak dibuang diam-diam; dipilih pemain, baru sisanya dihapus', () => {
  const mem = installFakeStorage();
  mem.set(
    'primordia_save_slots',
    JSON.stringify({
      '1': legacySlot('A-1', 600, '2026-01-01T00:00:00.000Z'),
      '2': legacySlot('B-2', 9000, '2026-03-01T00:00:00.000Z'),
      '3': legacySlot('C-3', 100, '2026-02-01T00:00:00.000Z'),
    })
  );
  const choices = migrateLegacySlots();
  assert.deepEqual(choices.map((c) => c.worldSeed), ['B-2', 'C-3', 'A-1']); // terbaru dulu
  // belum dipilih: semua data lama masih utuh
  assert.equal(mem.has('primordia_save_slots'), true);
  assert.equal(getLocalSave(), null);
  assert.equal(migrateLegacySlots().length, 3); // tetap menawarkan pilihan di sesi berikutnya

  assert.equal(resolveLegacyChoice(choices[2]), true);
  assert.equal(getLocalSave()?.worldSeed, 'A-1');
  assert.equal(mem.has('primordia_save_slots'), false);
  assert.deepEqual(migrateLegacySlots(), []);
});

test('migrasi: entri slot rusak diabaikan, simpanan baru yang sama tidak diduplikasi', () => {
  const mem = installFakeStorage();
  mem.set('primordia_save_slots', JSON.stringify({ '1': null, '2': 'x', '3': legacySlot('D-4', 5, '2026-01-01T00:00:00.000Z') }));
  assert.deepEqual(migrateLegacySlots(), []);
  assert.equal(getLocalSave()?.worldSeed, 'D-4');

  mem.set('primordia_save_slots', JSON.stringify({ '1': getLocalSave() }));
  assert.deepEqual(migrateLegacySlots(), []); // salinan identik bukan "dua pilihan"
  assert.equal(mem.has('primordia_save_slots'), false);
});

test('saveGame tidak menimpa simpanan nyata bila tidak ada dunia aktif (mis. dari menu utama)', () => {
  const mem = installFakeStorage();
  mem.set('primordia_save', JSON.stringify(legacySlot('REAL-1', 777, '2026-01-01T00:00:00.000Z')));
  gameState.activeWorldLoaded = false;
  assert.equal(saveGame(false), null);
  assert.equal(getLocalSave()?.playtimeSec, 777);

  gameState.activeWorldLoaded = true;
  gameState.playtimeSec = 888;
  const saved = saveGame(false);
  assert.equal(saved?.playtimeSec, 888);
  assert.equal(getLocalSave()?.playtimeSec, 888);
  assert.equal('slot' in (saved as object), false);
  gameState.activeWorldLoaded = false;
});

test('decideContinue: lokal saja, cloud saja, konflik, dan tanpa simpanan', () => {
  const base = { worldSeed: 'S', playtimeSec: 100, completedQuests: ['q1'], updatedAt: '2026-01-01T00:00:00.000Z' };
  const local = migrateSaveData(base, 'local');
  const cloudSame = migrateSaveData(base, 'cloud');
  const cloudAhead = migrateSaveData({ ...base, playtimeSec: 900, updatedAt: '2026-01-02T00:00:00.000Z' }, 'cloud');

  assert.equal(decideContinue(null, null).kind, 'none');
  assert.equal(decideContinue(local, null).kind, 'load');
  const cloudOnly = decideContinue(null, cloudAhead);
  assert.equal(cloudOnly.kind === 'load' && cloudOnly.save.playtimeSec, 900);
  const same = decideContinue(local, cloudSame);
  assert.equal(same.kind === 'load' && same.save.source, 'local');
  assert.equal(decideContinue(local, cloudAhead).kind, 'conflict');
});
