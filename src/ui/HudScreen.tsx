import { AwayReportModal } from './AwayReportModal';
import { SocialPanel } from './SocialPanel';
import { EdenClock } from './EdenClock';
import { NearbyPlayers } from './NearbyPlayers';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Backpack,
  Map as MapIcon,
  BookOpen,
  Maximize2,
  ChevronDown,
  ChevronUp,
  RotateCw,
  X,
  MessageCircle,
  ArrowUp,
  Eye,
  EyeOff,
  Flag,
  Users,
} from 'lucide-react';
import { ITEMS, WORLD_RADIUS } from '../game/config';
import { BALANCE } from '../game/data/balance';
import { eventBus } from '../game/core/eventBus';
import { input } from '../game/core/input';
import { gameState, saveSettingsToLocal, setScreen, type HudSnapshot } from '../game/core/state';
import { dismissTutorial } from '../game/systems/events';
import { removeItem, useHotbarSlot } from '../game/systems/inventory';
import { isTouchDevice } from '../game/utils/device';
import {
  cycleHudMode,
  getHudMode,
  hudVisibility,
  isCriticalState,
  subscribeHudMode,
  type HudMode,
} from '../game/utils/hudMode';
import { t } from '../game/utils/i18n';
import { ItemIcon } from './ItemIcon';
import { DebugOverlay } from './DebugOverlay';
import { multiplayer } from '../game/net/multiplayer';
import { MP_EMOTES } from '../game/net/multiplayerProtocol';

function getCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function HudScreen() {
  const [snap, setSnap] = useState<HudSnapshot | null>(() => gameState.lastHudSnapshot);
  const [muted, setMuted] = useState(gameState.settings.audio.muted);
  const [touchMode, setTouchMode] = useState(() => isTouchDevice());
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [isShortLandscape, setIsShortLandscape] = useState(() => window.innerHeight < 440);
  const [questCollapsed, setQuestCollapsed] = useState(() => window.innerHeight < 440);
  const [rotateBanner, setRotateBanner] = useState(false);
  const [inspectIdx, setInspectIdx] = useState<number | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [socialUnread, setSocialUnread] = useState(0);
  useEffect(() => eventBus.on<number>('social:unread', (n) => setSocialUnread(typeof n === 'number' ? n : 0)), []);
  const hudMode = useSyncExternalStore(subscribeHudMode, getHudMode, getHudMode);
  const [modeFlash, setModeFlash] = useState<string | null>(null);
  const modeFlashTimer = useRef<number | null>(null);

  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joyRef = useRef<{ x: number; y: number; touchId: number | null }>({ x: 0, y: 0, touchId: null });
  const lookRef = useRef<{ x: number; y: number; touchId: number | null }>({ x: 0, y: 0, touchId: null });
  const longPressTimerRef = useRef<number | null>(null);
  const debugTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  useEffect(() => {
    const unsub = eventBus.on<HudSnapshot>('hud:update', (data) => {
      if (data) setSnap(data);
    });
    const onResize = () => {
      setTouchMode(isTouchDevice());
      setIsPortrait(window.innerHeight > window.innerWidth);
      const short = window.innerHeight < 440;
      setIsShortLandscape(short);
      if (short) setQuestCollapsed(true);
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const flashMode = (m: HudMode) => {
    const label = m === 'full' ? t('hud.hudModeFull') : m === 'compact' ? t('hud.hudModeCompact') : t('hud.hudModeClean');
    setModeFlash(label);
    if (modeFlashTimer.current) window.clearTimeout(modeFlashTimer.current);
    modeFlashTimer.current = window.setTimeout(() => setModeFlash(null), 1600);
  };

  // Tombol H (desktop) mengganti mode HUD: Penuh → Ringkas → Bersih.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'h' && e.key !== 'H') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      flashMode(cycleHudMode());
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (modeFlashTimer.current) window.clearTimeout(modeFlashTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || !snap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const range = Math.max(WORLD_RADIUS, 160);
    const scale = half / range;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#14100e';
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const node of snap.minimapNodes) {
      const dx = (node.x - snap.playerX) * scale;
      const dz = (node.z - snap.playerZ) * scale;
      if (Math.hypot(dx, dz) > half - 5) continue;
      ctx.fillStyle =
        node.kind === 'volcano'
          ? '#ef4444'
          : node.kind === 'water' || node.kind === 'geyser'
            ? '#38bdf8'
            : node.kind === 'crystal'
              ? '#fb923c'
              : node.kind === 'beacon'
                ? '#10b981'
                : node.kind === 'player'
                  ? '#facc15'
                  : '#22c55e';
      ctx.beginPath();
      ctx.arc(half + dx, half + dz, node.kind === 'volcano' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(half, half, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }, [snap]);

  if (!snap) return null;

  const ctrl = gameState.settings.controls;
  const showFull = gameState.settings.gameplay.showHud;
  const lowOxygen = snap.vitals.oxygen < BALANCE.oxygen.lowWarnPct;
  const suffocating = snap.vitals.oxygen <= BALANCE.oxygen.depletedAtPct && (snap.vitals.suffocationTimer || 0) > 0;
  const isImperial = gameState.settings.gameplay.units === 'imperial';
  const tempDisplay = isImperial
    ? `${Math.round((snap.vitals.temperature * 9) / 5 + 32)}°F`
    : `${snap.vitals.temperature.toFixed(1)}°C`;
  const tempPct = Math.min(100, Math.max(0, ((snap.vitals.temperature - 30) / 22) * 100));
  // Layar landscape pendek: kontrol sedikit diperkecil agar tidak menutupi pandangan.
  const touchK = isShortLandscape ? 0.88 : 1;
  const joyRadius = 56 * ctrl.joystickSize * touchK;
  const knobSize = joyRadius * 0.8;
  const knobTravel = joyRadius * 0.55;
  const actionK = (ctrl.actionSize ?? 1.15) * touchK;
  const hudScale = isShortLandscape ? Math.min(ctrl.hudScale, 0.9) : ctrl.hudScale;
  const btnOpacity = ctrl.buttonOpacity ?? 0.9;
  const leftHanded = ctrl.handMode === 'left';

  const handleFullscreenLandscape = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
      const orient = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> };
      await orient?.lock?.('landscape');
    } catch {
      if (isPortrait) setRotateBanner(true);
    }
  };

  const handleCompassTap = () => {
    const now = performance.now();
    if (now - debugTapRef.current.lastAt < 650) {
      debugTapRef.current.count += 1;
      if (debugTapRef.current.count >= 3) {
        gameState.debugOpen = !gameState.debugOpen;
        debugTapRef.current.count = 0;
      }
    } else {
      debugTapRef.current.count = 1;
    }
    debugTapRef.current.lastAt = now;
  };

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
        : snap.hazard === 'meteor' || snap.hazard === 'heat' || snap.hazard === 'radiation'
          ? 'text-red-300 border-red-700/80'
          : 'text-amber-300 border-amber-700/80';

  const inspectedSlot = inspectIdx !== null ? snap.hotbar[inspectIdx] : null;
  const inspectedDef = inspectedSlot ? ITEMS[inspectedSlot.itemId] : null;

  const joystickNode = (
    // Area sentuh lebih luas (padding 14px) dari lingkaran yang terlihat, supaya jempol tidak meleset.
    <div
      className="pointer-events-auto relative select-none p-3.5"
      style={{ touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      onTouchStart={(e) => {
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rect = e.currentTarget.getBoundingClientRect();
        joyRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, touchId: touch.identifier };
        const dx = (touch.clientX - joyRef.current.x) / joyRadius;
        const dy = (touch.clientY - joyRef.current.y) / joyRadius;
        input.setTouchJoystick(dx, dy);
        setJoyKnob({ x: Math.max(-1, Math.min(1, dx)) * knobTravel, y: Math.max(-1, Math.min(1, dy)) * knobTravel });
      }}
      onTouchMove={(e) => {
        if (joyRef.current.touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === joyRef.current.touchId) {
            const dx = (touch.clientX - joyRef.current.x) / joyRadius;
            const dy = (touch.clientY - joyRef.current.y) / joyRadius;
            input.setTouchJoystick(dx, dy);
            setJoyKnob({ x: Math.max(-1, Math.min(1, dx)) * knobTravel, y: Math.max(-1, Math.min(1, dy)) * knobTravel });
          }
        }
      }}
      onTouchEnd={(e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === joyRef.current.touchId) {
            joyRef.current.touchId = null;
            input.setTouchJoystick(0, 0);
            setJoyKnob({ x: 0, y: 0 });
          }
        }
      }}
      onTouchCancel={() => {
        joyRef.current.touchId = null;
        input.setTouchJoystick(0, 0);
        setJoyKnob({ x: 0, y: 0 });
      }}
    >
      <div
        className="flex items-center justify-center rounded-full border-2 border-stone-600"
        style={{
          width: joyRadius * 2,
          height: joyRadius * 2,
          backgroundColor: 'rgba(15, 12, 11, 0.68)',
          opacity: btnOpacity,
        }}
      >
        <div
          className="rounded-full border-2 border-orange-300/70 bg-orange-600/85 shadow-lg"
          style={{ width: knobSize, height: knobSize, transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
        />
      </div>
    </div>
  );

  // Tombol aksi: dua baris, AKSI paling besar di sudut bawah agar mudah dijangkau jempol.
  const smallBtn = Math.round(64 * actionK);
  const bigBtn = Math.round(84 * actionK);
  const btnBase =
    'select-none flex items-center justify-center rounded-full border-2 font-bold uppercase tracking-wide shadow-lg transition-transform active:scale-90 active:brightness-125';
  const btnStyle = (size: number): React.CSSProperties => ({
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.2)),
    touchAction: 'none',
    WebkitTapHighlightColor: 'transparent',
    backgroundColor: 'rgba(15, 12, 11, 0.85)',
  });
  const actionClusterNode = (
    <div
      className="pointer-events-auto flex flex-col items-end gap-2 p-1.5"
      style={{ opacity: btnOpacity }}
      onTouchStart={(e) => {
        const touch = e.changedTouches[0];
        if (!touch) return;
        lookRef.current = { x: touch.clientX, y: touch.clientY, touchId: touch.identifier };
      }}
      onTouchMove={(e) => {
        if (lookRef.current.touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === lookRef.current.touchId) {
            input.addTouchLookDelta(touch.clientX - lookRef.current.x, touch.clientY - lookRef.current.y);
            lookRef.current.x = touch.clientX;
            lookRef.current.y = touch.clientY;
          }
        }
      }}
      onTouchEnd={(e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === lookRef.current.touchId) {
            lookRef.current.touchId = null;
          }
        }
      }}
      onTouchCancel={() => {
        lookRef.current.touchId = null;
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={() => input.triggerVirtualKey(ctrl.keys.build)}
          className={`${btnBase} border-stone-600 text-stone-100`}
          style={btnStyle(smallBtn)}
        >
          {t('hud.buildBtn')}
        </button>
        <button
          type="button"
          onPointerDown={() => input.triggerVirtualKey(ctrl.keys.jump)}
          className={`${btnBase} border-stone-600 text-stone-100`}
          style={btnStyle(smallBtn)}
        >
          {t('hud.jumpBtn')}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onTouchStart={() => input.setVirtualHold(ctrl.keys.sprint, true)}
          onTouchEnd={() => input.setVirtualHold(ctrl.keys.sprint, false)}
          onTouchCancel={() => input.setVirtualHold(ctrl.keys.sprint, false)}
          className={`${btnBase} border-stone-600 text-stone-100`}
          style={btnStyle(smallBtn)}
        >
          {t('hud.runBtn')}
        </button>
        <button
          type="button"
          onPointerDown={() => input.triggerVirtualKey(ctrl.keys.interact)}
          className={`${btnBase} border-orange-400 text-white`}
          style={{ ...btnStyle(bigBtn), backgroundColor: '#ea580c' }}
        >
          {t('hud.actionBtn')}
        </button>
      </div>
    </div>
  );

  const vis = hudVisibility(hudMode);
  const showFullBars = vis.vitalsFull && showFull;
  const compact = isShortLandscape; // layar landscape pendek: panel dipadatkan
  const showHazardPill = vis.hazardPills && (hudMode === 'full' || (snap.hazard !== 'safe' && snap.hazard !== 'sheltered'));
  const critical = vis.criticalVignette && isCriticalState(snap.vitals, suffocating);
  const toggleHudMode = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    flashMode(cycleHudMode());
  };
  const bar = (label: string, pct: number, text: string, barColor: string, blink = false) => (
    <VitalBar label={label} pct={pct} text={text} barColor={barColor} blink={blink} compact={compact} />
  );

  return (
    <div className="hud-root safe-hud-pad pointer-events-none fixed inset-0 z-20">
      <AwayReportModal />
      <SocialPanel />
      {critical && <div className="hud-critical-vignette animate-pulse" aria-hidden="true" />}
      {(rotateBanner || (ctrl.preferLandscape && isPortrait && touchMode)) && (
        <div
          className="pointer-events-auto fixed inset-x-4 top-16 z-40 flex items-center justify-between gap-2 rounded-lg border border-amber-700 px-3 py-2 text-xs text-amber-200 shadow-lg"
          style={{ backgroundColor: 'rgba(20, 14, 11, 0.94)' }}
        >
          <div className="flex items-center gap-2">
            <RotateCw className="h-4 w-4 shrink-0" />
            <span>{t('hud.rotateHint')}</span>
          </div>
          <button type="button" onClick={() => setRotateBanner(false)} className="p-1 text-stone-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Baris atas: vitals + kompas/peringatan + tombol. Tingginya dibatasi (hud-top) sehingga tidak pernah mendorong kontrol bawah keluar layar. */}
      <div className="hud-top">
        <div
          className={`pointer-events-auto flex flex-col gap-1 origin-top-left ${compact ? 'w-40' : 'w-36 sm:w-56'}`}
          style={{ transform: `scale(${hudScale})` }}
        >
          {vis.clock && <EdenClock compact={compact} />}
          {vis.clock && <NearbyPlayers snap={snap} compact={compact} />}
          {vis.vitalsBasic && (
            <div className="rounded-lg border border-stone-800 p-1.5 shadow-lg sm:p-2" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
              <div className={compact && showFullBars ? 'grid grid-cols-2 gap-x-2' : ''}>
                {bar(t('hud.health'), snap.vitals.health, `${Math.round(snap.vitals.health)}`, 'bg-red-600')}
                {!showFullBars && lowOxygen &&
                  bar(t('hud.oxygen'), snap.vitals.oxygen, `${Math.round(snap.vitals.oxygen)}%`, 'bg-red-500', true)}
                {showFullBars && (
                  <>
                    {bar(t('hud.stamina'), snap.vitals.stamina, `${Math.round(snap.vitals.stamina)}`, 'bg-amber-500')}
                    {bar(t('hud.temperature'), tempPct, tempDisplay, 'bg-orange-500')}
                    {bar(t('hud.oxygen'), snap.vitals.oxygen, `${Math.round(snap.vitals.oxygen)}%`, lowOxygen ? 'bg-red-500' : 'bg-emerald-500', lowOxygen)}
                    {bar(t('hud.water'), snap.vitals.water, `${Math.round(snap.vitals.water)}%`, 'bg-sky-500')}
                  </>
                )}
              </div>
              {showFullBars && (snap.vitals.radiation > 1 || snap.vitals.filterDurability > 0 || snap.vitals.fatigue < 80) && (
                <div className="mt-1 flex flex-wrap gap-1.5 border-t border-stone-800 pt-1 text-[10px] font-mono-tabular">
                  {snap.vitals.radiation > 1 && <span className="text-purple-300">RAD {Math.round(snap.vitals.radiation)}%</span>}
                  {snap.vitals.filterDurability > 0 && <span className="text-emerald-300">FLT {Math.round(snap.vitals.filterDurability)}%</span>}
                  <span className="text-stone-400">REST {Math.round(snap.vitals.fatigue)}%</span>
                </div>
              )}
              {(snap.vitals.burnTimer > 0 || snap.vitals.woundTimer > 0) && (
                <div className="mt-1 flex gap-1.5 text-[10px] font-bold">
                  {snap.vitals.burnTimer > 0 && <span className="rounded bg-red-900/70 px-1.5 py-0.5 text-red-200">{t('hud.burnStatus')}</span>}
                  {snap.vitals.woundTimer > 0 && <span className="rounded bg-amber-900/70 px-1.5 py-0.5 text-amber-200">{t('hud.woundStatus')}</span>}
                </div>
              )}
            </div>
          )}

          {vis.quest && showFull && (
            <div className="rounded-lg border border-stone-800 px-2 py-1 shadow-lg" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
              <button
                type="button"
                onClick={() => setQuestCollapsed((c) => !c)}
                className="flex w-full items-center justify-between gap-1 text-[11px] font-medium text-orange-400"
              >
                <span className="truncate">
                  {t('hud.objective')} <span className="text-stone-500">{snap.questsCompletedCount}/22</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 font-mono-tabular">
                  {snap.questProgressText}
                  {questCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </span>
              </button>
              {!questCollapsed && (
                <div className={compact ? 'max-h-[26vh] overflow-y-auto' : ''}>
                  {snap.activeQuestId ? (
                    <>
                      <div className="mt-0.5 text-xs font-semibold text-stone-100">{t(`quests.${snap.activeQuestId}.title`)}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-stone-400">{t(`quests.${snap.activeQuestId}.desc`)}</div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-xs text-emerald-300">{t('quests.completedAll')}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {gameState.debugOpen && <DebugOverlay debug={snap.debug} />}
        </div>

        {/* Tengah: kompas, bahaya, peringatan dunia, tutorial */}
        <div className="pointer-events-auto flex min-w-0 flex-1 flex-col items-center gap-1">
          {vis.compass && (
            <button
              type="button"
              onClick={handleCompassTap}
              className="hidden sm:flex min-w-0 max-w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-stone-800 px-3 py-1 text-[11px] sm:text-xs shadow-lg"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}
            >
              <span className="font-mono-tabular font-semibold text-orange-400">
                {getCardinal(snap.headingDeg)} · {snap.headingDeg}°
              </span>
              <span className="text-stone-600">|</span>
              <span className="min-w-0 truncate text-stone-200">{t(`biomes.${snap.biomeId}`)}</span>
              <span className="text-stone-600">|</span>
              <span className="text-stone-300">{t(`hud.weather.${snap.weather}`)}</span>
            </button>
          )}

          {showHazardPill && (
            <div className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium ${hazardClass}`} style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}>
              {t(`hud.hazards.${snap.hazard}`)}
            </div>
          )}

          {vis.hazardPills && suffocating && (
            <div className="animate-pulse rounded-md border border-red-500 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-red-300" style={{ backgroundColor: 'rgba(40, 8, 8, 0.92)' }} role="alert">
              {t('hud.suffocating')}
            </div>
          )}

          {vis.hazardPills && snap.cleanAir && snap.cleanAir.dist > 0 && (
            <div className="flex animate-pulse items-center gap-1.5 rounded-md border border-emerald-500/70 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300" style={{ backgroundColor: 'rgba(8, 28, 20, 0.92)' }}>
              <ArrowUp className="h-4 w-4" style={{ transform: `rotate(${snap.cleanAir.relDeg}deg)` }} aria-hidden="true" />
              <span>
                {snap.cleanAir.kind === 'shelter' ? t('hud.shelterHint') : t('hud.cleanAirHint')} · {snap.cleanAir.dist} m
              </span>
            </div>
          )}

          {vis.hazardPills && snap.questGuide && snap.questGuide.dist > 6 && (
            <div className="flex items-center gap-1.5 rounded-md border border-sky-500/70 px-2.5 py-0.5 text-[11px] font-medium text-sky-200" style={{ backgroundColor: 'rgba(10, 22, 34, 0.92)' }}>
              <ArrowUp className="h-4 w-4" style={{ transform: `rotate(${snap.questGuide.relDeg}deg)` }} aria-hidden="true" />
              <Flag className="h-3 w-3 opacity-70" aria-hidden="true" />
              <span>
                {t(`hud.questGuide.${snap.questGuide.kind}`)} · {snap.questGuide.dist} m
              </span>
            </div>
          )}

          {vis.hazardPills && snap.deathBag && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/70 px-2.5 py-0.5 text-[11px] font-medium text-amber-300" style={{ backgroundColor: 'rgba(36, 24, 6, 0.92)' }}>
              <ArrowUp className="h-4 w-4" style={{ transform: `rotate(${snap.deathBag.relDeg}deg)` }} aria-hidden="true" />
              <span>
                {t('hud.bagHint')} · {snap.deathBag.dist} m
              </span>
            </div>
          )}

          {hudMode === 'full' && snap.online.status !== 'off' && (
            <div className="rounded-md border border-stone-800 px-2.5 py-0.5 text-[11px] font-medium text-yellow-200" style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}>
              {snap.online.status === 'online'
                ? `${t('mp.online')} · ${snap.online.players} ${t('mp.players')}`
                : snap.online.status === 'connecting'
                  ? t('mp.connecting')
                  : t('mp.error')}
            </div>
          )}

          {vis.hazardPills && snap.activeEvent.type !== 'none' && (
            <div className="rounded-md border border-red-600/80 px-3 py-1 text-[11px] font-bold text-red-200 shadow-lg" style={{ backgroundColor: 'rgba(69, 10, 10, 0.9)' }}>
              {t(`events.${snap.activeEvent.type}`)} · {snap.activeEvent.remainingSec}s
            </div>
          )}

          {vis.tutorial && snap.tutorialHintKey && (
            <div className="flex max-w-xs items-center gap-2 rounded-lg border border-sky-700/80 px-3 py-1.5 text-[11px] text-sky-100 shadow-lg" style={{ backgroundColor: 'rgba(12, 24, 36, 0.92)' }}>
              <span>{t(`tutorials.${snap.tutorialHintKey}`)}</span>
              <button
                type="button"
                onClick={() => dismissTutorial(snap.tutorialHintKey!)}
                className="shrink-0 rounded bg-sky-900/80 px-1.5 py-0.5 text-[10px] text-sky-200"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Kanan atas: tombol menu + minimap. Tombol mata (tampilan HUD) selalu ada. */}
        <div
          className="pointer-events-auto flex shrink-0 flex-col items-end gap-1.5 origin-top-right"
          style={{ transform: `scale(${hudScale})` }}
        >
          <div className="flex flex-wrap items-center justify-end gap-1">
            {modeFlash && (
              <span className="rounded-md border border-stone-700 px-2 py-1 text-[11px] font-semibold text-orange-200" style={{ backgroundColor: 'rgba(15, 12, 11, 0.94)' }} role="status">
                {modeFlash}
              </span>
            )}
            <HudIconBtn label={t('hud.hudToggle')} onClick={toggleHudMode} dim={hudMode === 'clean'}>
              {hudMode === 'full' ? <Eye className="h-4 w-4 sm:h-5 sm:w-5" /> : <EyeOff className={`h-4 w-4 sm:h-5 sm:w-5 ${hudMode === 'clean' ? 'text-orange-300' : ''}`} />}
            </HudIconBtn>
            {vis.menuButtons && (
              <>
                <HudIconBtn label={t('hud.mapBtn')} onClick={() => setScreen('map')}>
                  <MapIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </HudIconBtn>
                <HudIconBtn label={t('hud.journalBtn')} onClick={() => setScreen('journal')}>
                  <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
                </HudIconBtn>
                <HudIconBtn label={t('hud.inventoryBtn')} onClick={() => setScreen('inventory')}>
                  <Backpack className="h-4 w-4 sm:h-5 sm:w-5" />
                </HudIconBtn>
                {touchMode && (
                  <HudIconBtn label={t('hud.fullscreenBtn')} onClick={handleFullscreenLandscape}>
                    <Maximize2 className="h-4 w-4" />
                  </HudIconBtn>
                )}
                <HudIconBtn label={muted ? t('hud.soundOff') : t('hud.soundOn')} onClick={toggleMute}>
                  {muted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                </HudIconBtn>
                {(snap.online.status === 'online' || gameState.user.mode === 'authenticated') && (
                  <div className="relative">
                    <HudIconBtn label={t('hud.socialBtn')} onClick={() => eventBus.emit('social:open')}>
                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-300" />
                    </HudIconBtn>
                    {socialUnread > 0 && (
                      <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-orange-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                        {socialUnread > 9 ? '9+' : socialUnread}
                      </span>
                    )}
                  </div>
                )}
                {snap.online.status === 'online' && (
                  <HudIconBtn label={t('mp.emoteBtn')} onClick={() => setEmoteOpen((o) => !o)}>
                    <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-300" />
                  </HudIconBtn>
                )}
              </>
            )}
            <HudIconBtn label={t('hud.pauseBtn')} onClick={() => setScreen('pause')} dim={hudMode === 'clean'}>
              <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
            </HudIconBtn>
          </div>

          {vis.menuButtons && emoteOpen && snap.online.status === 'online' && (
            <div className="flex max-w-[210px] flex-wrap justify-end gap-1">
              {MP_EMOTES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    multiplayer.sendEmote(id);
                    setEmoteOpen(false);
                  }}
                  className="min-h-[36px] rounded-md border border-stone-700 px-2.5 py-1 text-[11px] font-medium text-stone-100 hover:border-yellow-400"
                  style={{ backgroundColor: 'rgba(15, 12, 11, 0.94)' }}
                >
                  {t(`mp.emotes.${id}`)}
                </button>
              ))}
            </div>
          )}

          {vis.minimap && showFull && !isShortLandscape && (
            <button
              type="button"
              onClick={() => setScreen('map')}
              className="rounded-full border border-stone-800 p-1 shadow-lg hover:border-orange-500"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)' }}
              aria-label={t('hud.mapBtn')}
            >
              <canvas ref={minimapRef} width={88} height={88} className="block rounded-full" />
            </button>
          )}
        </div>
      </div>

      {/* Baris bawah: SELALU menempel di dasar layar (baris grid kedua), apa pun tinggi baris atas. */}
      <div className="hud-bottom">
        {snap.buildModeItem && (
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-orange-500/80 px-3 py-1.5 text-xs shadow-lg"
            style={{ backgroundColor: 'rgba(18, 12, 10, 0.94)' }}
          >
            <span className={snap.buildValid ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>
              {t(`items.${snap.buildModeItem}.name`)}
            </span>
            <button
              type="button"
              onClick={() => eventBus.emit('world:rotateBuild')}
              className="min-h-[34px] rounded border border-stone-700 bg-stone-900 px-2.5 text-stone-200"
            >
              ↻ {t('hud.rotateBuild')} [R]
            </button>
            <button
              type="button"
              onClick={() => eventBus.emit('world:confirmBuild')}
              className="min-h-[34px] rounded bg-emerald-600 px-3 font-semibold text-white"
            >
              {t('hud.placeConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                gameState.buildModeItem = null;
              }}
              className="min-h-[34px] rounded border border-stone-700 bg-stone-900 px-2.5 text-stone-300"
            >
              {t('hud.cancelBuild')}
            </button>
          </div>
        )}

        {!snap.buildModeItem && snap.interactTarget && (
          <button
            type="button"
            onClick={() => input.triggerVirtualKey(ctrl.keys.interact)}
            className="pointer-events-auto min-h-[40px] rounded-lg border border-orange-500/80 px-4 py-1.5 text-xs sm:text-sm font-semibold text-orange-100 shadow-lg"
            style={{ backgroundColor: 'rgba(20, 14, 11, 0.92)' }}
          >
            {t('hud.interact')} {t(`hud.actions.${snap.interactTarget.actionKey}`)}
          </button>
        )}

        {(() => {
          const hotbarNode = (
            <div
              className="pointer-events-auto flex items-center gap-1 rounded-xl border border-stone-800 p-1 shadow-lg origin-bottom"
              style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)', transform: `scale(${hudScale})` }}
            >
              {snap.hotbar.map((slot, idx) => {
                const def = slot ? ITEMS[slot.itemId] : null;
                const selected = snap.selectedHotbarIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    tabIndex={-1}
                    onPointerDown={() => {
                      longPressTimerRef.current = window.setTimeout(() => {
                        if (def) setInspectIdx(idx);
                      }, 480);
                    }}
                    onPointerUp={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    }}
                    onPointerLeave={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    }}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      useHotbarSlot(idx);
                    }}
                    aria-label={def ? t(`items.${def.id}.name`) : `Slot ${idx + 1}`}
                    className={`relative flex ${touchMode ? 'h-12 w-12' : 'h-10 w-10 sm:h-11 sm:w-11'} items-center justify-center rounded-lg border transition-colors ${
                      selected ? 'border-orange-500 bg-orange-950/50' : 'border-stone-800 bg-stone-900/80 hover:border-stone-700'
                    }`}
                  >
                    <span className="font-mono-tabular absolute left-1 top-0.5 text-[9px] text-stone-500">{idx + 1}</span>
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
          );

          return (
            <>
              {/* Long-press Inspect / Drop Popover */}
              {inspectedDef && inspectIdx !== null && (
                <div
                  className="pointer-events-auto flex items-center gap-2 rounded-lg border border-stone-700 px-3 py-1.5 text-xs shadow-lg"
                  style={{ backgroundColor: 'rgba(15, 12, 11, 0.96)' }}
                >
                  <span className="font-semibold text-orange-300">{t(`items.${inspectedDef.id}.name`)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      removeItem(inspectedDef.id, 1);
                      setInspectIdx(null);
                    }}
                    className="rounded border border-red-800 bg-red-950/60 px-2 py-1 text-[11px] text-red-200"
                  >
                    {t('hud.dropOne')}
                  </button>
                  <button type="button" onClick={() => setInspectIdx(null)} className="px-1.5 text-stone-400">
                    ✕
                  </button>
                </div>
              )}

              {touchMode && isShortLandscape ? (
                <div className="pointer-events-none flex w-full items-end justify-between gap-2 px-1">
                  {leftHanded ? actionClusterNode : joystickNode}
                  {hotbarNode}
                  {leftHanded ? joystickNode : actionClusterNode}
                </div>
              ) : (
                <>
                  {touchMode && (
                    <div className="pointer-events-none flex w-full items-end justify-between px-1">
                      {leftHanded ? actionClusterNode : joystickNode}
                      {leftHanded ? joystickNode : actionClusterNode}
                    </div>
                  )}
                  {hotbarNode}
                </>
              )}
            </>
          );
        })()}

        {vis.controlsHint && !isShortLandscape && (
          <div
            className="hidden md:block rounded-md border border-stone-800/80 px-2.5 py-0.5 text-[11px] text-stone-200 shadow-sm"
            style={{ backgroundColor: 'rgba(15, 12, 11, 0.78)' }}
          >
            {t('hud.controlsHint')}
          </div>
        )}
      </div>
    </div>
  );
}

function HudIconBtn({
  label,
  onClick,
  children,
  dim = false,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick(e);
      }}
      className="flex h-11 w-11 sm:h-12 sm:w-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-stone-800 text-stone-200 hover:border-orange-500 hover:text-white"
      style={{ backgroundColor: 'rgba(15, 12, 11, 0.9)', opacity: dim ? 0.55 : 1 }}
    >
      {children}
      <span className="max-w-full truncate px-0.5 text-[8px] sm:text-[9px] font-medium leading-none text-stone-300">{label}</span>
    </button>
  );
}

function VitalBar({
  label,
  pct,
  text,
  barColor,
  blink = false,
  compact = false,
}: {
  label: string;
  pct: number;
  text: string;
  barColor: string;
  blink?: boolean;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`${compact ? 'mb-0.5' : 'mb-1'} last:mb-0 ${blink ? 'animate-pulse' : ''}`}>
      <div className={`flex items-center justify-between gap-1 ${compact ? 'text-[9px] leading-tight' : 'text-[10px] sm:text-[11px]'}`}>
        <span className="truncate text-stone-300">{label}</span>
        <span className="font-mono-tabular font-semibold text-stone-100">{text}</span>
      </div>
      <div className={`${compact ? 'mt-px h-1' : 'mt-0.5 h-1.5'} w-full overflow-hidden rounded-full bg-stone-900`}>
        <div className={`h-full transition-all duration-150 ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
