import { WisdomPanel } from './WisdomPanel';
import { ExitGameButton } from './ExitGameButton';
import React, { useState } from 'react';
import { gameState, setScreen } from '../game/core/state';
import { getImmortalAge, wisdomPointsEarned, wisdomPointsSpent } from '../game/data/eden';
import { returnToMainMenu, saveCurrentGame } from '../game/main';
import { multiplayer } from '../game/net/multiplayer';
import { t } from '../game/utils/i18n';

export function PauseModal() {
  const [mpOn, setMpOn] = useState(() => multiplayer.isEnabled());
  const mpStatus = multiplayer.getStatus();
  const age = getImmortalAge(gameState.bornAtMs);
  const earnedWp = wisdomPointsEarned(age.totalSeconds);
  const availWp = Math.max(0, earnedWp - wisdomPointsSpent(gameState.wisdomPerks));
  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.82)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-5 sm:p-6 shadow-2xl">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-100">{t('pause.title')}</h2>

        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-stone-800 bg-stone-950/90 p-2.5 text-center text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-stone-400">{t('social.age')}</dt>
            <dd className="mt-0.5 font-semibold text-amber-200">{age.years}t {age.days}h {age.hours}j</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-stone-400">{t('social.deaths')}</dt>
            <dd className="mt-0.5 font-semibold text-stone-100">{gameState.deaths}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-stone-400">{t('social.wisdom')}</dt>
            <dd className="mt-0.5 font-semibold text-amber-300">{availWp}/{earnedWp}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[46px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('pause.resume')}
          </button>

          <button
            type="button"
            onClick={() => saveCurrentGame()}
            className="min-h-[48px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-stone-100 hover:bg-stone-800"
          >
            {t('pause.save')}
          </button>
          {gameState.user.mode === 'authenticated' && (
            <p className="-mt-1 text-center text-[11px] text-stone-500">{t('pause.saveCloudHint')}</p>
          )}

          {multiplayer.isAvailable() && (
            <div className="rounded-lg border border-stone-700 bg-stone-900 p-2.5">
              <button
                type="button"
                onClick={() => {
                  const next = !mpOn;
                  setMpOn(next);
                  multiplayer.setEnabled(next);
                }}
                className="min-h-[42px] w-full rounded-lg border border-stone-700 bg-stone-950 px-4 py-2 text-sm font-medium text-yellow-200 hover:bg-stone-800"
              >
                {t('mp.title')}: {mpOn ? t('mp.on') : t('mp.off')}
              </button>
              <p className="mt-1.5 text-[11px] leading-snug text-stone-400">
                {mpOn && mpStatus === 'error' ? t('mp.error') : t('mp.privacy')}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="min-h-[42px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('pause.settings')}
          </button>

          <button
            type="button"
            onClick={() => returnToMainMenu()}
            className="min-h-[42px] w-full rounded-lg border border-stone-800 bg-stone-950 px-5 py-2 text-sm font-medium text-stone-300 hover:border-red-800 hover:text-red-200"
          >
            {t('pause.mainMenu')}
          </button>

          <ExitGameButton />
        </div>
        <WisdomPanel />
      </section>
    </main>
  );
}
