import React, { useState } from 'react';
import { ITEMS } from '../game/config';
import { gameState, setScreen, type InventorySlot } from '../game/core/state';
import { addItem, addItemTo, removeItem, removeItemFrom } from '../game/systems/inventory';
import { t } from '../game/utils/i18n';
import { ItemIcon } from './ItemIcon';

export function StorageModal() {
  const chestId = gameState.activeStorageId || 'default_chest';
  const [bag, setBag] = useState<InventorySlot[]>(() => [...gameState.inventory]);
  const [chest, setChest] = useState<InventorySlot[]>(() => [...(gameState.storageInventories[chestId] || [])]);

  const storeOne = (itemId: string) => {
    removeItem(itemId, 1);
    const nextChest = addItemTo(chest, itemId, 1);
    gameState.storageInventories[chestId] = nextChest;
    setBag([...gameState.inventory]);
    setChest(nextChest);
  };

  const takeOne = (itemId: string) => {
    addItem(itemId, 1);
    const nextChest = removeItemFrom(chest, itemId, 1);
    gameState.storageInventories[chestId] = nextChest;
    setBag([...gameState.inventory]);
    setChest(nextChest);
  };

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.88)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-100">{t('storage.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[40px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('storage.close')}
          </button>
        </div>

        <div className="primordia-scroll grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{t('storage.playerBag')}</h3>
            <div className="space-y-2">
              {bag.map((slot, i) => {
                const def = ITEMS[slot.itemId];
                if (!def) return null;
                return (
                  <div key={`${slot.itemId}_${i}`} className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <ItemIcon iconType={def.iconType} color={def.color} />
                      <span className="text-xs font-medium text-stone-200">{t(`items.${def.id}.name`)}</span>
                      <span className="font-mono-tabular text-xs text-orange-400">x{slot.qty}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => storeOne(slot.itemId)}
                      className="min-h-[34px] rounded bg-stone-800 px-3 text-xs font-medium text-stone-200 hover:bg-orange-600 hover:text-white"
                    >
                      {t('storage.storeOne')} →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{t('storage.chestContents')}</h3>
            {chest.length === 0 ? (
              <div className="rounded-lg border border-stone-800 bg-stone-950/50 p-6 text-center text-xs text-stone-400">
                {t('storage.emptyChest')}
              </div>
            ) : (
              <div className="space-y-2">
                {chest.map((slot, i) => {
                  const def = ITEMS[slot.itemId];
                  if (!def) return null;
                  return (
                    <div key={`${slot.itemId}_${i}`} className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <ItemIcon iconType={def.iconType} color={def.color} />
                        <span className="text-xs font-medium text-stone-200">{t(`items.${def.id}.name`)}</span>
                        <span className="font-mono-tabular text-xs text-emerald-400">x{slot.qty}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => takeOne(slot.itemId)}
                        className="min-h-[34px] rounded bg-stone-800 px-3 text-xs font-medium text-stone-200 hover:bg-emerald-600 hover:text-white"
                      >
                        ← {t('storage.takeOne')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
