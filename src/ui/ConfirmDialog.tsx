import React from 'react';
import { t } from '../game/utils/i18n';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.86)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-stone-800 bg-[#14100e] p-6 shadow-2xl">
        <h3 id="confirm-dialog-title" className="font-display text-2xl font-semibold text-stone-100">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-300">{body}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-5 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
