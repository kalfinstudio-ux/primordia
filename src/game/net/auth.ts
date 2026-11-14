import { syncImmortalAge } from './immortal';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { pullCloudSettings } from './settingsSync';

export async function initAuthSession(): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      gameState.user = {
        mode: 'authenticated',
        userId: data.session.user.id,
        email: data.session.user.email || null,
      };
      eventBus.emit('auth:changed', gameState.user);
      void pullCloudSettings();
      void syncImmortalAge();
    }
    sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        gameState.user = {
          mode: 'authenticated',
          userId: session.user.id,
          email: session.user.email || null,
        };
      } else {
        gameState.user = { mode: 'guest', userId: null, email: null };
      }
      eventBus.emit('auth:changed', gameState.user);
      if (session?.user) void syncImmortalAge();
    });
  } catch {
    // Offline fallback silently keeps guest mode
  }
}

export async function signInWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  await pullCloudSettings();
  return { ok: true };
}

export async function signUpWithPassword(email: string, password: string): Promise<{ ok: boolean; needsConfirm?: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  const { error, data } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  // Tanpa sesi = Supabase meminta konfirmasi email dulu; profil dibuat otomatis oleh trigger.
  if (data.user && data.session) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      username: email.split('@')[0],
      avatar_config: gameState.avatar,
    });
  }
  return { ok: true, needsConfirm: !data.session };
}

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type OAuthProviderId = 'google' | 'github' | 'discord';

export async function signInWithProvider(provider: OAuthProviderId): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  // Kembali ke halaman game yang sama (aman untuk subpath GitHub Pages, mis. /primordia/).
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) return { ok: false, error: error.message };
  return { ok: true }; // browser dialihkan ke penyedia; sesi dipulihkan saat kembali
}

export function signInWithGoogle() {
  return signInWithProvider('google');
}

export async function signOutAccount(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut().catch(() => {});
  }
  gameState.user = { mode: 'guest', userId: null, email: null };
  eventBus.emit('auth:changed', gameState.user);
}
