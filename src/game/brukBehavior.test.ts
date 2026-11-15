import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUK_CULL_DIST,
  BRUK_HEAD_MAX,
  BRUK_MAX_LEVEL,
  BRUK_RECOIL_BACK_M,
  BRUK_RECOIL_SEC,
  BRUK_WATCH_RANGE,
  angleDiff,
  bearingTo,
  brukGuardSpot,
  brukPose,
  brukSitSpot,
  brukUpdateInterval,
  copyPose,
  lerpHex,
  makeInput,
  makePose,
  recoilEnvelope,
  smoothLevel,
  smoothPose,
  watchFactor,
  wrapAngle,
  type BrukMode,
  type BrukPose,
  type BrukPoseInput,
} from './data/brukBehavior';

const mk = (over: Partial<BrukPoseInput> = {}): BrukPoseInput => ({ ...makeInput(), dist: 15, bearing: 1, ...over });
const pose = (over: Partial<BrukPoseInput> = {}): BrukPose => brukPose(mk(over));
const NUM_KEYS = ['yaw', 'headYaw', 'lean', 'glow', 'eyeGlow', 'eyeOpen', 'crackColor', 'eyeColor', 'breath', 'arms', 'crouch', 'back', 'sit', 'guard'] as const;
const allFinite = (p: BrukPose): boolean => NUM_KEYS.every((k) => Number.isFinite(p[k]));

test('sudut: wrapAngle dan angleDiff mengambil jalur terpendek', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - -Math.PI) < 1e-9 || Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(angleDiff(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
  assert.equal(wrapAngle(NaN), 0);
  assert.ok(Math.abs(bearingTo(0, 0, 1, 0) - Math.PI / 2) < 1e-9); // +X → yaw π/2
  assert.ok(Math.abs(bearingTo(0, 0, 0, 1)) < 1e-9); // +Z → yaw 0
});

test('lima tingkat = lima tampilan: cahaya makin terang, bungkuk makin berkurang', () => {
  const ps = [0, 1, 2, 3, 4].map((level) => pose({ level, time: 0 }));
  for (let i = 1; i <= BRUK_MAX_LEVEL; i++) {
    assert.ok(ps[i].glow > ps[i - 1].glow, `glow naik di tingkat ${i}`);
    assert.ok(ps[i].eyeGlow > ps[i - 1].eyeGlow, `mata menyala di tingkat ${i}`);
    assert.ok(ps[i].lean < ps[i - 1].lean, `lebih tegak di tingkat ${i}`);
    assert.notEqual(ps[i].crackColor, ps[i - 1].crackColor, `warna retakan beda di tingkat ${i}`);
    assert.notEqual(ps[i].eyeColor, ps[i - 1].eyeColor, `warna mata beda di tingkat ${i}`);
  }
  assert.ok(ps[0].eyeOpen < 0.5, 'tingkat 0 sipit');
  assert.equal(ps[4].eyeOpen, 1);
});

test('warna retakan sesuai tabel di titik tingkat bulat', () => {
  assert.equal(pose({ level: 0 }).crackColor, 0x2a1410);
  assert.equal(pose({ level: 2 }).crackColor, 0xe0601a);
  assert.equal(pose({ level: 4 }).crackColor, 0xffc04a);
});

test('tangan terbuka hanya di tingkat 4', () => {
  for (const level of [0, 1, 2, 3]) assert.equal(pose({ level }).arms, 0);
  assert.equal(pose({ level: 4 }).arms, 1);
});

test('tingkat 4 berdenyut pelan; tingkat 0-3 tidak', () => {
  const vals4 = [0, 1, 2, 3, 4, 5].map((time) => pose({ level: 4, time }).glow);
  assert.ok(Math.max(...vals4) - Math.min(...vals4) > 0.1);
  const vals2 = [0, 1, 2, 3, 4, 5].map((time) => pose({ level: 2, time }).glow);
  assert.ok(Math.max(...vals2) - Math.min(...vals2) < 1e-9);
});

test('tingkat 0 memalingkan badan; tingkat 3 dan 4 menghadap pemain', () => {
  const bearing = 0.8;
  const p0 = pose({ level: 0, bearing, dist: 10 });
  const p3 = pose({ level: 3, bearing, dist: 10 });
  const p4 = pose({ level: 4, bearing, dist: 10 });
  assert.ok(Math.abs(angleDiff(p0.yaw, bearing)) > 2.0, 'membelakangi/menyamping');
  assert.ok(Math.abs(angleDiff(p3.yaw, bearing)) < 1e-6);
  assert.ok(Math.abs(angleDiff(p4.yaw, bearing)) < 1e-6);
});

test('tingkat 1 menoleh ke pemain walau badan masih berpaling; tingkat 0 hampir tidak', () => {
  const p0 = pose({ level: 0, bearing: 0.8, dist: 10 });
  const p1 = pose({ level: 1, bearing: 0.8, dist: 10 });
  assert.ok(Math.abs(p1.headYaw) > 0.9);
  assert.ok(Math.abs(p0.headYaw) < Math.abs(p1.headYaw) / 2);
  assert.ok(Math.abs(angleDiff(p1.yaw, 0.8)) > 1.0, 'badan belum menghadap');
});

test('jarak: di luar 40 m idle dan kembali ke arah dasar; dekat = watch', () => {
  const far = pose({ level: 3, dist: BRUK_WATCH_RANGE + 5, baseYaw: 0.3, bearing: 2 });
  assert.equal(far.mode, 'idle');
  assert.ok(Math.abs(angleDiff(far.yaw, 0.3)) < 1e-9);
  const near = pose({ level: 3, dist: 20, baseYaw: 0.3, bearing: 2 });
  assert.equal(near.mode, 'watch');
});

test('tidak ada lompatan di batas 40 m (pengikutan memudar mulus)', () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const a = pose({ level, dist: BRUK_WATCH_RANGE - 0.05, bearing: 1.2, time: 3 });
    const b = pose({ level, dist: BRUK_WATCH_RANGE + 0.05, bearing: 1.2, time: 3 });
    assert.ok(Math.abs(angleDiff(a.yaw, b.yaw)) < 0.05, `yaw level ${level}`);
    assert.ok(Math.abs(a.headYaw - b.headYaw) < 0.05, `kepala level ${level}`);
  }
  assert.equal(watchFactor(0), 1);
  assert.equal(watchFactor(BRUK_WATCH_RANGE), 0);
  assert.equal(watchFactor(500), 0);
});

test('sudut leher selalu dalam batas, untuk semua arah, jarak, tingkat, mode, waktu', () => {
  for (let level = 0; level <= 4; level += 0.5) {
    for (let b = -Math.PI; b <= Math.PI; b += 0.37) {
      for (const dist of [0, 5, 25, 38, 60]) {
        for (const time of [0, 3.7, 11, 90]) {
          for (const storm of [false, true]) {
            const p = pose({ level, bearing: b, dist, time, storm, inShelter: storm, guardFacing: storm ? 2 : null, fireBearing: 1, moments: ['fire_third'] });
            assert.ok(Math.abs(p.headYaw) <= BRUK_HEAD_MAX + 1e-9, `kepala ${p.headYaw}`);
            assert.ok(Math.abs(angleDiff(p.yaw, 0)) <= Math.PI + 1e-9, 'badan tidak berputar lebih dari 180° dari arah dasar');
            assert.ok(allFinite(p));
          }
        }
      }
    }
  }
});

test('idle bernapas pelan dan menoleh sesekali (deterministik)', () => {
  const ps = Array.from({ length: 400 }, (_, i) => pose({ level: 2, dist: 90, time: i * 0.25 }));
  const breaths = ps.map((p) => p.breath);
  assert.ok(Math.max(...breaths) > 0.95 && Math.min(...breaths) < 0.05, 'napas naik-turun penuh');
  const heads = ps.map((p) => p.headYaw);
  assert.ok(Math.max(...heads.map(Math.abs)) > 0.15, 'sesekali menoleh');
  assert.ok(Math.max(...heads.map(Math.abs)) <= 0.5 + 1e-9, 'tidak berlebihan');
  assert.ok(heads.filter((h) => Math.abs(h) < 0.02).length > 40, 'sebagian besar waktu diam');
  assert.equal(pose({ level: 2, dist: 90, time: 12.5 }).headYaw, pose({ level: 2, dist: 90, time: 12.5 }).headYaw);
});

test('recoil: mundur dan mengerut saat api pertama, lalu kembali', () => {
  assert.equal(recoilEnvelope(null), 0);
  assert.equal(recoilEnvelope(-1), 0);
  assert.equal(recoilEnvelope(BRUK_RECOIL_SEC), 0);
  assert.equal(recoilEnvelope(NaN), 0);
  assert.ok(recoilEnvelope(2) > 0.95);
  const during = pose({ level: 1, moments: ['first_fire'], sinceFirstFire: 2 });
  assert.equal(during.mode, 'recoil');
  assert.ok(during.back > BRUK_RECOIL_BACK_M * 0.95 && during.back <= BRUK_RECOIL_BACK_M + 1e-9);
  assert.ok(during.crouch > 0.95);
  const calm = pose({ level: 1, moments: ['first_fire'], sinceFirstFire: null });
  assert.ok(during.lean > calm.lean, 'lebih membungkuk');
  assert.ok(during.glow < calm.glow, 'meredup sesaat');
  const after = pose({ level: 1, moments: ['first_fire'], sinceFirstFire: BRUK_RECOIL_SEC + 1 });
  assert.equal(after.mode, 'watch');
  assert.equal(after.back, 0);
  assert.equal(after.crouch, 0);
});

test('recoil mulus: tidak ada lompatan pada amplop', () => {
  let prev = recoilEnvelope(0);
  for (let t = 0.01; t < BRUK_RECOIL_SEC; t += 0.01) {
    const e = recoilEnvelope(t);
    assert.ok(Math.abs(e - prev) < 0.04, `lompatan di ${t}`);
    prev = e;
  }
  assert.ok(recoilEnvelope(BRUK_RECOIL_SEC - 0.01) < 0.01);
});

test('save yang dimuat (momen first_fire tanpa saksi) tidak memicu recoil', () => {
  const p = pose({ moments: ['first_fire', 'first_shelter'], sinceFirstFire: null });
  assert.notEqual(p.mode, 'recoil');
});

test('sit: duduk bila fire_third sudah terjadi dan ada api; menghadap api', () => {
  const p = pose({ level: 2, moments: ['first_fire', 'fire_third'], fireBearing: 2.2, bearing: -1 });
  assert.equal(p.mode, 'sit');
  assert.equal(p.sit, 1);
  assert.ok(Math.abs(angleDiff(p.yaw, 2.2)) < 1e-9);
  assert.ok(Math.abs(p.headYaw) <= BRUK_HEAD_MAX);
  assert.ok(p.lean < pose({ level: 2, moments: [], bearing: -1 }).lean + 0.1);
});

test('sit tidak terjadi tanpa momen fire_third atau tanpa api', () => {
  assert.notEqual(pose({ moments: ['first_fire'], fireBearing: 1 }).mode, 'sit');
  assert.notEqual(pose({ moments: ['fire_third'], fireBearing: null }).mode, 'sit');
  assert.equal(pose({ moments: ['fire_third'], fireBearing: null }).sit, 0);
});

test('guard: berjaga hanya saat badai DAN pemain di shelter DAN ada pintu', () => {
  const base = { level: 3, guardFacing: 1.5, moments: ['fire_third'], fireBearing: 0 };
  const g = pose({ ...base, storm: true, inShelter: true });
  assert.equal(g.mode, 'guard');
  assert.equal(g.guard, 1);
  assert.equal(g.arms, 0);
  assert.ok(Math.abs(angleDiff(g.yaw, 1.5)) < 1e-9);
  assert.ok(Math.abs(g.headYaw) <= 0.4 + 1e-9, 'menyapu pandang, tidak menoleh liar');
  assert.notEqual(pose({ ...base, storm: false, inShelter: true }).mode, 'guard');
  assert.notEqual(pose({ ...base, storm: true, inShelter: false }).mode, 'guard');
  assert.notEqual(pose({ ...base, storm: true, inShelter: true, guardFacing: null }).mode, 'guard');
});

test('prioritas mode: guard > recoil > sit > watch > idle', () => {
  const all = { level: 2, moments: ['first_fire', 'fire_third'], fireBearing: 1, guardFacing: 2, storm: true, inShelter: true, sinceFirstFire: 1 };
  assert.equal(pose(all).mode, 'guard');
  assert.equal(pose({ ...all, storm: false }).mode, 'recoil');
  assert.equal(pose({ ...all, storm: false, sinceFirstFire: null }).mode, 'sit');
  assert.equal(pose({ ...all, storm: false, sinceFirstFire: null, moments: [] }).mode, 'watch');
  assert.equal(pose({ ...all, storm: false, sinceFirstFire: null, moments: [], dist: 100 }).mode, 'idle');
});

test('urutan momen: api pertama → recoil → watch; api ketiga → sit; badai → guard', () => {
  const seq: BrukMode[] = [];
  const step = (over: Partial<BrukPoseInput>) => seq.push(pose({ level: 1, ...over }).mode);
  step({ moments: [] });
  step({ moments: ['first_fire'], sinceFirstFire: 0.5 });
  step({ moments: ['first_fire'], sinceFirstFire: 10 });
  step({ moments: ['first_fire', 'fire_third'], fireBearing: 0.5 });
  step({ moments: ['first_fire', 'fire_third'], fireBearing: 0.5, guardFacing: 1, storm: true, inShelter: true });
  step({ moments: ['first_fire', 'fire_third'], fireBearing: 0.5 });
  assert.deepEqual(seq, ['watch', 'recoil', 'watch', 'sit', 'guard', 'sit']);
});

test('input sampah (NaN, Infinity, negatif, tingkat di luar rentang) tidak pernah menghasilkan NaN', () => {
  const junk = [NaN, Infinity, -Infinity, -5, 1e12, -1e12, 0];
  for (const level of junk) {
    for (const time of junk) {
      for (const dist of junk) {
        for (const bearing of junk) {
          const p = pose({ level, time, dist, bearing, baseYaw: bearing, sinceFirstFire: time, fireBearing: bearing, guardFacing: bearing, storm: true, inShelter: true, moments: ['fire_third'] });
          assert.ok(allFinite(p), JSON.stringify({ level, time, dist, bearing }));
          assert.ok(Math.abs(p.headYaw) <= BRUK_HEAD_MAX + 1e-9);
        }
      }
    }
  }
});

test('brukPose menulis ke objek yang dipakai ulang (tanpa alokasi) dan mengembalikannya', () => {
  const out = makePose();
  const r = brukPose(mk({ level: 4 }), out);
  assert.equal(r, out);
  assert.equal(out.crackColor, 0xffc04a);
});

test('smoothLevel: berubah halus beberapa detik, tidak melompat, tidak melewati target', () => {
  let lv = 0;
  lv = smoothLevel(lv, 3, 0.1);
  assert.ok(lv > 0 && lv < 0.5, 'frame pertama hanya bergeser sedikit');
  let t = 0.1;
  while (t < 1) { lv = smoothLevel(lv, 3, 0.1); t += 0.1; }
  assert.ok(lv < 2.5, '1 detik: belum sampai');
  for (let i = 0; i < 300; i++) lv = smoothLevel(lv, 3, 0.1); // ±30 detik
  assert.equal(lv, 3);
  assert.equal(smoothLevel(0, 99, 1000), 4);
  assert.equal(smoothLevel(3, 1, 1000), 1);
  assert.equal(smoothLevel(NaN, NaN, NaN), 0);
  assert.equal(smoothLevel(2, 2, 0), 2);
});

test('smoothPose: konvergen ke target tanpa overshoot, aman untuk dt aneh', () => {
  const tgt = pose({ level: 4, bearing: 1, dist: 10, time: 0 });
  const cur = copyPose(makePose(), pose({ level: 0, bearing: 1, dist: 10, time: 0 }));
  const start = cur.glow;
  smoothPose(cur, tgt, 0.016);
  assert.ok(cur.glow > start && cur.glow < tgt.glow);
  for (let i = 0; i < 2000; i++) smoothPose(cur, tgt, 0.016);
  for (const k of NUM_KEYS) {
    if (k === 'crackColor' || k === 'eyeColor') assert.equal(cur[k], tgt[k], k);
    else if (k === 'yaw') assert.ok(Math.abs(angleDiff(cur.yaw, tgt.yaw)) < 1e-3, 'yaw');
    else assert.ok(Math.abs(cur[k] - tgt[k]) < 1e-3, `${k}: ${cur[k]} vs ${tgt[k]}`);
  }
  const before = copyPose(makePose(), cur);
  smoothPose(cur, tgt, 0);
  smoothPose(cur, tgt, -3);
  smoothPose(cur, tgt, NaN);
  assert.deepEqual(cur, before);
  smoothPose(cur, tgt, 1e9);
  assert.ok(allFinite(cur));
});

test('smoothPose memutar yaw lewat jalur terpendek (tidak berputar penuh)', () => {
  const cur = makePose(); cur.yaw = Math.PI - 0.1;
  const tgt = makePose(); tgt.yaw = -Math.PI + 0.1; // beda 0.2 rad lewat sisi pendek
  smoothPose(cur, tgt, 0.05);
  assert.ok(Math.abs(angleDiff(cur.yaw, Math.PI - 0.1)) < 0.2, 'bergeser sedikit, bukan mengitari 340°');
});

test('smoothPose menjaga yaw tetap dalam ±π walau pemain mengitari terus', () => {
  const cur = makePose();
  const tgt = makePose();
  for (let i = 0; i < 5000; i++) {
    tgt.yaw = wrapAngle(i * 0.05);
    smoothPose(cur, tgt, 0.016);
    assert.ok(Math.abs(cur.yaw) <= Math.PI + 1e-9);
  }
});

test('lerpHex: ujung dan tengah benar, t dijepit', () => {
  assert.equal(lerpHex(0x000000, 0xffffff, 0), 0x000000);
  assert.equal(lerpHex(0x000000, 0xffffff, 1), 0xffffff);
  assert.equal(lerpHex(0x000000, 0xfefefe, 0.5), 0x7f7f7f);
  assert.equal(lerpHex(0x102030, 0xffffff, -4), 0x102030);
  assert.equal(lerpHex(0x102030, 0xffffff, NaN), 0x102030);
});

test('brukUpdateInterval: lewati bila >120 m atau di luar layar; grafis rendah lebih jarang', () => {
  assert.equal(brukUpdateInterval(BRUK_CULL_DIST + 1, true, false), Infinity);
  assert.equal(brukUpdateInterval(10, false, false), Infinity);
  assert.equal(brukUpdateInterval(NaN, true, false), Infinity);
  assert.equal(brukUpdateInterval(10, true, false), 0);
  assert.ok(brukUpdateInterval(10, true, true) > 0, 'grafis rendah di-throttle');
  for (const d of [10, 60, 110]) assert.ok(brukUpdateInterval(d, true, true) >= brukUpdateInterval(d, true, false));
  assert.ok(brukUpdateInterval(110, true, false) > brukUpdateInterval(10, true, false), 'makin jauh makin jarang');
});

test('brukSitSpot: tepat `radius` dari api, di sisi rumah; deterministik; aman bila api di rumah', () => {
  const s = brukSitSpot(10, 0, 0, 0, 2.5);
  assert.ok(Math.abs(s.x - 2.5) < 1e-9 && Math.abs(s.z) < 1e-9);
  const s2 = brukSitSpot(-3, 4, 1, 1, 2);
  assert.ok(Math.abs(Math.hypot(s2.x - 1, s2.z - 1) - 2) < 1e-9);
  assert.deepEqual(brukSitSpot(-3, 4, 1, 1, 2), s2);
  const same = brukSitSpot(5, 5, 5, 5, 2);
  assert.ok(Number.isFinite(same.x) && Number.isFinite(same.z));
  const out = { x: 0, z: 0 };
  assert.equal(brukSitSpot(10, 0, 0, 0, 1, out), out);
});

test('brukGuardSpot: di depan pintu searah hadap, `radius` dari pusat shelter', () => {
  const g = brukGuardSpot(100, 50, 0, 3); // hadap +Z
  assert.ok(Math.abs(g.x - 100) < 1e-9 && Math.abs(g.z - 53) < 1e-9);
  const g2 = brukGuardSpot(100, 50, Math.PI / 2, 3); // hadap +X
  assert.ok(Math.abs(g2.x - 103) < 1e-9 && Math.abs(g2.z - 50) < 1e-9);
});

test('copyPose menyalin semua field', () => {
  const a = pose({ level: 4, time: 2, sinceFirstFire: 1, bearing: 0.4 });
  const b = copyPose(makePose(), a);
  assert.deepEqual(b, a);
});
