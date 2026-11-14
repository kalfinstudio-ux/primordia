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
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, text: payload.text!, type: payload.type || 'info' }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
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
            className={`rounded-lg border px-4 py-2 text-sm font-medium shadow-lg ${borderClass}`}
            style={{ backgroundColor: 'rgba(18, 14, 12, 0.94)' }}
          >
            {toast.text}
          </div>
        );
      })}
    </div>
  );
}
