#!/usr/bin/env bash
# Kompres + konversi aset 3D (butuh internet sekali untuk npx). Hasil -> public/models
# Pakai: ./tools/optimize-assets.sh ~/unduhan/*.glb
set -e
mkdir -p public/models
for f in "$@"; do
  b=$(basename "${f%.*}")
  case "$f" in
    *.glb) in="$f" ;;
    *.usdz) # USDZ -> GLB dulu (butuh Blender: brew/apt install blender)
      blender -b --python-expr "import bpy;bpy.ops.wm.usd_import(filepath='$f');bpy.ops.export_scene.gltf(filepath='/tmp/$b.glb')"
      in="/tmp/$b.glb" ;;
  esac
  npx -y @gltf-transform/cli optimize "$in" "public/models/$b.glb" \
    --compress meshopt --texture-compress webp --texture-size 1024 --simplify true
done
ls -lh public/models
