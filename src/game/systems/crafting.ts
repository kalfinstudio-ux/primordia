import { RECIPES, type CraftingRecipe } from '../config';
import { gameState, type InventorySlot } from '../core/state';
import { eventBus } from '../core/eventBus';
import { addItemTo, getItemCountIn, removeItemFrom } from './inventory';
import { t } from '../utils/i18n';

export function canCraftIn(slots: InventorySlot[], recipe: CraftingRecipe): boolean {
  return recipe.ingredients.every((ing) => getItemCountIn(slots, ing.itemId) >= ing.qty);
}

export function canCraft(recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;
  return canCraftIn(gameState.inventory, recipe);
}

export function craftItem(recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe || !canCraftIn(gameState.inventory, recipe)) {
    return false;
  }

  let next = gameState.inventory;
  for (const ing of recipe.ingredients) {
    next = removeItemFrom(next, ing.itemId, ing.qty);
  }
  next = addItemTo(next, recipe.outputId, recipe.outputQty);
  gameState.inventory = next;

  eventBus.emit('audio:sfx', 'craft');
  eventBus.emit('inventory:changed', gameState.inventory);
  eventBus.emit('toast:show', {
    text: `${t('inventory.craftedToast')}: ${t(`items.${recipe.outputId}.name`)}`,
    type: 'success',
  });
  return true;
}
