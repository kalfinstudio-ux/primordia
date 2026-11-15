import React, { Suspense, lazy, useEffect, useState } from 'react';
import type { ScreenName } from '../game/config';
import { eventBus } from '../game/core/eventBus';
import { gameState } from '../game/core/state';
import { SplashScreen } from './SplashScreen';
import { HudScreen } from './HudScreen';
import { ToastContainer } from './ToastContainer';

const OnboardingScreen = lazy(() => import('./OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })));
const MainMenuScreen = lazy(() => import('./MainMenuScreen').then((m) => ({ default: m.MainMenuScreen })));
const AuthScreen = lazy(() => import('./AuthScreen').then((m) => ({ default: m.AuthScreen })));
const NewGameScreen = lazy(() => import('./NewGameScreen').then((m) => ({ default: m.NewGameScreen })));
const SettingsScreen = lazy(() => import('./SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const PauseModal = lazy(() => import('./PauseModal').then((m) => ({ default: m.PauseModal })));
const InventoryModal = lazy(() => import('./InventoryModal').then((m) => ({ default: m.InventoryModal })));
const MapScreen = lazy(() => import('./MapScreen').then((m) => ({ default: m.MapScreen })));
const JournalModal = lazy(() => import('./JournalModal').then((m) => ({ default: m.JournalModal })));
const StorageModal = lazy(() => import('./StorageModal').then((m) => ({ default: m.StorageModal })));
const VictoryModal = lazy(() => import('./VictoryModal').then((m) => ({ default: m.VictoryModal })));
const GameOverModal = lazy(() => import('./GameOverModal').then((m) => ({ default: m.GameOverModal })));
const AssetGalleryScreen = lazy(() => import('./AssetGalleryScreen').then((m) => ({ default: m.AssetGalleryScreen })));
const CreditsScreen = lazy(() => import('./CreditsScreen').then((m) => ({ default: m.CreditsScreen })));

const HUD_OVERLAY_SCREENS: ScreenName[] = [
  'hud',
  'pause',
  'inventory',
  'map',
  'journal',
  'storage',
  'victory',
  'gameOver',
];

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
      {HUD_OVERLAY_SCREENS.includes(screen) && <HudScreen />}
      <Suspense fallback={null}>
        {screen === 'onboarding' && <OnboardingScreen />}
        {screen === 'menu' && <MainMenuScreen />}
        {screen === 'auth' && <AuthScreen />}
        {screen === 'newGame' && <NewGameScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'pause' && <PauseModal />}
        {screen === 'inventory' && <InventoryModal />}
        {screen === 'map' && <MapScreen />}
        {screen === 'journal' && <JournalModal />}
        {screen === 'storage' && <StorageModal />}
        {screen === 'victory' && <VictoryModal />}
        {screen === 'gameOver' && <GameOverModal />}
        {screen === 'credits' && <CreditsScreen />}
        {screen === 'assets' && <AssetGalleryScreen />}
      </Suspense>
      <ToastContainer />
    </>
  );
}
