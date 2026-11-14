import { useEffect, useState } from 'react';
import { eventBus } from '../game/core/eventBus';
import { takeAwayReport } from '../game/systems/awayReport';
import { formatDuration, type AwayReport } from '../game/data/eden';

/** Panel kecil sekali muncul saat kembali ke dunia. Tidak menutupi kontrol: di atas-tengah, bisa ditutup. */
export function AwayReportModal() {
  const [report, setReport] = useState<AwayReport | null>(() => takeAwayReport());
  useEffect(() => {
    const off = eventBus.on<AwayReport>('away:report', (r) => {
      takeAwayReport();
      setReport(r);
    });
    return off;
  }, []);
  if (!report || report.entries.length === 0) return null;
  return (
    <div
      className="pointer-events-auto fixed left-1/2 top-[18%] z-40 w-[min(86vw,20rem)] -translate-x-1/2 rounded-xl border border-stone-700 p-3 shadow-2xl"
      style={{ backgroundColor: 'rgba(18, 14, 12, 0.95)' }}
      role="dialog"
      aria-label="Laporan saat kamu pergi"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-amber-300">Saat kamu pergi</div>
          <div className="text-[11px] text-stone-400">Selama {formatDuration(report.seconds)}</div>
        </div>
        <button
          type="button"
          onClick={() => setReport(null)}
          className="min-h-[32px] rounded-md border border-stone-700 px-2.5 text-[11px] text-stone-200"
        >
          Tutup
        </button>
      </div>
      <ul className="mt-2 flex max-h-[34dvh] flex-col gap-1 overflow-y-auto text-[11px] leading-snug text-stone-200">
        {report.entries.map((e, i) => (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden>{e.icon}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
