import { BASE_CARRY_WEIGHT, ITEMS, RECIPES } from '../config';
import { gameState, type InventorySlot, type StructureType } from '../core/state';
import { eventBus } from '../core/eventBus';
import { t } from '../utils/i18n';

export const MAX_BAG_SLOTS = 28;

export function getItemCountIn(slots: InventorySlot[], itemId: string): number {
  let total = 0;
  for (const s of slots) {
    if (s.itemId === itemId) total += s.qty;
  }
  return total;
}

export function computeCarryWeight(slots: InventorySlot[]): number {
  let total = 0;
  for (const s of slots) {
    const def = ITEMS[s.itemId];
    if (def) total += def.weight * s.qty;
  }
  return Math.round(total * 10) / 10;
}

export function getMaxCarryWeightIn(slots: InventorySlot[]): number {
  return BASE_CARRY_WEIGHT + (getItemCountIn(slots, 'expedition_pack') > 0 ? 35 : 0);
}

export function addItemTo(slots: InventorySlot[], itemId: string, qty: number): InventorySlot[] {
  const def = ITEMS[itemId];
  if (!def || qty <= 0) return slots;
  const next = slots.map((s) => ({ ...s }));
  let remaining = qty;

  if (def.stackable) {
    for (const slot of next) {
      if (slot.itemId === itemId && slot.qty < def.maxStack) {
        const take = Math.min(remaining, def.maxStack - slot.qty);
        slot.qty += take;
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
  }

  while (remaining > 0 && next.length < MAX_BAG_SLOTS) {
    const take = def.stackable ? Math.min(remaining, def.maxStack) : 1;
    next.push({
      itemId,
      qty: take,
      ...(def.maxDurability ? { durability: def.maxDurability } : {}),
    });
    remaining -= take;
  }
  return next;
}

/** Murni: cek apakah semua `drops` muat di tas (28 slot) berurutan, tanpa mengubah apa pun. */
export function canAddAll(slots: InventorySlot[], drops: ReadonlyArray<readonly [string, number]>): boolean {
  let cur = slots;
  for (const [itemId, qty] of drops) {
    if (qty <= 0) continue;
    const before = getItemCountIn(cur, itemId);
    cur = addItemTo(cur, itemId, qty);
    if (getItemCountIn(cur, itemId) - before < qty) return false;
  }
  return true;
}

/**
 * Murni: pindahkan SATU unit `itemId` dari `from` ke `to` dengan membawa data aslinya (mis. durability alat),
 * sehingga alat aus tidak "diperbaiki" lewat peti. Null bila tidak ada barangnya atau `to` penuh (`toCap` slot).
 */
export function transferOne(
  from: InventorySlot[],
  to: InventorySlot[],
  itemId: string,
  toCap: number = Infinity
): { from: InventorySlot[]; to: InventorySlot[] } | null {
  const idx = from.findIndex((s) => s.itemId === itemId && s.qty > 0);
  if (idx < 0) return null;
  const src = from[idx];
  const def = ITEMS[itemId];
  const nextTo = to.map((s) => ({ ...s }));
  const stackTarget =
    def?.stackable && src.durability === undefined
      ? nextTo.find((s) => s.itemId === itemId && s.durability === undefined && s.qty < def.maxStack)
      : undefined;
  if (stackTarget) {
    stackTarget.qty += 1;
  } else {
    if (nextTo.length >= toCap) return null;
    nextTo.push({ ...src, qty: 1 });
  }
  const nextFrom = from.map((s) => ({ ...s }));
  if (nextFrom[idx].qty <= 1) nextFrom.splice(idx, 1);
  else nextFrom[idx].qty -= 1;
  return { from: nextFrom, to: nextTo };
}

export function removeItemFrom(slots: InventorySlot[], itemId: string, qty: number): InventorySlot[] {
  let remaining = qty;
  const next: InventorySlot[] = [];
  for (const s of slots) {
    if (s.itemId === itemId && remaining > 0) {
      const deduct = Math.min(remaining, s.qty);
      remaining -= deduct;
      if (s.qty - deduct > 0) {
        next.push({ ...s, qty: s.qty - deduct });
      }
    } else {
      next.push({ ...s });
    }
  }
  return next;
}

export function damageToolDurability(itemId: string, amount = 1): void {
  const slot = gameState.inventory.find((s) => s.itemId === itemId);
  if (!slot || slot.durability === undefined) return;
  slot.durability = Math.max(0, slot.durability - amount);
  if (slot.durability <= 0) {
    removeItem(itemId, 1);
    eventBus.emit('toast:show', { text: `${t(`items.${itemId}.name`)} ✕`, type: 'warn' });
  }
}

/** Buang barang dari tas (mis. agar tidak terkunci saat tas penuh). Mengembalikan jumlah yang dibuang. */
export function discardItem(itemId: string, all = false): number {
  const have = getItemCountIn(gameState.inventory, itemId);
  if (have <= 0 || itemId === 'seed_of_life') return 0;
  const qty = all ? have : 1;
  removeItem(itemId, qty);
  return qty;
}

export function getItemCount(itemId: string): number {
  return getItemCountIn(gameState.inventory, itemId);
}

export function hasItem(itemId: string): boolean {
  return getItemCount(itemId) > 0;
}

/** Tampilkan pesan "tas penuh" (dipakai saat pengambilan/pembuatan ditolak agar tidak ada barang hilang). */
export function notifyBagFull(): void {
  eventBus.emit('toast:show', { text: t('survival.bagFull'), type: 'warn' });
}

/** Tambah barang. Peringatan: barang di luar kapasitas tas hilang — panggil `canAddAll` dulu bila itu tidak boleh terjadi. */
export function addItem(itemId: string, qty = 1): void {
  gameState.inventory = addItemTo(gameState.inventory, itemId, qty);

  // Recipe discovery unlock when discovering a new material
  for (const recipe of RECIPES) {
    if (recipe.unlocksOnItem === itemId && !gameState.unlockedRecipes.includes(recipe.id)) {
      gameState.unlockedRecipes.push(recipe.id);
      eventBus.emit('toast:show', {
        text: `${t('inventory.unlockedRecipe')}: ${t(`items.${recipe.outputId}.name`)}`,
        type: 'info',
      });
    }
  }

  eventBus.emit('inventory:changed', gameState.inventory);
}

export function removeItem(itemId: string, qty = 1): void {
  gameState.inventory = removeItemFrom(gameState.inventory, itemId, qty);
  eventBus.emit('inventory:changed', gameState.inventory);
}

export function getBestMiningToolId(): string | null {
  if (hasItem('meteor_drill')) return 'meteor_drill';
  if (hasItem('obsidian_pick')) return 'obsidian_pick';
  if (hasItem('stone_axe')) return 'stone_axe';
  return null;
}

export function getHotbarSlots(): Array<InventorySlot | null> {
  return gameState.hotbarItemIds.map((id) => {
    if (!id) return null;
    const match = gameState.inventory.find((s) => s.itemId === id);
    const count = getItemCount(id);
    return count > 0 ? { itemId: id, qty: count, durability: match?.durability } : { itemId: id, qty: 0 };
  });
}

export function assignToHotbar(itemId: string, slotIdx?: number): void {
  const targetIdx = slotIdx ?? gameState.selectedHotbarIdx;
  gameState.hotbarItemIds[targetIdx] = itemId;
  eventBus.emit('inventory:changed', gameState.inventory);
}

export function useItemById(itemId: string): boolean {
  const def = ITEMS[itemId];
  if (!def || getItemCount(itemId) <= 0) return false;

  if (def.category === 'structure' || def.category === 'module') {
    gameState.buildModeItem = itemId as StructureType;
    eventBus.emit('build:modeChanged', gameState.buildModeItem);
    return true;
  }

  if (itemId === 'water_vessel') {
    gameState.vitals.water = Math.min(100, gameState.vitals.water + 35);
    eventBus.emit('audio:sfx', 'water');
    eventBus.emit('toast:show', { text: `${t('hud.water')} +35%`, type: 'info' });
    return true;
  }

  if (itemId === 'purified_water') {
    removeItem('purified_water', 1);
    gameState.vitals.water = Math.min(100, gameState.vitals.water + 45);
    gameState.vitals.fatigue = Math.min(100, gameState.vitals.fatigue + 10);
    eventBus.emit('audio:sfx', 'water');
    eventBus.emit('toast:show', { text: `${t('hud.water')} +45%`, type: 'success' });
    return true;
  }

  if (itemId === 'gas_filter') {
    removeItem('gas_filter', 1);
    gameState.vitals.filterDurability = 100;
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: `${t('hud.filter')} 100%`, type: 'success' });
    return true;
  }

  if (itemId === 'mineral_bandage') {
    removeItem('mineral_bandage', 1);
    gameState.vitals.health = Math.min(100, gameState.vitals.health + 30);
    gameState.vitals.woundTimer = 0;
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: `${t('hud.health')} +30`, type: 'success' });
    return true;
  }

  if (itemId === 'burn_salve') {
    removeItem('burn_salve', 1);
    gameState.vitals.health = Math.min(100, gameState.vitals.health + 18);
    gameState.vitals.burnTimer = 0;
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: `${t('items.burn_salve.name')} ✓`, type: 'success' });
    return true;
  }

  if (itemId === 'rad_scrubber') {
    removeItem('rad_scrubber', 1);
    gameState.vitals.radiation = Math.max(0, gameState.vitals.radiation - 55);
    eventBus.emit('audio:sfx', 'craft');
    eventBus.emit('toast:show', { text: `${t('hud.radiation')} -55%`, type: 'success' });
    return true;
  }

  return false;
}

export function useHotbarSlot(index: number): void {
  gameState.selectedHotbarIdx = index;
  const itemId = gameState.hotbarItemIds[index];
  if (!itemId) return;
  useItemById(itemId);
  eventBus.emit('inventory:changed', gameState.inventory);
}
