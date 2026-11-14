import React from 'react';
import { gameState } from '../game/core/state';
import { respawnExplorer, returnToMainMenu } from '../game/main';
import { t } from '../game/utils/i18n';

export function GameOverModal() {
  const sec = Math.round(gameState.playtimeSec);
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  const timeText = `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(14, 7, 6, 0.88)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border border-red-900/70 bg-[#160e0d] p-5 sm:p-7 shadow-2xl">
        <h2 className="font-display text-3xl font-bold text-red-400">{t('gameOver.title')}</h2>
        <p className="mt-2 text-sm text-stone-300">{t(`gameOver.${gameState.deathReason}`)}</p>

        <div className="mt-6 grid grid-cols-3 gap-3 rounded-lg border border-stone-800 bg-stone-950/80 p-4 text-center">
          <div>
            <div className="text-[11px] text-stone-400">{t('gameOver.statTime')}</div>
            <div className="font-mono-tabular mt-1 text-lg font-semibold text-stone-100">{timeText}</div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">{t('gameOver.statQuests')}</div>
            <div className="font-mono-tabular mt-1 text-lg font-semibold text-stone-100">
              {gameState.completedQuests.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">{t('gameOver.statDistance')}</div>
            <div className="font-mono-tabular mt-1 text-lg font-semibold text-stone-100">
              {Math.round(gameState.distanceExplored)} m
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={() => respawnExplorer()}
            className="min-h-[48px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('gameOver.respawn')}
          </button>
          <button
            type="button"
            onClick={() => returnToMainMenu()}
            className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('gameOver.mainMenu')}
          </button>
        </div>
      </section>
    </main>
  );
}
