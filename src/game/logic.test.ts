import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise2D } from './world/noise';
import { CRYSTAL_CRATER, VOLCANO_MAIN, getBiomeAt } from './world/biomes';
import { computeHazardState, stepVitals } from './player/stats';
import { addItemTo, getItemCountIn, removeItemFrom } from './systems/inventory';
import { canCraftIn } from './systems/crafting';
import { RECIPES } from './config';
import { createInitialVitals } from './core/state';
import { getQuestProgressLabel, isQuestSatisfied, type QuestEvalInput } from './systems/quests';

test('deterministic noise returns identical samples for identical seeds', () => {
  const n1 = createNoise2D('HADEAN-01');
  const n2 = createNoise2D('HADEAN-01');
  const n3 = createNoise2D('ARCHEAN-99');
  assert.equal(n1.fbm(12.5, -8.3), n2.fbm(12.5, -8.3));
  assert.notEqual(n1.fbm(12.5, -8.3), n3.fbm(12.5, -8.3));
});

test('biome classifier identifies volcano ridge, crystal crater, and shallow ocean', () => {
  const ocean = getBiomeAt(20, 45, -1.5);
  assert.equal(ocean.id, 'shallow_ocean');

  const crater = getBiomeAt(CRYSTAL_CRATER.x, CRYSTAL_CRATER.z, 0.5);
  assert.equal(crater.id, 'crystal_crater');

  const lava = getBiomeAt(VOLCANO_MAIN.x, VOLCANO_MAIN.z + 10, 9.0);
  assert.equal(lava.id, 'lava_rift');

  const volcano = getBiomeAt(VOLCANO_MAIN.x + 16, VOLCANO_MAIN.z, 9.0);
  assert.equal(volcano.id, 'volcanic_ridge');
  assert.ok(volcano.toxicLevel > 0.4);
});

test('survival vitals heat up near lava and recover inside shelter', () => {
  const base = { ...createInitialVitals(), health: 80, oxygen: 70, water: 80 };
  const hotEnv = {
    ambientTempC: 66,
    toxicLevel: 0.45,
    radiationLevel: 0,
    weather: 'ash_storm' as const,
    isNight: false,
    inShelter: false,
    nearCampfire: false,
    hasHeatShield: false,
    inLava: true,
    inMeteorDanger: false,
    difficulty: 'survivor' as const,
  };
  assert.equal(computeHazardState(hotEnv), 'heat');
  const hotStep = stepVitals(base, hotEnv, 1.0);
  assert.ok(hotStep.vitals.temperature > 37);
  assert.ok(hotStep.vitals.health < 80);
  assert.ok(hotStep.vitals.oxygen < 70);

  const shelterEnv = { ...hotEnv, inLava: false, inShelter: true };
  assert.equal(computeHazardState(shelterEnv), 'sheltered');
  const safeStep = stepVitals(base, shelterEnv, 1.0);
  assert.ok(safeStep.vitals.oxygen > 70);
  assert.ok(safeStep.vitals.health > 80);
});

test('inventory stacking and crafting recipe validation work accurately', () => {
  let bag = addItemTo([], 'basalt_rock', 2);
  bag = addItemTo(bag, 'basalt_rock', 3);
  assert.equal(getItemCountIn(bag, 'basalt_rock'), 5);

  const axeRecipe = RECIPES.find((r) => r.id === 'recipe_stone_axe')!;
  assert.equal(canCraftIn(bag, axeRecipe), false);

  bag = addItemTo(bag, 'sulfur_mineral', 1);
  assert.equal(canCraftIn(bag, axeRecipe), true);

  bag = removeItemFrom(bag, 'basalt_rock', 2);
  assert.equal(getItemCountIn(bag, 'basalt_rock'), 3);
});

test('starter quest chain evaluates completion criteria correctly', () => {
  const emptySnap: QuestEvalInput = {
    waterCollectedCount: 0,
    basaltCount: 1,
    mineralCount: 0,
    obsidianCount: 0,
    meteorIronCount: 0,
    crystalsExtractedCount: 0,
    distanceExplored: 0,
    campaignComplete: false,
    hasItem: () => false,
    countItem: () => 0,
    structures: [],
  };
  assert.equal(isQuestSatisfied('q1', emptySnap), false);
  assert.equal(getQuestProgressLabel('q1', emptySnap), '0/1');

  assert.equal(isQuestSatisfied('q1', { ...emptySnap, waterCollectedCount: 1 }), true);
  assert.equal(isQuestSatisfied('q2', { ...emptySnap, basaltCount: 4, mineralCount: 2 }), true);
  assert.equal(
    isQuestSatisfied('q3', { ...emptySnap, hasItem: (id) => id === 'stone_axe' || id === 'water_vessel' }),
    true
  );
  assert.equal(
    isQuestSatisfied('q4', {
      ...emptySnap,
      structures: [{ id: 's1', type: 'basic_shelter', x: 0, y: 0, z: 0, rotY: 0, hp: 100, maxHp: 100 }],
    }),
    true
  );
  assert.equal(isQuestSatisfied('q5', { ...emptySnap, crystalsExtractedCount: 1 }), true);
});
