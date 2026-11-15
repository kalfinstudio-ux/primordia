import { recordDeathOnServer } from '../net/immortal';
import { BALANCE } from '../data/balance';
import { gameState, setScreen, type DeathBag, type InventorySlot } from '../core/state';
import { eventBus } from '../core/eventBus';
import { ITEMS } from '../config';
import { MAX_BAG_SLOTS } from './inventory';
import { saveGame } from './saveLoad';
import { distance2D } from '../utils/math';

const cloneSlots = (slots: readonly InventorySlot[]): InventorySlot[] => slots.map((s) => ({ ...s }));

/**
 * Gabungkan `extra` ke `base` tanpa menghilangkan barang: slot bertahan durability-nya,
 * tumpukan digabung sampai maxStack. Bila slotCap tercapai, sisanya dikembalikan di `leftover`.
 */
export function mergeSlots(
  base: readonly InventorySlot[],
  extra: readonly InventorySlot[],
  slotCap: number = Infinity
): { slots: InventorySlot[]; leftover: InventorySlot[] } {
  const slots = cloneSlots(base);
  const leftover: InventorySlot[] = [];
  for (const item of extra) {
    const def = ITEMS[item.itemId];
    let remaining = item.qty;
    const stackable = !!def?.stackable && item.durability === undefined;
    if (stackable) {
      for (const slot of slots) {
        if (slot.itemId === item.itemId && slot.durability === undefined && slot.qty < def.maxStack) {
          const take = Math.min(remaining, def.maxStack - slot.qty);
          slot.qty += take;
          remaining -= take;
          if (remaining <= 0) break;
        }
      }
    }
    while (remaining > 0) {
      if (slots.length >= slotCap) {
        leftover.push({ ...item, qty: remaining });
        break;
      }
      const take = stackable ? Math.min(remaining, def.maxStack) : remaining;
      slots.push({ ...item, qty: take });
      remaining -= take;
    }
  }
  return { slots, leftover };
}

/**
 * Murni: pindahkan seluruh inventaris ke kantong baru di lokasi mati.
 * Bila jumlah kantong melebihi batas, kantong tertua digabung ke yang terbaru (barang tidak hilang).
 */
export function dropInventoryAsBag(
  existing: readonly DeathBag[],
  inventory: readonly InventorySlot[],
  pos: { x: number; y: number; z: number },
  playtimeSec: number,
  maxBags: number = BALANCE.deathBag.maxBags
): { bags: DeathBag[]; inventory: InventorySlot[] } {
  const bags = existing.map((b) => ({ ...b, items: cloneSlots(b.items) }));
  if (inventory.length === 0) return { bags, inventory: [] };

  bags.push({
    id: `bag_${Math.round(playtimeSec * 1000)}_${bags.length}`,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    createdAtSec: playtimeSec,
    items: cloneSlots(inventory),
  });

  while (bags.length > maxBags) {
    const oldest = bags.shift()!;
    const newest = bags[bags.length - 1];
    newest.items = mergeSlots(newest.items, oldest.items).slots;
  }
  return { bags, inventory: [] };
}

/** Murni: ambil isi kantong sebanyak yang muat di inventaris; sisanya tetap di kantong. */
export function mergeBagIntoInventory(
  inventory: readonly InventorySlot[],
  bag: DeathBag
): { inventory: InventorySlot[]; remaining: InventorySlot[] } {
  const res = mergeSlots(inventory, bag.items, MAX_BAG_SLOTS);
  return { inventory: res.slots, remaining: res.leftover };
}

export function findBagInRange(
  bags: readonly DeathBag[],
  x: number,
  z: number,
  radius: number = BALANCE.deathBag.pickupRadiusM
): DeathBag | null {
  let best: DeathBag | null = null;
  let bestD = radius;
  for (const b of bags) {
    const d = distance2D(x, z, b.x, b.z);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Dipakai semua jalur kematian: jatuhkan barang sebagai kantong lalu tampilkan layar game over. */
export function handlePlayerDeath(reason: string): void {
  const p = gameState.playerPos;
  const res = dropInventoryAsBag(gameState.deathBags, gameState.inventory, { x: p.x, y: p.y, z: p.z }, gameState.playtimeSec);
  gameState.deathBags = res.bags;
  gameState.inventory = res.inventory;
  gameState.deathReason = reason;
  void recordDeathOnServer(); // umur abadi TIDAK direset; hanya hitung kematian
  gameState.vitals.filterDurability = 0;
  eventBus.emit('deathbags:changed', gameState.deathBags);
  eventBus.emit('audio:sfx', 'gameover');
  setScreen('gameOver');
  // Simpan SEKARANG: tanpa ini, menutup game di layar "Game Over" memuat simpanan sebelum mati
  // (barang utuh, tanpa kantong) dan kematian bisa dihindari begitu saja.
  saveGame(true);
}

/** Ambil kantong; mengembalikan true bila seluruh isi terambil (false bila inventaris penuh/sebagian). */
export function pickUpBag(bagId: string): boolean {
  const bag = gameState.deathBags.find((b) => b.id === bagId);
  if (!bag) return false;
  const res = mergeBagIntoInventory(gameState.inventory, bag);
  gameState.inventory = res.inventory;
  gameState.deathBags =
    res.remaining.length === 0
      ? gameState.deathBags.filter((b) => b.id !== bagId)
      : gameState.deathBags.map((b) => (b.id === bagId ? { ...b, items: res.remaining } : b));
  eventBus.emit('deathbags:changed', gameState.deathBags);
  return res.remaining.length === 0;
}
