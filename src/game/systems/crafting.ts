import { RECIPES, type CraftingRecipe, type StationType } from '../config';
import { gameState, type InventorySlot, type PlacedStructure } from '../core/state';
import { eventBus } from '../core/eventBus';
import { addItemTo, canAddAll, getItemCountIn, notifyBagFull, removeItemFrom } from './inventory';
import { distance2D } from '../utils/math';
import { t } from '../utils/i18n';

export function hasStationNearby(
  station: StationType | undefined,
  structures: PlacedStructure[],
  px: number,
  pz: number
): boolean {
  if (!station) return true;
  return structures.some((s) => s.type === station && distance2D(px, pz, s.x, s.z) <= 8.5);
}

export function canCraftIn(
  slots: InventorySlot[],
  recipe: CraftingRecipe,
  structures: PlacedStructure[] = [],
  px = 0,
  pz = 0,
  checkStation = false
): boolean {
  const hasIngredients = recipe.ingredients.every((ing) => getItemCountIn(slots, ing.itemId) >= ing.qty);
  if (!hasIngredients) return false;
  if (checkStation && recipe.stationRequired) {
    return hasStationNearby(recipe.stationRequired, structures, px, pz);
  }
  return true;
}

export function canCraft(recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;
  return canCraftIn(
    gameState.inventory,
    recipe,
    gameState.placedStructures,
    gameState.playerPos.x,
    gameState.playerPos.z,
    true
  );
}

export function craftItem(recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe || !canCraft(recipeId)) {
    return false;
  }

  let next = gameState.inventory;
  for (const ing of recipe.ingredients) {
    next = removeItemFrom(next, ing.itemId, ing.qty);
  }
  // Tas penuh: batalkan SEBELUM mengubah apa pun, jangan sampai bahan habis tapi hasil hilang.
  if (!canAddAll(next, [[recipe.outputId, recipe.outputQty]])) {
    notifyBagFull();
    return false;
  }
  next = addItemTo(next, recipe.outputId, recipe.outputQty);
  gameState.inventory = next;

  if (!gameState.unlockedRecipes.includes(recipe.id)) {
    gameState.unlockedRecipes.push(recipe.id);
  }

  // Unlock follow-up recipes triggered by crafted output
  for (const r of RECIPES) {
    if (r.unlocksOnItem === recipe.outputId && !gameState.unlockedRecipes.includes(r.id)) {
      gameState.unlockedRecipes.push(r.id);
    }
  }

  eventBus.emit('audio:sfx', 'craft');
  eventBus.emit('inventory:changed', gameState.inventory);
  eventBus.emit('toast:show', {
    text: `${t('inventory.craftedToast')}: ${t(`items.${recipe.outputId}.name`)}`,
    type: 'success',
  });
  return true;
}
