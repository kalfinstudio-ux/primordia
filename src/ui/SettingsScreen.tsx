import React, { useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type DifficultyLevel,
  type GameSettings,
  type GraphicsPreset,
  type HandMode,
  type KeyBindings,
  type LanguageCode,
} from '../game/config';
import { gameState, saveSettingsToLocal, setScreen } from '../game/core/state';
import { pushCloudSettings } from '../game/net/settingsSync';
import { clearAllGameStorage, writeStorage } from '../game/utils/storage';
import { eventBus } from '../game/core/eventBus';
import { t } from '../game/utils/i18n';
import { ConfirmDialog } from './ConfirmDialog';
import { usePWAInstall } from './pwaInstall';

type TabId = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'language' | 'account';

export function SettingsScreen() {
  const [tab, setTab] = useState<TabId>('graphics');
  const [draft, setDraft] = useState<GameSettings>(() => JSON.parse(JSON.stringify(gameState.settings)));
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const { canInstall, promptInstall } = usePWAInstall();

  const returnTarget = gameState.previousScreen === 'pause' ? 'pause' : 'menu';

  const applyAndSave = (next: GameSettings) => {
    setDraft(next);
    saveSettingsToLocal(next);
  };

  const applyPreset = (preset: GraphicsPreset) => {
    const viewDistance = preset === 'low' ? 85 : preset === 'medium' ? 125 : 175;
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
    <main className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.88)' }}>
      <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-100">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen(returnTarget)}
            className="min-h-[40px] rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('settings.saveClose')}
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-stone-800 px-5 py-2">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[38px] whitespace-nowrap rounded-lg px-3 py-1 text-xs sm:text-sm font-medium transition-colors ${
                tab === id ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white'
              }`}
            >
              {t(`settings.tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="primordia-scroll flex-1 space-y-5 overflow-y-auto p-5">
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
                      className={`min-h-[42px] rounded-lg border text-sm font-medium ${
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
                  max="220"
                  step="5"
                  value={draft.graphics.viewDistance}
                  onChange={(e) =>
                    applyAndSave({ ...draft, graphics: { ...draft.graphics, viewDistance: Number(e.target.value) } })
                  }
                  className="mt-2 w-full accent-orange-600"
                />
              </div>

              <ToggleRow
                label={t('settings.shadows')}
                enabled={draft.graphics.shadows}
                onToggle={() =>
                  applyAndSave({ ...draft, graphics: { ...draft.graphics, shadows: !draft.graphics.shadows } })
                }
              />
              <ToggleRow
                label={t('settings.particles')}
                enabled={draft.graphics.particles}
                onToggle={() =>
                  applyAndSave({ ...draft, graphics: { ...draft.graphics, particles: !draft.graphics.particles } })
                }
              />

              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.fpsLimit')}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[30, 60, 120].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => applyAndSave({ ...draft, graphics: { ...draft.graphics, fpsLimit: fps } })}
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
                      applyAndSave({ ...draft, audio: { ...draft.audio, [field]: Number(e.target.value) } })
                    }
                    className="mt-2 w-full accent-orange-600"
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'controls' && (
            <div className="space-y-4">
              <SliderRow
                id="cam-sens"
                label={t('settings.sensitivity')}
                valueText={`${draft.controls.sensitivity.toFixed(1)}x`}
                min={0.4}
                max={2.0}
                step={0.1}
                value={draft.controls.sensitivity}
                onChange={(v) => applyAndSave({ ...draft, controls: { ...draft.controls, sensitivity: v } })}
              />
              <SliderRow
                id="joy-size"
                label={t('settings.joystickSize')}
                valueText={`${Math.round(draft.controls.joystickSize * 100)}%`}
                min={0.8}
                max={1.4}
                step={0.1}
                value={draft.controls.joystickSize}
                onChange={(v) => applyAndSave({ ...draft, controls: { ...draft.controls, joystickSize: v } })}
              />
              <SliderRow
                id="hud-scale"
                label={t('settings.hudScale')}
                valueText={`${Math.round(draft.controls.hudScale * 100)}%`}
                min={0.75}
                max={1.25}
                step={0.05}
                value={draft.controls.hudScale}
                onChange={(v) => applyAndSave({ ...draft, controls: { ...draft.controls, hudScale: v } })}
              />
              <SliderRow
                id="btn-opacity"
                label={t('settings.buttonOpacity')}
                valueText={`${Math.round(draft.controls.buttonOpacity * 100)}%`}
                min={0.45}
                max={1.0}
                step={0.05}
                value={draft.controls.buttonOpacity}
                onChange={(v) => applyAndSave({ ...draft, controls: { ...draft.controls, buttonOpacity: v } })}
              />

              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.handMode')}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['right', 'left'] as HandMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => applyAndSave({ ...draft, controls: { ...draft.controls, handMode: mode } })}
                      className={`min-h-[40px] rounded-lg border px-3 text-xs font-medium ${
                        draft.controls.handMode === mode
                          ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                          : 'border-stone-800 bg-stone-900 text-stone-300'
                      }`}
                    >
                      {t(mode === 'right' ? 'settings.handRight' : 'settings.handLeft')}
                    </button>
                  ))}
                </div>
              </div>

              <ToggleRow
                label={t('settings.preferLandscape')}
                enabled={draft.controls.preferLandscape}
                onToggle={() =>
                  applyAndSave({
                    ...draft,
                    controls: { ...draft.controls, preferLandscape: !draft.controls.preferLandscape },
                  })
                }
              />

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
                        className="font-mono-tabular min-h-[34px] rounded border border-stone-700 bg-stone-950 px-3 text-xs text-orange-300 hover:border-orange-500"
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
                        onClick={() => applyAndSave({ ...draft, gameplay: { ...draft.gameplay, difficulty: d } })}
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

              <ToggleRow
                label={t('settings.showHud')}
                enabled={draft.gameplay.showHud}
                onToggle={() =>
                  applyAndSave({ ...draft, gameplay: { ...draft.gameplay, showHud: !draft.gameplay.showHud } })
                }
              />

              <div>
                <div className="text-xs font-medium text-stone-300">{t('settings.units')}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['metric', 'imperial'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => applyAndSave({ ...draft, gameplay: { ...draft.gameplay, units: u } })}
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
              {canInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="min-h-[44px] w-full rounded-lg border border-orange-600/70 bg-orange-950/30 px-4 py-2 text-left text-sm font-medium text-orange-200 hover:bg-orange-950/60"
                >
                  {t('menu.installApp')}
                </button>
              )}

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

function ToggleRow({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-200">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`min-h-[38px] rounded-lg px-4 text-sm font-medium ${
          enabled ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-300'
        }`}
      >
        {enabled ? t('common.on') : t('common.off')}
      </button>
    </div>
  );
}

function SliderRow({
  id,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm text-stone-300">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono-tabular">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-orange-600"
      />
    </div>
  );
}
