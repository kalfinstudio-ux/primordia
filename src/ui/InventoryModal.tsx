import React, { useEffect, useState } from 'react';
import { ITEMS, RECIPES } from '../game/config';
import { eventBus } from '../game/core/eventBus';
import { gameState, setScreen, type InventorySlot } from '../game/core/state';
import { canCraft, craftItem, hasStationNearby } from '../game/systems/crafting';
import {
  assignToHotbar,
  computeCarryWeight,
  getItemCount,
  getMaxCarryWeightIn,
  useItemById,
} from '../game/systems/inventory';
import { t } from '../game/utils/i18n';
import { ItemIcon } from './ItemIcon';

export function InventoryModal() {
  const [tab, setTab] = useState<'bag' | 'craft'>('craft');
  const [tierFilter, setTierFilter] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [slots, setSlots] = useState<InventorySlot[]>(() => [...gameState.inventory]);
  const [selectedId, setSelectedId] = useState<string | null>(gameState.inventory[0]?.itemId || null);

  useEffect(() => {
    const unsub = eventBus.on<InventorySlot[]>('inventory:changed', (next) => {
      if (next) setSlots([...next]);
    });
    return unsub;
  }, []);

  const selectedDef = selectedId ? ITEMS[selectedId] : null;
  const selectedSlot = selectedId ? slots.find((s) => s.itemId === selectedId) : null;
  const carryWeight = computeCarryWeight(slots);
  const maxWeight = getMaxCarryWeightIn(slots);

  const visibleRecipes = RECIPES.filter((r) => {
    if (tierFilter !== 0 && r.tier !== tierFilter) return false;
    return gameState.unlockedRecipes.includes(r.id) || r.discoveredByDefault;
  });

  const handleUseSelected = () => {
    if (!selectedId || !selectedDef) return;
    if (selectedDef.category === 'structure' || selectedDef.category === 'module') {
      setScreen('hud');
      eventBus.emit('world:requestPlaceStructure', selectedId);
    } else {
      useItemById(selectedId);
    }
  };

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.84)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-100">{t('inventory.title')}</h2>
            <div className="font-mono-tabular text-xs text-stone-400">
              {t('hud.weight')}:{' '}
              <span className={carryWeight > maxWeight ? 'text-red-400' : 'text-stone-200'}>
                {carryWeight.toFixed(1)} / {maxWeight} kg
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[40px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('inventory.close')}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 px-5 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('bag')}
              className={`min-h-[38px] rounded-lg px-4 text-sm font-medium ${
                tab === 'bag' ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800'
              }`}
            >
              {t('inventory.bagTab')}
            </button>
            <button
              type="button"
              onClick={() => setTab('craft')}
              className={`min-h-[38px] rounded-lg px-4 text-sm font-medium ${
                tab === 'craft' ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800'
              }`}
            >
              {t('inventory.craftTab')}
            </button>
          </div>

          {tab === 'craft' && (
            <div className="flex flex-wrap gap-1">
              {([0, 1, 2, 3, 4, 5] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  className={`min-h-[32px] rounded px-2.5 text-xs font-medium ${
                    tierFilter === tier
                      ? 'bg-orange-600/30 text-orange-200 border border-orange-500'
                      : 'bg-stone-900 text-stone-400 border border-stone-800'
                  }`}
                >
                  {tier === 0 ? t('inventory.allTiers') : `T${tier}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="primordia-scroll flex-1 overflow-y-auto p-5">
          {tab === 'bag' ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="md:col-span-2">
                {slots.length === 0 ? (
                  <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-6 text-center text-sm text-stone-400">
                    {t('inventory.empty')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                          <span className="mt-1 text-center text-[11px] font-medium text-stone-200 leading-tight">
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
                      <div>
                        <div className="text-sm font-semibold text-stone-100">{t(`items.${selectedDef.id}.name`)}</div>
                        <div className="font-mono-tabular text-[11px] text-stone-400">
                          {t('inventory.tierLabel')} {selectedDef.tier} · {selectedDef.weight} kg
                          {selectedSlot?.durability !== undefined && selectedDef.maxDurability
                            ? ` · ${selectedSlot.durability}/${selectedDef.maxDurability}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-stone-300">{t(`items.${selectedDef.id}.desc`)}</p>

                    <div className="mt-4 flex flex-col gap-2">
                      {(selectedDef.category === 'structure' ||
                        selectedDef.category === 'module' ||
                        selectedDef.category === 'consumable' ||
                        selectedDef.category === 'medical') && (
                        <button
                          type="button"
                          onClick={handleUseSelected}
                          className="min-h-[42px] w-full rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500"
                        >
                          {selectedDef.category === 'structure' || selectedDef.category === 'module'
                            ? t('inventory.place')
                            : t('inventory.use')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => assignToHotbar(selectedDef.id)}
                        className="min-h-[38px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-800"
                      >
                        {t('inventory.equip')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-stone-400">{t('inventory.empty')}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleRecipes.map((recipe) => {
                const out = ITEMS[recipe.outputId];
                if (!out) return null;
                const craftable = canCraft(recipe.id);
                const stationOk = hasStationNearby(
                  recipe.stationRequired,
                  gameState.placedStructures,
                  gameState.playerPos.x,
                  gameState.playerPos.z
                );

                return (
                  <div
                    key={recipe.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/70 p-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg border border-stone-800 bg-stone-950 p-2">
                        <ItemIcon iconType={out.iconType} color={out.color} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-stone-100">
                            {t(`items.${out.id}.name`)}{recipe.outputQty > 1 ? ` x${recipe.outputQty}` : ''}
                          </span>
                          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-mono-tabular text-orange-300">
                            T{recipe.tier}
                          </span>
                          {recipe.stationRequired && (
                            <span className={`text-[10px] font-medium ${stationOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {t('inventory.needStation')}: {t(`items.${recipe.stationRequired}.name`)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">{t(`items.${out.id}.desc`)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-2.5 text-xs">
                          {recipe.ingredients.map((ing) => {
                            const owned = getItemCount(ing.itemId);
                            const ok = owned >= ing.qty;
                            return (
                              <span key={ing.itemId} className={ok ? 'text-emerald-300' : 'text-red-300'}>
                                {t(`items.${ing.itemId}.name`)}{' '}
                                <span className="font-mono-tabular">({owned}/{ing.qty})</span>
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
                      className="min-h-[42px] shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
                    >
                      {craftable
                        ? t('inventory.craft')
                        : !stationOk && recipe.stationRequired
                          ? t('inventory.needStation')
                          : t('inventory.missingMaterials')}
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
