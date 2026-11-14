import React, { useEffect, useRef, useState } from 'react';
import { Compass, MapPin, Navigation } from 'lucide-react';
import { CHUNK_SIZE, WORLD_HALF_EXTENT } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { fastTravelToBeacon } from '../game/main';
import { WORLD_POIS } from '../game/world/biomes';
import { t } from '../game/utils/i18n';

export function MapScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedBeacon, setSelectedBeacon] = useState<{ id: string; x: number; z: number } | null>(null);
  const [waypoints, setWaypoints] = useState(() => [...gameState.customWaypoints]);

  const beacons = gameState.placedStructures.filter((s) => s.type === 'fast_beacon');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const half = w / 2;
    const scale = half / WORLD_HALF_EXTENT;

    // Unexplored fog background
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines every 512m
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1;
    for (let m = -WORLD_HALF_EXTENT; m <= WORLD_HALF_EXTENT; m += 512) {
      const p = half + m * scale;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }

    // Fog-of-war revealed chunks (64m sectors)
    const chunkPx = Math.max(4, CHUNK_SIZE * scale);
    ctx.fillStyle = '#29211d';
    for (const key of gameState.discoveredChunks) {
      const [cxStr, czStr] = key.split(',');
      const wx = Number(cxStr) * CHUNK_SIZE;
      const wz = Number(czStr) * CHUNK_SIZE;
      ctx.fillRect(half + wx * scale - chunkPx / 2, half + wz * scale - chunkPx / 2, chunkPx, chunkPx);
    }

    // World POIs (dimmed if undiscovered, bright if discovered)
    for (const poi of WORLD_POIS) {
      const discovered = gameState.discoveredPois.some((d) => d.id === poi.id);
      const px = half + poi.x * scale;
      const pz = half + poi.z * scale;
      ctx.fillStyle = poi.kind === 'volcano' ? '#ef4444' : poi.kind === 'geyser' ? '#38bdf8' : poi.kind === 'meteor_site' ? '#a855f7' : '#f59e0b';
      ctx.globalAlpha = discovered ? 1 : 0.45;
      ctx.beginPath();
      ctx.arc(px, pz, poi.kind === 'volcano' ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fast-travel beacons
    for (const b of beacons) {
      const bx = half + b.x * scale;
      const bz = half + b.z * scale;
      ctx.strokeStyle = selectedBeacon?.id === b.id ? '#ffffff' : '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, bz, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(bx, bz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Custom waypoints
    for (const wp of waypoints) {
      const wx = half + wp.x * scale;
      const wz = half + wp.z * scale;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(wx, wz - 7);
      ctx.lineTo(wx + 5, wz + 3);
      ctx.lineTo(wx - 5, wz + 3);
      ctx.closePath();
      ctx.fill();
    }

    // Explorer position
    const px = half + gameState.playerPos.x * scale;
    const pz = half + gameState.playerPos.z * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, pz, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [beacons, selectedBeacon, waypoints]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const half = canvas.width / 2;
    const wx = ((cx - half) / half) * WORLD_HALF_EXTENT;
    const wz = ((cy - half) / half) * WORLD_HALF_EXTENT;

    // Check if user clicked near a placed beacon
    const hitBeacon = beacons.find((b) => Math.hypot(b.x - wx, b.z - wz) < 160);
    if (hitBeacon) {
      setSelectedBeacon({ id: hitBeacon.id, x: hitBeacon.x, z: hitBeacon.z });
      return;
    }

    // Otherwise place or replace custom waypoint
    const nextWp = { id: 'wp_custom', x: Math.round(wx), z: Math.round(wz), label: 'Waypoint' };
    gameState.customWaypoints = [nextWp];
    setWaypoints([nextWp]);
    setSelectedBeacon(null);
  };

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.88)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-orange-400" />
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-100">{t('map.title')}</h2>
          </div>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[40px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('map.close')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-3">
          <div className="flex justify-center md:col-span-2">
            <canvas
              ref={canvasRef}
              width={420}
              height={420}
              onClick={handleCanvasClick}
              className="aspect-square w-full max-w-[380px] cursor-crosshair rounded-lg border border-stone-700"
            />
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/60 p-3.5 text-xs">
            <div className="space-y-2.5">
              <div className="font-semibold text-stone-200">{t('map.legend')}</div>
              <div className="flex items-center gap-2 text-stone-300">
                <span className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-orange-500" />
                <span>{t('map.player')} ({Math.round(gameState.playerPos.x)}m, {Math.round(gameState.playerPos.z)}m)</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>{t('map.beacon')} ({beacons.length})</span>
              </div>
              <div className="flex items-center gap-2 text-amber-300">
                <MapPin className="h-3.5 w-3.5" />
                <span>{t('map.poi')} ({gameState.discoveredPois.length}/{WORLD_POIS.length})</span>
              </div>
              <div className="text-stone-400">
                {t('map.discoveredChunks')}: <span className="font-mono-tabular text-stone-200">{gameState.discoveredChunks.length}</span>
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-stone-400">{t('map.clickHint')}</p>
            </div>

            <div className="space-y-2 border-t border-stone-800 pt-3">
              {selectedBeacon && (
                <button
                  type="button"
                  onClick={() => fastTravelToBeacon(selectedBeacon.x, selectedBeacon.z)}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {t('map.fastTravel')}
                </button>
              )}
              {waypoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    gameState.customWaypoints = [];
                    setWaypoints([]);
                  }}
                  className="min-h-[38px] w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-800"
                >
                  {t('map.clearWaypoint')} ({waypoints[0].x}m, {waypoints[0].z}m)
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
