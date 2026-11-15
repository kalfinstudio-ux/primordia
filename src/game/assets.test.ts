import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_FILES, assetFormat, assetUrl, assetWarnings, isWebLoadable, missingCoreClips,
  parseAssignments, playerModelUrl, sanitizeAssetFile, DEFAULT_PLAYER_MODEL,
  CHARACTER_BUDGET, canAssignRole, characterGate, type CharacterInfo,
} from './data/assets';

test('format dikenali dari ekstensi, tidak peka huruf besar', () => {
  assert.equal(assetFormat('a.GLB'), 'glb');
  assert.equal(assetFormat('Cave.usdz'), 'usdz');
  assert.equal(assetFormat('x.bin'), 'unknown');
  assert.ok(isWebLoadable('gltf') && !isWebLoadable('usdz'));
});

test('nama file aman: tolak path traversal & format tak dikenal', () => {
  assert.equal(sanitizeAssetFile('naked_dude.glb'), 'naked_dude.glb');
  for (const bad of ['../x.glb', 'a/b.glb', 'a\\b.glb', '..glb', 'x.exe', '', '   ', 42, null]) {
    assert.equal(sanitizeAssetFile(bad), null, String(bad));
  }
});

test('url aset di-encode dan semua aset terdaftar valid', () => {
  assert.equal(assetUrl('a b.glb'), './models/a%20b.glb');
  for (const a of ASSET_FILES) assert.ok(sanitizeAssetFile(a.file), a.file);
});

test('pilihan tersimpan dibersihkan; peran/file tak dikenal dibuang', () => {
  const r = parseAssignments({ player: 'naked_dude.glb', adam: '../hack.glb', alien: 'x.glb', hawa: 5 });
  assert.deepEqual(r, { player: 'naked_dude.glb' });
  assert.deepEqual(parseAssignments('rusak'), {});
});

test('model pemain: pilihan pemain atau bawaan', () => {
  assert.equal(playerModelUrl({}), './models/' + DEFAULT_PLAYER_MODEL);
  assert.equal(playerModelUrl({ player: 'naked_dude.glb' }), './models/naked_dude.glb');
});

test('klip inti yang hilang terdeteksi lewat alias', () => {
  assert.deepEqual(missingCoreClips([]), ['idle', 'walk', 'run']);
  assert.deepEqual(missingCoreClips(['Armature|Idle', 'Walking', 'Sprint_fast']), []);
  assert.deepEqual(missingCoreClips(['T-Pose']), ['idle', 'walk', 'run']);
});

test('peringatan: berat, poligon, tanpa animasi, usdz', () => {
  const ok = assetWarnings({ file: 'a.glb', bytes: 200_000, triangles: 5000, clipNames: ['Idle', 'Walk', 'Run'] });
  assert.deepEqual(ok, []);
  const heavy = assetWarnings({ file: 'a.glb', bytes: 3_015_160, triangles: 90_000, clipNames: [] });
  assert.equal(heavy.length, 3);
  assert.ok(heavy[0].includes('MB') && heavy[1].includes('segitiga') && heavy[2].includes('Tanpa animasi'));
  const usdz = assetWarnings({ file: 'Cave.usdz', bytes: null, triangles: 0, clipNames: [] });
  assert.equal(usdz.length, 1);
  assert.ok(usdz[0].includes('konversi'));
});

const goodChar = (over: Partial<CharacterInfo> = {}): CharacterInfo => ({
  file: 'hero.glb', bytes: 1_500_000, triangles: 7_500, clipNames: ['Idle', 'Walking', 'Running', 'Jump'],
  joints: 55, maxTexturePx: 512, license: { license: 'CC0', source: 'contoh' }, ...over,
});

test('gerbang karakter: model sehat lolos tanpa peringatan', () => {
  const g = characterGate(goodChar());
  assert.deepEqual(g, { ok: true, blockers: [], warnings: [] });
});

test('gerbang karakter: tolak tanpa rangka, tanpa klip, klip inti hilang', () => {
  assert.ok(characterGate(goodChar({ joints: 0 })).blockers[0].includes('rangka'));
  assert.ok(characterGate(goodChar({ clipNames: [] })).blockers.some((b) => b.includes('klip')));
  const g = characterGate(goodChar({ clipNames: ['Idle', 'Walk'] }));
  assert.equal(g.ok, false);
  assert.ok(g.blockers[0].includes('run'));
});

test('gerbang karakter: anggaran segitiga, ukuran, tekstur', () => {
  assert.equal(characterGate(goodChar({ triangles: CHARACTER_BUDGET.maxTriangles })).ok, true);
  assert.equal(characterGate(goodChar({ triangles: CHARACTER_BUDGET.maxTriangles + 1 })).ok, false);
  assert.equal(characterGate(goodChar({ bytes: CHARACTER_BUDGET.maxBytes + 1 })).ok, false);
  assert.equal(characterGate(goodChar({ maxTexturePx: 2048 })).ok, false);
  const warn = characterGate(goodChar({ maxTexturePx: 1024 }));
  assert.equal(warn.ok, true);
  assert.equal(warn.warnings.length, 1);
  const manyJoints = characterGate(goodChar({ joints: 200 }));
  assert.equal(manyJoints.ok, true);
  assert.equal(manyJoints.warnings.length, 1);
});

test('gerbang karakter: tanpa lisensi ditolak; format usdz ditolak', () => {
  const g = characterGate(goodChar({ license: null }));
  assert.equal(g.ok, false);
  assert.ok(g.blockers[0].includes('lisensi'));
  assert.equal(characterGate(goodChar({ file: 'a.usdz' })).ok, false);
});

test('canAssignRole: peran karakter wajib lolos gerbang; peran lain bebas', () => {
  const pass = characterGate(goodChar());
  const fail = characterGate(goodChar({ joints: 0 }));
  assert.equal(canAssignRole('player', pass), true);
  assert.equal(canAssignRole('player', fail), false);
  assert.equal(canAssignRole('hawa', null), false);
  assert.equal(canAssignRole('cave', fail), true);
  assert.equal(canAssignRole('animal', null), true);
});
