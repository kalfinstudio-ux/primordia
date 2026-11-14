import React from 'react';
import { gameState, setScreen } from '../game/core/state';
import { returnToMainMenu, saveCurrentSlot } from '../game/main';
import { t } from '../game/utils/i18n';

export function PauseModal() {
  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.82)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="w-full max-w-sm rounded-xl border border-stone-800 bg-[#14100e] p-6 shadow-2xl">
        <h2 className="font-display text-3xl font-semibold text-stone-100">{t('pause.title')}</h2>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[48px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('pause.resume')}
          </button>

          <button
            type="button"
            onClick={() => saveCurrentSlot(1, true)}
            className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-100 hover:bg-stone-800"
          >
            {t('pause.saveLocal')}
          </button>

          {gameState.user.mode === 'authenticated' && (
            <button
              type="button"
              onClick={() => saveCurrentSlot(1, true)}
              className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2.5 text-sm font-medium text-orange-300 hover:bg-stone-800"
            >
              {t('pause.saveCloud')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('pause.settings')}
          </button>

          <button
            type="button"
            onClick={() => returnToMainMenu()}
            className="min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-950 px-5 py-2.5 text-sm font-medium text-stone-300 hover:border-red-800 hover:text-red-200"
          >
            {t('pause.mainMenu')}
          </button>
        </div>
      </section>
    </main>
  );
}
