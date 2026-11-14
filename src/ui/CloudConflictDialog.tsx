import React from 'react';
import type { SaveSlotData } from '../game/systems/saveLoad';
import { t } from '../game/utils/i18n';

interface ConflictItem {
  slot: number;
  local: SaveSlotData;
  cloud: SaveSlotData;
}

export function CloudConflictDialog({
  conflict,
  onKeepLocal,
  onKeepCloud,
  onKeepBoth,
}: {
  conflict: ConflictItem | null;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  onKeepBoth: () => void;
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
        <h3 className="font-display text-xl font-semibold text-orange-300">{t('loadGame.conflictTitle')}</h3>
        <p className="mt-2 text-sm text-stone-300">{t('loadGame.conflictBody')}</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
            <div className="font-semibold text-stone-200">{t('loadGame.local')}</div>
            <div className="mt-1 text-stone-400">{conflict.local.worldSeed}</div>
            <div className="font-mono-tabular text-stone-300">{Math.floor(conflict.local.playtimeSec / 60)}m · {conflict.local.completedQuests.length}Q</div>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
            <div className="font-semibold text-orange-300">{t('loadGame.cloud')}</div>
            <div className="mt-1 text-stone-400">{conflict.cloud.worldSeed}</div>
            <div className="font-mono-tabular text-stone-300">{Math.floor(conflict.cloud.playtimeSec / 60)}m · {conflict.cloud.completedQuests.length}Q</div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeepLocal}
            className="min-h-[44px] rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            {t('loadGame.keepLocal')}
          </button>
          <button
            type="button"
            onClick={onKeepCloud}
            className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('loadGame.keepCloud')}
          </button>
          <button
            type="button"
            onClick={onKeepBoth}
            className="min-h-[44px] rounded-lg border border-stone-800 bg-stone-950 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-stone-900"
          >
            {t('loadGame.keepBoth')}
          </button>
        </div>
      </div>
    </div>
  );
}
