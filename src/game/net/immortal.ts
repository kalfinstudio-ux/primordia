import { gameState } from '../core/state';
import { sanitizeBornAt } from '../data/eden';
import { readStorage, writeStorage } from '../utils/storage';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const BORN_KEY = 'immortal_born_at';
const DEATHS_KEY = 'immortal_deaths';

/** Baca/simpan waktu lahir lokal agar tamu tetap membawa umur saat nanti masuk akun. */
export function rememberLocalBornAt(ms: number): void {
  const safe = sanitizeBornAt(ms);
  const existing = readStorage<number | null>(BORN_KEY, null);
  const chosen = typeof existing === 'number' && Number.isFinite(existing) ? Math.min(existing, safe) : safe;
  writeStorage(BORN_KEY, chosen);
  gameState.bornAtMs = chosen;
}

export function loadLocalImmortalStats(): void {
  const born = readStorage<number | null>(BORN_KEY, null);
  if (typeof born === 'number' && Number.isFinite(born)) {
    gameState.bornAtMs = sanitizeBornAt(born);
  } else {
    writeStorage(BORN_KEY, gameState.bornAtMs);
  }
  const deaths = readStorage<number>(DEATHS_KEY, 0);
  if (typeof deaths === 'number' && Number.isFinite(deaths) && deaths >= 0) {
    gameState.deaths = Math.max(gameState.deaths, Math.floor(deaths));
  }
}

export function recordLocalDeath(): number {
  gameState.deaths = Math.max(0, Math.floor(gameState.deaths) + 1);
  writeStorage(DEATHS_KEY, gameState.deaths);
  return gameState.deaths;
}

/**
 * Sinkron umur abadi & jumlah kematian dengan profil Supabase.
 * - Server menyimpan `born_at` sekali saja (tamu yang baru login mengirim `p_guest_born_at`,
 *   dibatasi server maks 30 hari dan tidak bisa memundurkan akun yang sudah punya `born_at`).
 * - Client tidak pernah bisa mengubah atau mereset umur di server.
 */
export async function syncImmortalAge(): Promise<boolean> {
  if (!isSupabaseConfigured() || gameState.user.mode !== 'authenticated') return false;
  const sb = getSupabaseClient();
  if (!sb) return false;
  const guestIso = new Date(sanitizeBornAt(gameState.bornAtMs)).toISOString();
  const { data, error } = await sb.rpc('sync_immortal_age', { p_guest_born_at: guestIso });
  if (error || !data) return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.born_at) return false;
  gameState.bornAtMs = sanitizeBornAt(row.born_at);
  writeStorage(BORN_KEY, gameState.bornAtMs);
  if (typeof row.deaths === 'number' && Number.isFinite(row.deaths)) {
    gameState.deaths = Math.max(gameState.deaths, Math.floor(row.deaths));
    writeStorage(DEATHS_KEY, gameState.deaths);
  }
  return true;
}

export async function recordDeathOnServer(): Promise<void> {
  recordLocalDeath();
  if (!isSupabaseConfigured() || gameState.user.mode !== 'authenticated') return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const { data } = await sb.rpc('record_death');
    if (typeof data === 'number' && Number.isFinite(data)) {
      gameState.deaths = Math.max(gameState.deaths, Math.floor(data));
      writeStorage(DEATHS_KEY, gameState.deaths);
    }
  } catch {
    /* offline: kematian lokal sudah dicatat, umur tetap berjalan */
  }
}
