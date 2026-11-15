import test from 'node:test';
import assert from 'node:assert/strict';
import idDict from '../i18n/id.json';
import enDict from '../i18n/en.json';
import { SAVE_VERSION } from './config';
import { migrateSaveData } from './systems/saveLoad';
import {
  BRUK_TALK_CONTEXTS,
  BRUK_TALK_VARIATIONS,
  canTalkToBruk,
  createDefaultBrukMemory,
  isLongAbsenceReturn,
  pickBrukResourceHint,
  recordBrukGift,
  recordBrukViolation,
  sanitizeBrukMemory,
  selectBrukTalkLine,
  stepBrukStormSanctuary,
} from './data/bruk';
import {
  brukPose,
  crackGlowWithBreath,
  eyeLookYawOffset,
  makeInput,
  makePose,
  makeRoutineState,
  seededEyeBlink,
  stepBrukRoutine,
  triggerRoutineInvestigate,
  triggerRoutineShock,
  type BrukMode,
  type BrukRoutineInput,
} from './data/brukBehavior';
import { brukTargetSpot } from './data/brukWorld';
import {
  BRUK_MAX_WATER_DEPTH,
  BRUK_STUCK_RETURN_SEC,
  makeBrukNavState,
  makePushSeparationOut,
  makeSteerStepResult,
  resolveBrukPlayerPush,
  steerBrukToward,
  type NavObstacle,
  type NavWaterSampler,
} from './data/brukNav';

const getKey = (dict: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], dict);

test('navigation: steers around rock/crystal/player colliders without passing through', () => {
  const state = makeBrukNavState(0, 0);
  const out = makeSteerStepResult();
  const flatDry: NavWaterSampler = { groundHeightAt: () => 2.0, waterLevel: -1.2 };
  const obstacles: NavObstacle[] = [
    { id: 'rock_1', x: 0, z: 6, radius: 1.4 },
    { id: 'crystal_1', x: 1.5, z: 10, radius: 1.0 },
    { id: 'player', x: -1.5, z: 12, radius: 0.8 },
  ];

  let x = 0;
  let z = 0;
  for (let i = 0; i < 120; i++) {
    steerBrukToward(state, x, z, 0, 18, 0, 0, 2.6, 0.1, 1.3, obstacles, flatDry, out);
    x = out.nextX;
    z = out.nextZ;
    for (const obs of obstacles) {
      const dist = Math.hypot(x - obs.x, z - obs.z);
      assert.ok(dist >= 1.3 + obs.radius - 0.05, `collided with ${obs.id}: dist=${dist}`);
    }
    if (Math.hypot(x - 0, z - 18) < 0.8) break;
  }
  assert.ok(z > 14, `expected Bruk to navigate past obstacles toward target, reached z=${z}`);
});

test('navigation: avoids water deeper than 0.6 m while walking through shallow puddles', () => {
  const state = makeBrukNavState(0, 0);
  const out = makeSteerStepResult();
  const deepPond: NavWaterSampler = {
    waterLevel: 0,
    groundHeightAt: (x, z) => {
      // Deep water trench (>0.6 m deep) centered at (0, 6) radius 3.2 m; shallow water <= 0.35 m elsewhere
      if (Math.hypot(x - 0, z - 6) < 3.2) return -1.2;
      return -0.35;
    },
  };

  let x = 0;
  let z = 0;
  for (let i = 0; i < 120; i++) {
    steerBrukToward(state, x, z, 0, 14, 0, 0, 2.6, 0.1, 1.3, [], deepPond, out);
    x = out.nextX;
    z = out.nextZ;
    const depth = deepPond.waterLevel - deepPond.groundHeightAt(x, z);
    assert.ok(depth <= BRUK_MAX_WATER_DEPTH + 1e-6, `entered deep water: depth=${depth}`);
  }
  assert.ok(z > 10, `expected Bruk to skirt around deep water to reach far side, z=${z}`);
});

test('navigation: stuck detection triggers return-to-home after > 4 s', () => {
  const state = makeBrukNavState(10, 10);
  const out = makeSteerStepResult();
  const ringWall: NavObstacle[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ringWall.push({ id: `wall_${i}`, x: 10 + Math.sin(a) * 2.1, z: 10 + Math.cos(a) * 2.1, radius: 1.0 });
  }
  const dry: NavWaterSampler = { groundHeightAt: () => 2.0, waterLevel: -1.2 };

  for (let s = 0; s < Math.ceil((BRUK_STUCK_RETURN_SEC + 0.8) / 0.2); s++) {
    steerBrukToward(state, 10, 10, 10, 30, 0, 0, 2.6, 0.2, 1.3, ringWall, dry, out);
    if (state.returningHome) break;
  }
  assert.equal(state.returningHome, true, 'should switch to returningHome after > 4 s stuck');
});

test('navigation: mutual push separates overlapping Bruk and player gently without NaN or teleporting', () => {
  const out = makePushSeparationOut();
  resolveBrukPlayerPush(0, 0, 0.2, 0, 1.75, 0.016, out);
  assert.equal(out.separated, true);
  assert.ok(out.playerX > 0.2 && out.brukX < 0);
  const singleStepDisp = Math.hypot(out.playerX - 0.2, out.playerZ);
  assert.ok(singleStepDisp < 0.25, 'gentle separation per frame, not teleport');

  const nanOut = makePushSeparationOut();
  resolveBrukPlayerPush(NaN, Infinity, -Infinity, NaN, 1.75, NaN, nanOut);
  assert.ok(Number.isFinite(nanOut.brukX) && Number.isFinite(nanOut.playerX));
});

test('routine: deterministic on identical input and resists boundary flickering (hysteresis)', () => {
  const baseInp: BrukRoutineInput = {
    timeSec: 12,
    seed: 4242,
    isNight: false,
    stormWeight: 0,
    playerDist: 20,
    inShelter: false,
    hasFire: false,
    canSitAtFire: false,
    guardFacing: null,
    sinceFirstFire: null,
    lavaDist: 25,
    violationCount: 0,
  };

  const runSim = (): BrukMode[] => {
    const st = makeRoutineState();
    const trace: BrukMode[] = [];
    for (let i = 0; i < 40; i++) {
      const t = i * 0.5;
      // Hold at 20m for 4.0s (> idle minHold 3.5s) to enter watch, then oscillate across 24..27m band
      const dist = i < 8 ? 20 : 25 + Math.sin(i) * 2.5;
      trace.push(stepBrukRoutine(st, { ...baseInp, timeSec: t, playerDist: dist }, 0.5));
    }
    return trace;
  };

  const runA = runSim();
  const runB = runSim();
  assert.deepEqual(runA, runB, 'routine trace must be 100% deterministic');

  // Hysteresis check: once in watch at dist=20, oscillating in 22.5..27.5m stays in watch cleanly
  for (let i = 8; i < runA.length; i++) {
    assert.equal(runA[i], 'watch', `expected hysteresis to hold watch at step ${i}, got ${runA[i]}`);
  }
});

test('routine: flee_lava enters <6.5m and holds via hysteresis until >10.5m, plus night/investigate/shock', () => {
  const st = makeRoutineState();
  const base: BrukRoutineInput = {
    timeSec: 0,
    seed: 77,
    isNight: false,
    stormWeight: 0,
    playerDist: 25,
    inShelter: false,
    hasFire: false,
    canSitAtFire: false,
    guardFacing: null,
    sinceFirstFire: null,
    lavaDist: 5.5,
    violationCount: 0,
  };

  assert.equal(stepBrukRoutine(st, base, 0.5), 'flee_lava');
  // Still stays fleeing at 8.5 m (< 10.5 m exit threshold)
  for (let k = 0; k < 4; k++) {
    assert.equal(stepBrukRoutine(st, { ...base, timeSec: 1 + k * 0.5, lavaDist: 8.5 }, 0.5), 'flee_lava');
  }
  // Exits once safely past 10.5 m
  assert.notEqual(stepBrukRoutine(st, { ...base, timeSec: 4, lavaDist: 12.0 }, 0.5), 'flee_lava');

  // Shock & investigate triggers produce finite pose and target spots
  triggerRoutineShock(st, 4.0, true);
  assert.equal(stepBrukRoutine(st, { ...base, timeSec: 9, lavaDist: 20 }, 0.5), 'recoil');

  const stNight = makeRoutineState();
  triggerRoutineInvestigate(stNight, 25, -15, 6.0);
  // Advance past initial idle minHold
  for (let i = 0; i < 10; i++) stepBrukRoutine(stNight, { ...base, timeSec: i * 0.5, lavaDist: 25, isNight: true }, 0.5);
  assert.equal(stNight.mode, 'investigate');

  const poseOut = makePose();
  for (const mode of ['patrol', 'rest', 'wander', 'investigate', 'flee_lava'] as const) {
    const inp = makeInput();
    inp.routineMode = mode;
    inp.level = 3;
    inp.time = 12.3;
    inp.dist = 14;
    inp.bearing = 0.7;
    inp.investigateBearing = -0.4;
    inp.fleeBearing = 1.1;
    const p = brukPose(inp, poseOut);
    assert.equal(p.mode, mode);
    assert.ok(Number.isFinite(p.yaw) && Number.isFinite(p.headYaw) && Number.isFinite(p.glow) && Number.isFinite(p.lean));
    const spot = brukTargetSpot({
      mode,
      home: { x: 24, z: -10 },
      fire: { x: 18, z: -8 },
      shelter: null,
      guardFacing: null,
      crater: { x: 38, z: -22 },
      timeSec: 12.3,
      seed: 77,
      investigateTarget: { x: 12, z: 4 },
      fleeFromLavaTarget: { x: 30, z: -10 },
    });
    assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.z));
  }
});

test('visual helpers: deterministic blink, breath-synced lava crack glow, and bounded eye tracking', () => {
  const b0 = seededEyeBlink(0, 101);
  assert.equal(b0, 1);
  let minBlink = 1;
  for (let t = 0; t < 20; t += 0.03) {
    const b = seededEyeBlink(t, 101);
    assert.ok(b >= 0.05 && b <= 1.0);
    if (b < minBlink) minBlink = b;
  }
  assert.ok(minBlink < 0.25, 'deterministic blink dips below 0.25 periodically');
  assert.equal(seededEyeBlink(7.42, 101), seededEyeBlink(7.42, 101));

  const gExhale = crackGlowWithBreath(1.0, 0.0, 3);
  const gInhale = crackGlowWithBreath(1.0, 1.0, 3);
  assert.ok(gInhale > gExhale);

  const eyeOff = eyeLookYawOffset(1.0, 0, 0, 8);
  assert.ok(Math.abs(eyeOff) <= 0.26 + 1e-9 && eyeOff > 0);
});

test('memory & old save migration: missing or corrupted brukMemory safely migrates to defaults', () => {
  const oldSave = {
    worldSeed: 'LEGACY-BRUK',
    playtimeSec: 500,
    completedQuests: ['q1', 'q2'],
    brukMoments: ['first_fire'],
  };
  const migrated = migrateSaveData(oldSave, 'local');
  assert.equal(migrated.saveVersion, SAVE_VERSION);
  assert.deepEqual(migrated.brukMemory, createDefaultBrukMemory());

  const corruptMem = sanitizeBrukMemory({
    violationCount: -5,
    gifts: NaN,
    lastTalkKey: 'invalid.key',
    lastHintLevel: 99,
  });
  assert.equal(corruptMem.violationCount, 0);
  assert.equal(corruptMem.gifts, 0);
  assert.equal(corruptMem.lastTalkKey, null);
  assert.equal(corruptMem.lastHintLevel, 4);

  let mem = createDefaultBrukMemory();
  mem = recordBrukViolation(mem, 120);
  mem = recordBrukGift(mem);
  assert.equal(mem.violationCount, 1);
  assert.equal(mem.gifts, 1);
  assert.equal(isLongAbsenceReturn({ ...mem, lastMeetingSec: 10 }, 250), true);
  assert.equal(isLongAbsenceReturn({ ...mem, lastMeetingSec: 200 }, 250), false);
});

test('talk interaction & layered dialog: range/facing gate, non-repeating variations, and complete id+en keys', () => {
  // Player at (0, 0) facing +Z (yaw = 0), Bruk at (0, 3) -> talkable
  assert.equal(canTalkToBruk(0, 0, 0, 0, 3.0), true);
  // Facing away (-Z, yaw = PI) -> not talkable
  assert.equal(canTalkToBruk(0, 0, Math.PI, 0, 3.0), false);
  // Too far (> 4m) -> not talkable
  assert.equal(canTalkToBruk(0, 0, 0, 0, 4.6), false);

  let mem = createDefaultBrukMemory();
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const res = selectBrukTalkLine(
      {
        level: 2,
        isNight: false,
        storm: true,
        playerInjured: false,
        fireOut: false,
        playtimeSec: 100 + i * 2,
        recentViolation: false,
      },
      mem
    );
    assert.equal(res.context, 'storm');
    if (seen.length > 0) assert.notEqual(res.key, seen[seen.length - 1], 'must never repeat consecutively');
    seen.push(res.key);
    mem = res.memory;
  }

  for (const ctx of BRUK_TALK_CONTEXTS) {
    for (let v = 0; v < BRUK_TALK_VARIATIONS; v++) {
      const k = `bruk.talk.${ctx}.${v}`;
      for (const [lang, dict] of [['en', enDict], ['id', idDict]] as const) {
        const val = getKey(dict, k);
        assert.equal(typeof val, 'string', `missing ${lang}:${k}`);
        assert.ok((val as string).length > 5, `empty ${lang}:${k}`);
      }
    }
  }
  for (const k of ['hud.actions.talk_bruk', 'bruk.stormSanctuary', 'bruk.hintWaypointToast']) {
    assert.equal(typeof getKey(enDict, k), 'string', `missing en:${k}`);
    assert.equal(typeof getKey(idDict, k), 'string', `missing id:${k}`);
  }
});

test('mechanical rewards simulation: trust resource waypoints & level 3-4 brief storm sanctuary', () => {
  assert.equal(pickBrukResourceHint(0, 0, 18), null);
  for (const lv of [1, 2, 3, 4]) {
    const h = pickBrukResourceHint(lv, 0, 18);
    assert.ok(h && Number.isFinite(h.x) && Number.isFinite(h.z) && h.level === lv);
  }

  let mem = createDefaultBrukMemory();
  // Trust level 2 does NOT grant storm sanctuary
  const sLow = stepBrukStormSanctuary(mem, { level: 2, storm: true, playerDist: 3, playtimeSec: 100 });
  assert.equal(sLow.active, false);

  // Trust level 3 grants brief 10s sanctuary then enters cooldown
  const sAct = stepBrukStormSanctuary(mem, { level: 3, storm: true, playerDist: 4, playtimeSec: 100 });
  assert.equal(sAct.active, true);
  assert.equal(sAct.activatedNow, true);
  mem = sAct.memory;

  // Mid-sanctuary at t=105 -> active, not newly activated
  const sMid = stepBrukStormSanctuary(mem, { level: 3, storm: true, playerDist: 4, playtimeSec: 105 });
  assert.equal(sMid.active, true);
  assert.equal(sMid.activatedNow, false);

  // Expired at t=112 during cooldown -> inactive
  const sCool = stepBrukStormSanctuary(mem, { level: 3, storm: true, playerDist: 4, playtimeSec: 112 });
  assert.equal(sCool.active, false);

  // After cooldown (100 + 10 + 45 = 155) -> re-activates cleanly
  const sAgain = stepBrukStormSanctuary(mem, { level: 3, storm: true, playerDist: 4, playtimeSec: 160 });
  assert.equal(sAgain.active, true);
  assert.equal(sAgain.activatedNow, true);
});
