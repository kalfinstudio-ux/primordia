import React, { useState } from 'react';
import { ACHIEVEMENTS, CAMPAIGN_QUESTS, JOURNAL_ENTRIES } from '../game/config';
import { gameState, setScreen } from '../game/core/state';
import { completeSurveyContract } from '../game/main';
import { t } from '../game/utils/i18n';

type JournalTab = 'discoveries' | 'campaign' | 'achievements' | 'contracts';

export function JournalModal() {
  const [tab, setTab] = useState<JournalTab>('discoveries');
  const [, setRefresh] = useState(0);

  const canClaimContract =
    (gameState.crystalsExtractedCount >= 1 || gameState.meteorIronCollectedCount >= 2) &&
    gameState.distanceExplored >= 250;

  return (
    <main
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(10, 8, 7, 0.88)' }}
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl border border-stone-800 bg-[#14100e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-100">{t('journal.title')}</h2>
          <button
            type="button"
            onClick={() => setScreen('hud')}
            className="min-h-[40px] rounded-lg border border-stone-700 bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
          >
            {t('journal.close')}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-stone-800 px-5 py-2.5">
          {(
            [
              ['discoveries', 'tabDiscoveries'],
              ['campaign', 'tabCampaign'],
              ['achievements', 'tabAchievements'],
              ['contracts', 'tabContracts'],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium ${
                tab === id ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-stone-800'
              }`}
            >
              {t(`journal.${labelKey}`)}
            </button>
          ))}
        </div>

        <div className="primordia-scroll flex-1 space-y-3 overflow-y-auto p-5">
          {tab === 'discoveries' &&
            JOURNAL_ENTRIES.map((entry) => {
              const unlocked = gameState.journalUnlocked.includes(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`rounded-lg border p-3.5 ${
                    unlocked ? 'border-stone-700 bg-stone-900/70' : 'border-stone-800/70 bg-stone-950/50 opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-stone-100">
                      {unlocked ? t(`journal.entries.${entry.id}.title`) : '???'}
                    </div>
                    <span className="text-[11px] font-medium text-orange-400">
                      {unlocked ? t('journal.unlocked') : entry.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-300">
                    {unlocked ? t(`journal.entries.${entry.id}.body`) : t('journal.locked')}
                  </p>
                </div>
              );
            })}

          {tab === 'campaign' &&
            CAMPAIGN_QUESTS.map((q) => {
              const done = gameState.completedQuests.includes(q.id);
              const active = !done && CAMPAIGN_QUESTS[gameState.activeQuestIdx]?.id === q.id;
              return (
                <div
                  key={q.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                    done
                      ? 'border-emerald-800/60 bg-emerald-950/20'
                      : active
                        ? 'border-orange-500/80 bg-orange-950/30'
                        : 'border-stone-800 bg-stone-900/40 opacity-65'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-stone-100">{t(`quests.${q.id}.title`)}</div>
                    <div className="mt-0.5 text-xs text-stone-400">{t(`quests.${q.id}.desc`)}</div>
                  </div>
                  <span className={`font-mono-tabular shrink-0 text-xs font-semibold ${done ? 'text-emerald-400' : 'text-stone-400'}`}>
                    {done ? '✓' : `Ch.${q.chapter}`}
                  </span>
                </div>
              );
            })}

          {tab === 'achievements' &&
            ACHIEVEMENTS.map((ach) => {
              const done = gameState.achievements.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={`flex items-center justify-between rounded-lg border p-3.5 ${
                    done ? 'border-amber-600/60 bg-amber-950/25' : 'border-stone-800 bg-stone-900/50 opacity-65'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-stone-100">{t(`achievements.${ach.id}.name`)}</div>
                    <div className="mt-0.5 text-xs text-stone-400">{t(`achievements.${ach.id}.desc`)}</div>
                  </div>
                  <span className={`text-sm font-bold ${done ? 'text-amber-400' : 'text-stone-600'}`}>
                    {done ? '★' : '☆'}
                  </span>
                </div>
              );
            })}

          {tab === 'contracts' && (
            <div className="rounded-lg border border-stone-700 bg-stone-900/70 p-4">
              <div className="text-base font-semibold text-stone-100">{t('journal.contractTitle')}</div>
              <p className="mt-1 text-xs text-stone-300">{t('journal.contractDesc')}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-400 font-mono-tabular">
                <span>Crystals: {gameState.crystalsExtractedCount}/1</span>
                <span>Meteor Iron: {gameState.meteorIronCollectedCount}/2</span>
                <span>Distance: {Math.round(gameState.distanceExplored)}/250m</span>
                <span>Cleared: {gameState.surveyContractsCleared}</span>
              </div>
              <button
                type="button"
                disabled={!canClaimContract}
                onClick={() => {
                  if (completeSurveyContract()) setRefresh((n) => n + 1);
                }}
                className="mt-4 min-h-[44px] rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
              >
                {t('journal.contractClaim')}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
