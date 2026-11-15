import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHELTER_WALL_COLLIDER_R, SHELTER_INTERIOR_R, shelterColliders, shelterDoorWorld, shelterCover, isInsideShelter, type ShelterLike,
} from './world/shelterLayout';

const PLAYER_R = 0.45;
const mk = (rotY: number, x = 10, z = -5): ShelterLike => ({ type: 'basic_shelter', x, z, rotY });

test('collider pondok: 7 segmen, celah pintu cukup lebar untuk pemain di semua arah', () => {
  for (const rot of [0, 0.7, Math.PI / 2, Math.PI, -2.3, 5.1]) {
    const s = mk(rot);
    const cols = shelterColliders(s);
    assert.equal(cols.length, 7);
    const door = shelterDoorWorld(s);
    // titik di pintu harus bebas dari semua collider (jarak > r + radius pemain)
    for (const c of cols) assert.ok(Math.hypot(door.x - c.x, door.z - c.z) > c.radius + PLAYER_R, `pintu tertutup rot=${rot}`);
    // pusat ruang dalam bebas
    for (const c of cols) assert.ok(Math.hypot(s.x - c.x, s.z - c.z) > c.radius + PLAYER_R);
    // jalur lurus pintu → pusat bebas
    for (let k = 0; k <= 10; k++) {
      const px = door.x + (s.x - door.x) * (k / 10);
      const pz = door.z + (s.z - door.z) * (k / 10);
      for (const c of cols) assert.ok(Math.hypot(px - c.x, pz - c.z) > c.radius + PLAYER_R - 1e-6, `jalur terhalang rot=${rot} k=${k}`);
    }
  }
});

test('pintu menghadap -Z lokal: rotY=0 → pintu di z lebih kecil dari pusat', () => {
  const s = mk(0);
  const d = shelterDoorWorld(s);
  assert.ok(d.z < s.z && Math.abs(d.x - s.x) < 1e-9);
  // dipasang di depan pemain yang menghadap yaw=π/2 (maju = +X): pintu harus menghadap pemain (−X)
  const t = mk(Math.PI / 2);
  const d2 = shelterDoorWorld(t);
  assert.ok(d2.x < t.x);
});

test('dinding menutup sisi lain: tidak ada celah lebih dari lebar pemain selain pintu', () => {
  const s = mk(0);
  const cols = shelterColliders(s);
  for (let i = 0; i < cols.length - 1; i++) {
    // segmen berurutan (kecuali melewati pintu) harus nyaris bersentuhan
    const a = cols[i], b = cols[i + 1];
    const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
    if (i === 5) assert.ok(gap > PLAYER_R * 2, 'celah pintu'); // segmen 5 → 7 melewati pintu
    else assert.ok(gap < PLAYER_R * 2, `celah dinding ${i} terlalu lebar: ${gap}`);
  }
  assert.ok(SHELTER_WALL_COLLIDER_R > 0);
});

test('shelterCover: 1 di dalam, memudar, 0 di luar; abaikan struktur lain', () => {
  const s = mk(0, 0, 0);
  assert.equal(shelterCover(0, 0, [s]), 1);
  assert.equal(shelterCover(SHELTER_INTERIOR_R - 0.01, 0, [s]), 1);
  const mid = shelterCover(2.4, 0, [s]);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(shelterCover(3.4, 0, [s]), 0);
  assert.equal(shelterCover(0, 0, [{ ...s, type: 'roof_panel' }]), 0);
  assert.equal(shelterCover(0, 0, []), 0);
  assert.ok(isInsideShelter(0.5, 0.5, s) && !isInsideShelter(2, 0, s));
});
