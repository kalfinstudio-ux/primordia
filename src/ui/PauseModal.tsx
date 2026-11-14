import { WisdomPanel } from './WisdomPanel';
import { ExitGameButton } from './ExitGameButton';
import React, { useState } from 'react';
import { gameState, setScreen } from '../game/core/state';
import { returnToMainMenu, saveCurrentSlot } from '../game/main';
import { multiplayer } from '../game/net/multiplayer';
import { t } from '../game/utils/i18n';

export function PauseModal() {
  const [mpOn, setMpOn] = useState(() => multiplayer.isEnabled());
  const mpStatus = multiplayer.getStatus();
  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.82)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-5 sm:p-6 shadow-2xl">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-100">{t('pause.title')}</h2>


        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[46px] w-full rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('pause.resume')}
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => saveCurrentSlot(1, true)}
              className="min-h-[42px] rounded-lg border border-stone-700 bg-stone-900 px-2 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800"
            >
              {t('pause.saveLocal')}
            </button>
            <button
              type="button"
              onClick={() => saveCurrentSlot(2, true)}
              className="min-h-[42px] rounded-lg border border-stone-700 bg-stone-900 px-2 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800"
            >
              {t('pause.saveSlot2')}
            </button>
            <button
              type="button"
              onClick={() => saveCurrentSlot(3, true)}
              className="min-h-[42px] rounded-lg border border-stone-700 bg-stone-900 px-2 py-2 text-xs font-medium text-stone-100 hover:bg-stone-800"
            >
              {t('pause.saveSlot3')}
            </button>
          </div>

          {gameState.user.mode === 'authenticated' && (
            <button
              type="button"
              onClick={() => saveCurrentSlot(1, true)}
              className="min-h-[42px] w-full rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-orange-300 hover:bg-stone-800"
            >
              {t('pause.saveCloud')}
            </button>
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
