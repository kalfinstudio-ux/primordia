import { useEffect, useState } from 'react';
import { gameState } from '../game/core/state';
import { formatShiftCountdown, getEdenCalendar, getImmortalAge, seasonEffects, shiftWarning } from '../game/data/eden';

/** Jam nyata, tanggal, dan umur abadi — ringkas, sebaris-dua di panel kiri atas. */
export function EdenClock({ compact = false }: { compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = new Date();
  const cal = getEdenCalendar(now);
  const age = getImmortalAge(gameState.bornAtMs);
  const fx = seasonEffects(now);
  const warn = shiftWarning(now.getTime());
  const hhmm = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      className={`rounded-lg border border-stone-800 px-2 ${compact ? 'py-0.5' : 'py-1'} text-[9px] sm:text-[10px] leading-tight text-stone-200 shadow-lg`}
      style={{ backgroundColor: 'rgba(15, 12, 11, 0.88)' }}
      title={cal.label}
    >
      <div className="flex justify-between font-semibold">
        <span>🕒 {hhmm}</span>
        <span>{String(cal.day).padStart(2, '0')}/{String(cal.month).padStart(2, '0')}/{cal.year}</span>
      </div>
      <div className="truncate text-amber-300">
        ♾ {age.years}th {age.days}h {age.hours}j{compact ? '' : ` · Thn ${cal.eraYear}`}
      </div>
      {!compact && <div className="truncate text-stone-400">🍂 {fx.label}</div>}
      {warn.level !== 'none' && (
        <div className={`truncate font-semibold ${warn.level === 'imminent' ? 'text-red-400 animate-pulse' : 'text-orange-300'}`}>
          ⚠ Pergeseran Besar {formatShiftCountdown(warn.msLeft)}
        </div>
      )}
    </div>
  );
}
