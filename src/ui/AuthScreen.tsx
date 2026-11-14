import React, { useState } from 'react';
import { gameState, setScreen } from '../game/core/state';
import { isSupabaseConfigured } from '../game/net/supabaseClient';
import { sendMagicLink, signInWithPassword, signInWithProvider, signOutAccount, signUpWithPassword, type OAuthProviderId } from '../game/net/auth';
import { t } from '../game/utils/i18n';
import { friendlyAuthError } from '../game/net/authErrors';
import { LOGO_DISCORD, LOGO_GITHUB, LOGO_GOOGLE } from './brandLogos';

const OAUTH_BTN =
  'flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-lg border border-[#8E918F] bg-[#131314] px-4 py-2.5 text-sm font-medium text-[#E3E3E3] hover:bg-[#1f1f21] disabled:opacity-40';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isSupabaseConfigured();
  const isSignedIn = gameState.user.mode === 'authenticated';
  const fail = (raw?: string) => setStatus({ text: friendlyAuthError(raw), ok: false });
  const done = (text: string) => setStatus({ text, ok: true });

  const handleAction = async (mode: 'signin' | 'signup' | 'magic') => {
    setStatus(null);
    if (!email.trim()) {
      setStatus({ text: t('auth.errors.emailRequired'), ok: false });
      return;
    }
    if (mode !== 'magic' && !password) {
      setStatus({ text: t('auth.errors.passwordRequired'), ok: false });
      return;
    }
    setBusy(true);
    if (mode === 'magic') {
      const res = await sendMagicLink(email.trim());
      if (res.ok) done(t('auth.magicSent')); else fail(res.error);
    } else if (mode === 'signup') {
      const res = await signUpWithPassword(email.trim(), password);
      if (res.ok) done(res.needsConfirm ? t('auth.signUpConfirm') : t('auth.authSuccess')); else fail(res.error);
    } else {
      const res = await signInWithPassword(email.trim(), password);
      if (res.ok) done(t('auth.authSuccess')); else fail(res.error);
    }
    setBusy(false);
  };

  const handleProvider = async (provider: OAuthProviderId) => {
    setStatus(null);
    setBusy(true);
    const res = await signInWithProvider(provider);
    if (!res.ok) {
      fail(res.error);
      setBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(11, 9, 8, 0.86)' }}>
      <section className="primordia-scroll max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border border-stone-800 bg-[#14100e] p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-stone-100">{t('auth.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="min-h-[44px] rounded-lg px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
          >
            {t('auth.back')}
          </button>
        </div>

        <p className="mt-2 text-sm text-stone-400">{t('auth.subtitle')}</p>

        {!configured && (
          <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            {t('auth.notConfigured')}
          </div>
        )}

        {isSignedIn ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-stone-800 bg-stone-900/90 p-4 text-sm text-stone-200">
              {t('menu.signedInAs')}: <span className="font-semibold text-orange-400">{gameState.user.email}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOutAccount();
                setScreen('menu');
              }}
              className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
            >
              {t('auth.signOut')}
            </button>
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAction('signin');
            }}
          >
            <button type="button" disabled={!configured || busy} onClick={() => void handleProvider('google')} className={OAUTH_BTN}>
              {/* Ikon resmi Google (tema gelap); margin negatif memangkas garis tepi bawaan file */}
              <span className="inline-block h-6 w-6 shrink-0 overflow-hidden">
                <img src={LOGO_GOOGLE} alt="" aria-hidden className="-m-px h-[26px] w-[26px] max-w-none" />
              </span>
              <span>{t('auth.google')}</span>
            </button>

            <button type="button" disabled={!configured || busy} onClick={() => void handleProvider('github')} className={OAUTH_BTN}>
              <img src={LOGO_GITHUB} alt="" aria-hidden className="h-5 w-5 shrink-0" />
              <span>Masuk dengan GitHub</span>
            </button>

            <button type="button" disabled={!configured || busy} onClick={() => void handleProvider('discord')} className={OAUTH_BTN}>
              <span>Masuk dengan</span>
              <img src={LOGO_DISCORD} alt="Discord" className="h-4 w-auto shrink-0" />
            </button>

            <div className="flex items-center gap-3 text-[11px] text-stone-500">
              <span className="h-px flex-1 bg-stone-800" />
              <span>{t('auth.or')}</span>
              <span className="h-px flex-1 bg-stone-800" />
            </div>

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-stone-300">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!configured || busy}
                placeholder="explorer@primordia.earth"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-orange-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-stone-300">
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || busy}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {status && (
              <div
                role="status"
                className={`rounded-lg border px-3 py-2 text-xs ${status.ok ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300' : 'border-stone-700 bg-stone-900 text-amber-300'}`}
              >
                {status.text}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="submit"
                disabled={!configured || busy}
                className="min-h-[44px] rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-40"
              >
                {busy ? t('auth.busy') : t('auth.signIn')}
              </button>
              <button
                type="button"
                disabled={!configured || busy}
                onClick={() => void handleAction('signup')}
                className="min-h-[44px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 disabled:opacity-40"
              >
                {t('auth.signUp')}
              </button>
            </div>

            <button
              type="button"
              disabled={!configured || busy}
              onClick={() => void handleAction('magic')}
              className="min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-900/70 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-stone-800 disabled:opacity-40"
            >
              {t('auth.magicLink')}
            </button>

            <div className="border-t border-stone-800 pt-3">
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="min-h-[44px] w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800"
              >
                {t('auth.continueGuest')}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
