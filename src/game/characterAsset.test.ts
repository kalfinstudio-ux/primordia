import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSET_LICENSES, CORE_CLIPS, characterGate, missingCoreClips, CLIP_ALIASES } from './data/assets';

/** Baca .glb tanpa three: kembalikan JSON + buffer biner. */
function readGlb(file: string) {
  const buf = readFileSync(new URL(`../../public/play/models/${file}`, import.meta.url));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'magic glTF');
  assert.equal(buf.readUInt32LE(8), buf.length, 'panjang header = ukuran berkas');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin, bytes: buf.length };
}

const COMP_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_N: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

for (const file of ['primordia_adam.glb', 'primordia_hawa.glb']) {
  const { json, bin, bytes } = readGlb(file);

  test(`${file}: struktur glTF valid (accessor dalam batas buffer)`, () => {
    assert.equal(json.asset.version, '2.0');
    assert.equal(json.buffers[0].byteLength, bin.length);
    for (const a of json.accessors) {
      const v = json.bufferViews[a.bufferView];
      const need = a.count * COMP_SIZE[a.componentType] * TYPE_N[a.type];
      assert.ok(v.byteOffset + need <= bin.length, 'accessor melewati buffer');
      assert.ok(need <= v.byteLength);
      assert.equal(v.byteOffset % 4, 0);
    }
  });

  test(`${file}: indeks, sendi, dan bobot kulit benar`, () => {
    const nJoints = json.skins[0].joints.length;
    for (const prim of json.meshes[0].primitives) {
      const pos = json.accessors[prim.attributes.POSITION];
      const idx = json.accessors[prim.indices];
      const iv = json.bufferViews[idx.bufferView];
      for (let i = 0; i < idx.count; i++) assert.ok(bin.readUInt16LE(iv.byteOffset + i * 2) < pos.count);
      const jv = json.bufferViews[json.accessors[prim.attributes.JOINTS_0].bufferView];
      const wv = json.bufferViews[json.accessors[prim.attributes.WEIGHTS_0].bufferView];
      for (let i = 0; i < pos.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const w = bin.readFloatLE(wv.byteOffset + (i * 4 + k) * 4);
          const j = bin.readUInt8(jv.byteOffset + i * 4 + k);
          assert.ok(j < nJoints);
          if (w === 0) assert.ok(true);
          sum += w;
        }
        assert.ok(Math.abs(sum - 1) < 1e-4, `bobot vertex ${i} berjumlah ${sum}`);
      }
    }
  });

  test(`${file}: klip inti ada dan semua animasi menunjuk node valid`, () => {
    const names: string[] = json.animations.map((a: { name: string }) => a.name);
    assert.deepEqual(missingCoreClips(names), []);
    for (const state of Object.keys(CLIP_ALIASES)) {
      assert.ok(names.some((n) => CLIP_ALIASES[state].some((al) => n.toLowerCase().includes(al))), `klip ${state}`);
    }
    for (const anim of json.animations) {
      for (const ch of anim.channels) assert.ok(ch.target.node < json.nodes.length);
    }
  });

  test(`${file}: lolos gerbang karakter (anggaran HP lama + lisensi)`, () => {
    let tris = 0;
    for (const prim of json.meshes[0].primitives) tris += json.accessors[prim.indices].count / 3;
    const gate = characterGate({
      file,
      bytes,
      triangles: tris,
      clipNames: json.animations.map((a: { name: string }) => a.name),
      joints: json.skins[0].joints.length,
      maxTexturePx: json.images?.length ? 9999 : 0,
      license: ASSET_LICENSES[file] ?? null,
    });
    assert.deepEqual(gate.blockers, []);
    assert.equal(gate.ok, true);
    assert.ok(CORE_CLIPS.length === 3);
  });
}
