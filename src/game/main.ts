import type { AvatarConfig, DifficultyLevel } from './config';
import { gameState, resetRunState, saveSettingsToLocal, setScreen } from './core/state';
import { SceneManager } from './scenes/SceneManager';
import { applySaveDataToState, getLocalSave, saveGame, type SaveData } from './systems/saveLoad';
import { audioSystem } from './systems/audio';
import { initAuthSession } from './net/auth';
import { submitLeaderboardScore } from './net/leaderboard';
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
  // Pemain baru (belum ada simpanan): langsung ke persiapan ekspedisi, satu ketukan lebih sedikit.
  setScreen(gameState.activeWorldLoaded || getLocalSave() ? 'menu' : 'newGame');
}

export function startNewExpedition(
  seed: string,
  avatar: AvatarConfig,
  difficulty: DifficultyLevel,
  preserveKnowledge = false
): void {
  audioSystem.unlock();
  const updatedSettings = {
    ...gameState.settings,
    gameplay: { ...gameState.settings.gameplay, difficulty },
  };
  saveSettingsToLocal(updatedSettings);
  resetRunState(seed, avatar, preserveKnowledge);
  setScreen('hud');
  manager?.enterWorld(true);
}

export function startNewGamePlus(): void {
  gameState.newGamePlusCount += 1;
  writeStorage('ng_plus_count', gameState.newGamePlusCount);
  const nextSeed = `ARCHEAN-NG${gameState.newGamePlusCount}-${Math.floor(100 + Math.random() * 899)}`;
  startNewExpedition(nextSeed, gameState.avatar, gameState.settings.gameplay.difficulty, true);
}

/** Lanjutkan dunia yang sedang aktif, atau muat simpanan lokal. Dengan cloud: lihat `resolveContinue`. */
export function continueLatestExpedition(): void {
  audioSystem.unlock();
  if (gameState.activeWorldLoaded) {
    openLoadedWorld();
    return;
  }
  const latest = getLocalSave();
  if (latest) {
    loadExpedition(latest);
  } else {
    startNewExpedition(gameState.worldSeed, gameState.avatar, gameState.settings.gameplay.difficulty);
  }
}

export function loadExpedition(save: SaveData): void {
  audioSystem.unlock();
  applySaveDataToState(save);
  openLoadedWorld();
}

/**
 * Masuk ke dunia yang sudah dimuat. Bila nyawa 0 (simpanan dibuat saat mati, atau kembali dari
 * layar Game Over lewat menu), tampilkan lagi layar Game Over alih-alih mengulang kematian di HUD.
 */
function openLoadedWorld(): void {
  setScreen('hud');
  manager?.enterWorld(false);
  if (gameState.vitals.health <= 0) {
    if (!gameState.deathReason) gameState.deathReason = 'reasonGeneric';
    setScreen('gameOver');
  }
}

export function fastTravelToBeacon(x: number, z: number): void {
  audioSystem.unlock();
  manager?.fastTravelTo(x, z);
}

export function computeExpeditionScore(): number {
  return Math.round(
    gameState.completedQuests.length * 150 +
      gameState.distanceExplored * 0.5 +
      gameState.crystalsExtractedCount * 80 +
      gameState.surveyContractsCleared * 250 +
      (gameState.campaignComplete ? 1000 : 0)
  );
}

export function completeSurveyContract(): boolean {
  const hasRichOre = gameState.crystalsExtractedCount >= 1 || gameState.meteorIronCollectedCount >= 2;
  if (!hasRichOre || gameState.distanceExplored < 250) return false;
  gameState.surveyContractsCleared += 1;
  void submitLeaderboardScore(computeExpeditionScore());
  audioSystem.playSfx('quest');
  eventBus.emit('toast:show', { text: `${t('journal.contractTitle')} ✓`, type: 'success' });
  return true;
}

export function returnToMainMenu(): void {
  manager?.enterMenuFlyover();
  setScreen('menu');
}

/**
 * Keluar game: simpan bila ada dunia aktif, keluar layar penuh,
 * lalu kembali ke halaman utama situs (satu tingkat di atas /play/).
 */
export function exitGame(saveFirst = true): void {
  if (saveFirst) {
    try {
      saveGame(true);
    } catch {
      /* tetap keluar walau gagal menyimpan */
    }
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    /* abaikan */
  }
  window.setTimeout(() => window.location.assign('../'), 150);
}

export function respawnExplorer(): void {
  audioSystem.unlock();
  manager?.respawnAtSafeRidge();
}

export function saveCurrentGame(): void {
  const saved = saveGame(true);
  eventBus.emit('toast:show', {
    text: saved ? t('pause.savedToast') : t('pause.saveFailedToast'),
    type: saved ? 'success' : 'warn',
  });
}

export function destroyGame(): void {
  manager?.dispose();
  manager = null;
}
