import React from 'react';
import { GAME_VERSION } from '../game/config';
import { t } from '../game/utils/i18n';

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '', stack: '', copied: false };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { hasError: true, message: err?.message || 'Unknown error', stack: err?.stack || '' };
  }

  componentDidCatch(err: Error): void {
    console.error('[PRIMORDIA ErrorBoundary]', err);
  }

  private handleCopy = async () => {
    const info = `PRIMORDIA ${GAME_VERSION}\nError: ${this.state.message}\nUA: ${navigator.userAgent}\n${this.state.stack}`;
    try {
      await navigator.clipboard.writeText(info);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0908] p-4 text-stone-100">
        <section className="primordia-scroll max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border border-red-900/70 bg-[#14100e] p-6 shadow-2xl">
          <h1 className="font-display text-2xl font-bold text-red-400">{t('errors.title')}</h1>
          <p className="mt-2 text-sm text-stone-300">{t('errors.body')}</p>
          <pre className="mt-3 max-h-28 overflow-auto rounded-lg border border-stone-800 bg-stone-950 p-2.5 text-[11px] text-stone-400">
            {this.state.message}
          </pre>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={this.handleCopy}
              className="min-h-[44px] flex-1 rounded-lg border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-medium text-stone-200 hover:bg-stone-800"
            >
              {this.state.copied ? t('errors.copied') : t('errors.copyDebug')}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] flex-1 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500"
            >
              {t('errors.reload')}
            </button>
          </div>
        </section>
      </main>
    );
  }
}
