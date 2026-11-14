import React, { useEffect } from 'react';
import { GAME_VERSION } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { continueLatestExpedition } from '../game/main';
import { t } from '../game/utils/i18n';
import { PrimordiaEmblem } from './ItemIcon';
import { usePWAInstall } from './pwaInstall';

export function MainMenuScreen() {
  const { canInstall, online, promptInstall } = usePWAInstall();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        continueLatestExpedition();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const userLabel =
    gameState.user.mode === 'authenticated'
      ? `${t('menu.signedInAs')}: ${gameState.user.email}`
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
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              continueLatestExpedition();
            }}
            className="min-h-[44px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-left text-base font-semibold text-white transition-colors hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            {t('menu.continue')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('newGame')}
            className="min-h-[40px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.newGame')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('loadGame')}
            className="min-h-[40px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.loadGame')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="min-h-[40px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.settings')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('assets')}
            className="min-h-[40px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.assets')}
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
    </main>
  );
}
