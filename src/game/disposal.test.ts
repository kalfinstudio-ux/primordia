import test from 'node:test';
import assert from 'node:assert/strict';
import { disposeObject3D, isShared, markShared, type DisposableLike, type Object3DLike } from './world/disposal';

function res(): DisposableLike & { n: number } {
  const r: DisposableLike & { n: number } = { n: 0, userData: {}, dispose() { r.n++; } };
  return r;
}
function mesh(geometry?: DisposableLike, material?: DisposableLike | DisposableLike[]): Object3DLike {
  const o: Object3DLike = { geometry, material, traverse: (cb) => cb(o) };
  return o;
}
function group(children: Object3DLike[]): Object3DLike {
  const g: Object3DLike = { traverse: (cb) => { cb(g); children.forEach((c) => c.traverse(cb)); } };
  return g;
}

test('membuang geometri & material milik chunk', () => {
  const g1 = res(), m1 = res(), g2 = res(), m2 = res();
  const stats = disposeObject3D(group([mesh(g1, m1), group([mesh(g2, m2)])]));
  assert.deepEqual([g1.n, m1.n, g2.n, m2.n], [1, 1, 1, 1]);
  assert.equal(stats.geometries, 2);
  assert.equal(stats.materials, 2);
});

test('sumber daya bersama tidak dibuang', () => {
  const shared = markShared(res());
  const own = res();
  const stats = disposeObject3D(group([mesh(own, shared), mesh(shared as DisposableLike, own)]));
  assert.equal(shared.n, 0);
  assert.equal(own.n, 1); // dipakai dua mesh, dibuang sekali
  assert.ok(stats.skippedShared >= 1);
  assert.ok(isShared(shared));
  assert.ok(!isShared(own));
});

test('material array & objek tanpa geometri aman', () => {
  const a = res(), b = res(), g = res();
  disposeObject3D(group([mesh(g, [a, b]), mesh(undefined, undefined)]));
  assert.deepEqual([a.n, b.n, g.n], [1, 1, 1]);
});

test('markShared pada objek tanpa userData', () => {
  const r: DisposableLike = { dispose() {} };
  markShared(r);
  assert.ok(isShared(r));
});
