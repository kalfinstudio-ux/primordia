import { createClient } from '@base44/sdk';

// ID aplikasi Base44 (dari URL editor: app.base44.com/apps/<APP_ID>/editor/...)
const BASE44_APP_ID = '6af36db49e4e4b187f00d88b';

export interface Base44Identity {
  email: string;
  name: string;
}

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) client = createClient({ appId: BASE44_APP_ID });
  return client;
}

// Identitas Base44 HANYA untuk nama/profil pemain. Cloud save & leaderboard
// tetap memakai sesi Supabase (gameState.user), jadi tidak disentuh di sini.
export async function getBase44Identity(): Promise<Base44Identity | null> {
  try {
    const b44 = getClient();
    if (!b44.auth.hasToken()) return null;
    const u = (await b44.auth.me()) as { email?: string; full_name?: string };
    if (!u?.email) return null;
    return { email: u.email, name: u.full_name || u.email.split('@')[0] };
  } catch {
    return null;
  }
}

export async function signInWithBase44(
  email: string,
  password: string,
): Promise<{ ok: boolean; identity?: Base44Identity; error?: string }> {
  try {
    await getClient().auth.loginViaEmailPassword(email, password);
    const identity = await getBase44Identity();
    if (!identity) return { ok: false, error: 'Login Base44 gagal.' };
    return { ok: true, identity };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Login Base44 gagal.' };
  }
}

export async function signOutBase44(): Promise<void> {
  try {
    const b44 = getClient();
    // setToken(null) menghapus token lokal tanpa mengalihkan halaman.
    b44.auth.setToken('', false);
    try { localStorage.removeItem('base44_access_token'); localStorage.removeItem('token'); } catch { /* abaikan */ }
  } catch { /* abaikan */ }
}
