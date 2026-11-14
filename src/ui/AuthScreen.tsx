import React, { useState } from 'react';
import { gameState, isSignedIn as isUserSignedIn, setScreen } from '../game/core/state';
import { isSupabaseConfigured } from '../game/net/supabaseClient';
import { isBase44Configured } from '../game/net/base44Client';
import { sendMagicLink, signInWithBase44, signInWithGoogle, signInWithPassword, signOutAccount, signUpWithPassword } from '../game/net/auth';
import { t } from '../game/utils/i18n';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isSupabaseConfigured();
  const base44On = isBase44Configured();
  const isSignedIn = isUserSignedIn(gameState.user);
  const isBase44User = gameState.user.provider === 'base44';

  const handleAction = async (mode: 'signin' | 'signup' | 'magic') => {
    setStatus(null);
    if (!email.trim()) {
      setStatus('Email required.');
      return;
    }
    setBusy(true);
    if (mode === 'magic') {
      const res = await sendMagicLink(email.trim());
      setStatus(res.ok ? t('auth.magicSent') : res.error || 'Error');
    } else if (mode === 'signup') {
      const res = await signUpWithPassword(email.trim(), password);
      setStatus(res.ok ? t('auth.authSuccess') : res.error || 'Error');
    } else {
      const res = await signInWithPassword(email.trim(), password);
      setStatus(res.ok ? t('auth.authSuccess') : res.error || 'Error');
    }
    setBusy(false);
  };

  const handleGoogle = async () => {
    setStatus(null);
    setBusy(true);
    const res = await signInWithGoogle();
    if (!res.ok) {
      setStatus(res.error || 'Error');
      setBusy(false);
    }
  };

  const handleBase44 = async () => {
    setStatus(null);
    setBusy(true);
    const res = await signInWithBase44('google');
    if (!res.ok) {
      setStatus(res.error || 'Error');
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

        {!configured && !base44On && (
          <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            {t('auth.notConfigured')}
          </div>
        )}

        {isSignedIn ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-stone-800 bg-stone-900/90 p-4 text-sm text-stone-200">
              {t('menu.signedInAs')}:{' '}
              <span className="font-semibold text-orange-400">{gameState.user.displayName || gameState.user.email}</span>
              {isBase44User && gameState.user.displayName && gameState.user.email && (
                <div className="mt-1 text-xs text-stone-400">{gameState.user.email}</div>
              )}
            </div>
            {isBase44User && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-200">
                {t('auth.base44NoCloud')}
              </div>
            )}
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
            {base44On && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleBase44()}
                className="min-h-[44px] w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-200 disabled:opacity-40"
              >
                {t('auth.base44')}
              </button>
            )}

            <button
              type="button"
              disabled={!configured || busy}
              onClick={() => void handleGoogle()}
              className="min-h-[44px] w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-200 disabled:opacity-40"
            >
              {t('auth.google')}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-stone-500">
              <span className="h-px flex-1 bg-stone-800" />
              <span>atau / or</span>
              <span className="h-px flex-1 bg-stone-800" />
            </div>

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-stone-300">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || busy}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-orange-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {status && (
              <div className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-amber-300">
                {status}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="submit"
                disabled={!configured || busy}
                className="min-h-[44px] rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-40"
              >
                {t('auth.signIn')}
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
