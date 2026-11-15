import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUK_HOME_RADII, BRUK_SIT_RADIUS, BRUK_GUARD_RADIUS, FirstFireTracker, brukTargetSpot, isStormWeather,
  nearestStruct, pickBrukHome, shelterDoorFacing, stepToward, type HomeSampler,
} from './data/brukWorld';
import { BRUK_RECOIL_SEC, bearingTo } from './data/brukBehavior';

const CRATER = { x: 38, z: -22 };
const SPAWN = { x: 0, z: 18 };
const flat: HomeSampler = { height: () => 5, slopeDeg: () => 2 };

test('rumah Bruk: di lereng luar kawah, sisi menghadap pemain, menatap kawah', () => {
  const h = pickBrukHome(CRATER, SPAWN, flat, 0);
  const d = Math.hypot(h.x - CRATER.x, h.z - CRATER.z);
  assert.ok(Math.abs(d - BRUK_HOME_RADII[0]) < 1e-6);
  // lebih dekat ke spawn daripada pusat kawah
  assert.ok(Math.hypot(h.x - SPAWN.x, h.z - SPAWN.z) < Math.hypot(CRATER.x - SPAWN.x, CRATER.z - SPAWN.z));
  assert.ok(Math.abs(h.yaw - bearingTo(h.x, h.z, CRATER.x, CRATER.z)) < 1e-9);
});

test('rumah Bruk: menghindari air & lereng curam, deterministik, fallback bila semua gagal', () => {
  const steepOnDirect: HomeSampler = {
    height: () => 5,
    slopeDeg: (x, z) => (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 33 ? 40 : 3), // sisi langsung ke pemain curam
  };
  const a = pickBrukHome(CRATER, SPAWN, steepOnDirect, 0);
  const b = pickBrukHome(CRATER, SPAWN, steepOnDirect, 0);
  assert.deepEqual(a, b);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
  const allWater = pickBrukHome(CRATER, SPAWN, { height: () => -3, slopeDeg: () => 1 }, 0);
  assert.ok(Math.abs(Math.hypot(allWater.x - CRATER.x, allWater.z - CRATER.z) - BRUK_HOME_RADII[0]) < 1e-6);
  const nan = pickBrukHome(CRATER, SPAWN, { height: () => NaN, slopeDeg: () => NaN }, 0);
  assert.ok(Number.isFinite(nan.x) && Number.isFinite(nan.yaw));
});

test('struktur terdekat: hormati tipe & jarak maksimum', () => {
  const s = [{ type: 'campfire_kit', x: 10, z: 0 }, { type: 'campfire_kit', x: 3, z: 0 }, { type: 'workbench', x: 1, z: 0 }];
  assert.equal(nearestStruct(s, ['campfire_kit'], 0, 0, 50)?.x, 3);
  assert.equal(nearestStruct(s, ['campfire_kit'], 0, 0, 2), null);
  assert.equal(nearestStruct([], ['campfire_kit'], 0, 0, 50), null);
});

test('api pertama: hanya yang disaksikan; save yang sudah punya api tidak memicu recoil', () => {
  const loadedWithFire = new FirstFireTracker();
  loadedWithFire.reset(2);
  assert.equal(loadedWithFire.update(2, 10), null);
  assert.equal(loadedWithFire.update(3, 20), null); // api ketiga bukan yang pertama

  const t = new FirstFireTracker();
  t.reset(0);
  assert.equal(t.update(0, 5), null);
  assert.equal(t.update(1, 6), 0); // baru dipasang
  assert.equal(t.update(1, 8.5), 2.5);
  assert.ok((t.update(1, 6 + BRUK_RECOIL_SEC + 1) ?? 0) >= BRUK_RECOIL_SEC);
  t.update(0, 100); // api dihancurkan lalu dipasang lagi: tidak mengulang
  assert.ok((t.update(1, 101) ?? 0) > BRUK_RECOIL_SEC);
  t.reset(0); // dunia dimuat ulang
  assert.equal(t.update(0, 0), null);
});

test('api pertama: dibuat tanpa reset() tetap aman (tidak melempar, tidak memicu)', () => {
  const t = new FirstFireTracker();
  assert.equal(t.update(3, 1), null);
});

test('tempat tujuan: rumah / duduk dekat api / berjaga di pintu shelter', () => {
  const home = { x: 20, z: -8 };
  const fire = { x: 5, z: 5 };
  const shelter = { type: 'basic_shelter', x: -4, z: 12, rotY: 0.7 };
  const facing = shelterDoorFacing(shelter);
  assert.ok(Number.isFinite(facing));

  const idle = brukTargetSpot({ mode: 'watch', home, fire, shelter, guardFacing: facing });
  assert.deepEqual(idle, home);

  const sit = brukTargetSpot({ mode: 'sit', home, fire, shelter, guardFacing: facing });
  assert.ok(Math.abs(Math.hypot(sit.x - fire.x, sit.z - fire.z) - BRUK_SIT_RADIUS) < 1e-9);
  // di sisi api yang menghadap rumah
  assert.ok(Math.hypot(sit.x - home.x, sit.z - home.z) < Math.hypot(fire.x - home.x, fire.z - home.z));

  const guard = brukTargetSpot({ mode: 'guard', home, fire, shelter, guardFacing: facing });
  assert.ok(Math.abs(Math.hypot(guard.x - shelter.x, guard.z - shelter.z) - BRUK_GUARD_RADIUS) < 1e-9);

  // mode duduk/berjaga tanpa api/shelter → tetap di rumah
  assert.deepEqual(brukTargetSpot({ mode: 'sit', home, fire: null, shelter: null, guardFacing: null }), home);
  assert.deepEqual(brukTargetSpot({ mode: 'guard', home, fire, shelter: null, guardFacing: null }), home);
});

test('melangkah: kecepatan tetap, tidak melewati target, dt dibatasi 0,25 dtk, aman untuk dt aneh', () => {
  const cur = { x: 0, z: 0 };
  const r = stepToward(cur, 0, 10, 2.6, 0.1);
  assert.ok(Math.abs(r.moved - 0.26) < 1e-9 && Math.abs(cur.z - 0.26) < 1e-9);
  assert.ok(Math.abs(r.remaining - 9.74) < 1e-9);
  assert.ok(Math.abs(r.heading - 0) < 1e-9); // +Z = yaw 0
  // frame tersendat (dt besar) tidak membuat Bruk melompat
  const hitch = { x: 0, z: 0 };
  assert.ok(Math.abs(stepToward(hitch, 0, 100, 2.6, 5).moved - 2.6 * 0.25) < 1e-9);
  const close = { x: 0, z: 9.9 };
  const r2 = stepToward(close, 0, 10, 2.6, 0.25);
  assert.ok(Math.abs(close.z - 10) < 1e-9 && r2.remaining === 0);
  const same = { x: 1, z: 1 };
  assert.equal(stepToward(same, 1, 1, 2.6, 0.1).moved, 0);
  for (const dt of [0, -1, NaN, Infinity]) {
    const c = { x: 0, z: 0 };
    const rr = stepToward(c, 5, 5, 2.6, dt);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(rr.moved), String(dt));
  }
  // timur → heading +π/2
  assert.ok(Math.abs(stepToward({ x: 0, z: 0 }, 5, 0, 2, 0.1).heading - Math.PI / 2) < 1e-9);
});

test('cuaca badai dikenali', () => {
  assert.ok(isStormWeather('ash_storm') && isStormWeather('meteor_shower'));
  assert.ok(!isStormWeather('clear_haze'));
});
