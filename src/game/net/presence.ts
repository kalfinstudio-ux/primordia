import { gameState } from '../core/state';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const HEARTBEAT_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

function canUseServer(): boolean {
  return isSupabaseConfigured() && gameState.user.mode === 'authenticated';
}

/**
 * Tanya server berapa detik pemain pergi (selisih `last_seen_at` ke sekarang) lalu perbarui `last_seen_at`.
 * Server = sumber kebenaran, jadi mengubah waktu save lokal tidak memperpanjang waktu offline.
 * Mengembalikan null bila tamu / tanpa jaringan / migrasi belum dijalankan → pemanggil memakai waktu lokal.
 */
export async function fetchAwaySeconds(): Promise<number | null> {
  if (!canUseServer()) return null;
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('presence_ping');
    if (error || data === null || data === undefined) return null;
    const n = Number(Array.isArray(data) ? data[0] : data);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Denyut tiap 60 dtk + saat tab disembunyikan, agar `last_seen_at` mendekati waktu terakhir benar-benar bermain. */
export function startPresenceHeartbeat(): void {
  if (timer || typeof window === 'undefined') return;
  const beat = () => {
    if (!canUseServer() || !gameState.activeWorldLoaded) return;
    void getSupabaseClient()?.rpc('presence_ping');
  };
  timer = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beat();
  });
}
