import { ERA_LORE, ERA_NAME, getEdenCalendar, randomPrimordialName } from '../game/data/eden';
import React, { useState } from 'react';
import type { AvatarConfig, BodyBuild, DifficultyLevel, HairStyle, PackStyle } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { startNewExpedition } from '../game/main';
import { t } from '../game/utils/i18n';
import { CharacterPreviewCanvas } from './CharacterPreviewCanvas';

const SKIN_TONES = ['#f1c27d', '#c68b59', '#8d5524', '#5c3818'];
const HAIR_COLORS = ['#1c1917', '#57361c', '#9a3412', '#d6d3d1'];
const SUIT_COLORS = ['#ea580c', '#d97706', '#0284c7', '#65a30d'];
const BUILDS: BodyBuild[] = ['slim', 'standard', 'athletic'];
const HAIR_STYLES: HairStyle[] = ['short', 'ponytail', 'buzz', 'hood'];
const PACK_STYLES: PackStyle[] = ['o2_pack', 'expedition', 'scout'];

export function NewGameScreen() {
  const [name, setName] = useState(() => gameState.avatar.name && gameState.avatar.name !== t('newGame.defaultName') ? gameState.avatar.name : randomPrimordialName());
  const [height, setHeight] = useState(gameState.avatar.height);
  const [build, setBuild] = useState<BodyBuild>(gameState.avatar.build || 'standard');
  const [skinTone, setSkinTone] = useState(gameState.avatar.skinTone);
  const [hairColor, setHairColor] = useState(gameState.avatar.hairColor);
  const [hairStyle, setHairStyle] = useState<HairStyle>(gameState.avatar.hairStyle || 'short');
  const [suitColor, setSuitColor] = useState(gameState.avatar.suitColor);
  const [packStyle, setPackStyle] = useState<PackStyle>(gameState.avatar.packStyle || 'o2_pack');
  const [seed, setSeed] = useState(gameState.worldSeed || 'HADEAN-01');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(gameState.settings.gameplay.difficulty);

  const previewAvatar: AvatarConfig = {
    name: name.trim() || t('newGame.defaultName'),
    height,
    build,
    skinTone,
    hairColor,
    hairStyle,
    suitColor,
    packStyle,
  };

  const randomizeSeed = () => {
    const code = Math.floor(100 + Math.random() * 899);
    const prefixes = ['HADEAN', 'ARCHEAN', 'BASALT', 'CRATER', 'MAGMA'];
    setSeed(`${prefixes[code % prefixes.length]}-${code}`);
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    startNewExpedition(seed.trim() || 'HADEAN-01', previewAvatar, difficulty);
  };

  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.86)' }}>
      <form
        onSubmit={handleLaunch}
        className="primordia-scroll max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-5 sm:p-7 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-3.5">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-100">{t('newGame.title')}</h2>
            {gameState.newGamePlusCount > 0 && (
              <span className="mt-0.5 inline-block text-xs font-medium text-emerald-400">
                {t('newGame.ngPlusBadge')} (NG+{gameState.newGamePlusCount})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="min-h-[40px] rounded-lg px-4 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
          >
            {t('newGame.cancel')}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <CharacterPreviewCanvas avatar={previewAvatar} />

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
                className="mt-1 min-h-[42px] w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setName(randomPrimordialName())}
                className="mt-1.5 text-xs text-orange-400 hover:text-orange-300"
              >
                🎲 Nama acak baru
              </button>
              <p className="mt-2 text-[11px] leading-snug text-stone-400">
                <span className="font-semibold text-stone-200">{ERA_NAME}</span> — {getEdenCalendar().label}. {ERA_LORE[1]}
              </p>
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
                  className="font-mono-tabular min-h-[42px] flex-1 rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={randomizeSeed}
                  className="min-h-[42px] rounded-lg border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-medium text-stone-200 hover:bg-stone-800"
                >
                  {t('newGame.randomizeSeed')}
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-stone-300">{t('newGame.difficulty')}</span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {(['explorer', 'survivor', 'hadean'] as DifficultyLevel[]).map((d) => {
                  const key = d === 'explorer' ? 'diffExplorer' : d === 'survivor' ? 'diffSurvivor' : 'diffHadean';
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`min-h-[40px] rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                        difficulty === d
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

          <div className="space-y-3.5">
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
                className="mt-1.5 w-full accent-orange-600"
              />
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.build')}</span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {BUILDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBuild(b)}
                    className={`min-h-[36px] rounded-lg border text-xs font-medium ${
                      build === b ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-stone-800 bg-stone-900 text-stone-300'
                    }`}
                  >
                    {t(`newGame.builds.${b}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.hairStyle')}</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {HAIR_STYLES.map((hs) => (
                  <button
                    key={hs}
                    type="button"
                    onClick={() => setHairStyle(hs)}
                    className={`min-h-[36px] rounded-lg border px-2 text-xs font-medium ${
                      hairStyle === hs ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-stone-800 bg-stone-900 text-stone-300'
                    }`}
                  >
                    {t(`newGame.hairStyles.${hs}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs text-stone-400">{t('newGame.packStyle')}</span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {PACK_STYLES.map((ps) => (
                  <button
                    key={ps}
                    type="button"
                    onClick={() => setPackStyle(ps)}
                    className={`min-h-[36px] rounded-lg border px-2 text-xs font-medium ${
                      packStyle === ps ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-stone-800 bg-stone-900 text-stone-300'
                    }`}
                  >
                    {t(`newGame.packStyles.${ps}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <span className="block text-[11px] text-stone-400">{t('newGame.skinTone')}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SKIN_TONES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Skin ${c}`}
                      onClick={() => setSkinTone(c)}
                      className={`h-8 w-8 rounded-md border-2 ${skinTone === c ? 'border-orange-500' : 'border-stone-700'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[11px] text-stone-400">{t('newGame.hairColor')}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {HAIR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Hair ${c}`}
                      onClick={() => setHairColor(c)}
                      className={`h-8 w-8 rounded-md border-2 ${hairColor === c ? 'border-orange-500' : 'border-stone-700'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[11px] text-stone-400">{t('newGame.suitColor')}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SUIT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Suit ${c}`}
                      onClick={() => setSuitColor(c)}
                      className={`h-8 w-8 rounded-md border-2 ${suitColor === c ? 'border-white' : 'border-stone-700'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-stone-800 pt-4">
          <button
            type="submit"
            data-start="true"
            className="min-h-[46px] rounded-lg bg-orange-600 px-8 py-2.5 text-sm sm:text-base font-semibold text-white hover:bg-orange-500"
          >
            {t('newGame.start')}
          </button>
        </div>
      </form>
    </main>
  );
}
