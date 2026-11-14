import React, { useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type DifficultyLevel,
  type GameSettings,
  type GraphicsPreset,
  type KeyBindings,
  type LanguageCode,
} from '../game/config';
import { gameState, saveSettingsToLocal, setScreen } from '../game/core/state';
import { pushCloudSettings } from '../game/net/settingsSync';
import { clearAllGameStorage, writeStorage } from '../game/utils/storage';
import { eventBus } from '../game/core/eventBus';
import { t } from '../game/utils/i18n';
import { ConfirmDialog } from './ConfirmDialog';

type TabId = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'language' | 'account';

export function SettingsScreen() {
  const [tab, setTab] = useState<TabId>('graphics');
  const [draft, setDraft] = useState<GameSettings>(() => JSON.parse(JSON.stringify(gameState.settings)));
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const returnTarget = gameState.previousScreen === 'pause' ? 'pause' : 'menu';

  const applyAndSave = (next: GameSettings) => {
    setDraft(next);
    saveSettingsToLocal(next);
  };

  const applyPreset = (preset: GraphicsPreset) => {
    const viewDistance = preset === 'low' ? 85 : preset === 'medium' ? 120 : 165;
    const shadows = preset !== 'low';
    const particles = preset !== 'low';
    applyAndSave({
      ...draft,
      graphics: { ...draft.graphics, preset, viewDistance, shadows, particles },
    });
  };

  const handleKeyCapture = (action: keyof KeyBindings) => {
    setListeningKey(action);
    const listener = (e: KeyboardEvent) => {
      e.preventDefault();
      window.removeEventListener('keydown', listener);
      setListeningKey(null);
      applyAndSave({
        ...draft,
        controls: {
          ...draft.controls,
          keys: { ...draft.controls.keys, [action]: e.code },
        },
      });
    };
    window.addEventListener('keydown', listener, { once: true });
  };

  const tabs: TabId[] = ['graphics', 'audio', 'controls', 'gameplay', 'language', 'account'];

  return (
    <main className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.88)' }}>
      <section className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
          <h2 className="font-display text-3xl font-semibold text-stone-100">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen(returnTarget)}
            className="min-h-[44px] rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('settings.saveClose')}
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-b border-stone-800 px-6 py-2">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[40px] whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-orange-600 text-white'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-white'
              }`}
            >
              {t(`settings.tabs.${id}`)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="primordia-scroll flex-1 space-y-5 overflow-y-auto p-6">
          {tab === 'graphics' && (
            <>
              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.preset')}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as GraphicsPreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                        draft.graphics.preset === p
                          ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                          : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      {t(`settings.presets.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm text-stone-300">
                  <label htmlFor="view-dist">{t('settings.viewDistance')}</label>
                  <span className="font-mono-tabular">{draft.graphics.viewDistance} m</span>
                </div>
                <input
                  id="view-dist"
                  type="range"
                  min="70"
                  max="180"
                  step="5"
                  value={draft.graphics.viewDistance}
                  onChange={(e) =>
                    applyAndSave({
                      ...draft,
                      graphics: { ...draft.graphics, viewDistance: Number(e.target.value) },
                    })
                  }
                  className="mt-2 w-full accent-orange-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-200">{t('settings.shadows')}</span>
                <button
                  type="button"
                  onClick={() =>
                    applyAndSave({
                      ...draft,
                      graphics: { ...draft.graphics, shadows: !draft.graphics.shadows },
                    })
                  }
                  className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
                    draft.graphics.shadows ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {draft.graphics.shadows ? t('common.on') : t('common.off')}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-200">{t('settings.particles')}</span>
                <button
                  type="button"
                  onClick={() =>
                    applyAndSave({
                      ...draft,
                      graphics: { ...draft.graphics, particles: !draft.graphics.particles },
                    })
                  }
                  className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
                    draft.graphics.particles ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {draft.graphics.particles ? t('common.on') : t('common.off')}
                </button>
              </div>

              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.fpsLimit')}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[30, 60, 120].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() =>
                        applyAndSave({ ...draft, graphics: { ...draft.graphics, fpsLimit: fps } })
                      }
                      className={`font-mono-tabular min-h-[40px] rounded-lg border text-sm ${
                        draft.graphics.fpsLimit === fps
                          ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                          : 'border-stone-800 bg-stone-900 text-stone-300'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'audio' && (
            <div className="space-y-4">
              {(
                [
                  ['master', 'masterVol'],
                  ['music', 'musicVol'],
                  ['sfx', 'sfxVol'],
                  ['ambient', 'ambientVol'],
                ] as const
              ).map(([field, labelKey]) => (
                <div key={field}>
                  <div className="flex justify-between text-sm text-stone-300">
                    <label htmlFor={`vol-${field}`}>{t(`settings.${labelKey}`)}</label>
                    <span className="font-mono-tabular">{Math.round(draft.audio[field] * 100)}%</span>
                  </div>
                  <input
                    id={`vol-${field}`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.audio[field]}
                    onChange={(e) =>
                      applyAndSave({
                        ...draft,
                        audio: { ...draft.audio, [field]: Number(e.target.value) },
                      })
                    }
                    className="mt-2 w-full accent-orange-600"
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'controls' && (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-sm text-stone-300">
                  <label htmlFor="cam-sens">{t('settings.sensitivity')}</label>
                  <span className="font-mono-tabular">{draft.controls.sensitivity.toFixed(1)}x</span>
                </div>
                <input
                  id="cam-sens"
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.1"
                  value={draft.controls.sensitivity}
                  onChange={(e) =>
                    applyAndSave({
                      ...draft,
                      controls: { ...draft.controls, sensitivity: Number(e.target.value) },
                    })
                  }
                  className="mt-2 w-full accent-orange-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm text-stone-300">
                  <label htmlFor="joy-size">{t('settings.joystickSize')}</label>
                  <span className="font-mono-tabular">{Math.round(draft.controls.joystickSize * 100)}%</span>
                </div>
                <input
                  id="joy-size"
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.1"
                  value={draft.controls.joystickSize}
                  onChange={(e) =>
                    applyAndSave({
                      ...draft,
                      controls: { ...draft.controls, joystickSize: Number(e.target.value) },
                    })
                  }
                  className="mt-2 w-full accent-orange-600"
                />
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-stone-300">{t('settings.keyBindings')}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(Object.keys(draft.controls.keys) as Array<keyof KeyBindings>).map((action) => (
                    <div
                      key={action}
                      className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2"
                    >
                      <span className="text-sm capitalize text-stone-300">{action}</span>
                      <button
                        type="button"
                        onClick={() => handleKeyCapture(action)}
                        className="font-mono-tabular min-h-[36px] rounded border border-stone-700 bg-stone-950 px-3 text-xs text-orange-300 hover:border-orange-500"
                      >
                        {listeningKey === action ? t('settings.pressKey') : draft.controls.keys[action]}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'gameplay' && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.difficulty')}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['explorer', 'survivor', 'hadean'] as DifficultyLevel[]).map((d) => {
                    const key = d === 'explorer' ? 'diffExplorer' : d === 'survivor' ? 'diffSurvivor' : 'diffHadean';
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          applyAndSave({ ...draft, gameplay: { ...draft.gameplay, difficulty: d } })
                        }
                        className={`min-h-[44px] rounded-lg border px-2 text-xs font-medium ${
                          draft.gameplay.difficulty === d
                            ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                            : 'border-stone-800 bg-stone-900 text-stone-300'
                        }`}
                      >
                        {t(`newGame.${key}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-200">{t('settings.showHud')}</span>
                <button
                  type="button"
                  onClick={() =>
                    applyAndSave({
                      ...draft,
                      gameplay: { ...draft.gameplay, showHud: !draft.gameplay.showHud },
                    })
                  }
                  className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
                    draft.gameplay.showHud ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {draft.gameplay.showHud ? t('common.on') : t('common.off')}
                </button>
              </div>

              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.units')}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['metric', 'imperial'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() =>
                        applyAndSave({ ...draft, gameplay: { ...draft.gameplay, units: u } })
                      }
                      className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                        draft.gameplay.units === u
                          ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                          : 'border-stone-800 bg-stone-900 text-stone-300'
                      }`}
                    >
                      {t(`settings.${u}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'language' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-stone-300">{t('settings.languageLabel')}</div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['id', 'Bahasa Indonesia (Default)'],
                    ['en', 'English'],
                  ] as Array<[LanguageCode, string]>
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => applyAndSave({ ...draft, language: code })}
                    className={`min-h-[48px] rounded-lg border px-4 text-sm font-medium ${
                      draft.language === code
                        ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                        : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'account' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={async () => {
                  const ok = await pushCloudSettings();
                  eventBus.emit('toast:show', {
                    text: ok ? t('pause.savedToast') : t('auth.notConfigured'),
                    type: ok ? 'success' : 'warn',
                  });
                }}
                className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-left text-sm font-medium text-stone-200 hover:bg-stone-800"
              >
                {t('settings.syncNow')}
              </button>

              <button
                type="button"
                onClick={() => {
                  gameState.onboardingDone = false;
                  writeStorage('onboarding_done', false);
                  setScreen('onboarding');
                }}
                className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-left text-sm font-medium text-stone-200 hover:bg-stone-800"
              >
                {t('settings.resetOnboarding')}
              </button>

              <button
                type="button"
                onClick={() => applyAndSave(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))}
                className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-left text-sm font-medium text-stone-200 hover:bg-stone-800"
              >
                {t('settings.reset')}
              </button>

              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[44px] w-full rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-2 text-left text-sm font-medium text-red-300 hover:bg-red-950/60"
              >
                {t('settings.clearLocalData')}
              </button>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title={t('settings.confirmClearTitle')}
        body={t('settings.confirmClearBody')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAllGameStorage();
          setConfirmClear(false);
          applyAndSave(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
        }}
      />
    </main>
  );
}
