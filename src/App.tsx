import { useEffect, useRef } from 'react';
import { bootGame, destroyGame } from './game/main';
import { ScreenRouter } from './ui/ScreenRouter';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;
    void bootGame(container);
    return () => {
      destroyGame();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0908]">
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-mount"
        className="absolute inset-0 h-full w-full"
      />
      <ScreenRouter />
    </div>
  );
}
