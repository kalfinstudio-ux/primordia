import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THUNDER_SPEED_OF_SOUND_M_S,
  WEATHER_TYPES,
  WeatherBlend,
  createWeatherWeights,
  stepWetness,
  thunderDelaySec,
  windVector,
} from './data/weather';

test('WeatherBlend: weights always sum to 1, monotonic progression, and handles zero/negative/large dt without NaN', () => {
  const blend = new WeatherBlend('clear_haze', 30);
  let w = blend.weights();
  assert.equal(w.clear_haze, 1);

  blend.setTarget('acid_rain');
  // Zero / negative / NaN dt do not break state or produce NaN
  blend.step(0);
  blend.step(-5);
  blend.step(Number.NaN);
  w = blend.weights();
  assert.equal(w.clear_haze, 1);
  assert.equal(w.acid_rain, 0);

  let prevTo = -1;
  let prevFrom = 2;
  for (let s = 0; s <= 32; s += 2) {
    w = blend.weights();
    let sum = 0;
    for (const k of WEATHER_TYPES) {
      assert.ok(Number.isFinite(w[k]), `weight for ${k} must be finite`);
      assert.ok(w[k] >= 0 && w[k] <= 1, `weight for ${k} in [0,1]`);
      sum += w[k];
    }
    assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to 1 (got ${sum})`);
    assert.ok(w.acid_rain >= prevTo - 1e-12, 'target weight must be monotonic non-decreasing');
    assert.ok(w.clear_haze <= prevFrom + 1e-12, 'source weight must be monotonic non-increasing');
    prevTo = w.acid_rain;
    prevFrom = w.clear_haze;
    blend.step(2);
  }

  assert.equal(blend.weights().acid_rain, 1);
  assert.equal(blend.weights().clear_haze, 0);

  // Large dt snaps cleanly to 1 without overshoot
  blend.setTarget('ash_storm');
  blend.step(9999);
  w = blend.weights();
  assert.equal(w.ash_storm, 1);
  assert.equal(w.acid_rain, 0);

  // Immediate snap (mid-cycle startup) skips transition
  blend.setTarget('electrical_storm', true);
  assert.equal(blend.weights().electrical_storm, 1);
  assert.equal(blend.normalizedProgress, 1);
});

test('thunderDelaySec converts distance at 120 m/s and guards invalid inputs', () => {
  assert.equal(THUNDER_SPEED_OF_SOUND_M_S, 120);
  assert.equal(thunderDelaySec(0), 0);
  assert.equal(thunderDelaySec(-40), 0);
  assert.equal(thunderDelaySec(Number.NaN), 0);
  assert.equal(thunderDelaySec(120), 1);
  assert.equal(thunderDelaySec(300), 2.5);
});

test('windVector is deterministic, bounded, intensifies during storms, and reuses out buffer', () => {
  const t = Date.UTC(2026, 10, 15, 14, 30, 0);
  const wClearA = windVector(t, 'clear_haze');
  const wClearB = windVector(t, 'clear_haze');
  assert.deepEqual(wClearA, wClearB);

  const reusable = { x: 0, z: 0, strength: 0 };
  const ret = windVector(t, 'ash_storm', reusable);
  assert.equal(ret, reusable);

  for (const kind of WEATHER_TYPES) {
    const v = windVector(t, kind);
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.strength));
    assert.ok(v.strength >= 0.8 && v.strength <= 11.0, `bounded strength for ${kind}: ${v.strength}`);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - v.strength) < 1e-9);
  }

  const clear = windVector(t, 'clear_haze');
  const rain = windVector(t, 'acid_rain');
  const ash = windVector(t, 'ash_storm');
  assert.ok(rain.strength > clear.strength);
  assert.ok(ash.strength > rain.strength);

  // Blended weights match pure state at endpoints
  const weights = createWeatherWeights('electrical_storm');
  assert.deepEqual(windVector(t, weights), windVector(t, 'electrical_storm'));
});

test('stepWetness rises during acid rain, dries gradually, and stays in [0, 1]', () => {
  let w = 0;
  for (let i = 0; i < 10; i++) w = stepWetness(w, 1, 1);
  assert.ok(w > 0.5 && w <= 1);
  w = stepWetness(w, 1, 500);
  assert.equal(w, 1);

  for (let i = 0; i < 10; i++) w = stepWetness(w, 0, 1);
  assert.ok(w < 1 && w >= 0);
  w = stepWetness(w, 0, 500);
  assert.equal(w, 0);

  assert.equal(stepWetness(0.4, 1, -3), 0.4);
  assert.equal(stepWetness(Number.NaN, 1, 1), 0.085);
});
