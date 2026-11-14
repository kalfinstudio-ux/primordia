import { useEffect, useState } from 'react';
import { t } from '../game/utils/i18n';

type LockableOrientation = { lock?: (mode: string) => Promise<void> };

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;
const isLandscape = () => window.innerWidth > window.innerHeight;
const isFullscreen = () => Boolean(document.fullscreenElement);

async function enterFullscreenLandscape(): Promise<void> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
    await (screen.orientation as unknown as LockableOrientation)?.lock?.('landscape');
  } catch {
    // Fullscreen or orientation lock is not supported or was refused: ignore silently.
  }
}

/**
 * Browsers only allow fullscreen after a user gesture, so the address bar cannot be
 * hidden automatically. Instead, the first tap while the phone is in landscape enters
 * fullscreen (address bar hidden). If the player exits fullscreen on purpose, we do not
 * force it again until they rotate back to landscape.
 */
export function AutoFullscreen() {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!isTouchDevice()) return;

    let exitedByUser = false;
    let wasFullscreen = false;
    let hideTimer: number | undefined;

    const showHint = () => {
      setHint(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setHint(false), 6000);
    };

    const evaluate = () => {
      if (!isLandscape()) {
        exitedByUser = false;
        setHint(false);
        return;
      }
      if (!isFullscreen() && !exitedByUser) showHint();
      else setHint(false);
    };

    const onPointerUp = () => {
      if (isLandscape() && !isFullscreen() && !exitedByUser) {
        void enterFullscreenLandscape();
      }
    };

    const onFullscreenChange = () => {
      const now = isFullscreen();
      if (wasFullscreen && !now && isLandscape()) exitedByUser = true;
      wasFullscreen = now;
      if (now) setHint(false);
    };

    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('resize', evaluate);
    window.addEventListener('orientationchange', evaluate);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    evaluate();

    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('resize', evaluate);
      window.removeEventListener('orientationchange', evaluate);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  if (!hint) return null;
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-2 z-[100] -translate-x-1/2 rounded-full border border-orange-500/40 bg-black/70 px-4 py-1.5 text-xs font-semibold text-orange-300 backdrop-blur"
      style={{ marginTop: 'env(safe-area-inset-top)' }}
      role="status"
    >
      {t('hud.tapFullscreen')}
    </div>
  );
}
