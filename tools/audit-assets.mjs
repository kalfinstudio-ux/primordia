#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/play/models';
const CHAR_MAX_BYTES = 1024 * 1024;
const CHAR_MAX_TRIS = 30_000;
const FOLDER_MAX_BYTES = 15 * 1024 * 1024;

function parseGlbSummary(filePath) {
  const buf = readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    return { bytes: buf.length, tris: 0, meshes: 0, joints: 0, textures: [], anims: [], exts: [] };
  }
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let tris = 0;
  for (const m of j.meshes || []) {
    for (const p of m.primitives || []) {
      const idx = p.indices !== undefined ? j.accessors[p.indices]?.count : j.accessors[p.attributes?.POSITION]?.count;
      tris += (idx || 0) / 3;
    }
  }
  const uniqueBones = new Set();
  for (const sk of j.skins || []) for (const nodeIdx of sk.joints || []) uniqueBones.add(nodeIdx);
  return {
    bytes: buf.length,
    tris: Math.round(tris),
    meshes: (j.meshes || []).length,
    joints: uniqueBones.size,
    textures: (j.images || []).map((im) => im.mimeType || 'img'),
    anims: (j.animations || []).map((a) => a.name || '(tanpa nama)'),
    exts: j.extensionsUsed || [],
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.glb') || f.endsWith('.gltf')).sort();
let totalBytes = 0;
const rows = [];

for (const file of files) {
  const info = parseGlbSummary(join(DIR, file));
  totalBytes += info.bytes;
  rows.push({
    file,
    kb: `${(info.bytes / 1024).toFixed(1)} KB`,
    tris: info.tris,
    meshes: info.meshes,
    joints: info.joints,
    textures: info.textures.length > 0 ? `${info.textures.length} (${[...new Set(info.textures)].join(',')})` : '0',
    clips: info.anims.length,
    exts: info.exts.join(', ') || '-',
    budgetOk: info.bytes <= CHAR_MAX_BYTES && info.tris <= CHAR_MAX_TRIS ? 'PASS' : 'OVER',
  });
}

console.table(rows);
console.log(`Total public/play/models/: ${(totalBytes / 1048576).toFixed(2)} MB (budget <= ${(FOLDER_MAX_BYTES / 1048576).toFixed(0)} MB)`);
if (totalBytes > FOLDER_MAX_BYTES) process.exitCode = 1;
