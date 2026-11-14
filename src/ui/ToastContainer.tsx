import React, { useEffect, useState } from 'react';
import { eventBus } from '../game/core/eventBus';

interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'success' | 'warn';
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let nextId = 1;
    const unsub = eventBus.on<{ text?: string; type?: 'info' | 'success' | 'warn' }>('toast:show', (payload) => {
      if (!payload?.text) return;
      const text = payload.text.length > 90 ? `${payload.text.slice(0, 87)}…` : payload.text;
      const id = nextId++;
      setToasts((prev) => {
        // Pesan sama tidak ditumpuk; maksimal 2 notifikasi tampil sekaligus
        const rest = prev.filter((item) => item.text !== text);
        return [...rest.slice(-1), { id, text, type: payload.type || 'info' }];
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 2200);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[22%] z-50 flex w-max max-w-[60vw] sm:max-w-sm -translate-x-1/2 flex-col items-center gap-1.5"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const borderClass =
          toast.type === 'success'
            ? 'border-amber-500/70 text-amber-100'
            : toast.type === 'warn'
              ? 'border-red-500/70 text-red-100'
              : 'border-stone-700 text-stone-100';
        return (
          <div
            key={toast.id}
            className={`rounded-lg border px-2.5 py-1 text-center text-[11px] sm:text-xs font-medium leading-snug opacity-90 shadow-md ${borderClass}`}
            style={{ backgroundColor: 'rgba(18, 14, 12, 0.94)' }}
          >
            {toast.text}
          </div>
        );
      })}
    </div>
  );
}
