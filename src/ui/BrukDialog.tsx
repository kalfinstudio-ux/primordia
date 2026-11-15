import React, { useEffect, useRef, useState } from 'react';
import { eventBus } from '../game/core/eventBus';
import { t } from '../game/utils/i18n';
import type { BrukSayPayload } from '../game/systems/bruk';

const SHOW_MS_BASE = 3200;
const SHOW_MS_PER_CHAR = 38;

/** Kotak dialog Bruk di HUD: antrean kunci i18n, tampil satu per satu, ketuk untuk menutup. */
export function BrukDialog() {
  const [queue, setQueue] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = eventBus.on<BrukSayPayload>('bruk:say', (p) => {
      if (!p?.lines?.length) return;
      setLevel(p.level);
      setQueue((prev) => [...prev, ...p.lines]);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const current = queue[0];
  const text = current ? t(current) : '';

  useEffect(() => {
    if (!current) return;
    const ms = SHOW_MS_BASE + text.length * SHOW_MS_PER_CHAR;
    timer.current = setTimeout(() => setQueue((q) => q.slice(1)), ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, text]);

  if (!current) return null;
  const isHint = current.startsWith('bruk.hints.');
  // Mata makin terang tiap tingkat kepercayaan (hanya warna aksen; murah).
  const accent = ['#6b5b4d', '#a0642a', '#c9772b', '#e08a2e', '#f2a33a'][Math.min(4, Math.max(0, level))];

  return (
    <button
      type="button"
      onClick={() => setQueue((q) => q.slice(1))}
      className="pointer-events-auto fixed left-1/2 top-[30%] z-40 w-[86vw] max-w-sm -translate-x-1/2 rounded-lg border px-3 py-2 text-left shadow-lg"
      style={{ backgroundColor: 'rgba(16, 12, 10, 0.95)', borderColor: accent }}
      aria-live="polite"
    >
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        {t('bruk.name')}
        {isHint && <span className="font-normal normal-case tracking-normal text-stone-400">· {t('bruk.hintLabel')}</span>}
      </div>
      <div className={`text-[13px] leading-snug text-stone-100 ${isHint ? 'italic' : ''}`}>{text}</div>
    </button>
  );
}
