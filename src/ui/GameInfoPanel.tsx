import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS, LEGAL_CONFIG, type KeyBindings } from '../game/config';
import { gameState } from '../game/core/state';
import {
  INFO_SECTIONS,
  buildInfoVars,
  fillInfo,
  parseBlocks,
  prettyKey,
  questsByChapter,
  type InfoBlock,
  type InfoSectionId,
} from '../game/data/gameInfo';
import { t, tRaw } from '../game/utils/i18n';

const KEY_ORDER: Array<keyof KeyBindings> = [
  'forward',
  'backward',
  'left',
  'right',
  'jump',
  'sprint',
  'interact',
  'inventory',
  'build',
  'map',
  'journal',
];

/** Panel "Info Game" di Pengaturan: deskripsi, skema, misi, panduan, ketentuan, kebijakan. */
export function GameInfoPanel({ showProgress = false }: { showProgress?: boolean }) {
  const [section, setSection] = useState<InfoSectionId>('about');

  const vars = useMemo(() => {
    const biomes = tRaw('biomes');
    return buildInfoVars({
      biomeCount: biomes && typeof biomes === 'object' ? Object.keys(biomes as object).length : 0,
      contactEmail: LEGAL_CONFIG.contactEmail,
      ownerName: LEGAL_CONFIG.ownerName,
      updatedAt: LEGAL_CONFIG.updatedAt,
    });
    // Bahasa berubah → ScreenRouter me-render ulang; vars tidak bergantung bahasa kecuali jumlah bioma.
  }, []);

  const fill = (s: string) => fillInfo(s, vars);
  const blocks = (key: string): InfoBlock[] => parseBlocks(tRaw(key));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-semibold text-stone-100">{t('info.title')}</h3>
        <p className="mt-1 text-xs text-stone-400">{t('info.subtitle')}</p>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('info.title')}>
        {INFO_SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              section === id
                ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                : 'border-stone-800 bg-stone-900 text-stone-300 hover:bg-stone-800'
            }`}
          >
            {t(`info.nav.${id}`)}
          </button>
        ))}
      </div>

      {section === 'about' && <BlockList heading={t('info.about.heading')} blocks={blocks('info.about.blocks')} fill={fill} />}

      {section === 'scheme' && <BlockList heading={t('info.scheme.heading')} blocks={blocks('info.scheme.blocks')} fill={fill} />}

      {section === 'missions' && <MissionsSection fill={fill} blocks={blocks('info.missions.blocks')} showProgress={showProgress} />}

      {section === 'guide' && (
        <>
          <ControlsCard />
          <BlockList heading={t('info.guide.heading')} blocks={blocks('info.guide.blocks')} fill={fill} />
        </>
      )}

      {section === 'terms' && (
        <>
          <BlockList heading={t('info.terms.heading')} blocks={blocks('info.terms.blocks')} fill={fill} />
          <LegalFooter fill={fill} />
        </>
      )}

      {section === 'privacy' && (
        <>
          <BlockList heading={t('info.privacy.heading')} blocks={blocks('info.privacy.blocks')} fill={fill} />
          <LegalFooter fill={fill} />
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <article className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">{children}</article>;
}

function BlockList({ heading, blocks, fill }: { heading: string; blocks: InfoBlock[]; fill: (s: string) => string }) {
  return (
    <section className="space-y-3">
      {heading && <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-400">{heading}</h4>}
      {blocks.map((b, i) => (
        <Card key={`${b.title}-${i}`}>
          <h5 className="text-sm font-semibold text-stone-100">{fill(b.title)}</h5>
          {b.body && <p className="mt-1.5 text-sm leading-relaxed text-stone-300">{fill(b.body)}</p>}
          {b.items && b.items.length > 0 && (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-300 marker:text-orange-500">
              {b.items.map((it, j) => (
                <li key={j}>{fill(it)}</li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </section>
  );
}

function ControlsCard() {
  const keys = gameState.settings.controls.keys;
  return (
    <Card>
      <h5 className="text-sm font-semibold text-stone-100">{t('info.guide.controlsTitle')}</h5>
      <div className="mt-2 text-xs font-medium text-stone-400">{t('info.guide.controlsDesktop')}</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {KEY_ORDER.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <dt className="text-stone-300">{t(`info.guide.keys.${k}`)}</dt>
            <dd>
              <kbd className="rounded border border-stone-700 bg-stone-950 px-1.5 py-0.5 font-mono-tabular text-xs text-orange-300">
                {prettyKey(keys[k])}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm leading-relaxed text-stone-300">{t('info.guide.controlsMobile')}</p>
    </Card>
  );
}

function MissionsSection({
  fill,
  blocks,
  showProgress,
}: {
  fill: (s: string) => string;
  blocks: InfoBlock[];
  showProgress: boolean;
}) {
  const chapters = questsByChapter();
  const done = new Set(gameState.completedQuests);
  const activeId = showProgress && !gameState.campaignComplete ? chapters.flatMap((c) => c.ids).find((id) => !done.has(id)) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-stone-300">{fill(t('info.missions.intro'))}</p>

      {chapters.map(({ chapter, ids }) => (
        <section key={chapter} className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-orange-300">{t(`info.missions.chapters.${chapter}.title`)}</h4>
            <p className="text-xs text-stone-400">{t(`info.missions.chapters.${chapter}.desc`)}</p>
          </div>
          <ol className="space-y-2">
            {ids.map((id) => {
              const isDone = showProgress && done.has(id);
              const isActive = id === activeId;
              return (
                <li
                  key={id}
                  className={`rounded-lg border p-3 ${
                    isActive ? 'border-orange-500/70 bg-orange-950/30' : 'border-stone-800 bg-stone-900/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-sm font-semibold ${isDone ? 'text-stone-400 line-through' : 'text-stone-100'}`}>
                      {t(`quests.${id}.title`)}
                    </div>
                    {isDone && <span className="shrink-0 text-[11px] font-medium text-emerald-400">{t('info.missions.done')}</span>}
                    {isActive && <span className="shrink-0 text-[11px] font-medium text-orange-300">{t('info.missions.active')}</span>}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-stone-400">{t(`quests.${id}.desc`)}</div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-400">
          {t('info.missions.achievementsTitle')} ({ACHIEVEMENTS.length})
        </h4>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => (
            <li key={a.id} className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
              <div className="text-sm font-semibold text-stone-100">{t(`achievements.${a.id}.name`)}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-stone-400">{t(`achievements.${a.id}.desc`)}</div>
            </li>
          ))}
        </ul>
      </section>

      <BlockList heading="" blocks={blocks} fill={fill} />
    </div>
  );
}

function LegalFooter({ fill }: { fill: (s: string) => string }) {
  const { ownerName, contactEmail } = LEGAL_CONFIG;
  return (
    <div className="space-y-1 rounded-lg border border-stone-800 bg-stone-950 p-3 text-xs text-stone-400">
      <div>{fill(t('info.legal.updated'))}</div>
      {ownerName && <div>{fill(t('info.legal.owner'))}</div>}
      {contactEmail && (
        <div>
          {t('info.legal.contact').split('{contact}')[0]}
          <a className="text-orange-300 underline" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </div>
      )}
    </div>
  );
}
