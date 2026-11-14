import React from 'react';
import { GAME_VERSION } from '../game/config';
import { setScreen } from '../game/core/state';
import { t } from '../game/utils/i18n';
import { PrimordiaEmblem } from './ItemIcon';

export function CreditsScreen() {
  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.86)' }}>
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <PrimordiaEmblem className="h-10 w-10" />
          <div>
            <h2 className="font-display text-3xl font-semibold text-stone-100">{t('credits.title')}</h2>
            <div className="font-mono-tabular text-xs text-orange-400">{GAME_VERSION}</div>
          </div>
        </div>

        <p className="mt-5 text-base font-medium text-stone-200">{t('credits.lead')}</p>
        <p className="mt-2 text-sm leading-relaxed text-stone-400">{t('credits.engine')}</p>

        <div className="mt-8 flex justify-end border-t border-stone-800 pt-5">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="min-h-[44px] rounded-lg bg-orange-600 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('credits.back')}
          </button>
        </div>
      </section>
    </main>
  );
}
