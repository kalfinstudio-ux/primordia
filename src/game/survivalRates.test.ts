import test from 'node:test';
import assert from 'node:assert/strict';
import idDict from '../i18n/id.json';
import enDict from '../i18n/en.json';
import { BALANCE } from './data/balance';
import {
  computeFallDamage,
  computeHeatLossMultiplier,
  computeWindHeatLossMultiplier,
  getCampfireBurnTimeSec,
  getFoodSpoilageTimeSec,
  getRegionDangerMultiplier,
  getSurvivalRateMultiplier,
  isFallingFast,
  stepPlayerWetness,
} from './data/survivalRates';
import { createInitialVitals } from './core/state';
import { stepVitals, type SurvivalEnvironment } from './player/stats';
import { dangerTier } from './world/regions';

function mildEnv(over: Partial<SurvivalEnvironment> = {}): SurvivalEnvironment {
  return {
    ambientTempC: 37,
    toxicLevel: 0,
    radiationLevel: 0,
    weather: 'clear_haze',
    isNight: false,
    inShelter: false,
    nearCampfire: false,
    hasHeatShield: false,
    inLava: false,
    inMeteorDanger: false,
    difficulty: 'survivor',
    survivalRate: 'normal',
    eraYear: 2,
    ...over,
  };
}

test('friendly start: full meter stays 100 during grace period, then drops on real seconds', () => {
  const start = createInitialVitals();
  assert.equal(start.water, 100);
  assert.equal(start.hunger, 100);
  assert.ok(BALANCE.water.fullGraceSec > 0);
  assert.ok(BALANCE.hunger.fullGraceSec > 0);

  // Step through nearly the entire water grace window: stays strictly 100
  let v = start;
  const env = mildEnv({ eraYear: 2 });
  const stepsInGrace = Math.floor((BALANCE.water.fullGraceSec - 1) * 2);
  for (let i = 0; i < stepsInGrace; i++) {
    v = stepVitals(v, env, 0.5).vitals;
  }
  assert.equal(v.water, 100, 'water should stay full during grace period');
  assert.equal(v.hunger, 100, 'hunger should stay full during grace period');

  // Step past grace expiration: meter starts dropping
  for (let i = 0; i < 20; i++) {
    v = stepVitals(v, env, 1.0).vitals;
  }
  assert.ok(v.water < 100, 'water should drop after grace period expires');
});

test('thirst is more urgent and reaches critical before hunger at default settings', () => {
  let v = createInitialVitals();
  const env = mildEnv({ eraYear: 2, survivalRate: 'normal', difficulty: 'survivor' });

  let thirstCriticalSec: number | null = null;
  let hungerCriticalSec: number | null = null;

  for (let t = 1; t <= 1200; t++) {
    v = stepVitals(v, env, 1.0).vitals;
    if (thirstCriticalSec === null && v.water <= BALANCE.water.criticalPct) {
      thirstCriticalSec = t;
    }
    if (hungerCriticalSec === null && v.hunger <= BALANCE.hunger.criticalPct) {
      hungerCriticalSec = t;
    }
    if (thirstCriticalSec !== null && hungerCriticalSec !== null) break;
  }

  assert.ok(thirstCriticalSec !== null, 'thirst should eventually reach critical');
  assert.ok(hungerCriticalSec !== null, 'hunger should eventually reach critical in Era 2+');
  assert.ok(
    thirstCriticalSec < hungerCriticalSec,
    `expected thirst (${thirstCriticalSec}s) < hunger (${hungerCriticalSec}s)`
  );
});

test('hunger starts in Era 2+ only; Era 1 keeps hunger full', () => {
  let vEra1 = createInitialVitals();
  const envEra1 = mildEnv({ eraYear: 1 });
  for (let i = 0; i < 300; i++) {
    vEra1 = stepVitals(vEra1, envEra1, 1.0).vitals;
  }
  assert.equal(vEra1.hunger, 100, 'Era 1 should not drain hunger');
  assert.ok(vEra1.water < 100, 'Era 1 still drains thirst after grace');

  let vEra2 = createInitialVitals();
  const envEra2 = mildEnv({ eraYear: 2 });
  for (let i = 0; i < 300; i++) {
    vEra2 = stepVitals(vEra2, envEra2, 1.0).vitals;
  }
  assert.ok(vEra2.hunger < 100, 'Era 2+ should drain hunger');
});

test('body heat: wet + windy loses more heat than dry + calm, immersion cools faster than wet', () => {
  const baseTemp = { ...createInitialVitals(), temperature: 37.0 };
  const coldEnv = { ambientTempC: 18, isNight: true };

  const dryCalm = stepVitals(
    baseTemp,
    mildEnv({ ...coldEnv, wetness: 0, windStrength: 0, inWater: false, immersed: false }),
    5
  ).vitals;

  const wetWindy = stepVitals(
    baseTemp,
    mildEnv({ ...coldEnv, wetness: 1, windStrength: 7.5, inWater: false, immersed: false }),
    5
  ).vitals;

  const immersed = stepVitals(
    baseTemp,
    mildEnv({ ...coldEnv, wetness: 1, windStrength: 2.0, inWater: true, immersed: true }),
    5
  ).vitals;

  const dryLoss = 37.0 - dryCalm.temperature;
  const wetWindyLoss = 37.0 - wetWindy.temperature;
  const immersedLoss = 37.0 - immersed.temperature;

  assert.ok(wetWindyLoss > dryLoss * 1.5, `wet+windy loss ${wetWindyLoss} should exceed dry+calm ${dryLoss}`);
  assert.ok(immersedLoss > wetWindyLoss, `immersion loss ${immersedLoss} should exceed wet+windy ${wetWindyLoss}`);

  // Wind alone provides ~10-15% heat loss multiplier
  const windLight = computeWindHeatLossMultiplier(2.2, false, true);
  const windStorm = computeWindHeatLossMultiplier(8.8, false, true);
  assert.ok(windLight >= 1.09 && windLight <= 1.16, `light wind mult ${windLight}`);
  assert.ok(windStorm >= 1.10 && windStorm <= 1.16, `storm wind mult ${windStorm}`);
  assert.equal(computeWindHeatLossMultiplier(8.8, true, true), 1.0, 'sheltered blocks wind chill');
});

test('drying happens over time and faster near campfire', () => {
  let wetAmbient = 0.9;
  let wetFire = 0.9;
  for (let i = 0; i < 10; i++) {
    wetAmbient = stepPlayerWetness(wetAmbient, 1, {
      rainWeight: 0,
      inWater: false,
      immersed: false,
      inShelter: false,
      nearCampfire: false,
      windStrength: 1.5,
      enabled: true,
    });
    wetFire = stepPlayerWetness(wetFire, 1, {
      rainWeight: 0,
      inWater: false,
      immersed: false,
      inShelter: false,
      nearCampfire: true,
      windStrength: 1.5,
      enabled: true,
    });
  }
  assert.ok(wetAmbient < 0.9, 'drying reduces wetness over time');
  assert.ok(wetFire < wetAmbient, `near campfire (${wetFire}) should dry faster than ambient (${wetAmbient})`);
});

test('fall damage: zero below threshold, monotonic with landing speed, reduced/canceled in water', () => {
  const safe = BALANCE.fallDamage.safeLandingSpeedMs;
  assert.equal(computeFallDamage(0), 0);
  assert.equal(computeFallDamage(8.4), 0, 'normal jump speed is safe');
  assert.equal(computeFallDamage(safe), 0, 'exactly at threshold is safe');

  // Monotonic progression above threshold (10m ~ 20.7 m/s, 12.5m ~ 23.2 m/s, >13m ~ 24.5 m/s)
  const speeds = [safe + 0.5, 20.8, 22.0, 23.2, 24.5];
  const dmgs = speeds.map((s) => computeFallDamage(s));
  for (let i = 0; i < dmgs.length; i++) {
    assert.ok(dmgs[i] > 0, `damage > 0 above threshold at ${speeds[i]} m/s`);
    if (i > 0) {
      assert.ok(dmgs[i] >= dmgs[i - 1], `monotonic at ${speeds[i]} m/s: ${dmgs[i]} >= ${dmgs[i - 1]}`);
      if (dmgs[i - 1] < 100) {
        assert.ok(dmgs[i] > dmgs[i - 1], `strictly increasing before cap at ${speeds[i]} m/s`);
      }
    }
  }
  assert.ok(dmgs[dmgs.length - 1] >= 90, 'above ~13m should be near-lethal / lethal');

  // Water landing reduction / cancellation
  const dryHard = computeFallDamage(23.2, { inWater: false, immersed: false });
  const shallowWater = computeFallDamage(23.2, { inWater: true, immersed: false });
  const deepWater = computeFallDamage(23.2, { inWater: true, immersed: true });
  assert.ok(shallowWater < dryHard * 0.3, `shallow water ${shallowWater} should greatly reduce ${dryHard}`);
  assert.equal(deepWater, 0, 'deep water landing should cancel fall damage');

  assert.equal(isFallingFast(false, false, -14), true);
  assert.equal(isFallingFast(true, false, -14), false);
  assert.equal(isFallingFast(false, true, -14), false);
});

test('global survival-rate setting (relaxed / normal / hard) scales real-time drain and fall damage', () => {
  assert.ok(getSurvivalRateMultiplier('relaxed') < getSurvivalRateMultiplier('normal'));
  assert.ok(getSurvivalRateMultiplier('normal') < getSurvivalRateMultiplier('hard'));

  const start = { ...createInitialVitals(), water: 80, waterGraceTimer: 0 };
  const afterRelaxed = stepVitals(start, mildEnv({ survivalRate: 'relaxed' }), 10).vitals.water;
  const afterNormal = stepVitals(start, mildEnv({ survivalRate: 'normal' }), 10).vitals.water;
  const afterHard = stepVitals(start, mildEnv({ survivalRate: 'hard' }), 10).vitals.water;

  assert.ok(afterRelaxed > afterNormal && afterNormal > afterHard);

  const fRelaxed = computeFallDamage(22.0, { survivalRate: 'relaxed' });
  const fNormal = computeFallDamage(22.0, { survivalRate: 'normal' });
  const fHard = computeFallDamage(22.0, { survivalRate: 'hard' });
  assert.ok(fRelaxed < fNormal && fNormal < fHard);
});

test('master switches genuinely disable wetness, wind, fallDamage, hunger, and regionDanger', () => {
  // 1. Wetness switch OFF
  assert.equal(
    stepPlayerWetness(0.5, 5, {
      rainWeight: 1,
      inWater: true,
      immersed: true,
      inShelter: false,
      nearCampfire: false,
      windStrength: 8,
      enabled: false,
    }),
    0
  );
  const hlNoWet = computeHeatLossMultiplier({
    wetness: 1,
    inWater: true,
    immersed: true,
    windStrength: 0,
    inShelter: false,
    wetnessEnabled: false,
    windEnabled: false,
  });
  assert.equal(hlNoWet.rateMult, 1.0);
  assert.equal(hlNoWet.coldTargetDropC, 0);

  // 2. Wind switch OFF
  assert.equal(computeWindHeatLossMultiplier(10, false, false), 1.0);

  // 3. Fall damage switch OFF
  assert.equal(computeFallDamage(30, { enabled: false }), 0);
  assert.equal(isFallingFast(false, false, -20, false), false);

  // 4. Hunger switch OFF (even in Era 2+)
  let vNoHunger = createInitialVitals();
  const envNoHunger = mildEnv({ eraYear: 3, switches: { hunger: false } });
  for (let i = 0; i < 200; i++) vNoHunger = stepVitals(vNoHunger, envNoHunger, 1.0).vitals;
  assert.equal(vNoHunger.hunger, 100, 'hunger switch false disables hunger drain in Era 2+');

  // 5. Region danger hook defaults OFF, and only applies when explicitly enabled
  assert.equal(BALANCE.survival.switches.regionDanger, false, 'regionDanger must default OFF');
  assert.equal(getRegionDangerMultiplier(dangerTier(2000, 2000)), 1.0);
  assert.ok(getRegionDangerMultiplier(dangerTier(2000, 2000), true) > 1.0);
});

test('campfire fuel & food spoilage placeholders are defined and accessible', () => {
  assert.ok(getCampfireBurnTimeSec('sulfur_mineral') > 0);
  assert.ok(getCampfireBurnTimeSec('plant_fiber') > 0);
  assert.equal(getCampfireBurnTimeSec('basalt_rock'), 0);
  assert.ok(getFoodSpoilageTimeSec('raw_meat') > 0);
  assert.ok(getFoodSpoilageTimeSec('cooked_meat') > getFoodSpoilageTimeSec('raw_meat'));
});

test('i18n symmetry for survival rate settings, HUD status cues, and fall/starvation death reasons', () => {
  for (const dict of [idDict, enDict]) {
    assert.equal(typeof dict.settings.survivalRate, 'string');
    assert.equal(typeof dict.settings.survivalRates.relaxed, 'string');
    assert.equal(typeof dict.settings.survivalRates.normal, 'string');
    assert.equal(typeof dict.settings.survivalRates.hard, 'string');
    assert.equal(typeof dict.settings.survivalRateHint, 'string');
    assert.equal(typeof dict.hud.hunger, 'string');
    assert.equal(typeof dict.hud.status.wet, 'string');
    assert.equal(typeof dict.hud.status.immersed, 'string');
    assert.equal(typeof dict.hud.status.cold, 'string');
    assert.equal(typeof dict.hud.status.windy, 'string');
    assert.equal(typeof dict.hud.status.falling, 'string');
    assert.equal(typeof dict.survival.fallHurt, 'string');
    assert.equal(typeof dict.gameOver.reasonFall, 'string');
    assert.equal(typeof dict.gameOver.reasonStarvation, 'string');
  }
});
