import React, { useEffect, useState } from 'react';
import { GAME_VERSION } from '../game/config';
import { gameState, isSignedIn, setScreen } from '../game/core/state';
import { continueLatestExpedition, loadExpedition } from '../game/main';
import {
  applyConflictChoice,
  getLocalSave,
  migrateLegacySlots,
  resolveContinue,
  resolveLegacyChoice,
  type ContinueDecision,
  type SaveData,
} from '../game/systems/saveLoad';
import { t } from '../game/utils/i18n';
import { CloudConflictDialog } from './CloudConflictDialog';
import { LegacySavePicker } from './LegacySavePicker';
import { PrimordiaEmblem } from './ItemIcon';
import { usePWAInstall } from './pwaInstall';

function formatPlaytime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export function MainMenuScreen() {
  const { canInstall, online, promptInstall } = usePWAInstall();
  // Migrasi dari Slot 1/2/3 berjalan sekali saat menu pertama kali dibuka.
  const [legacyChoices, setLegacyChoices] = useState<SaveData[]>(() => migrateLegacySlots());
  const [decision, setDecision] = useState<ContinueDecision | null>(null);
  const [conflict, setConflict] = useState<{ local: SaveData; cloud: SaveData } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localTick, setLocalTick] = useState(0);

  const resumeActive = gameState.activeWorldLoaded;
  const localSave = React.useMemo(() => getLocalSave(), [localTick, legacyChoices]);

  // Akun login: cek simpanan cloud di latar belakang agar tombol Lanjutkan tahu keadaan terbaru.
  useEffect(() => {
    if (resumeActive || legacyChoices.length > 0) return;
    let cancelled = false;
    void resolveContinue().then((d) => {
      if (!cancelled) setDecision(d);
    });
    return () => {
      cancelled = true;
    };
  }, [resumeActive, legacyChoices.length, localTick]);

  const hasSave = resumeActive || (decision ? decision.kind !== 'none' : localSave !== null);
  const summarySave: SaveData | null = resumeActive
    ? null
    : decision?.kind === 'load'
      ? decision.save
      : decision?.kind === 'conflict'
        ? decision.local
        : localSave;

  const onContinue = async () => {
    if (busy) return;
    if (resumeActive) {
      continueLatestExpedition();
      return;
    }
    setBusy(true);
    const d = decision ?? (await resolveContinue());
    setBusy(false);
    if (d.kind === 'conflict') setConflict({ local: d.local, cloud: d.cloud });
    else if (d.kind === 'load') loadExpedition(d.save);
    else setScreen('newGame');
  };

  const primaryAction = () => {
    if (legacyChoices.length > 0 || conflict) return;
    if (hasSave) void onContinue();
    else setScreen('newGame');
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        primaryAction();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const userLabel = isSignedIn(gameState.user)
    ? `${t('menu.signedInAs')}: ${gameState.user.displayName || gameState.user.email || ''}`
    : t('menu.guestBadge');

  return (
    <main className="safe-hud-pad pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-8">
      <div
        className="primordia-scroll pointer-events-auto flex max-h-[90dvh] max-w-sm flex-col overflow-y-auto rounded-xl border border-stone-800/90 p-5 sm:p-7"
        style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}
      >
        <div className="flex items-center gap-3">
          <PrimordiaEmblem className="h-10 w-10 shrink-0" />
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-wider text-stone-100 leading-none">
              {t('app.title')}
            </h1>
            <p className="mt-1 text-xs text-stone-400">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
          <span>{userLabel}</span>
          <span>·</span>
          <span className="font-mono-tabular">{GAME_VERSION}</span>
          {!online && <span className="rounded bg-emerald-950/70 px-1.5 py-0.5 text-[10px] text-emerald-300">{t('menu.offlineReady')}</span>}
        </div>

        <nav className="mt-4 flex flex-col gap-2" aria-label="Main Menu">
          {hasSave && (
            <button
              type="button"
              data-start="true"
              disabled={busy}
              onClick={(e) => {
                e.currentTarget.blur();
                void onContinue();
              }}
              className="min-h-[56px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-left text-base font-semibold text-white transition-colors hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-70"
            >
              <span className="block">{t('menu.continue')}</span>
              {summarySave && (
                <span className="block text-xs font-normal text-orange-100/90">
                  {summarySave.avatar?.name || 'Arka-01'} · {formatPlaytime(summarySave.playtimeSec)} ·{' '}
                  {new Date(summarySave.updatedAt).toLocaleDateString()}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            data-start={hasSave ? undefined : 'true'}
            onClick={() => setScreen('newGame')}
            className={
              hasSave
                ? 'min-h-[48px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800'
                : 'min-h-[56px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-left text-base font-semibold text-white transition-colors hover:bg-orange-500'
            }
          >
            {t('menu.newGame')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="min-h-[48px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.settings')}
          </button>

          {canInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="min-h-[40px] w-full rounded-lg border border-orange-600/70 bg-orange-950/40 px-5 py-2 text-left text-xs font-semibold text-orange-200 hover:bg-orange-900/50"
            >
              {t('menu.installApp')}
            </button>
          )}

          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScreen('auth')}
              className="min-h-[40px] rounded-lg border border-stone-800 bg-stone-900/80 px-3 py-1.5 text-center text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
            >
              {t('menu.account')}
            </button>
            <button
              type="button"
              onClick={() => setScreen('credits')}
              className="min-h-[40px] rounded-lg border border-stone-800 bg-stone-900/80 px-3 py-1.5 text-center text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
            >
              {t('menu.credits')}
            </button>
          </div>
        </nav>
      </div>

      <div className="hidden sm:block text-xs text-stone-300/85">{t('hud.controlsHint')}</div>

      <LegacySavePicker
        choices={legacyChoices}
        onChoose={(save) => {
          if (resolveLegacyChoice(save)) setLegacyChoices([]);
        }}
      />
      <CloudConflictDialog
        conflict={conflict}
        onKeepLocal={() => {
          const c = conflict;
          if (!c) return;
          setConflict(null);
          void applyConflictChoice('local', c.local, c.cloud).then((save) => loadExpedition(save));
        }}
        onKeepCloud={() => {
          const c = conflict;
          if (!c) return;
          setConflict(null);
          void applyConflictChoice('cloud', c.local, c.cloud).then((save) => {
            setLocalTick((n) => n + 1);
            loadExpedition(save);
          });
        }}
      />
    </main>
  );
}
