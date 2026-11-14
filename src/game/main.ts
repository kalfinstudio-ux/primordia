import type { AvatarConfig, DifficultyLevel } from './config';
import { gameState, resetRunState, saveSettingsToLocal, setScreen } from './core/state';
import { SceneManager } from './scenes/SceneManager';
import { applySaveDataToState, getLatestLocalSave, saveGameToSlot, type SaveSlotData } from './systems/saveLoad';
import { audioSystem } from './systems/audio';
import { initAuthSession } from './net/auth';
import { writeStorage } from './utils/storage';
import { eventBus } from './core/eventBus';
import { t } from './utils/i18n';

let manager: SceneManager | null = null;

export async function bootGame(canvasContainer: HTMLElement): Promise<void> {
  if (manager) {
    manager.dispose();
    manager = null;
  }

  manager = new SceneManager(canvasContainer);
  void initAuthSession();
  await manager.init();

  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';

  if (autostart) {
    gameState.onboardingDone = true;
    startNewExpedition(gameState.worldSeed, gameState.avatar, gameState.settings.gameplay.difficulty);
    return;
  }

  if (!gameState.onboardingDone) {
    setScreen('onboarding');
  } else {
    setScreen('menu');
  }
}

export function completeOnboarding(): void {
  gameState.onboardingDone = true;
  writeStorage('onboarding_done', true);
  setScreen('menu');
}

export function startNewExpedition(seed: string, avatar: AvatarConfig, difficulty: DifficultyLevel): void {
  audioSystem.unlock();
  const updatedSettings = {
    ...gameState.settings,
    gameplay: { ...gameState.settings.gameplay, difficulty },
  };
  saveSettingsToLocal(updatedSettings);
  resetRunState(seed, avatar);
  setScreen('hud');
  manager?.enterWorld(true);
}

export function continueLatestExpedition(): void {
  audioSystem.unlock();
  if (gameState.activeWorldLoaded) {
    setScreen('hud');
    manager?.enterWorld(false);
    return;
  }
  const latest = getLatestLocalSave();
  if (latest) {
    loadExpedition(latest);
  } else {
    startNewExpedition(gameState.worldSeed, gameState.avatar, gameState.settings.gameplay.difficulty);
  }
}

export function loadExpedition(save: SaveSlotData): void {
  audioSystem.unlock();
  applySaveDataToState(save);
  setScreen('hud');
  manager?.enterWorld(false);
}

export function returnToMainMenu(): void {
  manager?.enterMenuFlyover();
  setScreen('menu');
}

export function respawnExplorer(): void {
  audioSystem.unlock();
  manager?.respawnAtSafeRidge();
}

export function saveCurrentSlot(slot = 1, syncCloud = true): void {
  saveGameToSlot(slot, syncCloud);
  eventBus.emit('toast:show', { text: t('pause.savedToast'), type: 'success' });
}

export function destroyGame(): void {
  manager?.dispose();
  manager = null;
}
