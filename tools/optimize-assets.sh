#!/usr/bin/env bash
# Audit + kompres + konversi aset 3D (butuh @gltf-transform/cli; `npx` mengunduh sekali saat online
# atau install global: `npm i -g @gltf-transform/cli`; Blender opsional untuk .usdz/.fbx/.obj).
#
# Pemakaian:
#   ./tools/optimize-assets.sh [character|prop] <berkas1.glb> [berkas2.usdz ...]
# Contoh:
#   ./tools/optimize-assets.sh character raw/hero.glb
#   ./tools/optimize-assets.sh prop raw/cave.glb
#
# Anggaran:
#   character : <= 1.0 MB, <= 30.000 segitiga, tekstur <= 1024px WebP, meshopt
#   prop      : <= 300 KB, tekstur <= 512px WebP, meshopt
#   total     : folder public/play/models/ <= 15 MB
set -euo pipefail

MODE="character"
if [ "${1:-}" = "character" ] || [ "${1:-}" = "prop" ]; then
  MODE="$1"
  shift
fi

if [ "$#" -eq 0 ]; then
  echo "Pemakaian: $0 [character|prop] <berkas...>"
  exit 1
fi

TEX_SIZE=1024
MAX_TRIS=30000
if [ "$MODE" = "prop" ]; then
  TEX_SIZE=512
  MAX_TRIS=15000
fi

OUT_DIR="public/play/models"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$OUT_DIR"

CLI="npx --yes @gltf-transform/cli"

for f in "$@"; do
  b="$(basename "${f%.*}")"
  in="$f"
  case "${f,,}" in
    *.glb|*.gltf) ;;
    *.usdz)
      blender -b --python-expr "import bpy;bpy.ops.wm.usd_import(filepath='$f');bpy.ops.export_scene.gltf(filepath='$TMP_DIR/$b.raw.glb')"
      in="$TMP_DIR/$b.raw.glb"
      ;;
    *)
      echo "Format tidak didukung langsung: $f (konversi ke .glb dulu)" >&2
      exit 1
      ;;
  esac

  # Konversi KHR_materials_pbrSpecularGlossiness -> metal-roughness bila ada, lalu cek segitiga.
  work="$TMP_DIR/$b.mr.glb"
  $CLI metalrough "$in" "$work" >/dev/null 2>&1 || cp "$in" "$work"

  tris="$(node -e '
    const fs = require("fs");
    const buf = fs.readFileSync(process.argv[1]);
    if (buf.readUInt32LE(0) === 0x46546c67) {
      const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
      let t = 0;
      for (const m of j.meshes || []) for (const p of m.primitives || []) {
        const c = p.indices !== undefined ? j.accessors[p.indices]?.count : j.accessors[p.attributes?.POSITION]?.count;
        t += (c || 0) / 3;
      }
      console.log(Math.round(t));
    } else console.log(0);
  ' "$work")"

  if [ "${tris:-0}" -gt "$MAX_TRIS" ]; then
    ratio="$(node -e "console.log(Math.max(0.15, ($MAX_TRIS * 0.9 / $tris)).toFixed(2))")"
    sim="$TMP_DIR/$b.sim.glb"
    echo "[simplify] $b: $tris tris > $MAX_TRIS -> ratio $ratio"
    $CLI simplify "$work" "$sim" --ratio "$ratio" --error 0.01
    work="$sim"
  fi

  $CLI optimize "$work" "$OUT_DIR/$b.glb" \
    --compress meshopt \
    --texture-compress webp \
    --texture-size "$TEX_SIZE" \
    --simplify true
done

node tools/audit-assets.mjs
