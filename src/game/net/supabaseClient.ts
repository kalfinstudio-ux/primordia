import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../config';

let client: SupabaseClient | null = null;
let initialized = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (initialized) return client;
  initialized = true;

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return client;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client, falling back to guest mode.', err);
    client = null;
    return null;
  }
}
