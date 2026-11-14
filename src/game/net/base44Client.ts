import { BASE44_CONFIG } from '../config';

/**
 * Klien Base44 (login mudah: Google dll). Dimuat malas (dynamic import) supaya
 * game tetap ringan dan tetap jalan bila VITE_BASE44_APP_ID tidak diisi.
 */
// Tipe minimal yang kita pakai; SDK asli lebih lengkap.
export interface Base44User {
  id: string;
  email: string;
  full_name?: string | null;
}

export interface Base44AuthLike {
  me(): Promise<Base44User>;
  isAuthenticated(): Promise<boolean>;
  loginWithProvider(provider: 'google' | 'microsoft' | 'facebook', fromUrl?: string): void;
  logout(redirectUrl?: string): void;
  setToken(token: string, saveToStorage?: boolean): void;
}

interface Base44ClientLike {
  auth: Base44AuthLike;
}

let clientPromise: Promise<Base44ClientLike | null> | null = null;

export function isBase44Configured(): boolean {
  return Boolean(BASE44_CONFIG.appId);
}

export function getBase44Client(): Promise<Base44ClientLike | null> {
  if (!isBase44Configured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@base44/sdk')
      .then((mod) => mod.createClient({ appId: BASE44_CONFIG.appId }) as unknown as Base44ClientLike)
      .catch((err) => {
        console.warn('[Base44] SDK gagal dimuat, login Base44 dimatikan.', err);
        return null;
      });
  }
  return clientPromise;
}

/** Alamat halaman game saat ini tanpa query/hash (aman untuk subpath GitHub Pages). */
export function currentGameUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Bila Base44 mengembalikan token lewat parameter URL (?access_token=…) dan SDK belum
 * menyimpannya sendiri, simpan token itu lalu bersihkan URL. Token tidak pernah dicatat ke konsol.
 */
export function consumeTokenFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('access_token');
    if (!token) return null;
    url.searchParams.delete('access_token');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    return token;
  } catch {
    return null;
  }
}
