import test from 'node:test';
import assert from 'node:assert/strict';
import { HumanPoser, actionKindFor, type PoseRig } from './player/pose';

const node = () => ({ rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } });
const makeRig = (): PoseRig => ({
  bodyPivot: node(), torsoGroup: node(), chestGroup: node(), headGroup: node(),
  leftArm: node(), rightArm: node(), leftElbow: node(), rightElbow: node(),
  leftLeg: node(), rightLeg: node(), leftKnee: node(), rightKnee: node(), leftAnkle: node(), rightAnkle: node(),
});
const base = { speed: 0, grounded: true, swimming: false, verticalSpeed: 0, lookYaw: 0, heightScale: 1, action: null, landWeight: 0 };

function range(speed: number, secs = 3) {
  const rig = makeRig();
  const p = new HumanPoser();
  let min = Infinity, max = -Infinity, minY = 0;
  for (let i = 0; i < secs * 60; i++) {
    p.update(rig, { ...base, speed }, 1 / 60, i / 60);
    if (i > secs * 30) {
      min = Math.min(min, rig.leftArm.rotation.x);
      max = Math.max(max, rig.leftArm.rotation.x);
      minY = Math.min(minY, rig.bodyPivot.position.y);
    }
  }
  return { min, max, minY, rig };
}

test('ayunan tangan saat lari jauh lebih lebar daripada versi robot lama (±0,56 rad)', () => {
  const walk = range(5.6);
  const sprint = range(9.4);
  assert.ok(walk.max - walk.min > 1.4);
  assert.ok(sprint.max - sprint.min > 2.0);
});

test('pinggul dan dada berputar berlawanan, siku & lutut menekuk saat lari', () => {
  const { rig } = range(9.4);
  assert.ok(Math.abs(rig.torsoGroup.rotation.y) + Math.abs(rig.chestGroup.rotation.y) > 0.01);
  assert.ok(rig.leftKnee.rotation.x >= 0 && rig.rightKnee.rotation.x >= 0);
  assert.ok(rig.leftElbow.rotation.x < -0.5);
});

test('pinggul tidak pernah naik di atas tanah saat menapak (kaki tidak melayang)', () => {
  for (const sp of [0, 3, 5.6, 9.4]) assert.ok(range(sp).minY <= 1e-6);
});

test('semua aksi menghasilkan sudut hingga dan kembali netral', () => {
  for (const kind of ['mine', 'gather', 'drink', 'use', 'build'] as const) {
    const rig = makeRig();
    const p = new HumanPoser();
    for (let i = 0; i < 90; i++) {
      p.update(rig, { ...base, action: { kind, t: Math.min(1, i / 60) } }, 1 / 60, i / 60);
      for (const j of Object.values(rig)) {
        const n = j as { rotation: { x: number; y: number; z: number } };
        assert.ok(Number.isFinite(n.rotation.x + n.rotation.y + n.rotation.z));
      }
    }
    for (let i = 0; i < 120; i++) p.update(rig, base, 1 / 60, 3 + i / 60);
    assert.ok(Math.abs(rig.rightArm.rotation.x) < 0.2, kind);
  }
});

test('keluar dari air melipat putaran lengan ke sudut terdekat', () => {
  const rig = makeRig();
  const p = new HumanPoser();
  for (let i = 0; i < 300; i++) p.update(rig, { ...base, swimming: true, speed: 2 }, 1 / 60, i / 60);
  p.update(rig, base, 1 / 60, 5);
  assert.ok(Math.abs(rig.leftArm.rotation.x) <= Math.PI + 0.5);
});

test('jenis aksi mengikuti benda', () => {
  assert.equal(actionKindFor('rock', true), 'mine');
  assert.equal(actionKindFor('rock', false), 'gather');
  assert.equal(actionKindFor('water', true), 'drink');
  assert.equal(actionKindFor('storage_chest', false), 'use');
});
