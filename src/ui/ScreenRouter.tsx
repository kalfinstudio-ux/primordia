import React, { useEffect, useState } from 'react';
import type { ScreenName } from '../game/config';
import { eventBus } from '../game/core/eventBus';
import { gameState } from '../game/core/state';
import { SplashScreen } from './SplashScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { AuthScreen } from './AuthScreen';
import { NewGameScreen } from './NewGameScreen';
import { LoadGameScreen } from './LoadGameScreen';
import { SettingsScreen } from './SettingsScreen';
import { HudScreen } from './HudScreen';
import { PauseModal } from './PauseModal';
import { InventoryModal } from './InventoryModal';
import { GameOverModal } from './GameOverModal';
import { CreditsScreen } from './CreditsScreen';
import { ToastContainer } from './ToastContainer';

export function ScreenRouter() {
  const [screen, setActiveScreen] = useState<ScreenName>(gameState.screen);
  const [, setLangTick] = useState(0);

  useEffect(() => {
    const unsubScreen = eventBus.on<ScreenName>('screen:changed', (next) => {
      if (next) setActiveScreen(next);
    });
    const unsubLang = eventBus.on('language:changed', () => {
      setLangTick((n) => n + 1);
    });
    return () => {
      unsubScreen();
      unsubLang();
    };
  }, []);

  return (
    <>
      {screen === 'splash' && <SplashScreen />}
      {screen === 'onboarding' && <OnboardingScreen />}
      {screen === 'menu' && <MainMenuScreen />}
      {screen === 'auth' && <AuthScreen />}
      {screen === 'newGame' && <NewGameScreen />}
      {screen === 'loadGame' && <LoadGameScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {(screen === 'hud' || screen === 'pause' || screen === 'inventory' || screen === 'gameOver') && (
        <HudScreen />
      )}
      {screen === 'pause' && <PauseModal />}
      {screen === 'inventory' && <InventoryModal />}
      {screen === 'gameOver' && <GameOverModal />}
      {screen === 'credits' && <CreditsScreen />}
      <ToastContainer />
    </>
  );
}
