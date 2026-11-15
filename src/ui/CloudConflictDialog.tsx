import React from 'react';
import type { SaveData } from '../game/systems/saveLoad';
import { t } from '../game/utils/i18n';

function SaveSummary({ save, label, accent }: { save: SaveData; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
      <div className={`font-semibold ${accent ? 'text-orange-300' : 'text-stone-200'}`}>{label}</div>
      <div className="mt-1 text-stone-400">{save.worldSeed}</div>
      <div className="font-mono-tabular text-stone-300">
        {Math.floor(save.playtimeSec / 60)}m · {save.completedQuests.length}Q
      </div>
      <div className="font-mono-tabular text-stone-500">{new Date(save.updatedAt).toLocaleString()}</div>
    </div>
  );
}

/** Simpanan lokal dan cloud berbeda: pilih salah satu (yang lain ditimpa). */
export function CloudConflictDialog({
  conflict,
  onKeepLocal,
  onKeepCloud,
}: {
  conflict: { local: SaveData; cloud: SaveData } | null;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
}) {
  if (!conflict) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.9)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="primordia-scroll max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-orange-800/70 bg-[#14100e] p-6 shadow-2xl">
        <h3 className="font-display text-xl font-semibold text-orange-300">{t('save.conflictTitle')}</h3>
        <p className="mt-2 text-sm text-stone-300">{t('save.conflictBody')}</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
          <SaveSummary save={conflict.local} label={t('save.local')} />
          <SaveSummary save={conflict.cloud} label={t('save.cloud')} accent />
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeepLocal}
            className="min-h-[48px] rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('save.keepLocal')}
          </button>
          <button
            type="button"
            onClick={onKeepCloud}
            className="min-h-[48px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('save.keepCloud')}
          </button>
        </div>
      </div>
    </div>
  );
}
