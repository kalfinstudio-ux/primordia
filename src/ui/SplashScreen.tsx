import React, { useEffect, useState } from 'react';
import { eventBus } from '../game/core/eventBus';
import { GAME_VERSION } from '../game/config';
import { getTipList, t } from '../game/utils/i18n';
import { PrimordiaEmblem } from './ItemIcon';

export function SplashScreen() {
  const [progress, setProgress] = useState(10);
  const [tipIndex, setTipIndex] = useState(0);
  const tips = getTipList();

  useEffect(() => {
    const unsub = eventBus.on<{ progress: number }>('assets:progress', (p) => {
      if (typeof p?.progress === 'number') setProgress(p.progress);
    });
    const timer = setInterval(() => {
      setTipIndex((i) => (i + 1) % Math.max(1, tips.length));
    }, 3500);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [tips.length]);

  return (
    <main className="fixed inset-0 z-30 flex flex-col items-center justify-between px-6 py-10" style={{ backgroundColor: 'rgba(11, 9, 8, 0.88)' }}>
      <div className="text-xs font-mono-tabular text-stone-400">{GAME_VERSION}</div>

      <div className="flex w-full max-w-md flex-col items-center text-center">
        <PrimordiaEmblem className="h-16 w-16" />
        <h1 className="font-display mt-4 text-5xl font-bold tracking-wider text-stone-100">
          {t('app.title')}
        </h1>
        <p className="mt-1 text-sm text-stone-400">{t('app.subtitle')}</p>

        <div className="mt-8 w-full">
          <div className="mb-2 flex items-center justify-between text-xs text-stone-300">
            <span>{progress >= 100 ? t('splash.ready') : t('splash.loading')}</span>
            <span className="font-mono-tabular">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-900 border border-stone-800">
            <div
              className="h-full bg-orange-600 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg text-center">
        <div className="text-xs font-medium text-orange-400">{t('splash.tipLabel')}</div>
        <p className="mt-1 text-sm text-stone-300">{tips[tipIndex] || ''}</p>
      </div>
    </main>
  );
}
