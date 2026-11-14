import React, { useEffect, useState } from 'react';
import { setScreen } from '../game/core/state';
import { loadExpedition } from '../game/main';
import { deleteSaveSlot, getAllAvailableSaves, type SaveSlotData } from '../game/systems/saveLoad';
import { t } from '../game/utils/i18n';
import { ConfirmDialog } from './ConfirmDialog';

function formatPlaytime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LoadGameScreen() {
  const [saves, setSaves] = useState<SaveSlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<SaveSlotData | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await getAllAvailableSaves();
    setSaves(list);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.86)' }}>
      <section className="primordia-scroll max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 pb-4">
          <h2 className="font-display text-3xl font-semibold text-stone-100">{t('loadGame.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm text-stone-300 hover:bg-stone-800"
          >
            {t('loadGame.back')}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-stone-400">{t('splash.loading')}</div>
          ) : saves.length === 0 ? (
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 py-10 text-center text-sm text-stone-400">
              {t('loadGame.empty')}
            </div>
          ) : (
            saves.map((save) => (
              <div
                key={`${save.source}_${save.slot}`}
                className="flex flex-col justify-between gap-4 rounded-lg border border-stone-800 bg-stone-900/70 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                    <span>{save.avatar?.name || 'Arka-01'}</span>
                    <span className="text-stone-500">·</span>
                    <span className="text-orange-400">
                      {t('loadGame.slot')} {save.slot} ({save.source === 'cloud' ? t('loadGame.cloud') : t('loadGame.local')})
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-stone-400">
                    <span>
                      {t('loadGame.seed')}: <span className="font-mono-tabular text-stone-300">{save.worldSeed}</span>
                    </span>
                    <span>·</span>
                    <span>
                      {t('loadGame.playtime')}:{' '}
                      <span className="font-mono-tabular text-stone-300">{formatPlaytime(save.playtimeSec)}</span>
                    </span>
                    <span>·</span>
                    <span className="font-mono-tabular">{new Date(save.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadExpedition(save)}
                    className="min-h-[44px] rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                  >
                    {t('loadGame.load')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(save)}
                    className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm text-stone-300 hover:border-red-700 hover:text-red-300"
                  >
                    {t('loadGame.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('loadGame.confirmDeleteTitle')}
        body={t('loadGame.confirmDeleteBody')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteSaveSlot(pendingDelete.slot, pendingDelete.source);
            setPendingDelete(null);
            await refresh();
          }
        }}
      />
    </main>
  );
}
