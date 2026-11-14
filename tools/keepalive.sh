#!/usr/bin/env bash
# Server dev PRIMORDIA anti-mati:
#  - restart otomatis kalau proses berhenti
#  - watchdog: kalau port 3000 tidak menjawab 3x berturut-turut, server di-restart paksa
#  - satu instance saja (lock) supaya tidak dobel
# Pakai:  nohup ./tools/keepalive.sh > server.log 2>&1 &
# Stop :  ./tools/keepalive.sh stop
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
LOCK=".keepalive.pid"

if [ "$1" = "stop" ]; then
  [ -f "$LOCK" ] && kill "$(cat "$LOCK")" 2>/dev/null; pkill -f "vite --port=$PORT" 2>/dev/null
  rm -f "$LOCK"; echo "server dihentikan"; exit 0
fi

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "keepalive sudah berjalan (PID $(cat "$LOCK")). Pakai './tools/keepalive.sh stop' dulu."; exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"; pkill -P $$ 2>/dev/null; exit 0' INT TERM

[ -d node_modules ] || npm install --legacy-peer-deps

up() { curl -fsS -m 4 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; }

while true; do
  echo "[$(date '+%F %T')] start server :$PORT"
  pkill -f "vite --port=$PORT" 2>/dev/null; sleep 1
  npm run dev &
  SRV=$!
  fails=0; sleep 15
  while kill -0 "$SRV" 2>/dev/null; do
    if up; then fails=0; else fails=$((fails+1)); fi
    if [ "$fails" -ge 3 ]; then echo "[$(date '+%F %T')] tidak merespons, restart paksa"; kill "$SRV" 2>/dev/null; break; fi
    sleep 10
  done
  wait "$SRV" 2>/dev/null
  echo "[$(date '+%F %T')] server berhenti, restart 3 dtk..."; sleep 3
done
