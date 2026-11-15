import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState } from './core/state';
import { MAX_BAG_SLOTS, addItemTo, canAddAll, discardItem, getItemCountIn, transferOne } from './systems/inventory';
import { craftItem } from './systems/crafting';
import { handlePlayerDeath } from './systems/deathBag';
import { getLocalSave, migrateSaveData, sanitizeSlots } from './systems/saveLoad';

function fakeStorage(): Map<string, string> {
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    },
  };
  return mem;
}

const fullBagOfAxes = () => Array.from({ length: MAX_BAG_SLOTS - 1 }, () => ({ itemId: 'stone_axe', qty: 1, durability: 60 }));

test('canAddAll: tas penuh menolak barang baru, tumpukan yang ada masih bisa ditambah', () => {
  const full = [...fullBagOfAxes(), { itemId: 'basalt_rock', qty: 3 }];
  assert.equal(full.length, MAX_BAG_SLOTS);
  assert.equal(canAddAll(full, [['sulfur_mineral', 1]]), false); // butuh slot baru
  assert.equal(canAddAll(full, [['basalt_rock', 10]]), true); // masuk ke tumpukan
  assert.equal(canAddAll(full, [['basalt_rock', 10], ['iron_slag', 1]]), false); // salah satu tak muat
  assert.equal(canAddAll(fullBagOfAxes(), [['sulfur_mineral', 1]]), true); // 27 slot: masih ada 1 slot
});

test('craftItem saat tas penuh dibatalkan tanpa memakai bahan', () => {
  const full = [...fullBagOfAxes(), { itemId: 'basalt_rock', qty: 3 }];
  gameState.inventory = full.map((s) => ({ ...s }));
  gameState.placedStructures = [];
  assert.equal(craftItem('recipe_water_vessel'), false); // butuh 2 batu; sisa 1 batu menahan slot, hasil tak muat
  assert.equal(getItemCountIn(gameState.inventory, 'basalt_rock'), 3);
  assert.equal(getItemCountIn(gameState.inventory, 'water_vessel'), 0);

  gameState.inventory = [{ itemId: 'basalt_rock', qty: 2 }];
  assert.equal(craftItem('recipe_water_vessel'), true);
  assert.equal(getItemCountIn(gameState.inventory, 'water_vessel'), 1);
  assert.equal(getItemCountIn(gameState.inventory, 'basalt_rock'), 0);
});

test('transferOne membawa durability alat (peti tidak memperbaiki alat) dan menghormati kapasitas', () => {
  const worn = [{ itemId: 'stone_axe', qty: 1, durability: 7 }];
  const toChest = transferOne(worn, [], 'stone_axe');
  assert.ok(toChest);
  assert.equal(toChest!.from.length, 0);
  assert.equal(toChest!.to[0].durability, 7);
  const back = transferOne(toChest!.to, [], 'stone_axe', MAX_BAG_SLOTS);
  assert.equal(back!.to[0].durability, 7);

  // tumpukan: satu unit dipindah, sisanya tetap; menggabung ke tumpukan tujuan walau tujuan penuh slot
  const stack = transferOne([{ itemId: 'basalt_rock', qty: 5 }], [...fullBagOfAxes(), { itemId: 'basalt_rock', qty: 1 }], 'basalt_rock', MAX_BAG_SLOTS);
  assert.equal(stack!.from[0].qty, 4);
  assert.equal(stack!.to[stack!.to.length - 1].qty, 2);

  // tujuan penuh dan tak ada tumpukan untuk digabung: ditolak, sumber tidak berubah
  const fullDest = [...fullBagOfAxes(), { itemId: 'basalt_rock', qty: 1 }];
  assert.equal(transferOne([{ itemId: 'iron_slag', qty: 2 }], fullDest, 'iron_slag', MAX_BAG_SLOTS), null);
  assert.equal(transferOne([], [], 'stone_axe'), null);
});

test('discardItem membuang 1 atau semua, tetapi tidak Benih Kehidupan', () => {
  gameState.inventory = addItemTo([], 'basalt_rock', 7);
  assert.equal(discardItem('basalt_rock'), 1);
  assert.equal(getItemCountIn(gameState.inventory, 'basalt_rock'), 6);
  assert.equal(discardItem('basalt_rock', true), 6);
  assert.equal(gameState.inventory.length, 0);
  gameState.inventory = [{ itemId: 'seed_of_life', qty: 1 }];
  assert.equal(discardItem('seed_of_life', true), 0);
  assert.equal(discardItem('tidak_ada'), 0);
});

test('migrateSaveData: save rusak (NaN/null, barang tak dikenal) tidak merambat ke state', () => {
  const m = migrateSaveData({
    vitals: { health: null, oxygen: 'x', water: 55, temperature: Number.NaN },
    inventory: [
      { itemId: 'basalt_rock', qty: 3 },
      { itemId: 'item_hantu', qty: 5 },
      { itemId: 'stone_axe', qty: -2 },
      { itemId: 'sulfur_mineral', qty: 'abc' },
      null,
      { itemId: 'stone_axe', qty: 1, durability: 12 },
    ],
    storageInventories: { c1: [{ itemId: 'iron_slag', qty: 2 }, { itemId: 'zzz', qty: 1 }], c2: 'rusak' },
    deathBags: [{ id: 'b', items: [{ itemId: 'basalt_rock', qty: 1 }, { itemId: 'zzz', qty: 1 }] }],
  });
  assert.equal(m.vitals.health, 100);
  assert.equal(m.vitals.oxygen, 100);
  assert.equal(m.vitals.water, 55);
  assert.equal(m.vitals.temperature, 37);
  assert.deepEqual(m.inventory, [
    { itemId: 'basalt_rock', qty: 3 },
    { itemId: 'stone_axe', qty: 1, durability: 12 },
  ]);
  assert.deepEqual(m.storageInventories, { c1: [{ itemId: 'iron_slag', qty: 2 }], c2: [] });
  assert.equal(m.deathBags[0].items.length, 1);
  assert.deepEqual(sanitizeSlots('bukan array'), []);
});

test('mati menyimpan seketika: menutup game di layar Game Over tidak membatalkan kematian', () => {
  fakeStorage();
  gameState.activeWorldLoaded = true;
  gameState.screen = 'hud';
  gameState.inventory = [{ itemId: 'basalt_rock', qty: 9 }];
  gameState.deathBags = [];
  gameState.vitals = { ...gameState.vitals, health: 0 };
  handlePlayerDeath('reasonTemp');
  assert.equal(gameState.screen, 'gameOver');
  const saved = getLocalSave();
  assert.ok(saved);
  assert.equal(saved!.inventory.length, 0);
  assert.equal(saved!.deathBags.length, 1);
  assert.equal(saved!.deathBags[0].items[0].qty, 9);
  assert.equal(saved!.vitals.health, 0);
  gameState.activeWorldLoaded = false;
});
