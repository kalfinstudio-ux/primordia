import { useEffect, useState } from 'react';
import { gameState } from '../game/core/state';
import { getEdenCalendar, getImmortalAge } from '../game/data/eden';

/** Jam nyata, tanggal era, dan umur abadi pemain. */
export function EdenClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = new Date();
  const cal = getEdenCalendar(now);
  const age = getImmortalAge(gameState.bornAtMs);
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-black/45 px-3 py-1 text-center text-[10px] leading-tight text-stone-200 backdrop-blur-sm">
      <div className="font-semibold">{now.toLocaleTimeString('id-ID')} · {cal.label}</div>
      <div className="text-amber-300">{gameState.avatar.name} · umur {age.label}</div>
    </div>
  );
}
