import { syncImmortalAge } from './immortal';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { pullCloudSettings } from './settingsSync';
import { consumeTokenFromUrl, currentGameUrl, getBase44Client, isBase44Configured } from './base44Client';

function setSupabaseUser(id: string, email: string | null): void {
  gameState.user = { mode: 'authenticated', userId: id, email, provider: 'supabase', displayName: null };
}

function setGuestUser(): void {
  // Jangan menimpa identitas Base44 yang sedang aktif.
  if (gameState.user.provider === 'base44') return;
  gameState.user = { mode: 'guest', userId: null, email: null };
}

/** Pulihkan sesi Base44 (setelah kembali dari halaman login atau saat membuka game lagi). */
async function initBase44Session(): Promise<void> {
  if (!isBase44Configured()) return;
  try {
    const b44 = await getBase44Client();
    if (!b44) return;
    // Cadangan: bila token datang lewat URL dan SDK belum menyimpannya.
    const urlToken = consumeTokenFromUrl();
    if (urlToken) b44.auth.setToken(urlToken, true);
    if (!(await b44.auth.isAuthenticated())) return;
    const me = await b44.auth.me();
    if (!me?.id) return;
    // Sesi Supabase (bila ada) tetap diutamakan karena membuka fitur cloud.
    if (gameState.user.mode === 'authenticated') return;
    gameState.user = {
      mode: 'guest',
      userId: null,
      email: me.email || null,
      provider: 'base44',
      displayName: me.full_name || null,
    };
    eventBus.emit('auth:changed', gameState.user);
  } catch {
    // Offline / belum login: tetap mode tamu.
  }
}

export async function initAuthSession(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.user) {
        setSupabaseUser(data.session.user.id, data.session.user.email || null);
        eventBus.emit('auth:changed', gameState.user);
        void pullCloudSettings();
        void syncImmortalAge();
      }
      sb.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setSupabaseUser(session.user.id, session.user.email || null);
        } else {
          setGuestUser();
        }
        eventBus.emit('auth:changed', gameState.user);
        if (session?.user) void syncImmortalAge();
      });
    } catch {
      // Offline fallback silently keeps guest mode
    }
  }
  await initBase44Session();
}

/**
 * Masuk lewat Base44 (Google). Browser dialihkan ke halaman login Base44 lalu kembali ke game ini.
 * Catatan: identitas Base44 tidak membuka sinkron cloud Supabase (lihat HANDOFF.md §11).
 */
export async function signInWithBase44(provider: 'google' | 'microsoft' | 'facebook' = 'google'): Promise<{ ok: boolean; error?: string }> {
  if (!isBase44Configured()) return { ok: false, error: 'Base44 not configured' };
  const b44 = await getBase44Client();
  if (!b44) return { ok: false, error: 'Base44 unavailable' };
  try {
    b44.auth.loginWithProvider(provider, currentGameUrl());
    return { ok: true }; // browser dialihkan; sesi dipulihkan saat kembali
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error' };
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

export async function signUpWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  const { error, data } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  if (data.user) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      username: email.split('@')[0],
      avatar_config: gameState.avatar,
    });
  }
  return { ok: true };
}

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase unavailable' };
  // Kembali ke halaman game yang sama (aman untuk subpath GitHub Pages, mis. /primordia/).
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) return { ok: false, error: error.message };
  return { ok: true }; // browser dialihkan ke Google; sesi dipulihkan saat kembali
}

export async function signOutAccount(): Promise<void> {
  const wasBase44 = gameState.user.provider === 'base44';
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut().catch(() => {});
  }
  // Hapus identitas lokal dulu agar UI langsung bersih.
  gameState.user = { mode: 'guest', userId: null, email: null };
  eventBus.emit('auth:changed', gameState.user);
  if (wasBase44) {
    try {
      const b44 = await getBase44Client();
      b44?.auth.logout(currentGameUrl()); // mengakhiri sesi Base44 lalu kembali ke game
    } catch {
      /* sesi Base44 akan kedaluwarsa sendiri; lokal sudah bersih */
    }
  }
}
