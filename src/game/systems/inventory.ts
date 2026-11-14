import { ITEMS } from '../config';
import { gameState, type InventorySlot } from '../core/state';
import { eventBus } from '../core/eventBus';

export function getItemCountIn(slots: InventorySlot[], itemId: string): number {
  let total = 0;
  for (const s of slots) {
    if (s.itemId === itemId) total += s.qty;
  }
  return total;
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

  while (remaining > 0 && next.length < 18) {
    const take = def.stackable ? Math.min(remaining, def.maxStack) : 1;
    next.push({ itemId, qty: take });
    remaining -= take;
  }
  return next;
}

export function removeItemFrom(slots: InventorySlot[], itemId: string, qty: number): InventorySlot[] {
  let remaining = qty;
  const next: InventorySlot[] = [];
  for (const s of slots) {
    if (s.itemId === itemId && remaining > 0) {
      const deduct = Math.min(remaining, s.qty);
      remaining -= deduct;
      if (s.qty - deduct > 0) {
        next.push({ itemId: s.itemId, qty: s.qty - deduct });
      }
    } else {
      next.push({ ...s });
    }
  }
  return next;
}

export function getItemCount(itemId: string): number {
  return getItemCountIn(gameState.inventory, itemId);
}

export function hasItem(itemId: string): boolean {
  return getItemCount(itemId) > 0;
}

export function addItem(itemId: string, qty = 1): void {
  gameState.inventory = addItemTo(gameState.inventory, itemId, qty);
  eventBus.emit('inventory:changed', gameState.inventory);
}

export function removeItem(itemId: string, qty = 1): void {
  gameState.inventory = removeItemFrom(gameState.inventory, itemId, qty);
  eventBus.emit('inventory:changed', gameState.inventory);
}

export function getHotbarSlots(): Array<InventorySlot | null> {
  return gameState.hotbarItemIds.map((id) => {
    if (!id) return null;
    const count = getItemCount(id);
    return count > 0 ? { itemId: id, qty: count } : { itemId: id, qty: 0 };
  });
}

export function useHotbarSlot(index: number): void {
  gameState.selectedHotbarIdx = index;
  const itemId = gameState.hotbarItemIds[index];
  if (!itemId) return;
  const count = getItemCount(itemId);
  if (count <= 0) return;

  if (itemId === 'water_vessel') {
    gameState.vitals.water = Math.min(100, gameState.vitals.water + 35);
    eventBus.emit('audio:sfx', 'water');
    eventBus.emit('toast:show', { messageKey: 'hud.water', detail: '+35%', type: 'info' });
  } else if (itemId === 'basic_shelter' || itemId === 'campfire_kit') {
    eventBus.emit('world:requestPlaceStructure', itemId);
  }
  eventBus.emit('inventory:changed', gameState.inventory);
}
