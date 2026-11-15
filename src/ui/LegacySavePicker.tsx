import React from 'react';
import type { SaveData } from '../game/systems/saveLoad';
import { t } from '../game/utils/i18n';

/**
 * Muncul sekali bila perangkat masih punya beberapa simpanan dari sistem Slot 1/2/3.
 * Pemain memilih satu; sisanya dihapus setelah pilihan dibuat (bukan diam-diam).
 */
export function LegacySavePicker({ choices, onChoose }: { choices: SaveData[]; onChoose: (save: SaveData) => void }) {
  if (choices.length === 0) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.92)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="primordia-scroll max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-orange-800/70 bg-[#14100e] p-6 shadow-2xl">
        <h3 className="font-display text-xl font-semibold text-orange-300">{t('save.legacyTitle')}</h3>
        <p className="mt-2 text-sm text-stone-300">{t('save.legacyBody')}</p>
        <div className="mt-4 flex flex-col gap-2">
          {choices.map((save, i) => (
            <button
              key={`${save.worldSeed}_${save.updatedAt}_${i}`}
              type="button"
              onClick={() => onChoose(save)}
              className={`min-h-[56px] rounded-lg border px-4 py-2 text-left text-sm ${
                i === 0
                  ? 'border-orange-600 bg-orange-950/40 text-stone-100 hover:bg-orange-900/50'
                  : 'border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800'
              }`}
            >
              <div className="font-semibold">
                {save.avatar?.name || 'Arka-01'} · {save.worldSeed}
                {i === 0 && <span className="ml-2 text-xs font-medium text-orange-300">{t('save.legacyNewest')}</span>}
              </div>
              <div className="font-mono-tabular text-xs text-stone-400">
                {Math.floor(save.playtimeSec / 60)}m · {save.completedQuests.length}Q · {new Date(save.updatedAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
