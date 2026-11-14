import type { RealtimeChannel } from '@supabase/supabase-js';
import { WORLD_HALF_EXTENT, type AvatarConfig } from '../config';
import { eventBus } from '../core/eventBus';
import { gameState } from '../core/state';
import { readStorage, writeStorage } from '../utils/storage';
import { t } from '../utils/i18n';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import {
  MP_EMOTE_COOLDOWN_MS,
  MP_INBOUND_MIN_GAP_MS,
  MP_MAX_PER_ROOM,
  MP_MAX_SHARDS,
  MP_PRESENCE_GRACE_MS,
  MP_STALE_MS,
  makeSessionId,
  parseEmote,
  parsePos,
  parsePresence,
  roomName,
  sanitizeAvatar,
  sanitizeName,
  shouldMoveToNextShard,
  shouldSendPos,
  type AnimState,
  type EmoteId,
  type OnlineStatus,
  type PlayerInfo,
} from './multiplayerProtocol';

export interface RemotePlayerState {
  id: string;
  name: string;
  avatar: AvatarConfig;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AnimState;
  speed: number;
  lastSeen: number;
  /** ID akun Supabase pemain itu bila ia login (null untuk tamu). */
  userId: string | null;
}

export interface NearbyPlayer {
  id: string;
  name: string;
  userId: string | null;
}

export interface LocalPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AnimState;
  speed: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Multiplayer Tahap A: pemain dengan seed yang sama berada di "kamar" Realtime yang sama
 * (maks 8 per kamar, sisanya otomatis ke kamar berikutnya). Posisi/animasi dikirim lewat
 * Broadcast, daftar pemain lewat Presence. Tidak ada tabel database dan tidak ada data
 * permainan (inventaris, save) yang dikirim. Mode tamu offline tetap berjalan normal.
 */
class MultiplayerClient {
  private status: OnlineStatus = 'off';
  private readonly sessionId = makeSessionId();
  private channel: RealtimeChannel | null = null;
  private seed = '';
  private connectedSeed = '';
  private shard = 0;
  private inWorld = false;
  private token = 0;
  private joinedAt = 0;
  private firstSyncDone = false;
  private roster = new Map<string, PlayerInfo>();
  private remote = new Map<string, RemotePlayerState>();
  private lastInboundAt = new Map<string, number>();
  private lastEmoteAt = new Map<string, number>();
  private lastSent: (LocalPose & { at: number }) | null = null;
  private lastEmoteSentAt = 0;

  constructor() {
    eventBus.on('auth:changed', () => this.reconcile());
  }

  /** Apakah Supabase terkonfigurasi (tanpa itu fitur online tidak tersedia). */
  isAvailable(): boolean {
    return isSupabaseConfigured();
  }

  /** Preferensi pemain; bawaan: aktif untuk semua (tamu maupun login) selama Supabase terkonfigurasi. */
  isEnabled(): boolean {
    if (!isSupabaseConfigured()) return false;
    const stored = readStorage<boolean | null>('mp_enabled', null);
    if (typeof stored === 'boolean') return stored;
    return true;
  }

  setEnabled(value: boolean): void {
    writeStorage('mp_enabled', value);
    this.reconcile();
  }

  getStatus(): OnlineStatus {
    return this.status;
  }

  getHudInfo(): { status: OnlineStatus; players: number } {
    return { status: this.status, players: this.status === 'online' ? this.roster.size + 1 : 0 };
  }

  getRemotePlayers(): IterableIterator<RemotePlayerState> {
    return this.remote.values();
  }

  /** Daftar pemain lain di kamar yang sama (dari Presence), untuk panel sosial. */
  getNearby(): NearbyPlayer[] {
    return [...this.roster.values()].map((p) => ({ id: p.id, name: p.name, userId: p.userId ?? null }));
  }

  enterWorld(seed: string): void {
    this.inWorld = true;
    this.seed = seed;
    this.reconcile();
  }

  leave(): void {
    this.inWorld = false;
    this.reconcile();
  }

  /** Dipanggil tiap frame selama pemain berada di dunia (termasuk saat dijeda). */
  tick(pose: LocalPose): void {
    if (this.status !== 'online' || !this.channel) return;
    const now = Date.now();

    for (const [id, r] of this.remote) {
      if (now - r.lastSeen > MP_STALE_MS) {
        this.remote.delete(id);
        this.lastInboundAt.delete(id);
      }
    }

    if (!shouldSendPos(this.lastSent, pose, now)) return;
    this.lastSent = { ...pose, at: now };
    this.safeSend('pos', {
      id: this.sessionId,
      x: round2(pose.x),
      y: round2(pose.y),
      z: round2(pose.z),
      yaw: round2(pose.yaw),
      anim: pose.anim,
      speed: round2(pose.speed),
    });
  }

  sendEmote(emote: EmoteId): boolean {
    const now = Date.now();
    if (this.status !== 'online' || !this.channel) return false;
    if (now - this.lastEmoteSentAt < MP_EMOTE_COOLDOWN_MS) return false;
    this.lastEmoteSentAt = now;
    this.safeSend('emote', { id: this.sessionId, emote });
    eventBus.emit('toast:show', { text: `${t('mp.you')}: ${t(`mp.emotes.${emote}`)}`, type: 'info' });
    return true;
  }

  // ---- internal ----

  private reconcile(): void {
    const want = this.inWorld && this.isEnabled();
    if (!want) {
      this.disconnect();
      return;
    }
    if (!this.channel || this.connectedSeed !== this.seed) this.connect(0);
  }

  private setStatus(next: OnlineStatus): void {
    if (this.status === next) return;
    this.status = next;
    eventBus.emit('mp:status', next);
  }

  private myInfo(): Omit<PlayerInfo, 'id' | 'userId'> & { uid?: string } {
    const a = gameState.avatar;
    const name = sanitizeName(a.name);
    const uid = gameState.user.mode === 'authenticated' ? gameState.user.userId : null;
    return {
      ...(uid ? { uid } : {}),
      name,
      avatar: {
        name,
        height: a.height,
        build: a.build,
        skinTone: a.skinTone,
        hairColor: a.hairColor,
        hairStyle: a.hairStyle,
        suitColor: a.suitColor,
        packStyle: a.packStyle,
      },
      joinedAt: this.joinedAt,
    };
  }

  private teardownChannel(): void {
    const ch = this.channel;
    this.channel = null;
    if (!ch) return;
    try {
      const sb = getSupabaseClient();
      void Promise.resolve(sb?.removeChannel(ch)).catch(() => {});
    } catch {
      // abaikan
    }
  }

  private resetRoomState(): void {
    this.roster.clear();
    this.remote.clear();
    this.lastInboundAt.clear();
    this.lastEmoteAt.clear();
    this.lastSent = null;
    this.firstSyncDone = false;
  }

  private disconnect(): void {
    if (!this.channel && this.status === 'off') return;
    this.token++;
    this.teardownChannel();
    this.resetRoomState();
    this.connectedSeed = '';
    this.setStatus('off');
  }

  private connect(shard: number): void {
    const sb = getSupabaseClient();
    if (!sb) {
      this.setStatus('off');
      return;
    }
    this.teardownChannel();
    this.resetRoomState();
    const token = ++this.token;
    this.shard = shard;
    this.connectedSeed = this.seed;
    this.joinedAt = Date.now();
    this.setStatus('connecting');

    try {
      const ch = sb.channel(roomName(this.seed, shard), {
        config: { broadcast: { self: false }, presence: { key: this.sessionId } },
      });
      ch.on('presence', { event: 'sync' }, () => {
        if (token === this.token) this.onPresenceSync(ch);
      })
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
          if (token === this.token) this.onPos(payload);
        })
        .on('broadcast', { event: 'emote' }, ({ payload }) => {
          if (token === this.token) this.onEmote(payload);
        })
        .subscribe((rawStatus) => {
          if (token !== this.token) return;
          const status = String(rawStatus);
          if (status === 'SUBSCRIBED') {
            void Promise.resolve(ch.track(this.myInfo())).catch(() => {});
            this.setStatus('online');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.setStatus('error');
          } else if (status === 'CLOSED') {
            this.setStatus('connecting');
          }
        });
      this.channel = ch;
    } catch {
      this.channel = null;
      this.setStatus('error');
    }
  }

  private safeSend(event: 'pos' | 'emote', payload: Record<string, unknown>): void {
    try {
      void Promise.resolve(this.channel?.send({ type: 'broadcast', event, payload })).catch(() => {});
    } catch {
      // abaikan; koneksi akan dipulihkan otomatis oleh supabase-js
    }
  }

  private onPresenceSync(ch: RealtimeChannel): void {
    const state = ch.presenceState() as Record<string, unknown[]>;
    const now = Date.now();
    const entries: Array<{ id: string; joinedAt: number }> = [];
    const next = new Map<string, PlayerInfo>();

    for (const [key, metas] of Object.entries(state)) {
      const info = parsePresence(key, Array.isArray(metas) ? metas[0] : null);
      if (!info) continue;
      entries.push({ id: key, joinedAt: info.joinedAt });
      if (key !== this.sessionId) next.set(key, info);
    }

    if (this.firstSyncDone) {
      for (const [id, info] of next) {
        if (!this.roster.has(id)) {
          eventBus.emit('toast:show', { text: `${info.name} ${t('mp.joined')}`, type: 'info' });
        }
      }
      for (const [id, info] of this.roster) {
        if (!next.has(id)) {
          eventBus.emit('toast:show', { text: `${info.name} ${t('mp.left')}`, type: 'info' });
        }
      }
    }
    this.firstSyncDone = true;
    this.roster = next;

    for (const [id, r] of this.remote) {
      const info = next.get(id);
      if (info) {
        r.name = info.name;
        r.avatar = info.avatar;
        r.userId = info.userId ?? null;
      } else if (now - r.lastSeen > MP_PRESENCE_GRACE_MS) {
        this.remote.delete(id);
        this.lastInboundAt.delete(id);
      }
    }

    // Kamar penuh: pendatang terbaru pindah ke kamar berikutnya.
    const selfListed = entries.some((e) => e.id === this.sessionId);
    if (selfListed && this.shard + 1 < MP_MAX_SHARDS && shouldMoveToNextShard(this.sessionId, entries)) {
      this.connect(this.shard + 1);
    }
  }

  private onPos(payload: unknown): void {
    const msg = parsePos(payload, WORLD_HALF_EXTENT);
    if (!msg || msg.id === this.sessionId) return;
    const now = Date.now();
    if (now - (this.lastInboundAt.get(msg.id) ?? 0) < MP_INBOUND_MIN_GAP_MS) return;
    this.lastInboundAt.set(msg.id, now);

    const existing = this.remote.get(msg.id);
    if (existing) {
      existing.x = msg.x;
      existing.y = msg.y;
      existing.z = msg.z;
      existing.yaw = msg.yaw;
      existing.anim = msg.anim;
      existing.speed = msg.speed;
      existing.lastSeen = now;
      existing.userId = this.roster.get(msg.id)?.userId ?? existing.userId;
      return;
    }
    if (this.remote.size >= MP_MAX_PER_ROOM + 2) return;
    const info = this.roster.get(msg.id);
    this.remote.set(msg.id, {
      id: msg.id,
      name: info?.name ?? 'Penjelajah',
      avatar: info?.avatar ?? sanitizeAvatar(null, 'Penjelajah'),
      x: msg.x,
      y: msg.y,
      z: msg.z,
      yaw: msg.yaw,
      anim: msg.anim,
      speed: msg.speed,
      lastSeen: now,
      userId: info?.userId ?? null,
    });
  }

  private onEmote(payload: unknown): void {
    const msg = parseEmote(payload);
    if (!msg || msg.id === this.sessionId) return;
    const now = Date.now();
    if (now - (this.lastEmoteAt.get(msg.id) ?? 0) < MP_EMOTE_COOLDOWN_MS * 0.75) return;
    this.lastEmoteAt.set(msg.id, now);
    const name = this.remote.get(msg.id)?.name ?? this.roster.get(msg.id)?.name ?? 'Penjelajah';
    eventBus.emit('mp:emote', { id: msg.id, emote: msg.emote });
    eventBus.emit('toast:show', { text: `${name}: ${t(`mp.emotes.${msg.emote}`)}`, type: 'info' });
  }
}

export const multiplayer = new MultiplayerClient();
