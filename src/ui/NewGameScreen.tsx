import React, { useState } from 'react';
import type { AvatarConfig, DifficultyLevel } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { startNewExpedition } from '../game/main';
import { t } from '../game/utils/i18n';

const SKIN_TONES = ['#f1c27d', '#c68b59', '#8d5524', '#5c3818'];
const HAIR_COLORS = ['#1c1917', '#57361c', '#9a3412', '#d6d3d1'];
const SUIT_COLORS = ['#ea580c', '#d97706', '#0284c7', '#65a30d'];

export function NewGameScreen() {
  const [name, setName] = useState(gameState.avatar.name || t('newGame.defaultName'));
  const [height, setHeight] = useState(gameState.avatar.height);
  const [skinTone, setSkinTone] = useState(gameState.avatar.skinTone);
  const [hairColor, setHairColor] = useState(gameState.avatar.hairColor);
  const [suitColor, setSuitColor] = useState(gameState.avatar.suitColor);
  const [seed, setSeed] = useState(gameState.worldSeed || 'HADEAN-01');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(gameState.settings.gameplay.difficulty);

  const randomizeSeed = () => {
    const code = Math.floor(100 + Math.random() * 899);
    const prefixes = ['HADEAN', 'ARCHEAN', 'BASALT', 'CRATER', 'MAGMA'];
    setSeed(`${prefixes[code % prefixes.length]}-${code}`);
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    const avatar: AvatarConfig = {
      name: name.trim() || t('newGame.defaultName'),
      height,
      skinTone,
      hairColor,
      suitColor,
    };
    startNewExpedition(seed.trim() || 'HADEAN-01', avatar, difficulty);
  };

  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.86)' }}>
      <form
        onSubmit={handleLaunch}
        className="primordia-scroll max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-6 sm:p-8 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-4">
          <h2 className="font-display text-3xl font-semibold text-stone-100">{t('newGame.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm text-stone-300 hover:bg-stone-800"
          >
            {t('newGame.cancel')}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="explorer-name" className="block text-xs font-medium text-stone-300">
                {t('newGame.explorerName')}
              </label>
              <input
                id="explorer-name"
                type="text"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="world-seed" className="block text-xs font-medium text-stone-300">
                {t('newGame.worldSeed')}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="world-seed"
                  type="text"
                  maxLength={24}
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="font-mono-tabular min-h-[44px] flex-1 rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={randomizeSeed}
                  className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-medium text-stone-200 hover:bg-stone-800"
                >
                  {t('newGame.randomizeSeed')}
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-stone-300">{t('newGame.difficulty')}</span>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {(['explorer', 'survivor', 'hadean'] as DifficultyLevel[]).map((d) => {
                  const key = d === 'explorer' ? 'diffExplorer' : d === 'survivor' ? 'diffSurvivor' : 'diffHadean';
                  const active = difficulty === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`min-h-[44px] rounded-lg border px-4 py-2 text-left text-sm font-medium transition-colors ${
                        active
                          ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                          : 'border-stone-800 bg-stone-900/70 text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      {t(`newGame.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-xs font-medium text-stone-300">{t('newGame.appearance')}</div>

            <div>
              <div className="flex justify-between text-xs text-stone-400">
                <label htmlFor="explorer-height">{t('newGame.height')}</label>
                <span className="font-mono-tabular">{Math.round(height * 175)} cm</span>
              </div>
              <input
                id="explorer-height"
                type="range"
                min="0.9"
                max="1.15"
                step="0.01"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value))}
                className="mt-2 w-full accent-orange-600"
              />
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.skinTone')}</span>
              <div className="mt-2 flex gap-2.5">
                {SKIN_TONES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Skin ${c}`}
                    onClick={() => setSkinTone(c)}
                    className={`h-10 w-10 rounded-lg border-2 ${
                      skinTone === c ? 'border-orange-500 scale-105' : 'border-stone-700'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.hairColor')}</span>
              <div className="mt-2 flex gap-2.5">
                {HAIR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Hair ${c}`}
                    onClick={() => setHairColor(c)}
                    className={`h-10 w-10 rounded-lg border-2 ${
                      hairColor === c ? 'border-orange-500 scale-105' : 'border-stone-700'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.suitColor')}</span>
              <div className="mt-2 flex gap-2.5">
                {SUIT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Suit ${c}`}
                    onClick={() => setSuitColor(c)}
                    className={`h-10 w-10 rounded-lg border-2 ${
                      suitColor === c ? 'border-white scale-105' : 'border-stone-700'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end border-t border-stone-800 pt-5">
          <button
            type="submit"
            data-start="true"
            className="min-h-[48px] rounded-lg bg-orange-600 px-8 py-3 text-base font-semibold text-white hover:bg-orange-500"
          >
            {t('newGame.start')}
          </button>
        </div>
      </form>
    </main>
  );
}
