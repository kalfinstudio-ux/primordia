import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, X } from 'lucide-react';
import { eventBus } from '../game/core/eventBus';
import { gameState } from '../game/core/state';
import { multiplayer, type NearbyPlayer } from '../game/net/multiplayer';
import {
  canUseSocial,
  fetchProfile,
  getMessages,
  listSocial,
  refreshUnreadNow,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  sendMessage,
  startSocialPolling,
  syncDisplayName,
  type ChatMessage,
  type PublicProfile,
  type SocialEntry,
} from '../game/net/social';
import { t } from '../game/utils/i18n';

type Tab = 'nearby' | 'friends';
type View = { kind: 'tabs' } | { kind: 'profile'; userId: string; name: string } | { kind: 'chat'; userId: string; name: string };

export interface SocialOpenPayload {
  userId?: string;
  name?: string;
}

function formatAge(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} ${t('social.d')} ${h} ${t('social.h')}`;
  if (h > 0) return `${h} ${t('social.h')} ${m} ${t('social.m')}`;
  return `${m} ${t('social.m')}`;
}

function btn(extra = ''): string {
  return `min-h-[40px] rounded-lg border px-3 py-1.5 text-sm font-medium ${extra}`;
}

/** Panel sosial: pemain sekitar, profil akun, teman, dan pesan. Dibuka lewat eventBus 'social:open'. */
export function SocialPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('nearby');
  const [view, setView] = useState<View>({ kind: 'tabs' });
  const [nearby, setNearby] = useState<NearbyPlayer[]>([]);
  const [social, setSocial] = useState<SocialEntry[]>([]);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const loggedIn = canUseSocial();

  // Nama publik + polling pesan baru selama pemain login.
  useEffect(() => {
    const boot = () => {
      if (!canUseSocial()) return;
      void syncDisplayName();
      startSocialPolling();
    };
    boot();
    return eventBus.on('auth:changed', boot);
  }, []);

  const openProfile = useCallback((userId: string, name: string) => {
    setNote('');
    setProfile(null);
    setView({ kind: 'profile', userId, name });
  }, []);

  useEffect(() => {
    return eventBus.on<SocialOpenPayload>('social:open', (p) => {
      if (document.pointerLockElement) document.exitPointerLock?.();
      setOpen(true);
      setNote('');
      if (p?.userId) openProfile(p.userId, p.name || t('social.unknown'));
      else setView({ kind: 'tabs' });
    });
  }, [openProfile]);

  // Daftar pemain sekitar: segarkan tiap 2 dtk selama panel terbuka.
  useEffect(() => {
    if (!open) return;
    const tick = () => setNearby(multiplayer.getNearby());
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [open]);

  const reloadSocial = useCallback(async () => {
    if (!canUseSocial()) return;
    const res = await listSocial();
    if (res.ok) setSocial(res.data);
    else setNote(res.error);
  }, []);

  useEffect(() => {
    if (open && view.kind === 'tabs' && tab === 'friends') void reloadSocial();
  }, [open, view.kind, tab, reloadSocial]);

  // Profil.
  const profileUserId = view.kind === 'profile' ? view.userId : null;
  const loadProfile = useCallback(async (uid: string) => {
    setProfileLoading(true);
    const res = await fetchProfile(uid);
    setProfileLoading(false);
    if (res.ok) {
      setProfile(res.data);
      if (!res.data) setNote(t('social.noProfile'));
    } else setNote(res.error);
  }, []);
  useEffect(() => {
    if (open && profileUserId) void loadProfile(profileUserId);
  }, [open, profileUserId, loadProfile]);

  // Chat: muat + segarkan tiap 5 dtk.
  const chatUserId = view.kind === 'chat' ? view.userId : null;
  useEffect(() => {
    if (!open || !chatUserId) return;
    let alive = true;
    const load = async () => {
      const res = await getMessages(chatUserId);
      if (!alive) return;
      if (res.ok) {
        setMsgs(res.data);
        refreshUnreadNow();
      } else setNote(res.error);
    };
    setMsgs([]);
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, chatUserId]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setView({ kind: 'tabs' });
  };

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => Promise<void> | void) => {
    setBusy(true);
    setNote('');
    const res = await fn();
    setBusy(false);
    if (!res.ok) setNote((res as { error: string }).error);
    else await after?.();
  };

  const send = async () => {
    if (view.kind !== 'chat' || !draft.trim() || busy) return;
    const text = draft;
    setDraft('');
    await act(
      () => sendMessage(view.userId, text),
      async () => {
        const res = await getMessages(view.userId);
        if (res.ok) setMsgs(res.data);
      }
    );
  };

  const me = gameState.user.userId;
  const rowBase = 'flex w-full items-center justify-between gap-2 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-left text-sm text-stone-100 hover:border-orange-500';

  const renderNearby = () => (
    <div className="flex flex-col gap-1.5">
      {!multiplayer.isEnabled() || multiplayer.getStatus() !== 'online' ? (
        <p className="text-xs text-stone-400">{t('social.notOnline')}</p>
      ) : nearby.length === 0 ? (
        <p className="text-xs text-stone-400">{t('social.nobodyNearby')}</p>
      ) : (
        nearby.map((p) => (
          <button
            key={p.id}
            type="button"
            className={rowBase}
            onClick={() => {
              if (p.userId && p.userId !== me) openProfile(p.userId, p.name);
              else setNote(p.userId === me ? t('social.thisIsYou') : t('social.guestNoProfile'));
            }}
          >
            <span className="truncate font-semibold text-amber-200">{p.name}</span>
            <span className="shrink-0 text-[11px] text-stone-400">
              {p.userId ? (p.userId === me ? t('social.you') : t('social.viewProfile')) : t('social.guest')}
            </span>
          </button>
        ))
      )}
    </div>
  );

  const section = (title: string, list: SocialEntry[], extra?: (e: SocialEntry) => React.ReactNode) =>
    list.length === 0 ? null : (
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{title}</div>
        {list.map((e) => (
          <div key={e.userId} className="flex items-center gap-2">
            <button type="button" className={rowBase} onClick={() => openProfile(e.userId, e.name)}>
              <span className="truncate font-semibold text-amber-200">{e.name}</span>
              {e.unread > 0 && (
                <span className="shrink-0 rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white">{e.unread}</span>
              )}
            </button>
            {extra?.(e)}
          </div>
        ))}
      </div>
    );

  const renderFriends = () => {
    if (!loggedIn) return <p className="text-xs text-stone-400">{t('social.needLogin')}</p>;
    const incoming = social.filter((e) => e.relation === 'incoming');
    const friends = social.filter((e) => e.relation === 'friend');
    const outgoing = social.filter((e) => e.relation === 'outgoing');
    return (
      <div className="flex flex-col gap-3">
        {section(t('social.incoming'), incoming, (e) => (
          <>
            <button
              type="button"
              disabled={busy}
              className={btn('border-green-700 bg-green-950 text-green-200')}
              onClick={() => void act(() => respondFriendRequest(e.userId, true), reloadSocial)}
            >
              {t('social.accept')}
            </button>
            <button
              type="button"
              disabled={busy}
              className={btn('border-stone-700 bg-stone-900 text-stone-300')}
              onClick={() => void act(() => respondFriendRequest(e.userId, false), reloadSocial)}
            >
              {t('social.decline')}
            </button>
          </>
        ))}
        {section(t('social.friends'), friends, (e) => (
          <button
            type="button"
            className={btn('border-orange-700 bg-orange-950 text-orange-200')}
            onClick={() => setView({ kind: 'chat', userId: e.userId, name: e.name })}
          >
            {t('social.message')}
          </button>
        ))}
        {section(t('social.outgoing'), outgoing)}
        {social.length === 0 && <p className="text-xs text-stone-400">{t('social.noFriends')}</p>}
      </div>
    );
  };

  const renderProfile = () => {
    if (view.kind !== 'profile') return null;
    const uid = view.userId;
    const status = profile?.friendStatus ?? 'none';
    const refresh = () => loadProfile(uid);
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-stone-700 bg-stone-900 p-3">
          <div className="font-display text-xl font-semibold text-amber-200">{profile?.displayName || view.name}</div>
          {profileLoading && <p className="mt-1 text-xs text-stone-400">{t('social.loading')}</p>}
          {profile && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-stone-200">
              <div>
                <dt className="text-[11px] text-stone-400">{t('social.age')}</dt>
                <dd>{profile.bornAt ? formatAge(profile.ageSeconds) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">{t('social.deaths')}</dt>
                <dd>{profile.deaths}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">{t('social.wisdom')}</dt>
                <dd className="font-semibold text-amber-300">{profile.wisdomPoints} WP</dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">{t('social.score')}</dt>
                <dd>{profile.score}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-stone-400">{t('social.status')}</dt>
                <dd>{t(`social.st_${status}`)}</dd>
              </div>
            </dl>
          )}
        </div>
        {profile && status !== 'self' && (
          <div className="flex flex-wrap gap-2">
            {status === 'none' && (
              <button type="button" disabled={busy} className={btn('border-orange-600 bg-orange-700 text-white')} onClick={() => void act(() => sendFriendRequest(uid), refresh)}>
                {t('social.addFriend')}
              </button>
            )}
            {status === 'sent' && (
              <button type="button" disabled={busy} className={btn('border-stone-700 bg-stone-900 text-stone-300')} onClick={() => void act(() => removeFriend(uid), refresh)}>
                {t('social.cancelRequest')}
              </button>
            )}
            {status === 'received' && (
              <>
                <button type="button" disabled={busy} className={btn('border-green-700 bg-green-950 text-green-200')} onClick={() => void act(() => respondFriendRequest(uid, true), refresh)}>
                  {t('social.accept')}
                </button>
                <button type="button" disabled={busy} className={btn('border-stone-700 bg-stone-900 text-stone-300')} onClick={() => void act(() => respondFriendRequest(uid, false), refresh)}>
                  {t('social.decline')}
                </button>
              </>
            )}
            {status === 'friends' && (
              <>
                <button type="button" className={btn('border-orange-600 bg-orange-700 text-white')} onClick={() => setView({ kind: 'chat', userId: uid, name: view.name })}>
                  {t('social.message')}
                </button>
                <button type="button" disabled={busy} className={btn('border-red-800 bg-red-950 text-red-200')} onClick={() => void act(() => removeFriend(uid), refresh)}>
                  {t('social.removeFriend')}
                </button>
              </>
            )}
          </div>
        )}
        {profile && status === 'none' && <p className="text-[11px] text-stone-400">{t('social.friendsOnlyMsg')}</p>}
      </div>
    );
  };

  const renderChat = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-[160px] flex-1 overflow-y-auto rounded-lg border border-stone-800 bg-stone-950 p-2">
        {msgs.length === 0 && <p className="text-xs text-stone-500">{t('social.noMessages')}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`mb-1.5 flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-sm ${
                m.mine ? 'bg-orange-700 text-white' : 'bg-stone-800 text-stone-100'
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
        <div ref={chatEnd} />
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder={t('social.typeMessage')}
          className="min-h-[42px] min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 text-sm text-stone-100 outline-none focus:border-orange-500"
        />
        <button type="button" aria-label={t('social.send')} disabled={busy || !draft.trim()} onClick={() => void send()} className="flex min-h-[42px] w-12 items-center justify-center rounded-lg border border-orange-600 bg-orange-700 text-white disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const title = view.kind === 'tabs' ? t('social.title') : view.name;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(10, 8, 7, 0.82)' }} role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col gap-3 rounded-xl border border-stone-800 bg-[#14100e] p-4 shadow-2xl">
        <div className="flex items-center gap-2">
          {view.kind !== 'tabs' && (
            <button
              type="button"
              aria-label={t('social.back')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-700 text-stone-200"
              onClick={() => {
                setNote('');
                setView({ kind: 'tabs' });
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h3 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-stone-100">{title}</h3>
          <button type="button" aria-label={t('social.close')} className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-700 text-stone-200" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {view.kind === 'tabs' && (
          <div className="grid grid-cols-2 gap-2">
            {(['nearby', 'friends'] as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setNote('');
                  setTab(k);
                }}
                className={btn(tab === k ? 'border-orange-500 bg-orange-950 text-orange-200' : 'border-stone-700 bg-stone-900 text-stone-300')}
              >
                {t(`social.tab_${k}`)}
              </button>
            ))}
          </div>
        )}

        {note && <p className="rounded-md border border-amber-800 bg-amber-950/60 px-2.5 py-1.5 text-xs text-amber-200">{note}</p>}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {view.kind === 'tabs' && (tab === 'nearby' ? renderNearby() : renderFriends())}
          {view.kind === 'profile' && renderProfile()}
          {view.kind === 'chat' && renderChat()}
        </div>
      </div>
    </div>
  );
}
