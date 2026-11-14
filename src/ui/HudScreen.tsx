import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Pause, Backpack } from 'lucide-react';
import { ITEMS, WORLD_RADIUS } from '../game/config';
import { eventBus } from '../game/core/eventBus';
import { input } from '../game/core/input';
import { gameState, saveSettingsToLocal, setScreen, type HudSnapshot } from '../game/core/state';
import { useHotbarSlot } from '../game/systems/inventory';
import { isTouchDevice } from '../game/utils/device';
import { t } from '../game/utils/i18n';
import { ItemIcon } from './ItemIcon';

function getCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function HudScreen() {
  const [snap, setSnap] = useState<HudSnapshot | null>(() => gameState.lastHudSnapshot);
  const [muted, setMuted] = useState(gameState.settings.audio.muted);
  const [touchMode, setTouchMode] = useState(() => isTouchDevice());
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joyOriginRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const lookOriginRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const unsub = eventBus.on<HudSnapshot>('hud:update', (data) => {
      if (data) setSnap(data);
    });
    const onResize = () => setTouchMode(isTouchDevice());
    window.addEventListener('resize', onResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        const next = {
          ...gameState.settings,
          audio: { ...gameState.settings.audio, muted: !gameState.settings.audio.muted },
        };
        saveSettingsToLocal(next);
        setMuted(next.audio.muted);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Draw real projected minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || !snap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const scale = half / WORLD_RADIUS;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#14100e';
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.fill();

    // Rim circle
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Nodes
    for (const node of snap.minimapNodes) {
      const mx = half + node.x * scale;
      const mz = half + node.z * scale;
      ctx.fillStyle =
        node.kind === 'volcano'
          ? '#ef4444'
          : node.kind === 'water'
            ? '#38bdf8'
            : node.kind === 'crystal'
              ? '#fb923c'
              : '#22c55e';
      ctx.beginPath();
      ctx.arc(mx, mz, node.kind === 'volcano' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player marker
    const px = half + snap.playerX * scale;
    const pz = half + snap.playerZ * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }, [snap]);

  if (!snap) return null;

  const showFull = gameState.settings.gameplay.showHud;
  const isImperial = gameState.settings.gameplay.units === 'imperial';
  const tempDisplay = isImperial
    ? `${Math.round((snap.vitals.temperature * 9) / 5 + 32)}°F`
    : `${snap.vitals.temperature.toFixed(1)}°C`;
  const tempPct = Math.min(100, Math.max(0, ((snap.vitals.temperature - 30) / 22) * 100));

  const toggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = {
      ...gameState.settings,
      audio: { ...gameState.settings.audio, muted: !gameState.settings.audio.muted },
    };
    saveSettingsToLocal(next);
    setMuted(next.audio.muted);
  };

  const hazardClass =
    snap.hazard === 'safe'
      ? 'text-stone-300 border-stone-800'
      : snap.hazard === 'sheltered'
        ? 'text-emerald-300 border-emerald-700/70'
        : snap.hazard === 'meteor' || snap.hazard === 'heat'
          ? 'text-red-300 border-red-700/80'
          : 'text-amber-300 border-amber-700/80';

  const joyRadius = 46 * gameState.settings.controls.joystickSize;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Vitals + Compass/Weather + Minimap/Actions */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left: Vitals & Active Quest */}
        <div className="pointer-events-auto flex w-48 sm:w-56 flex-col gap-2">
          <div className="rounded-lg border border-stone-800 p-2.5 shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
            <VitalBar label={t('hud.health')} pct={snap.vitals.health} text={`${Math.round(snap.vitals.health)}`} barColor="bg-red-600" />
            {showFull && (
              <>
                <VitalBar label={t('hud.stamina')} pct={snap.vitals.stamina} text={`${Math.round(snap.vitals.stamina)}`} barColor="bg-amber-500" />
                <VitalBar label={t('hud.temperature')} pct={tempPct} text={tempDisplay} barColor="bg-orange-500" />
                <VitalBar label={t('hud.oxygen')} pct={snap.vitals.oxygen} text={`${Math.round(snap.vitals.oxygen)}%`} barColor="bg-emerald-500" />
                <VitalBar label={t('hud.water')} pct={snap.vitals.water} text={`${Math.round(snap.vitals.water)}%`} barColor="bg-sky-500" />
              </>
            )}
          </div>

          {showFull && (
            <div className="rounded-lg border border-stone-800 p-2.5 shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
              <div className="flex items-center justify-between text-[11px] font-medium text-orange-400">
                <span>{t('hud.objective')}</span>
                <span className="font-mono-tabular">{snap.questProgressText}</span>
              </div>
              {snap.activeQuestId ? (
                <>
                  <div className="mt-0.5 text-xs font-semibold text-stone-100">
                    {t(`quests.${snap.activeQuestId}.title`)}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-stone-400">
                    {t(`quests.${snap.activeQuestId}.desc`)}
                  </div>
                </>
              ) : (
                <div className="mt-0.5 text-xs text-emerald-300">{t('quests.completedAll')}</div>
              )}
            </div>
          )}
        </div>

        {/* Top-Center: Compass & Weather/Hazard */}
        <div className="hidden md:flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3 rounded-lg border border-stone-800 px-4 py-1.5 text-xs shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
            <span className="font-mono-tabular font-semibold text-orange-400">
              {getCardinal(snap.headingDeg)} · {snap.headingDeg}°
            </span>
            <span className="text-stone-600">|</span>
            <span className="text-stone-200">{t(`hud.weather.${snap.weather}`)}</span>
          </div>
          <div className={`rounded-md border px-3 py-0.5 text-[11px] font-medium ${hazardClass}`} style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}>
            {t(`hud.hazards.${snap.hazard}`)}
          </div>
        </div>

        {/* Top-Right: Minimap & Utility Icon Buttons */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('hud.inventoryBtn')}
              onClick={(e) => {
                e.currentTarget.blur();
                setScreen('inventory');
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-800 text-stone-200 hover:border-orange-500 hover:text-white"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}
            >
              <Backpack className="h-5 w-5" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Mute"
              onClick={toggleMute}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-800 text-stone-200 hover:border-orange-500 hover:text-white"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}
            >
              {muted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5" />}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={t('hud.pauseBtn')}
              onClick={(e) => {
                e.currentTarget.blur();
                setScreen('pause');
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone-800 text-stone-200 hover:border-orange-500 hover:text-white"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}
            >
              <Pause className="h-5 w-5" />
            </button>
          </div>

          {showFull && (
            <div className="rounded-full border border-stone-800 p-1 shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}>
              <canvas ref={minimapRef} width={96} height={96} className="block rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Interaction Prompt, Hotbar, and Mobile Touch Controls */}
      <div className="flex flex-col items-center gap-2">
        {snap.interactTarget && (
          <button
            type="button"
            onClick={() => input.triggerVirtualKey(gameState.settings.controls.keys.interact)}
            className="pointer-events-auto min-h-[44px] rounded-lg border border-orange-500/80 px-5 py-2 text-sm font-semibold text-orange-100 shadow-lg"
            style={{ backgroundColor: 'rgba(20, 14, 11, 0.92)' }}
          >
            {t('hud.interact')} {t(`hud.actions.${snap.interactTarget.actionKey}`)}
          </button>
        )}

        {/* Mobile Virtual Touch Controls */}
        {touchMode && (
          <div className="pointer-events-none flex w-full items-end justify-between px-1 pb-1">
            {/* Virtual Joystick */}
            <div
              className="pointer-events-auto relative flex items-center justify-center rounded-full border border-stone-700"
              style={{
                width: joyRadius * 2,
                height: joyRadius * 2,
                backgroundColor: 'rgba(15, 12, 11, 0.65)',
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                joyOriginRef.current = {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                  active: true,
                };
                const dx = (touch.clientX - joyOriginRef.current.x) / joyRadius;
                const dy = (touch.clientY - joyOriginRef.current.y) / joyRadius;
                input.setTouchJoystick(dx, dy);
                setJoyKnob({ x: Math.max(-1, Math.min(1, dx)) * 22, y: Math.max(-1, Math.min(1, dy)) * 22 });
              }}
              onTouchMove={(e) => {
                if (!joyOriginRef.current.active) return;
                const touch = e.touches[0];
                const dx = (touch.clientX - joyOriginRef.current.x) / joyRadius;
                const dy = (touch.clientY - joyOriginRef.current.y) / joyRadius;
                input.setTouchJoystick(dx, dy);
                setJoyKnob({ x: Math.max(-1, Math.min(1, dx)) * 22, y: Math.max(-1, Math.min(1, dy)) * 22 });
              }}
              onTouchEnd={() => {
                joyOriginRef.current.active = false;
                input.setTouchJoystick(0, 0);
                setJoyKnob({ x: 0, y: 0 });
              }}
            >
              <div
                className="h-10 w-10 rounded-full bg-orange-600/80 border border-orange-300/60"
                style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
              />
            </div>

            {/* Right Touch Look + Action Cluster */}
            <div
              className="pointer-events-auto flex items-center gap-2"
              onTouchStart={(e) => {
                const touch = e.touches[0];
                lookOriginRef.current = { x: touch.clientX, y: touch.clientY, active: true };
              }}
              onTouchMove={(e) => {
                if (!lookOriginRef.current.active) return;
                const touch = e.touches[0];
                input.addTouchLookDelta(touch.clientX - lookOriginRef.current.x, touch.clientY - lookOriginRef.current.y);
                lookOriginRef.current.x = touch.clientX;
                lookOriginRef.current.y = touch.clientY;
              }}
              onTouchEnd={() => {
                lookOriginRef.current.active = false;
              }}
            >
              <button
                type="button"
                onClick={() => input.triggerVirtualKey(gameState.settings.controls.keys.build)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-700 text-xs font-bold text-stone-100"
                style={{ backgroundColor: 'rgba(15, 12, 11, 0.85)' }}
              >
                {t('hud.buildBtn')}
              </button>
              <button
                type="button"
                onClick={() => input.triggerVirtualKey(gameState.settings.controls.keys.interact)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-500 bg-orange-600 text-sm font-bold text-white"
              >
                E
              </button>
              <button
                type="button"
                onClick={() => input.triggerVirtualKey(gameState.settings.controls.keys.jump)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-700 text-xs font-bold text-stone-100"
                style={{ backgroundColor: 'rgba(15, 12, 11, 0.85)' }}
              >
                JMP
              </button>
            </div>
          </div>
        )}

        {/* 6-Slot Hotbar */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-stone-800 p-1.5 shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}>
          {snap.hotbar.map((slot, idx) => {
            const def = slot ? ITEMS[slot.itemId] : null;
            const selected = snap.selectedHotbarIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  useHotbarSlot(idx);
                }}
                aria-label={def ? t(`items.${def.id}.name`) : `Slot ${idx + 1}`}
                className={`relative flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
                  selected ? 'border-orange-500 bg-orange-950/50' : 'border-stone-800 bg-stone-900/80 hover:border-stone-700'
                }`}
              >
                <span className="font-mono-tabular absolute left-1 top-0.5 text-[10px] text-stone-500">
                  {idx + 1}
                </span>
                {def && slot && (
                  <div className={slot.qty === 0 ? 'opacity-25' : ''}>
                    <ItemIcon iconType={def.iconType} color={def.color} />
                  </div>
                )}
                {slot && slot.qty > 0 && (
                  <span className="font-mono-tabular absolute bottom-0.5 right-1 text-[10px] font-semibold text-stone-200">
                    {slot.qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:block text-[11px] text-stone-300/80">
          {t('hud.controlsHint')}
        </div>
      </div>
    </div>
  );
}

function VitalBar({
  label,
  pct,
  text,
  barColor,
}: {
  label: string;
  pct: number;
  text: string;
  barColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-stone-300">{label}</span>
        <span className="font-mono-tabular font-semibold text-stone-100">{text}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-900">
        <div className={`h-full transition-all duration-150 ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
