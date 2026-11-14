import React, { useEffect, useState } from 'react';
import { ITEMS, RECIPES } from '../game/config';
import { eventBus } from '../game/core/eventBus';
import { gameState, setScreen, type InventorySlot } from '../game/core/state';
import { canCraft, craftItem } from '../game/systems/crafting';
import { getItemCount } from '../game/systems/inventory';
import { t } from '../game/utils/i18n';
import { ItemIcon } from './ItemIcon';

export function InventoryModal() {
  const [tab, setTab] = useState<'bag' | 'craft'>('craft');
  const [slots, setSlots] = useState<InventorySlot[]>(() => [...gameState.inventory]);
  const [selectedId, setSelectedId] = useState<string | null>(
    gameState.inventory[0]?.itemId || null
  );

  useEffect(() => {
    const unsub = eventBus.on<InventorySlot[]>('inventory:changed', (next) => {
      if (next) setSlots([...next]);
    });
    return unsub;
  }, []);

  const selectedDef = selectedId ? ITEMS[selectedId] : null;

  const handleUseSelected = () => {
    if (!selectedId) return;
    if (selectedId === 'basic_shelter' || selectedId === 'campfire_kit') {
      setScreen('hud');
      eventBus.emit('world:requestPlaceStructure', selectedId);
    } else if (selectedId === 'water_vessel') {
      gameState.vitals.water = Math.min(100, gameState.vitals.water + 35);
      eventBus.emit('audio:sfx', 'water');
      eventBus.emit('toast:show', { text: `${t('hud.water')} +35%`, type: 'info' });
    }
  };

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.84)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
          <h2 className="font-display text-3xl font-semibold text-stone-100">{t('inventory.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('inventory.close')}
          </button>
        </div>

        <div className="flex gap-2 border-b border-stone-800 px-6 py-2.5">
          <button
            type="button"
            onClick={() => setTab('bag')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
              tab === 'bag' ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800'
            }`}
          >
            {t('inventory.bagTab')}
          </button>
          <button
            type="button"
            onClick={() => setTab('craft')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
              tab === 'craft' ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800'
            }`}
          >
            {t('inventory.craftTab')}
          </button>
        </div>

        <div className="primordia-scroll flex-1 overflow-y-auto p-6">
          {tab === 'bag' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                {slots.length === 0 ? (
                  <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-6 text-center text-sm text-stone-400">
                    {t('inventory.empty')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {slots.map((slot, idx) => {
                      const def = ITEMS[slot.itemId];
                      if (!def) return null;
                      const active = selectedId === slot.itemId;
                      return (
                        <button
                          key={`${slot.itemId}_${idx}`}
                          type="button"
                          onClick={() => setSelectedId(slot.itemId)}
                          className={`flex min-h-[82px] flex-col items-center justify-center rounded-lg border p-2 transition-colors ${
                            active
                              ? 'border-orange-500 bg-orange-950/40'
                              : 'border-stone-800 bg-stone-900/80 hover:border-stone-700'
                          }`}
                        >
                          <ItemIcon iconType={def.iconType} color={def.color} />
                          <span className="mt-1.5 text-center text-xs font-medium text-stone-200 leading-tight">
                            {t(`items.${def.id}.name`)}
                          </span>
                          <span className="font-mono-tabular mt-0.5 text-[11px] text-orange-400">
                            x{slot.qty}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
                {selectedDef ? (
                  <>
                    <div className="flex items-center gap-3">
                      <ItemIcon iconType={selectedDef.iconType} color={selectedDef.color} />
                      <div className="text-base font-semibold text-stone-100">
                        {t(`items.${selectedDef.id}.name`)}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-stone-300">
                      {t(`items.${selectedDef.id}.desc`)}
                    </p>
                    {(selectedDef.id === 'basic_shelter' ||
                      selectedDef.id === 'campfire_kit' ||
                      selectedDef.id === 'water_vessel') && (
                      <button
                        type="button"
                        onClick={handleUseSelected}
                        className="mt-5 min-h-[44px] w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                      >
                        {selectedDef.category === 'structure' ? t('inventory.place') : t('inventory.use')}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-stone-400">{t('inventory.empty')}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {RECIPES.map((recipe) => {
                const out = ITEMS[recipe.outputId];
                const craftable = canCraft(recipe.id);
                return (
                  <div
                    key={recipe.id}
                    className="flex flex-col justify-between gap-4 rounded-lg border border-stone-800 bg-stone-900/70 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg border border-stone-800 bg-stone-950 p-2">
                        <ItemIcon iconType={out.iconType} color={out.color} />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-stone-100">
                          {t(`items.${out.id}.name`)}
                        </div>
                        <p className="text-xs text-stone-400">{t(`items.${out.id}.desc`)}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          {recipe.ingredients.map((ing) => {
                            const owned = getItemCount(ing.itemId);
                            const ok = owned >= ing.qty;
                            return (
                              <span key={ing.itemId} className={ok ? 'text-emerald-300' : 'text-red-300'}>
                                {t(`items.${ing.itemId}.name`)}{' '}
                                <span className="font-mono-tabular">
                                  ({owned}/{ing.qty})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!craftable}
                      onClick={() => craftItem(recipe.id)}
                      className="min-h-[44px] shrink-0 rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
                    >
                      {craftable ? t('inventory.craft') : t('inventory.missingMaterials')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
