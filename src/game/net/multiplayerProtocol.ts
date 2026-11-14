/**
 * Protokol multiplayer Tahap A (presence + broadcast lewat Supabase Realtime).
 * Modul ini murni (tanpa supabase/three) supaya mudah diuji. Semua data dari pemain lain
 * dianggap tidak tepercaya: selalu lewat sanitize/parse sebelum dipakai.
 */
import type { AvatarConfig, BodyBuild, HairStyle, PackStyle } from '../config';

export const MP_MAX_PER_ROOM = 8;
export const MP_MAX_SHARDS = 6;
export const MP_SEND_INTERVAL_MS = 200;
export const MP_HEARTBEAT_MS = 1000;
export const MP_STALE_MS = 8000;
export const MP_PRESENCE_GRACE_MS = 3000;
export const MP_INBOUND_MIN_GAP_MS = 80;
export const MP_EMOTE_COOLDOWN_MS = 2000;

export const MP_EMOTES = ['hello', 'danger', 'water', 'safe', 'help', 'follow'] as const;
export type EmoteId = (typeof MP_EMOTES)[number];

export const MP_ANIMS = ['idle', 'walk', 'run', 'swim', 'jump'] as const;
export type AnimState = (typeof MP_ANIMS)[number];

export type OnlineStatus = 'off' | 'connecting' | 'online' | 'error';

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: AvatarConfig;
  joinedAt: number;
}

export interface PosMessage {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AnimState;
  speed: number;
}

export interface EmoteMessage {
  id: string;
  emote: EmoteId;
}

const BUILDS: BodyBuild[] = ['slim', 'standard', 'athletic'];
const HAIRS: HairStyle[] = ['short', 'ponytail', 'buzz', 'hood'];
const PACKS: PackStyle[] = ['o2_pack', 'expedition', 'scout'];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_NAME = 'Penjelajah';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function makeSessionId(rand: () => number = Math.random): string {
  let s = 'p_';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(rand() * alphabet.length) % alphabet.length];
  return s;
}

export function roomName(seed: string, shard: number): string {
  const slug = (seed || 'HADEAN-01').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
  return `primordia:${slug}:${Math.max(0, Math.floor(shard))}`;
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return cleaned || DEFAULT_NAME;
}

export function sanitizeColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && COLOR_RE.test(raw) ? raw : fallback;
}

export function sanitizeAvatar(raw: unknown, name: string): AvatarConfig {
  const r = isRecord(raw) ? raw : {};
  return {
    name,
    height: clampNum(r.height, 0.9, 1.15, 1.0),
    build: BUILDS.includes(r.build as BodyBuild) ? (r.build as BodyBuild) : 'standard',
    skinTone: sanitizeColor(r.skinTone, '#c68b59'),
    hairColor: sanitizeColor(r.hairColor, '#1c1917'),
    hairStyle: HAIRS.includes(r.hairStyle as HairStyle) ? (r.hairStyle as HairStyle) : 'short',
    suitColor: sanitizeColor(r.suitColor, '#ea580c'),
    packStyle: PACKS.includes(r.packStyle as PackStyle) ? (r.packStyle as PackStyle) : 'o2_pack',
  };
}

export function parsePresence(key: string, raw: unknown): PlayerInfo | null {
  if (!ID_RE.test(key) || !isRecord(raw)) return null;
  const name = sanitizeName(raw.name);
  return {
    id: key,
    name,
    avatar: sanitizeAvatar(raw.avatar, name),
    joinedAt: clampNum(raw.joinedAt, 0, 8.64e15, 0),
  };
}

export function parsePos(raw: unknown, halfExtent: number): PosMessage | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  const lim = halfExtent + 100;
  if (typeof raw.x !== 'number' || typeof raw.z !== 'number' || typeof raw.y !== 'number') return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.z) || !Number.isFinite(raw.y)) return null;
  const anim = MP_ANIMS.includes(raw.anim as AnimState) ? (raw.anim as AnimState) : 'idle';
  return {
    id: raw.id,
    x: clampNum(raw.x, -lim, lim, 0),
    y: clampNum(raw.y, -50, 200, 0),
    z: clampNum(raw.z, -lim, lim, 0),
    yaw: clampNum(raw.yaw, -1000, 1000, 0),
    anim,
    speed: clampNum(raw.speed, 0, 20, 0),
  };
}

export function parseEmote(raw: unknown): EmoteMessage | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  if (!MP_EMOTES.includes(raw.emote as EmoteId)) return null;
  return { id: raw.id, emote: raw.emote as EmoteId };
}

/**
 * Pemain paling baru yang melebihi kapasitas kamar pindah ke kamar berikutnya.
 * Aturan deterministik (urut joinedAt lalu id) agar tidak semua pemain pindah bersamaan.
 */
export function shouldMoveToNextShard(
  selfId: string,
  entries: ReadonlyArray<{ id: string; joinedAt: number }>,
  max: number = MP_MAX_PER_ROOM
): boolean {
  if (entries.length <= max) return false;
  const sorted = [...entries].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const idx = sorted.findIndex((e) => e.id === selfId);
  return idx >= max;
}

export function shouldSendPos(
  last: { x: number; y: number; z: number; yaw: number; anim: AnimState; at: number } | null,
  cur: { x: number; y: number; z: number; yaw: number; anim: AnimState },
  nowMs: number
): boolean {
  if (!last) return true;
  const gap = nowMs - last.at;
  if (gap < MP_SEND_INTERVAL_MS) return false;
  if (gap >= MP_HEARTBEAT_MS) return true;
  const moved = Math.hypot(cur.x - last.x, cur.y - last.y, cur.z - last.z) > 0.15;
  const turned = Math.abs(cur.yaw - last.yaw) > 0.05;
  return moved || turned || cur.anim !== last.anim;
}
