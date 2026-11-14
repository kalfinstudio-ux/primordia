import React from 'react';
import { ArrowUp } from 'lucide-react';
import { eventBus } from '../game/core/eventBus';
import type { HudSnapshot } from '../game/core/state';
import { multiplayer } from '../game/net/multiplayer';
import { t } from '../game/utils/i18n';

/** Pemain lain dianggap "dekat" bila berjarak sampai sekian meter. */
const NEAR_RADIUS_M = 120;

/**
 * Detektor pemain di sekitar: jumlah pemain dekat, jarak, dan arah pemain terdekat
 * (panah relatif terhadap arah pandangmu). Ketuk untuk membuka panel Pemain & Teman.
 */
export function NearbyPlayers({ snap, compact = false }: { snap: HudSnapshot; compact?: boolean }) {
  if (!multiplayer.isAvailable()) return null;

  const status = snap.online.status;
  let near = 0;
  let nearest: { name: string; dist: number; rel: number } | null = null;
  for (const r of multiplayer.getRemotePlayers()) {
    const dx = r.x - snap.playerX;
    const dz = r.z - snap.playerZ;
    const dist = Math.hypot(dx, dz);
    if (dist <= NEAR_RADIUS_M) near += 1;
    if (!nearest || dist < nearest.dist) {
      // Utara = -Z, searah jarum jam; headingDeg memakai konvensi yang sama.
      const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      nearest = { name: r.name, dist, rel: bearing - snap.headingDeg };
    }
  }

  let text: string;
  if (status === 'off') text = t('hud.nearby.off');
  else if (status === 'connecting') text = t('hud.nearby.connecting');
  else if (status === 'error') text = t('mp.error');
  else if (snap.online.players <= 1) text = t('hud.nearby.alone');
  else if (near === 0) text = t('hud.nearby.none');
  else text = t('hud.nearby.count').replace('{n}', String(near));

  const online = status === 'online';
  return (
    <button
      type="button"
      onClick={() => eventBus.emit('social:open')}
      className={`flex w-full items-center gap-1.5 rounded-lg border px-2 ${compact ? 'py-0.5' : 'py-1'} text-left text-[9px] leading-tight shadow-lg sm:text-[10px] ${
        online && near > 0 ? 'border-emerald-700/70 text-emerald-200' : 'border-stone-800 text-stone-300'
      }`}
      style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}
      aria-label={t('hud.nearby.title')}
    >
      <span aria-hidden>👥</span>
      <span className="min-w-0 flex-1 truncate">
        {text}
        {online && nearest && (
          <span className="text-stone-400"> · {Math.round(nearest.dist)} m</span>
        )}
      </span>
      {online && nearest && (
        <ArrowUp
          className="h-3.5 w-3.5 shrink-0 text-emerald-300"
          style={{ transform: `rotate(${Math.round(nearest.rel)}deg)` }}
          aria-label={t('hud.nearby.nearest')}
        />
      )}
    </button>
  );
}
