import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { exitGame } from '../game/main';
import { t } from '../game/utils/i18n';
import { ConfirmDialog } from './ConfirmDialog';

/** Tombol "Keluar Game" + dialog konfirmasi. Dipakai di menu Jeda dan Pengaturan. */
export function ExitGameButton({ saveFirst = true }: { saveFirst?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/60"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {t('pause.exit')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('pause.exitTitle')}
        body={t('pause.exitBody')}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          exitGame(saveFirst);
        }}
      />
    </>
  );
}
