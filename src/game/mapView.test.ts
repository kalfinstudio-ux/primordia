import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SPAN,
  clampToWorld,
  clampView,
  formatDistance,
  gridStep,
  maxSpan,
  panBy,
  pickTarget,
  scaleBarMeters,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './world/mapView';

const HALF = 2048;
const SIZE = 400;

test('worldToScreen dan screenToWorld saling balik', () => {
  const v = { cx: 120, cz: -300, span: 900 };
  const s = worldToScreen(v, SIZE, 500, 250);
  const w = screenToWorld(v, SIZE, s.x, s.y);
  assert.ok(Math.abs(w.x - 500) < 1e-9 && Math.abs(w.z - 250) < 1e-9);
  const c = worldToScreen(v, SIZE, v.cx, v.cz);
  assert.equal(c.x, SIZE / 2);
  assert.equal(c.y, SIZE / 2);
});

test('zoomAt menjaga titik di bawah jari tetap diam', () => {
  const v = { cx: 0, cz: 0, span: 1600 };
  const before = screenToWorld(v, SIZE, 300, 100);
  const z = zoomAt(v, SIZE, 300, 100, 0.5, HALF);
  const after = screenToWorld(z, SIZE, 300, 100);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.z - after.z) < 1e-6);
  assert.equal(z.span, 800);
});

test('zoom dan geser selalu dibatasi', () => {
  const tiny = zoomAt({ cx: 0, cz: 0, span: 200 }, SIZE, 200, 200, 0.001, HALF);
  assert.equal(tiny.span, MIN_SPAN);
  const huge = zoomAt({ cx: 0, cz: 0, span: 2000 }, SIZE, 200, 200, 1000, HALF);
  assert.equal(huge.span, maxSpan(HALF));
  const far = panBy({ cx: 2000, cz: 0, span: 800 }, SIZE, -5000, 0, HALF);
  assert.equal(far.cx, HALF);
  assert.deepEqual(clampView({ cx: -9999, cz: 9999, span: 1 }, HALF), { cx: -HALF, cz: HALF, span: MIN_SPAN });
});

test('panBy menggeser peta searah jari', () => {
  const v = panBy({ cx: 0, cz: 0, span: 800 }, SIZE, 100, 0, HALF);
  assert.equal(v.cx, -200); // jari ke kanan → dunia tampak bergeser ke kanan → pusat ke kiri
});

test('pickTarget memilih yang terdekat dalam radius', () => {
  const v = { cx: 0, cz: 0, span: 400 };
  const targets = [
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 30, z: 0 },
  ];
  assert.equal(pickTarget(v, SIZE, 205, 200, targets, 20)?.id, 'a');
  assert.equal(pickTarget(v, SIZE, 232, 200, targets, 20)?.id, 'b');
  assert.equal(pickTarget(v, SIZE, 390, 390, targets, 20), null);
});

test('grid, batang skala, jarak, dan clamp dunia', () => {
  assert.ok(gridStep(4096, SIZE) >= 256);
  assert.ok(gridStep(200, SIZE) <= 32);
  assert.ok(scaleBarMeters(1000, SIZE, 120) * (SIZE / 1000) <= 120);
  assert.equal(formatDistance(850), '850 m');
  assert.equal(formatDistance(1500), '1.50 km');
  assert.deepEqual(clampToWorld(5000, -5000, HALF), { x: HALF, z: -HALF });
});
