import React, { useEffect, useState } from 'react';
import { gameState, setScreen } from '../game/core/state';
import type { BrukChoice } from '../game/data/bruk';
import { chooseBrukEnding } from '../game/systems/bruk';
import { computeExpeditionScore, returnToMainMenu, startNewGamePlus } from '../game/main';
import { submitLeaderboardScore } from '../game/net/leaderboard';
import { t } from '../game/utils/i18n';

export function VictoryModal() {
  const score = computeExpeditionScore();
  const [choice, setChoice] = useState<BrukChoice | null>(gameState.brukChoice);
  const pick = (c: BrukChoice) => {
    chooseBrukEnding(c);
    setChoice(c);
  };

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
        {choice === null ? (
          <div role="group" aria-labelledby="bruk-ending-title">
            <h2 id="bruk-ending-title" className="font-display text-xl sm:text-2xl font-bold text-amber-300">{t('bruk.name')}</h2>
            <p className="mt-3 text-base leading-relaxed text-stone-100">{t('bruk.lines.ending')}</p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => pick('release')}
                className="min-h-[48px] w-full rounded-lg border border-amber-700/80 bg-amber-950/40 px-5 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-900/50"
              >
                {t('bruk.choice.release.label')}
              </button>
              <button
                type="button"
                onClick={() => pick('hold')}
                className="min-h-[48px] w-full rounded-lg border border-stone-600 bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-100 hover:bg-stone-800"
              >
                {t('bruk.choice.hold.label')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-5 rounded-lg border border-amber-800/70 bg-stone-950/80 p-3 text-sm italic leading-relaxed text-amber-100">
              <span className="mb-1 block text-[10px] font-bold uppercase not-italic tracking-wider text-amber-400">{t('bruk.name')}</span>
              {t(`bruk.choice.${choice}.reply`)}
            </p>
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
          </>
        )}
      </section>
    </main>
  );
}
