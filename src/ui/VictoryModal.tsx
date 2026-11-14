import React, { useEffect } from 'react';
import { setScreen } from '../game/core/state';
import { computeExpeditionScore, returnToMainMenu, startNewGamePlus } from '../game/main';
import { submitLeaderboardScore } from '../game/net/leaderboard';
import { t } from '../game/utils/i18n';

export function VictoryModal() {
  const score = computeExpeditionScore();

  useEffect(() => {
    void submitLeaderboardScore(score);
  }, [score]);

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8, 14, 12, 0.9)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-emerald-700/80 bg-[#0f1714] p-6 sm:p-8 shadow-2xl">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-emerald-300">{t('victory.title')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-300">{t('victory.subtitle')}</p>

        <div className="mt-5 rounded-lg border border-emerald-900/70 bg-stone-950/80 p-4 text-center">
          <div className="text-xs text-stone-400">{t('victory.scoreLabel')}</div>
          <div className="font-mono-tabular mt-1 text-3xl font-bold text-emerald-400">{score}</div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[46px] w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            {t('victory.continueExplore')}
          </button>
          <button
            type="button"
            onClick={() => startNewGamePlus()}
            className="min-h-[44px] w-full rounded-lg border border-orange-600/80 bg-orange-950/40 px-5 py-2.5 text-sm font-medium text-orange-200 hover:bg-orange-900/50"
          >
            {t('victory.startNgPlus')}
          </button>
          <button
            type="button"
            onClick={() => returnToMainMenu()}
            className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('victory.mainMenu')}
          </button>
        </div>
      </section>
    </main>
  );
}
