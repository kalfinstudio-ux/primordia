import React, { useState } from 'react';
import { completeOnboarding } from '../game/main';
import { gameState } from '../game/core/state';
import { t } from '../game/utils/i18n';
import { PrimordiaEmblem } from './ItemIcon';

export function OnboardingScreen() {
  const [step, setStep] = useState(0);

  const slides = [
    {
      title: t('onboarding.slide1Title'),
      body: t('onboarding.slide1Body'),
      extra: null,
    },
    {
      title: t('onboarding.slide2Title'),
      body: t('onboarding.slide2Body'),
      extra: null,
    },
    {
      title: t('onboarding.slide3Title'),
      body: t('onboarding.slide3Body'),
      extra: null,
    },
    {
      title: t('onboarding.slide4Title'),
      body: t('onboarding.slide4Body'),
      extra: `${t('onboarding.detectedPreset')}: ${t(`settings.presets.${gameState.settings.graphics.preset}`)}`,
    },
  ];

  const current = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-8" style={{ backgroundColor: 'rgba(11, 9, 8, 0.84)' }}>
      <section className="w-full max-w-xl rounded-xl border border-stone-800 bg-[#14100e] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PrimordiaEmblem className="h-8 w-8" />
            <span className="font-display text-xl font-bold tracking-wide text-stone-100">
              {t('app.title')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => completeOnboarding()}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
          >
            {t('onboarding.skip')}
          </button>
        </div>

        <div className="mt-6 border-t border-stone-800 pt-6">
          <div className="font-mono-tabular text-xs text-orange-400">
            0{step + 1} / 0{slides.length}
          </div>
          <h2 className="font-display mt-2 text-3xl font-semibold text-stone-100">
            {current.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-stone-300">{current.body}</p>
          {current.extra && (
            <div className="mt-4 rounded-lg border border-stone-800 bg-stone-900/80 px-4 py-3 text-sm font-medium text-amber-300">
              {current.extra}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Slide ${idx + 1}`}
                onClick={() => setStep(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  idx === step ? 'w-8 bg-orange-600' : 'w-2.5 bg-stone-700 hover:bg-stone-500'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
              >
                {t('onboarding.prev')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? completeOnboarding() : setStep((s) => s + 1))}
              className="min-h-[44px] rounded-lg bg-orange-600 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
