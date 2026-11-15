import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from './data/balance';
import {
  computeHalfResBloomSize,
  decideGraphicsTier,
  recordFpsSample,
  tierRank,
  type FpsSample,
} from './data/graphicsTier';
import type { GraphicsTier } from './config';

function makeSamples(startSec: number, count: number, fpsFn: number | ((sec: number, idx: number) => number)): FpsSample[] {
  const out: FpsSample[] = [];
  for (let i = 0; i < count; i++) {
    const t = startSec + i;
    const fps = typeof fpsFn === 'function' ? fpsFn(t, i) : fpsFn;
    out.push({ timeSec: t, fps });
  }
  return out;
}

test('Auto tier steps down one tier when average FPS stays below threshold for stepDownWindowSec', () => {
  const { stepDownFps, stepDownWindowSec } = BALANCE.graphics.auto;
  const lowFps = stepDownFps - 6;

  // 5 seconds of sub-threshold FPS steps high -> medium (never skips straight to low)
  const samples = makeSamples(1, stepDownWindowSec, lowFps);
  const next = decideGraphicsTier({
    samples,
    currentTier: 'high',
    timeSec: stepDownWindowSec,
  });
  assert.equal(next, 'medium');

  // From medium it steps down to low after another full window post-transition
  const samples2 = [...samples, ...makeSamples(stepDownWindowSec + 1, stepDownWindowSec, lowFps)];
  const next2 = decideGraphicsTier({
    samples: samples2,
    currentTier: 'medium',
    timeSec: stepDownWindowSec * 2,
    lastChangeTimeSec: stepDownWindowSec,
    lastChangeDirection: 'down',
  });
  assert.equal(next2, 'low');

  // Clamped at low
  const clamped = decideGraphicsTier({
    samples: samples2,
    currentTier: 'low',
    timeSec: stepDownWindowSec * 2,
  });
  assert.equal(clamped, 'low');
});

test('Brief FPS dip shorter than stepDownWindowSec does not step down', () => {
  const { stepDownFps, stepDownWindowSec } = BALANCE.graphics.auto;
  // 2 seconds of lag followed by recovery keeps average >= 40
  const samples = [
    { timeSec: 1, fps: 58 },
    { timeSec: 2, fps: 56 },
    { timeSec: 3, fps: stepDownFps - 12 },
    { timeSec: 4, fps: stepDownFps - 10 },
    { timeSec: 5, fps: 55 },
  ];
  assert.equal(
    decideGraphicsTier({
      samples,
      currentTier: 'high',
      timeSec: 5,
    }),
    'high'
  );

  // Only 3 seconds total (< 5s window) does not trigger step-down either
  const shortSamples = makeSamples(1, Math.max(2, stepDownWindowSec - 2), stepDownFps - 15);
  assert.equal(
    decideGraphicsTier({
      samples: shortSamples,
      currentTier: 'high',
      timeSec: shortSamples[shortSamples.length - 1].timeSec,
    }),
    'high'
  );
});

test('Step up requires a much longer stable period and higher FPS than step down', () => {
  const cfg = BALANCE.graphics.auto;
  assert.ok(cfg.stepUpWindowSec > cfg.stepDownWindowSec * 2, 'stepUpWindowSec must be much longer than stepDownWindowSec');
  assert.ok(cfg.stepUpFps > cfg.stepDownFps, 'hysteresis requires stepUpFps > stepDownFps');

  // High FPS for 12s (< stepUpWindowSec) must NOT step up yet
  const tooShort = makeSamples(1, 12, cfg.stepUpFps + 4);
  assert.equal(
    decideGraphicsTier({
      samples: tooShort,
      currentTier: 'medium',
      timeSec: 12,
    }),
    'medium'
  );

  // Mid-band FPS inside hysteresis deadband (46 FPS: between 40 and 54) stays stable forever
  const deadband = makeSamples(1, cfg.stepUpWindowSec + 10, (cfg.stepDownFps + cfg.stepUpFps) / 2);
  assert.equal(
    decideGraphicsTier({
      samples: deadband,
      currentTier: 'medium',
      timeSec: cfg.stepUpWindowSec + 10,
    }),
    'medium'
  );

  // Full stable window >= stepUpFps and min >= stepUpMinFps steps up one tier
  const stable = makeSamples(1, cfg.stepUpWindowSec + 2, cfg.stepUpFps + 2);
  assert.equal(
    decideGraphicsTier({
      samples: stable,
      currentTier: 'medium',
      timeSec: cfg.stepUpWindowSec + 2,
    }),
    'high'
  );
});

test('No oscillation under alternating FPS around threshold or right after step down', () => {
  const cfg = BALANCE.graphics.auto;
  let tier: GraphicsTier = 'high';
  let lastChangeSec: number | null = null;
  let lastDir: 'up' | 'down' | null = null;
  let samples: FpsSample[] = [];
  const transitions: Array<{ t: number; from: GraphicsTier; to: GraphicsTier }> = [];

  // Phase 1 (t = 1..6): high drops to 34 FPS -> steps down to medium at t = 5
  // Phase 2 (t = 7..40): FPS fluctuates in alternating bursts (57 FPS for 4s, 36 FPS for 3s)
  for (let t = 1; t <= 40; t++) {
    let fps: number;
    if (t <= 6) {
      fps = 34;
    } else {
      const cycle = (t - 7) % 7;
      fps = cycle < 4 ? 57 : 36;
    }
    samples = recordFpsSample(samples, fps, t);
    const next = decideGraphicsTier({
      samples,
      currentTier: tier,
      timeSec: t,
      lastChangeTimeSec: lastChangeSec,
      lastChangeDirection: lastDir,
    });
    if (next !== tier) {
      transitions.push({ t, from: tier, to: next });
      lastDir = tierRank(next) < tierRank(tier) ? 'down' : 'up';
      lastChangeSec = t;
      tier = next;
    }
  }

  // Only the single step down high -> medium should happen; zero upward/downward ping-ponging.
  assert.equal(transitions.length, 1, `expected 1 transition, got ${JSON.stringify(transitions)}`);
  assert.deepEqual(transitions[0], { t: cfg.stepDownWindowSec, from: 'high', to: 'medium' });

  // Also test cooldown blocks stepping up even if FPS immediately spikes after step-down until full stable window passes
  const immediateSpike = makeSamples(11, cfg.stepUpWindowSec + 2, 60);
  const stillLocked = decideGraphicsTier({
    samples: immediateSpike,
    currentTier: 'medium',
    timeSec: 10 + Math.min(cfg.cooldownAfterDownSec, cfg.stepUpWindowSec) - 1,
    lastChangeTimeSec: 10,
    lastChangeDirection: 'down',
  });
  assert.equal(stillLocked, 'medium');
});

test('decideGraphicsTier respects maxTier cap and ignores invalid samples', () => {
  const cfg = BALANCE.graphics.auto;
  const stable = makeSamples(1, cfg.stepUpWindowSec + 5, 60);
  assert.equal(
    decideGraphicsTier({
      samples: stable,
      currentTier: 'medium',
      timeSec: cfg.stepUpWindowSec + 5,
      maxTier: 'medium',
    }),
    'medium'
  );
  assert.equal(
    decideGraphicsTier({
      samples: [{ timeSec: 1, fps: Number.NaN }, { timeSec: 2, fps: -10 }],
      currentTier: 'high',
      timeSec: 10,
    }),
    'high'
  );
});

test('Half-resolution bloom uses ~75% fewer pixels than full resolution', () => {
  const fullW = 1920;
  const fullH = 1080;
  const bloom = computeHalfResBloomSize(fullW, fullH);
  assert.equal(bloom.width, 960);
  assert.equal(bloom.height, 540);
  const ratio = (bloom.width * bloom.height) / (fullW * fullH);
  assert.ok(Math.abs(ratio - 0.25) < 0.01, `expected 25% pixel ratio (-75% pixels), got ${ratio}`);
});
