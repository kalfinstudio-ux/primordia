import React from 'react';
import type { DebugTelemetry } from '../game/core/state';

export function DebugOverlay({ debug }: { debug: DebugTelemetry }) {
  return (
    <aside
      data-testid="debug-overlay"
      className="pointer-events-none w-max max-w-[260px] rounded-lg border border-stone-700/90 px-2.5 py-1.5 font-mono-tabular text-[11px] leading-snug text-emerald-300 shadow-lg"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.92)' }}
    >
      <div>FPS: {debug.fps} · Chunks: {debug.activeChunks} (+{debug.pendingChunks}) · Draw: {debug.drawCalls}</div>
      <div>
        XYZ: {debug.playerX.toFixed(1)}, {debug.playerY.toFixed(1)}, {debug.playerZ.toFixed(1)}
      </div>
      <div>Biome: {debug.biomeId} · Hazard: {debug.hazard}</div>
    </aside>
  );
}
