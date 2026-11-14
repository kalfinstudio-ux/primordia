import { useEffect, useRef } from 'react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ScreenRouter } from './ui/ScreenRouter';
import { AutoFullscreen } from './ui/AutoFullscreen';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void import('./game/main').then((mod) => {
      if (cancelled) return;
      cleanup = mod.destroyGame;
      void mod.bootGame(container);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative h-full w-full overflow-hidden bg-[#0b0908]">
        <div
          ref={canvasMountRef}
          data-testid="game-canvas-mount"
          className="absolute inset-0 h-full w-full"
        />
        <ScreenRouter />
        <AutoFullscreen />
      </div>
    </ErrorBoundary>
  );
}
