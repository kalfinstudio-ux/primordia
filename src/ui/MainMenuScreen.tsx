import React, { useEffect } from 'react';
import { GAME_VERSION } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { continueLatestExpedition } from '../game/main';
import { t } from '../game/utils/i18n';
import { PrimordiaEmblem } from './ItemIcon';

export function MainMenuScreen() {
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
    <main className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10">
      {/* Left negative-space menu column leaving right 65% live 3D volcano flyover completely unobstructed */}
      <div className="pointer-events-auto flex max-w-sm flex-col rounded-xl border border-stone-800/90 p-6 sm:p-8" style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}>
        <div className="flex items-center gap-3">
          <PrimordiaEmblem className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="font-display text-4xl font-bold tracking-wider text-stone-100 leading-none">
              {t('app.title')}
            </h1>
            <p className="mt-1 text-xs text-stone-400">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="mt-3 text-xs text-stone-400">
          {userLabel} · <span className="font-mono-tabular">{GAME_VERSION}</span>
        </div>

        <nav className="mt-6 flex flex-col gap-2.5" aria-label="Main Menu">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              continueLatestExpedition();
            }}
            className="min-h-[48px] w-full rounded-lg bg-orange-600 px-5 py-3 text-left text-base font-semibold text-white transition-colors hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            {t('menu.continue')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('newGame')}
            className="min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2.5 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.newGame')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('loadGame')}
            className="min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2.5 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.loadGame')}
          </button>

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-900/90 px-5 py-2.5 text-left text-sm font-medium text-stone-100 transition-colors hover:border-stone-700 hover:bg-stone-800"
          >
            {t('menu.settings')}
          </button>

          <div className="mt-1 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setScreen('auth')}
              className="min-h-[44px] rounded-lg border border-stone-800 bg-stone-900/80 px-3 py-2 text-center text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
            >
              {t('menu.account')}
            </button>
            <button
              type="button"
              onClick={() => setScreen('credits')}
              className="min-h-[44px] rounded-lg border border-stone-800 bg-stone-900/80 px-3 py-2 text-center text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
            >
              {t('menu.credits')}
            </button>
          </div>
        </nav>
      </div>

      <div className="text-xs text-stone-300/85">
        {t('hud.controlsHint')}
      </div>
    </main>
  );
}
