import React from 'react';
import type { DebugTelemetry } from '../game/core/state';

export function DebugOverlay({ debug }: { debug: DebugTelemetry }) {
  const tierText = debug.graphicsTier
    ? debug.graphicsMode === 'auto'
      ? `${debug.graphicsTier} (auto)`
      : debug.graphicsTier
    : '-';

  return (
    <aside
      data-testid="debug-overlay"
      className="pointer-events-none w-max max-w-[340px] rounded-lg border border-stone-700/90 px-2.5 py-1.5 font-mono-tabular text-[11px] leading-snug text-emerald-300 shadow-lg"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.92)' }}
    >
      <div>
        FPS: {debug.fps} · Tier: {tierText} · Chunks: {debug.activeChunks} (+{debug.pendingChunks})
      </div>
      <div>
        Draw: {debug.drawCalls} · Tris: {typeof debug.triangles === 'number' ? debug.triangles.toLocaleString() : '-'}
      </div>
      <div>RT: {debug.renderTargetSize || '-'}</div>
      <div>
        XYZ: {debug.playerX.toFixed(1)}, {debug.playerY.toFixed(1)}, {debug.playerZ.toFixed(1)}
      </div>
      <div>Biome: {debug.biomeId} · Hazard: {debug.hazard}</div>
      {typeof debug.wetness === 'number' && typeof debug.windSpeed === 'number' && (
        <div>
          Wind: {debug.windSpeed.toFixed(1)} m/s · Wet: {Math.round(debug.wetness * 100)}% ·{' '}
          {debug.weatherBlend || 'steady'}
        </div>
      )}
      {typeof debug.faunaCount === 'number' && (
        <div data-testid="debug-fauna-row">
          Fauna: {debug.faunaCount} · AI: {(debug.faunaAiMs ?? 0).toFixed(2)}ms · {debug.faunaBuckets || '-'}
        </div>
      )}
      <div className="text-[10px] text-stone-400">
        FPS method: 1s sample count / elapsed · Low cap: ≤60 ptcl, 0 splash/fog
      </div>
    </aside>
  );
}
