import { eventBus } from '../core/eventBus';
import { gameState } from '../core/state';
import { readStorage, writeStorage } from '../utils/storage';
import { t } from '../utils/i18n';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { isUuid } from './multiplayerProtocol';
import { wisdomPointsEarned } from '../data/eden';

/**
 * Fitur sosial (profil publik, teman, pesan). Semua lewat RPC Postgres (lihat
 * supabase/migration-social.sql) sehingga aturan akses dijaga server, bukan client.
 */

export type FriendStatus = 'none' | 'friends' | 'sent' | 'received' | 'self';
export type FriendRelation = 'friend' | 'incoming' | 'outgoing';

export interface PublicProfile {
  displayName: string;
  bornAt: string | null;
  ageSeconds: number;
  deaths: number;
  wisdomPoints: number;
  score: number;
  friendStatus: FriendStatus;
}

export interface SocialEntry {
  userId: string;
  name: string;
  relation: FriendRelation;
  unread: number;
  lastAt: string | null;
}

export interface ChatMessage {
  id: number;
  mine: boolean;
  body: string;
  sentAt: string;
}

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const UNREAD_POLL_MS = 20_000;
const MAX_BODY = 500;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastUnread = 0;

export function canUseSocial(): boolean {
  return isSupabaseConfigured() && gameState.user.mode === 'authenticated';
}

function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('not friends')) return t('social.errNotFriends');
  if (m.includes('too fast')) return t('social.errTooFast');
  if (m.includes('function') && (m.includes('does not exist') || m.includes('schema cache'))) return t('social.errMigration');
  if (m.includes('too many')) return t('social.errTooMany');
  return t('social.errGeneric');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  if (!canUseSocial()) return { ok: false, error: t('social.needLogin') };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: t('social.errGeneric') };
  try {
    const { data, error } = await sb.rpc(fn, args);
    if (error) return { ok: false, error: friendlyError(error.message || '') };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: t('social.errGeneric') };
  }
}

type Row = Record<string, unknown>;
const rows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : d ? [d as Row] : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Nama karakter dipakai sebagai nama publik (email/username akun tidak dibagikan). */
export async function syncDisplayName(): Promise<void> {
  if (!canUseSocial()) return;
  const key = `social_name_${gameState.user.userId}`;
  const name = (gameState.avatar.name || '').trim();
  if (!name || readStorage<string>(key, '') === name) return;
  const res = await rpc<string>('set_display_name', { p_name: name });
  if (res.ok) writeStorage(key, name);
}

export async function fetchProfile(userId: string): Promise<Result<PublicProfile | null>> {
  if (!isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<unknown>('get_public_profile', { p_user: userId });
  if (!res.ok) return res;
  const r = rows(res.data)[0];
  if (!r) return { ok: true, data: null };
  const status = String(r.friend_status);
  const ageSeconds = num(r.age_seconds);
  const wisdomPoints =
    r.wisdom_points !== undefined && r.wisdom_points !== null
      ? num(r.wisdom_points)
      : wisdomPointsEarned(ageSeconds);
  return {
    ok: true,
    data: {
      displayName: String(r.display_name ?? 'Penjelajah'),
      bornAt: typeof r.born_at === 'string' ? r.born_at : null,
      ageSeconds,
      deaths: num(r.deaths),
      wisdomPoints,
      score: num(r.score),
      friendStatus: (['none', 'friends', 'sent', 'received', 'self'].includes(status) ? status : 'none') as FriendStatus,
    },
  };
}

export async function sendFriendRequest(userId: string): Promise<Result<FriendStatus>> {
  if (!isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<string>('send_friend_request', { p_user: userId });
  return res.ok ? { ok: true, data: (res.data === 'friends' ? 'friends' : 'sent') as FriendStatus } : res;
}

export async function respondFriendRequest(userId: string, accept: boolean): Promise<Result> {
  if (!isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<string>('respond_friend_request', { p_user: userId, p_accept: accept });
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function removeFriend(userId: string): Promise<Result> {
  if (!isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<boolean>('remove_friend', { p_user: userId });
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function listSocial(): Promise<Result<SocialEntry[]>> {
  const res = await rpc<unknown>('list_social');
  if (!res.ok) return res;
  const relations: FriendRelation[] = ['friend', 'incoming', 'outgoing'];
  const list: SocialEntry[] = [];
  for (const r of rows(res.data)) {
    const id = String(r.other_id ?? '');
    const rel = String(r.relation) as FriendRelation;
    if (!isUuid(id) || !relations.includes(rel)) continue;
    list.push({
      userId: id,
      name: String(r.name ?? 'Penjelajah'),
      relation: rel,
      unread: num(r.unread),
      lastAt: typeof r.last_at === 'string' ? r.last_at : null,
    });
  }
  return { ok: true, data: list };
}

export async function getMessages(userId: string): Promise<Result<ChatMessage[]>> {
  if (!isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<unknown>('get_messages', { p_user: userId, p_limit: 50 });
  if (!res.ok) return res;
  return {
    ok: true,
    data: rows(res.data).map((r) => ({
      id: num(r.msg_id),
      mine: r.mine === true,
      body: String(r.body ?? ''),
      sentAt: String(r.sent_at ?? ''),
    })),
  };
}

export async function sendMessage(userId: string, body: string): Promise<Result> {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text || !isUuid(userId)) return { ok: false, error: t('social.errGeneric') };
  const res = await rpc<number>('send_message', { p_user: userId, p_body: text });
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function fetchUnread(): Promise<number> {
  const res = await rpc<unknown>('unread_count');
  return res.ok ? num(res.data) : 0;
}

/** Cek pesan baru tiap 20 dtk selama pemain login; memberi toast + event 'social:unread'. */
export function startSocialPolling(): void {
  if (pollTimer || typeof window === 'undefined') return;
  const poll = async () => {
    if (!canUseSocial()) {
      if (lastUnread !== 0) {
        lastUnread = 0;
        eventBus.emit('social:unread', 0);
      }
      return;
    }
    const n = await fetchUnread();
    if (n > lastUnread) eventBus.emit('toast:show', { text: t('social.newMessage'), type: 'info' });
    if (n !== lastUnread) {
      lastUnread = n;
      eventBus.emit('social:unread', n);
    }
  };
  void poll();
  pollTimer = setInterval(() => void poll(), UNREAD_POLL_MS);
}

export function refreshUnreadNow(): void {
  void fetchUnread().then((n) => {
    lastUnread = n;
    eventBus.emit('social:unread', n);
  });
}
