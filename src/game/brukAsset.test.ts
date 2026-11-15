import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Gerbang aset Bruk tingkat 2 (model dibuat `tools/make_bruk.py`). Anggaran dari prompt v24:
 * ≤ 3.000 segitiga, ≤ 500 KB, tanpa tekstur gambar (warna + emissive saja).
 */
const BRUK_BUDGET = { maxTriangles: 3000, maxBytes: 500 * 1024 } as const;
const FILE = 'primordia_bruk.glb';

interface GltfNode { name: string; mesh?: number; children?: number[]; translation?: number[] }
interface GltfAccessor { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }

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

const { json, bin, bytes } = readGlb(FILE);
const nodes: GltfNode[] = json.nodes;
const accessors: GltfAccessor[] = json.accessors;
const materialNames: string[] = json.materials.map((m: { name: string }) => m.name);

function vec3(acc: GltfAccessor, i: number): [number, number, number] {
  const v = json.bufferViews[acc.bufferView];
  const o = v.byteOffset + i * 12;
  return [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
}

/** Segitiga = jumlah vertex POSITION / 3 (model tanpa indeks, flat-shaded). */
function triangleCount(): number {
  let verts = 0;
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    assert.equal(p.indices, undefined, 'model Bruk tanpa indeks');
    assert.equal(p.mode, 4, 'hanya TRIANGLES');
    verts += accessors[p.attributes.POSITION].count;
  }
  assert.equal(verts % 3, 0);
  return verts / 3;
}

test(`${FILE}: struktur glTF valid (accessor dalam batas buffer)`, () => {
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.buffers[0].byteLength, bin.length);
  for (const a of accessors) {
    const v = json.bufferViews[a.bufferView];
    const need = a.count * COMP_SIZE[a.componentType] * TYPE_N[a.type];
    assert.ok(v.byteOffset + need <= bin.length, 'accessor melewati buffer');
    assert.ok(need <= v.byteLength);
    assert.equal(v.byteOffset % 4, 0);
  }
});

test(`${FILE}: sesuai anggaran (segitiga, ukuran, tanpa tekstur/kulit/animasi)`, () => {
  const tris = triangleCount();
  assert.ok(tris <= BRUK_BUDGET.maxTriangles, `${tris} segitiga > ${BRUK_BUDGET.maxTriangles}`);
  assert.ok(tris >= 1500, 'model tidak boleh nyaris kosong');
  assert.ok(bytes <= BRUK_BUDGET.maxBytes, `${bytes} byte > ${BRUK_BUDGET.maxBytes}`);
  for (const k of ['images', 'textures', 'samplers', 'skins', 'animations', 'cameras']) {
    assert.equal(json[k], undefined, `tidak boleh ada ${k}`);
  }
  for (const m of json.materials) {
    const p = m.pbrMetallicRoughness ?? {};
    assert.equal(p.baseColorTexture, undefined, `${m.name}: tanpa baseColorTexture`);
    assert.equal(m.emissiveTexture, undefined, `${m.name}: tanpa emissiveTexture`);
    assert.equal(m.normalTexture, undefined, `${m.name}: tanpa normalTexture`);
  }
});

test(`${FILE}: node dan material yang dibutuhkan BrukBody ada, hierarki benar`, () => {
  const names = nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length, 'nama node unik');
  for (const n of ['Bruk', 'Hips', 'LegL', 'LegR', 'Torso', 'Head', 'Eye', 'ArmL', 'ArmR']) assert.ok(names.includes(n), `node ${n}`);
  const parentOf = (child: string): string | null => {
    const ci = names.indexOf(child);
    const p = nodes.find((n) => n.children?.includes(ci));
    return p ? p.name : null;
  };
  assert.equal(parentOf('Bruk'), null);
  assert.equal(parentOf('Hips'), 'Bruk');
  assert.equal(parentOf('Torso'), 'Hips');
  assert.equal(parentOf('Head'), 'Torso');
  assert.equal(parentOf('Eye'), 'Head');
  assert.equal(parentOf('ArmL'), 'Torso');
  assert.equal(parentOf('ArmR'), 'Torso');
  assert.equal(parentOf('LegL'), 'Hips');
  assert.equal(parentOf('LegR'), 'Hips');
  for (const m of ['Lava', 'Eye', 'Basalt', 'BasaltDark', 'Crystal', 'Gold', 'Fang', 'EyeDead']) assert.ok(materialNames.includes(m), `material ${m}`);
});

test(`${FILE}: Lava dan Eye bercahaya (digerakkan per tingkat); batu tidak bercahaya`, () => {
  const mat = (n: string) => json.materials.find((m: { name: string }) => m.name === n);
  for (const n of ['Lava', 'Eye']) assert.ok(Math.max(...mat(n).emissiveFactor) >= 0.5, `${n} emissive`);
  for (const n of ['Basalt', 'BasaltDark', 'Gold', 'Fang', 'EyeDead']) {
    assert.deepEqual(mat(n).emissiveFactor, [0, 0, 0], `${n} tidak bercahaya`);
  }
});

test(`${FILE}: semua posisi dan normal terbatas (bukan NaN) dan normal satuan`, () => {
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const pos = accessors[p.attributes.POSITION];
    const nor = accessors[p.attributes.NORMAL];
    assert.equal(pos.count, nor.count);
    for (let i = 0; i < pos.count; i++) {
      for (const c of vec3(pos, i)) assert.ok(Number.isFinite(c));
      const n = vec3(nor, i);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-3, `normal ${i} tidak satuan`);
    }
  }
});

test(`${FILE}: tinggi ±3,3 m (jauh lebih besar dari manusia 1,8 m), kaki di tanah, tidak terlalu lebar`, () => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const walk = (idx: number, off: [number, number, number]) => {
    const n = nodes[idx];
    const t = n.translation ?? [0, 0, 0];
    const o: [number, number, number] = [off[0] + t[0], off[1] + t[1], off[2] + t[2]];
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        const pos = accessors[p.attributes.POSITION];
        for (let i = 0; i < pos.count; i++) {
          const v = vec3(pos, i);
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], v[k] + o[k]);
            hi[k] = Math.max(hi[k], v[k] + o[k]);
          }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, o);
  };
  walk(0, [0, 0, 0]);
  const height = hi[1] - lo[1];
  assert.ok(height > 3.1 && height < 3.5, `tinggi ${height.toFixed(2)} m`);
  assert.ok(lo[1] > -0.08 && lo[1] < 0.05, `kaki di y=${lo[1].toFixed(3)}`);
  assert.ok(hi[0] - lo[0] < 3.4, `lebar ${(hi[0] - lo[0]).toFixed(2)} m`);
  assert.ok(height > 1.8 * 1.6, 'terbaca jauh lebih besar dari manusia');
  // Simetris kiri-kanan kira-kira (model dibuat cermin): tidak melenceng ke satu sisi.
  assert.ok(Math.abs(hi[0] + lo[0]) < 0.2, 'badan terpusat di x=0');
});
