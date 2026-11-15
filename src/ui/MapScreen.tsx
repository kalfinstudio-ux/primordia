import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Crosshair, Globe, MapPin, Minus, Navigation, Plus } from 'lucide-react';
import { CHUNK_SIZE, WORLD_HALF_EXTENT } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { fastTravelToBeacon } from '../game/main';
import { WORLD_POIS } from '../game/world/biomes';
import {
  type MapView,
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
} from '../game/world/mapView';
import { t } from '../game/utils/i18n';
import { MAX_TIER, SPAWN_POINT, TIER_RADII, dangerLevel, getRegionAt, regionLabel } from '../game/world/regions';

type Selected =
  | { type: 'beacon'; id: string; x: number; z: number }
  | { type: 'poi'; id: string; x: number; z: number; discovered: boolean; labelKey: string };

const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
const HIT_RADIUS_PX = 24;
const LABEL_MAX_SPAN = 1200;

const POI_COLOR: Record<string, string> = {
  volcano: '#ef4444',
  geyser: '#38bdf8',
  meteor_site: '#a855f7',
  crater: '#f59e0b',
  obsidian_crevasse: '#94a3b8',
  lava_tube: '#fb923c',
  hot_spring: '#2dd4bf',
};

/** Warna latar tiap tingkat bahaya (makin jauh makin merah-gelap). */
const TIER_BG = ['#0c0a09', '#100c0a', '#150d0a', '#1b0e0a', '#230f0b'];

function initialView(): MapView {
  return clampView({ cx: gameState.playerPos.x, cz: gameState.playerPos.z, span: 1000 }, WORLD_HALF_EXTENT);
}

export function MapScreen() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<MapView>(initialView());
  const sizeRef = useRef({ css: 380, dpr: 1 });
  const rafRef = useRef(0);
  const drawRef = useRef<() => void>(() => {});
  const chunkCache = useRef<{ n: number; cells: Array<[number, number]> }>({ n: -1, cells: [] });

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ sx: 0, sy: 0, t0: 0, moved: false, pinch: 0 });

  const [selected, setSelected] = useState<Selected | null>(null);
  const [waypoints, setWaypoints] = useState(() => [...gameState.customWaypoints]);

  const beacons = gameState.placedStructures.filter((s) => s.type === 'fast_beacon');

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawRef.current();
    });
  }, []);

  const setView = useCallback(
    (v: MapView) => {
      viewRef.current = v;
      schedule();
    },
    [schedule]
  );

  // ---- Menggambar -------------------------------------------------------
  drawRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { css: size, dpr } = sizeRef.current;
    const v = viewRef.current;
    const half = WORLD_HALF_EXTENT;
    const px = (m: number) => (m * size) / v.span;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#070605';
    ctx.fillRect(0, 0, size, size);

    // Area dunia
    const tl = worldToScreen(v, size, -half, -half);
    const worldPx = px(half * 2);
    ctx.fillStyle = TIER_BG[MAX_TIER];
    ctx.fillRect(tl.x, tl.y, worldPx, worldPx);
    const spawnS = worldToScreen(v, size, SPAWN_POINT.x, SPAWN_POINT.z);
    for (let i = TIER_RADII.length - 1; i >= 0; i--) {
      ctx.fillStyle = TIER_BG[i];
      ctx.beginPath();
      ctx.arc(spawnS.x, spawnS.y, px(TIER_RADII[i]), 0, Math.PI * 2);
      ctx.fill();
    }

    // Grid adaptif
    const step = gridStep(v.span, size);
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let m = -half; m <= half; m += step) {
      const a = worldToScreen(v, size, m, m);
      if (a.x >= 0 && a.x <= size) {
        ctx.moveTo(a.x, Math.max(0, tl.y));
        ctx.lineTo(a.x, Math.min(size, tl.y + worldPx));
      }
      if (a.y >= 0 && a.y <= size) {
        ctx.moveTo(Math.max(0, tl.x), a.y);
        ctx.lineTo(Math.min(size, tl.x + worldPx), a.y);
      }
    }
    ctx.stroke();

    // Fog-of-war: sektor terjelajahi (cache hasil parse)
    const dc = gameState.discoveredChunks;
    if (chunkCache.current.n !== dc.length) {
      chunkCache.current = {
        n: dc.length,
        cells: dc.map((k) => {
          const [a, b] = k.split(',');
          return [Number(a) * CHUNK_SIZE, Number(b) * CHUNK_SIZE] as [number, number];
        }),
      };
    }
    const cell = Math.max(3, px(CHUNK_SIZE));
    ctx.fillStyle = '#2d241f';
    for (const [wx, wz] of chunkCache.current.cells) {
      const s = worldToScreen(v, size, wx, wz);
      if (s.x + cell < 0 || s.y + cell < 0 || s.x - cell > size || s.y - cell > size) continue;
      ctx.fillRect(s.x - cell / 2, s.y - cell / 2, cell, cell);
    }

    // Batas dunia
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, worldPx, worldPx);

    // Cincin tingkat bahaya + nama wilayah (saat zoom keluar)
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(180,83,9,0.35)';
    ctx.lineWidth = 1;
    for (const r of TIER_RADII) {
      ctx.beginPath();
      ctx.arc(spawnS.x, spawnS.y, px(r), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (v.span > LABEL_MAX_SPAN) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= MAX_TIER; i++) {
        const inner = i === 0 ? 0 : TIER_RADII[i - 1];
        const outer = i < MAX_TIER ? TIER_RADII[i] : TIER_RADII[MAX_TIER - 1] + 170;
        const mid = i === 0 ? 0 : (inner + outer) / 2;
        const lp = worldToScreen(v, size, SPAWN_POINT.x, SPAWN_POINT.z - mid - (i === 0 ? 0 : 0));
        if (lp.x < 20 || lp.y < 8 || lp.x > size - 20 || lp.y > size - 8) continue;
        const text = `${t(`regions.tier.${i}`)} · ${t('regions.danger')} ${dangerLevel(i)}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,8,7,0.9)';
        ctx.strokeText(text, lp.x, lp.y + (i === 0 ? 16 : 0));
        ctx.fillStyle = i >= 3 ? '#fca5a5' : '#a8a29e';
        ctx.fillText(text, lp.x, lp.y + (i === 0 ? 16 : 0));
      }
      ctx.textAlign = 'start';
    }

    // Titik penting
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const poi of WORLD_POIS) {
      const s = worldToScreen(v, size, poi.x, poi.z);
      if (s.x < -20 || s.y < -20 || s.x > size + 20 || s.y > size + 20) continue;
      const found = gameState.discoveredPois.some((d) => d.id === poi.id);
      const color = POI_COLOR[poi.kind] ?? '#f59e0b';
      ctx.globalAlpha = found ? 1 : 0.5;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const r = found ? 6 : 4.5;
      ctx.beginPath();
      if (poi.kind === 'volcano') {
        ctx.moveTo(s.x, s.y - r - 1);
        ctx.lineTo(s.x + r + 1, s.y + r);
        ctx.lineTo(s.x - r - 1, s.y + r);
        ctx.closePath();
        ctx.fill();
      } else if (poi.kind === 'meteor_site') {
        ctx.moveTo(s.x, s.y - r - 1);
        ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r + 1);
        ctx.lineTo(s.x - r, s.y);
        ctx.closePath();
        ctx.fill();
      } else if (poi.kind === 'crater') {
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (poi.kind === 'obsidian_crevasse') {
        ctx.fillRect(s.x - r + 1, s.y - r + 1, (r - 1) * 2, (r - 1) * 2);
      } else {
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (found && v.span <= LABEL_MAX_SPAN) {
        const label = t(poi.labelKey);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,8,7,0.9)';
        ctx.strokeText(label, s.x + r + 5, s.y);
        ctx.fillStyle = '#e7e5e4';
        ctx.fillText(label, s.x + r + 5, s.y);
      }
    }

    // Suar teleportasi
    for (const b of beacons) {
      const s = worldToScreen(v, size, b.x, b.z);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pemain + garis putus ke penanda
    const me = worldToScreen(v, size, gameState.playerPos.x, gameState.playerPos.z);
    const wp = gameState.customWaypoints[0];
    if (wp) {
      const w = worldToScreen(v, size, wp.x, wp.z);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(251,191,36,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(me.x, me.y);
      ctx.lineTo(w.x, w.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - 10);
      ctx.lineTo(w.x + 7, w.y + 4);
      ctx.lineTo(w.x - 7, w.y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (selected) {
      const s = worldToScreen(v, size, selected.x, selected.z);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(me.x, me.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Batang skala
    const bar = scaleBarMeters(v.span, size, size * 0.3);
    const barPx = px(bar);
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, size - 14);
    ctx.lineTo(12 + barPx, size - 14);
    ctx.moveTo(12, size - 19);
    ctx.lineTo(12, size - 9);
    ctx.moveTo(12 + barPx, size - 19);
    ctx.lineTo(12 + barPx, size - 9);
    ctx.stroke();
    ctx.fillStyle = '#d6d3d1';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formatDistance(bar), 12, size - 24);
  };

  useEffect(() => {
    schedule();
  });

  // ---- Ukuran kanvas (HiDPI) + roda mouse ------------------------------
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const css = Math.max(200, Math.floor(wrap.clientWidth));
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { css, dpr };
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      canvas.style.height = `${css}px`;
      schedule();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    window.addEventListener('resize', resize);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(e.deltaY * 0.0015);
      setView(zoomAt(viewRef.current, sizeRef.current.css, e.clientX - rect.left, e.clientY - rect.top, factor, WORLD_HALF_EXTENT));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [schedule, setView]);

  // ---- Ketuk ------------------------------------------------------------
  const handleTap = (sx: number, sy: number) => {
    const v = viewRef.current;
    const size = sizeRef.current.css;

    const hitBeacon = pickTarget(v, size, sx, sy, beacons, HIT_RADIUS_PX);
    if (hitBeacon) {
      setSelected({ type: 'beacon', id: hitBeacon.id, x: hitBeacon.x, z: hitBeacon.z });
      return;
    }
    const pois = WORLD_POIS.map((p) => ({ ...p }));
    const hitPoi = pickTarget(v, size, sx, sy, pois, HIT_RADIUS_PX);
    if (hitPoi) {
      const discovered = gameState.discoveredPois.some((d) => d.id === hitPoi.id);
      setSelected({ type: 'poi', id: hitPoi.id, x: hitPoi.x, z: hitPoi.z, discovered, labelKey: hitPoi.labelKey });
      return;
    }
    const w = screenToWorld(v, size, sx, sy);
    const c = clampToWorld(w.x, w.z, WORLD_HALF_EXTENT);
    placeWaypoint(c.x, c.z);
    setSelected(null);
  };

  const placeWaypoint = (x: number, z: number) => {
    const next = { id: 'wp_custom', x, z, label: 'Waypoint' };
    gameState.customWaypoints = [next];
    setWaypoints([next]);
    schedule();
  };

  // ---- Pointer: geser, cubit, ketuk -------------------------------------
  const localPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPos(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer sudah dilepas */
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.sx = p.x;
      g.sy = p.y;
      g.t0 = performance.now();
      g.moved = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      g.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = localPos(e);
    const g = gesture.current;
    const size = sizeRef.current.css;

    if (pointers.current.size >= 2) {
      const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
      const o = others[0][1];
      const oldMid = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 };
      const newMid = { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 };
      const newDist = Math.hypot(p.x - o.x, p.y - o.y);
      let v = viewRef.current;
      if (g.pinch > 8 && newDist > 8) v = zoomAt(v, size, newMid.x, newMid.y, g.pinch / newDist, WORLD_HALF_EXTENT);
      v = panBy(v, size, newMid.x - oldMid.x, newMid.y - oldMid.y, WORLD_HALF_EXTENT);
      g.pinch = newDist;
      pointers.current.set(e.pointerId, p);
      setView(v);
      return;
    }

    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > TAP_SLOP_PX) g.moved = true;
    if (g.moved) setView(panBy(viewRef.current, size, p.x - prev.x, p.y - prev.y, WORLD_HALF_EXTENT));
    pointers.current.set(e.pointerId, p);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasSingle = pointers.current.size === 1;
    const p = localPos(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (wasSingle && !g.moved && performance.now() - g.t0 <= TAP_MAX_MS) handleTap(p.x, p.y);
    if (pointers.current.size === 1) {
      // Satu jari tersisa setelah cubit: jangan dihitung sebagai ketuk
      const rest = [...pointers.current.values()][0];
      g.sx = rest.x;
      g.sy = rest.y;
      g.moved = true;
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const size = sizeRef.current.css;
    const v = viewRef.current;
    const step = size * 0.15;
    const map: Record<string, () => MapView> = {
      ArrowLeft: () => panBy(v, size, step, 0, WORLD_HALF_EXTENT),
      ArrowRight: () => panBy(v, size, -step, 0, WORLD_HALF_EXTENT),
      ArrowUp: () => panBy(v, size, 0, step, WORLD_HALF_EXTENT),
      ArrowDown: () => panBy(v, size, 0, -step, WORLD_HALF_EXTENT),
      '+': () => zoomAt(v, size, size / 2, size / 2, 0.7, WORLD_HALF_EXTENT),
      '=': () => zoomAt(v, size, size / 2, size / 2, 0.7, WORLD_HALF_EXTENT),
      '-': () => zoomAt(v, size, size / 2, size / 2, 1.4, WORLD_HALF_EXTENT),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      setView(fn());
    }
  };

  const zoomBy = (factor: number) => {
    const size = sizeRef.current.css;
    setView(zoomAt(viewRef.current, size, size / 2, size / 2, factor, WORLD_HALF_EXTENT));
  };
  const centerOnPlayer = () =>
    setView(clampView({ cx: gameState.playerPos.x, cz: gameState.playerPos.z, span: Math.min(viewRef.current.span, 1000) }, WORLD_HALF_EXTENT));
  const showWholeWorld = () => setView(clampView({ cx: 0, cz: 0, span: maxSpan(WORLD_HALF_EXTENT) }, WORLD_HALF_EXTENT));

  // ---- Kartu info target terpilih --------------------------------------
  const selDist = selected ? Math.hypot(selected.x - gameState.playerPos.x, selected.z - gameState.playerPos.z) : 0;
  const selName = selected
    ? selected.type === 'beacon'
      ? t('map.beaconLabel')
      : selected.discovered
        ? t(selected.labelKey)
        : t('map.unknownPoi')
    : '';

  const myRegion = getRegionAt(gameState.playerPos.x, gameState.playerPos.z);
  const selRegion = selected ? getRegionAt(selected.x, selected.z) : null;

  const iconBtn =
    'flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-stone-900/90 text-stone-200 hover:bg-stone-800 active:bg-stone-700';

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.88)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-stone-800 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Compass className="h-5 w-5 shrink-0 text-orange-400" />
            <h2 className="font-display text-base font-semibold leading-tight text-stone-100 sm:text-2xl">{t('map.title')}</h2>
          </div>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[40px] shrink-0 whitespace-nowrap rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('map.close')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-3 sm:p-5 md:grid-cols-3">
          <div className="md:col-span-2">
            <div ref={wrapRef} className="relative mx-auto w-full max-w-[560px]">
              <canvas
                ref={canvasRef}
                tabIndex={0}
                aria-label={t('map.title')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onKeyDown={onKeyDown}
                className="block w-full cursor-crosshair touch-none select-none rounded-lg border border-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                style={{ touchAction: 'none' }}
              />
              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <button type="button" className={iconBtn} onClick={() => zoomBy(0.65)} aria-label={t('map.zoomIn')} title={t('map.zoomIn')}>
                  <Plus className="h-5 w-5" />
                </button>
                <button type="button" className={iconBtn} onClick={() => zoomBy(1.55)} aria-label={t('map.zoomOut')} title={t('map.zoomOut')}>
                  <Minus className="h-5 w-5" />
                </button>
                <button type="button" className={iconBtn} onClick={centerOnPlayer} aria-label={t('map.centerPlayer')} title={t('map.centerPlayer')}>
                  <Crosshair className="h-5 w-5" />
                </button>
                <button type="button" className={iconBtn} onClick={showWholeWorld} aria-label={t('map.fullWorld')} title={t('map.fullWorld')}>
                  <Globe className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/60 p-3.5 text-xs">
            <div className="space-y-2.5">
              <div className="font-semibold text-stone-200">{t('map.legend')}</div>
              <div className="flex items-center gap-2 text-stone-300">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white ring-2 ring-orange-500" />
                <span>{t('map.player')} ({Math.round(gameState.playerPos.x)}m, {Math.round(gameState.playerPos.z)}m)</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-300">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{t('map.beacon')} ({beacons.length})</span>
              </div>
              <div className="flex items-center gap-2 text-amber-300">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{t('map.poi')} ({gameState.discoveredPois.length}/{WORLD_POIS.length})</span>
              </div>
              <div className="text-stone-300">
                {t('regions.current')}: <span className="font-semibold text-stone-100">{regionLabel(myRegion, t)}</span>{' '}
                <span className={myRegion.tier >= 3 ? 'text-red-300' : 'text-stone-400'}>
                  · {t('regions.danger')} {dangerLevel(myRegion.tier)}/{MAX_TIER + 1}
                </span>
              </div>
              <div className="text-stone-400">
                {t('map.discoveredChunks')}: <span className="font-mono-tabular text-stone-200">{gameState.discoveredChunks.length}</span>
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-stone-400">{t('map.clickHint')}</p>
            </div>

            <div className="space-y-2 border-t border-stone-800 pt-3">
              {selected && (
                <div className="space-y-1.5 rounded-lg border border-stone-700 bg-stone-950/60 p-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-stone-500">{t('map.selected')}</div>
                  <div className="text-sm font-semibold text-stone-100">{selName}</div>
                  {selected.type === 'poi' && !selected.discovered ? (
                    <div className="text-[11px] text-stone-400">{t('map.unknownPoiHint')}</div>
                  ) : null}
                  {selRegion && (
                    <div className="text-[11px] text-stone-400">
                      {regionLabel(selRegion, t)} · {t('regions.danger')} {dangerLevel(selRegion.tier)}/{MAX_TIER + 1}
                    </div>
                  )}
                  <div className="text-[11px] text-stone-400">
                    {Math.round(selected.x)}m, {Math.round(selected.z)}m · {t('map.distance')}{' '}
                    <span className="font-mono-tabular text-stone-200">{formatDistance(selDist)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => placeWaypoint(Math.round(selected.x), Math.round(selected.z))}
                    className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-amber-600/60 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {t('map.markThis')}
                  </button>
                  {selected.type === 'beacon' && (
                    <button
                      type="button"
                      onClick={() => fastTravelToBeacon(selected.x, selected.z)}
                      className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      {t('map.fastTravel')}
                    </button>
                  )}
                </div>
              )}
              {waypoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    gameState.customWaypoints = [];
                    setWaypoints([]);
                    schedule();
                  }}
                  className="min-h-[40px] w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-800"
                >
                  {t('map.clearWaypoint')} ({waypoints[0].x}m, {waypoints[0].z}m ·{' '}
                  {formatDistance(Math.hypot(waypoints[0].x - gameState.playerPos.x, waypoints[0].z - gameState.playerPos.z))})
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
