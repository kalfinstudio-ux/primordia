#!/usr/bin/env bash
# Jalankan server dev PRIMORDIA dan restart otomatis kalau mati.
# Pakai:  ./tools/keepalive.sh          (foreground)
#         nohup ./tools/keepalive.sh > server.log 2>&1 &   (latar belakang)
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --legacy-peer-deps
while true; do
  echo "[$(date '+%F %T')] start server"
  npm run dev
  echo "[$(date '+%F %T')] server berhenti (kode $?), restart 3 dtk..."
  sleep 3
done
