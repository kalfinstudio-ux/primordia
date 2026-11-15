import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_LOWPASS_HZ,
  SHELTER_LOWPASS_HZ,
  SPATIAL_SOURCE_SPECS,
  UNDERWATER_LOWPASS_HZ,
  brukTrustGain,
  classifyFootstepSpeed,
  computeDuckingGain,
  computeEnvFilterTarget,
  computeSpatialAttenuation,
  nextAudioSeed,
  pickFootstepVariation,
  selectActiveSpatialSources,
  selectMusicMode,
  selectRainLayers,
} from './data/audioMath';
import { thunderDelaySec } from './data/weather';

test('computeSpatialAttenuation respects per-type maxDistance, rolloff, and bounds', () => {
  assert.equal(computeSpatialAttenuation(-5, 'lava', 1), 0);
  assert.equal(computeSpatialAttenuation(Number.NaN, 'campfire', 1), 0);
  assert.equal(computeSpatialAttenuation(SPATIAL_SOURCE_SPECS.campfire.maxDistance, 'campfire', 1), 0);
  assert.equal(computeSpatialAttenuation(SPATIAL_SOURCE_SPECS.campfire.maxDistance + 10, 'campfire', 1), 0);

  const near = computeSpatialAttenuation(1, 'lava', 1);
  const mid = computeSpatialAttenuation(18, 'lava', 1);
  const far = computeSpatialAttenuation(40, 'lava', 1);
  assert.equal(near, 1);
  assert.ok(near > mid && mid > far && far > 0);

  // Respects spatialEnvMix slider
  assert.equal(computeSpatialAttenuation(2, 'bruk', 0), 0);
  assert.ok(Math.abs(computeSpatialAttenuation(2, 'bruk', 0.5) - 0.5) < 1e-9);
});

test('selectActiveSpatialSources caps active ambient sources <= 4 on low preset and drops out-of-range', () => {
  const candidates = [
    { kind: 'lava' as const, x: 0, y: 0, z: -20, distance: 20 },
    { kind: 'geyser' as const, x: -90, y: 0, z: -60, distance: 90 }, // out of range (max 36)
    { kind: 'water' as const, x: 10, y: 0, z: 10, distance: 10 },
    { kind: 'campfire' as const, x: 2, y: 0, z: 2, distance: 3 },
    { kind: 'bruk' as const, x: 6, y: 0, z: -4, distance: 7 },
  ];

  // Low preset: max 4 total ambient sources, 2 global (wind + rain) -> max 2 spatial slots
  const lowSelected = selectActiveSpatialSources(candidates, 4, 2, 1.0);
  assert.equal(lowSelected.length, 2);
  assert.ok(lowSelected.every((s) => s.kind !== 'geyser'));

  // High preset: up to 3 spatial slots (when maxTotal=5, global=2)
  const highSelected = selectActiveSpatialSources(candidates, 5, 2, 1.0);
  assert.equal(highSelected.length, 3);
  assert.equal(highSelected[0].kind, 'campfire'); // nearest/strongest gain first
});

test('thunderDelaySec scales linearly with distance at 120 m/s', () => {
  assert.equal(thunderDelaySec(0), 0);
  assert.equal(thunderDelaySec(60), 0.5);
  assert.equal(thunderDelaySec(240), 2);
  assert.equal(thunderDelaySec(-10), 0);
});

test('computeEnvFilterTarget handles open air, shelter (~1.2kHz + 70% reduction), and underwater (~500Hz)', () => {
  const open = computeEnvFilterTarget(false, false, 1.0);
  assert.equal(open.cutoffHz, OPEN_LOWPASS_HZ);
  assert.equal(open.exteriorWeatherMult, 1);

  const shelter = computeEnvFilterTarget(true, false, 1.0);
  assert.ok(Math.abs(shelter.cutoffHz - SHELTER_LOWPASS_HZ) < 1e-6);
  assert.ok(Math.abs(shelter.exteriorWeatherMult - 0.3) < 1e-9);

  // Half muffling blends smoothly
  const halfShelter = computeEnvFilterTarget(true, false, 0.5);
  assert.ok(halfShelter.cutoffHz > SHELTER_LOWPASS_HZ && halfShelter.cutoffHz < OPEN_LOWPASS_HZ);
  assert.ok(Math.abs(halfShelter.exteriorWeatherMult - 0.65) < 1e-9);

  // Zero muffling leaves exterior unmuffled
  const zeroShelter = computeEnvFilterTarget(true, false, 0);
  assert.equal(zeroShelter.cutoffHz, OPEN_LOWPASS_HZ);
  assert.equal(zeroShelter.exteriorWeatherMult, 1);

  // Swimming takes precedence over shelter
  const swim = computeEnvFilterTarget(true, true, 1.0);
  assert.equal(swim.cutoffHz, UNDERWATER_LOWPASS_HZ);
});

test('selectRainLayers distinguishes shelter roof tapping, ground hiss, and water splashes', () => {
  const roof = selectRainLayers(0.9, true, 'basalt', false);
  assert.ok(roof.roofTap > roof.groundHiss && roof.waterSplash === 0);
  assert.equal(roof.filterType, 'bandpass');

  const water = selectRainLayers(0.9, false, 'water', true);
  assert.ok(water.waterSplash > water.groundHiss && water.roofTap === 0);

  const ground = selectRainLayers(0.9, false, 'basalt', false);
  assert.ok(ground.groundHiss > 0.8 && ground.roofTap === 0 && ground.waterSplash === 0);
  assert.equal(ground.filterType, 'highpass');

  const dry = selectRainLayers(0, false, 'basalt', false);
  assert.equal(dry.groundHiss, 0);
});

test('pickFootstepVariation is deterministic, never repeats same note twice in a row, and scales by speed & wetness', () => {
  let seed = 42;
  let prev = -1;
  const seen = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const step = pickFootstepVariation(seed, prev, 'basalt', 5.6, 0.2);
    assert.notEqual(step.noteIndex, prev, `repeated note index ${step.noteIndex} at iteration ${i}`);
    prev = step.noteIndex;
    seed = step.nextSeed;
    seen.add(step.noteIndex);
  }
  assert.ok(seen.size >= 4, 'seeded picker should explore multiple variants');

  // Identical inputs yield identical outputs (deterministic PRNG, no Math.random)
  const a = pickFootstepVariation(999, 2, 'crystal', 9.2, 0.5);
  const b = pickFootstepVariation(999, 2, 'crystal', 9.2, 0.5);
  assert.deepEqual(a, b);

  // Speed classification & gain/pitch ordering: crouch < walk < run
  assert.equal(classifyFootstepSpeed(2.5), 'crouch');
  assert.equal(classifyFootstepSpeed(5.6), 'walk');
  assert.equal(classifyFootstepSpeed(9.4), 'run');

  const crouch = pickFootstepVariation(101, 0, 'ash', 2.4, 0);
  const walk = pickFootstepVariation(101, 0, 'ash', 5.6, 0);
  const run = pickFootstepVariation(101, 0, 'ash', 9.4, 0);
  assert.ok(crouch.gainMult < walk.gainMult && walk.gainMult < run.gainMult);
  assert.ok(crouch.pitchMult < walk.pitchMult && walk.pitchMult < run.pitchMult);

  // Wetness increases wetBlend on dry surfaces
  const dryStep = pickFootstepVariation(101, 0, 'basalt', 5.6, 0);
  const wetStep = pickFootstepVariation(101, 0, 'basalt', 5.6, 1.0);
  assert.ok(wetStep.wetBlend > dryStep.wetBlend);

  // Seed generator always advances cleanly
  const n = nextAudioSeed(0);
  assert.ok(n.value >= 0 && n.value < 1);
});

test('selectMusicMode, brukTrustGain, and computeDuckingGain follow priority and bounds', () => {
  assert.equal(
    selectMusicMode({ inShelter: true, health: 20, hazard: 'safe', stormWeight: 0, activeEvent: 'none', isNight: false }),
    'danger'
  );
  assert.equal(
    selectMusicMode({ inShelter: true, health: 90, hazard: 'toxic', stormWeight: 0, activeEvent: 'none', isNight: false }),
    'alert'
  );
  assert.equal(
    selectMusicMode({ inShelter: true, health: 90, hazard: 'safe', stormWeight: 0, activeEvent: 'none', isNight: true }),
    'shelter'
  );
  assert.equal(
    selectMusicMode({ inShelter: false, health: 90, hazard: 'safe', stormWeight: 0, activeEvent: 'none', isNight: true }),
    'night'
  );
  assert.equal(
    selectMusicMode({ inShelter: false, health: 90, hazard: 'safe', stormWeight: 0, activeEvent: 'none', isNight: false }),
    'calm'
  );

  for (let lv = 0; lv < 4; lv++) {
    assert.ok(brukTrustGain(lv + 1) > brukTrustGain(lv));
  }
  assert.equal(computeDuckingGain([]), 1);
  assert.equal(computeDuckingGain([0.6, 0.32, 0.8]), 0.32);
});
