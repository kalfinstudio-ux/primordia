import { gameState } from '../core/state';
import { sanitizeBornAt } from '../data/eden';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

/**
 * Sinkron umur abadi dengan profil Supabase. Server menyimpan born_at sekali saja;
 * client hanya membaca. Jika offline/tamu, memakai bornAtMs lokal (tersimpan di save).
 */
export async function syncImmortalAge(): Promise<boolean> {
  if (!isSupabaseConfigured() || gameState.user.mode !== 'authenticated') return false;
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { data, error } = await sb.rpc('sync_immortal_age');
  if (error || !data) return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.born_at) return false;
  gameState.bornAtMs = sanitizeBornAt(row.born_at);
  return true;
}

export async function recordDeathOnServer(): Promise<void> {
  if (!isSupabaseConfigured() || gameState.user.mode !== 'authenticated') return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await sb.rpc('record_death');
  } catch {
    /* offline: abaikan, umur tetap berjalan */
  }
}
