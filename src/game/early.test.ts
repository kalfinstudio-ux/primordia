// Tes v11: mode HUD, panah tujuan misi, warna medan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD_MODES, hudVisibility, isCriticalState, isHudMode, nextHudMode } from './utils/hudMode';
import { STARTER_POOL, guideKindsForQuest, pickQuestGuide } from './systems/questGuide';
import { sampleTerrainColor } from './world/terrainHeight';
import { createNoise2D } from './world/noise';
import { VOLCANO_MAIN } from './world/biomes';

test('mode HUD berputar Penuh → Ringkas → Bersih → Penuh', () => {
  assert.deepEqual([...HUD_MODES], ['full', 'compact', 'clean']);
  assert.equal(nextHudMode('full'), 'compact');
  assert.equal(nextHudMode('compact'), 'clean');
  assert.equal(nextHudMode('clean'), 'full');
  assert.ok(isHudMode('clean'));
  assert.ok(!isHudMode('xyz'));
});

test('mode Bersih menyembunyikan SEMUA informasi; Penuh menampilkan semuanya', () => {
  const clean = hudVisibility('clean');
  for (const k of ['clock', 'vitalsFull', 'vitalsBasic', 'quest', 'minimap', 'compass', 'hazardPills', 'tutorial', 'controlsHint', 'menuButtons'] as const) {
    assert.equal(clean[k], false, `clean.${k}`);
  }
  assert.equal(clean.toasts, 'none');
  assert.equal(clean.criticalVignette, true, 'isyarat kritis minimal tetap ada');
  const full = hudVisibility('full');
  for (const k of ['clock', 'vitalsFull', 'vitalsBasic', 'quest', 'minimap', 'compass', 'hazardPills', 'tutorial', 'controlsHint', 'menuButtons'] as const) {
    assert.equal(full[k], true, `full.${k}`);
  }
  assert.equal(full.toasts, 'all');
});

test('mode Ringkas: hanya nyawa + peringatan; toast hanya peringatan', () => {
  const c = hudVisibility('compact');
  assert.equal(c.vitalsBasic, true);
  assert.equal(c.vitalsFull, false);
  assert.equal(c.hazardPills, true);
  assert.equal(c.quest, false);
  assert.equal(c.toasts, 'warn');
});

test('kondisi kritis: sesak, nyawa ≤30, air habis', () => {
  assert.equal(isCriticalState({ health: 100, oxygen: 100, water: 100 }, false), false);
  assert.equal(isCriticalState({ health: 100, oxygen: 100, water: 100 }, true), true);
  assert.equal(isCriticalState({ health: 22, oxygen: 100, water: 100 }, false), true);
  assert.equal(isCriticalState({ health: 100, oxygen: 100, water: 2 }, false), true);
});

test('panah misi: q1 menunjuk kolam terdekat; cadangan = kolam awal', () => {
  assert.deepEqual(guideKindsForQuest('q1'), ['water', 'geyser']);
  assert.deepEqual(guideKindsForQuest('q4'), []);
  assert.deepEqual(guideKindsForQuest(null), []);
  assert.equal(pickQuestGuide('q4', 0, 0, []), null);

  const none = pickQuestGuide('q1', 0, 18, [])!;
  assert.equal(none.x, STARTER_POOL.x);
  assert.equal(none.z, STARTER_POOL.z);
  assert.equal(none.kind, 'water');

  const withNode = pickQuestGuide('q1', 100, 100, [{ x: 105, z: 100, kind: 'water' }])!;
  assert.equal(withNode.x, 105);
  assert.ok(Math.abs(withNode.dist - 5) < 1e-9);

  const ignoresOther = pickQuestGuide('q1', 100, 100, [{ x: 101, z: 100, kind: 'crystal' }])!;
  assert.notEqual(ignoresOther.x, 101);
});

test('panah misi: q5 → kristal, q7 → obsidian, q16 → meteor', () => {
  assert.equal(pickQuestGuide('q5', 0, 0, [])!.kind, 'crystal');
  assert.equal(pickQuestGuide('q7', 0, 0, [])!.kind, 'obsidian');
  assert.equal(pickQuestGuide('q16', 0, 0, [])!.kind, 'meteor');
});

test('warna medan: valid 0..1, tebing lebih gelap dari dataran, urat bara menghangat dekat gunung', () => {
  const noise = createNoise2D('uji-warna');
  let minV = 1;
  let maxV = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i * 37) % 900 - 450;
    const z = (i * 91) % 900 - 450;
    const [r, g, b] = sampleTerrainColor(noise, x, z, 2 + (i % 7), (i % 10) / 20);
    for (const c of [r, g, b]) {
      assert.ok(c >= 0 && c <= 1 && Number.isFinite(c), `warna di luar rentang: ${c}`);
      minV = Math.min(minV, c);
      maxV = Math.max(maxV, c);
    }
  }
  assert.ok(maxV - minV > 0.15, 'harus ada variasi warna');

  const lum = (c: number[]) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  let flat = 0;
  let steep = 0;
  for (let i = 0; i < 80; i++) {
    const x = 300 + i * 11;
    const z = -200 + i * 7;
    flat += lum(sampleTerrainColor(noise, x, z, 3, 0));
    steep += lum(sampleTerrainColor(noise, x, z, 3, 0.5));
  }
  assert.ok(steep < flat, 'tebing curam harus lebih gelap');

  // Di cincin 10–40 m dari gunung api ada titik yang jelas lebih merah dari hijau (urat bara)
  let ember = 0;
  for (let i = 0; i < 3000; i++) {
    const a = i * 2.399;
    const r = 10 + (i % 30);
    const c = sampleTerrainColor(noise, VOLCANO_MAIN.x + Math.cos(a) * r, VOLCANO_MAIN.z + Math.sin(a) * r, 6, 0.1);
    if (c[0] - c[1] > 0.2) ember++;
  }
  // Jauh dari gunung api tidak ada urat bara
  let farEmber = 0;
  for (let i = 0; i < 1000; i++) {
    const c = sampleTerrainColor(noise, 900 + i * 0.7, 700 - i * 0.4, 6, 0.1);
    if (c[0] - c[1] > 0.2) farEmber++;
  }
  assert.equal(farEmber, 0, 'tidak ada bara jauh dari gunung api');
  assert.ok(ember > 0, 'harus ada urat bara di kaki gunung');
});

test('warna medan: lebih gelap dari palet lama (tidak lagi pucat)', () => {
  const noise = createNoise2D('uji-gelap');
  let sum = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const c = sampleTerrainColor(noise, 500 + i * 3, 500 - i * 2, 3, 0.05);
    sum += c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  }
  assert.ok(sum / N < 0.2, `luminansi rata-rata ${(sum / N).toFixed(3)} masih terlalu terang`);
});
