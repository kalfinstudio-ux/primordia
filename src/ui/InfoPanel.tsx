import React, { useState } from 'react';
import { ACHIEVEMENTS, CAMPAIGN_QUESTS } from '../game/config';
import {
  CHAPTERS,
  DESCRIPTION_KEYS,
  INFO_SECTIONS,
  PRIVACY_KEYS,
  SCHEME_KEYS,
  STEP_KEYS,
  TERMS_KEYS,
  TIP_KEYS,
  type InfoSection,
} from '../game/data/infoContent';
import { t } from '../game/utils/i18n';

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-lg font-semibold text-amber-200">{children}</h3>;
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
      {title && <div className="mb-1 text-sm font-semibold text-stone-100">{title}</div>}
      <div className="text-sm leading-relaxed text-stone-300">{children}</div>
    </div>
  );
}

function Numbered({ keys, prefix }: { keys: string[]; prefix: string }) {
  return (
    <ol className="space-y-1.5">
      {keys.map((k, i) => (
        <li key={k} className="flex gap-2 text-sm leading-relaxed text-stone-300">
          <span className="font-mono-tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-600/25 text-[11px] font-bold text-orange-200">
            {i + 1}
          </span>
          <span>{t(`${prefix}.${k}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function Doc({ root, keys }: { root: 'info.terms' | 'info.privacy'; keys: string[] }) {
  return (
    <div className="space-y-2">
      <Heading>{t(`${root}.title`)}</Heading>
      <p className="text-xs text-stone-500">{t('info.updated')}</p>
      {keys.map((k) => (
        <Card key={k} title={t(`${root}.${k}.t`)}>
          {t(`${root}.${k}.b`)}
        </Card>
      ))}
    </div>
  );
}

function Missions() {
  return (
    <div className="space-y-3">
      <Heading>{t('info.missions.title')}</Heading>
      <p className="text-sm leading-relaxed text-stone-300">{t('info.missions.intro')}</p>
      {CHAPTERS.map((ch) => (
        <div key={ch} className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t(`info.missions.chapter${ch}`)}</div>
          {CAMPAIGN_QUESTS.filter((q) => q.chapter === ch).map((q) => (
            <Card key={q.id} title={t(`quests.${q.id}.title`)}>
              {t(`quests.${q.id}.desc`)}
            </Card>
          ))}
        </div>
      ))}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t('info.missions.achievements')}</div>
        {ACHIEVEMENTS.map((a) => (
          <Card key={a.id} title={t(`achievements.${a.id}.name`)}>
            {t(`achievements.${a.id}.desc`)}
          </Card>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t('info.missions.extra')}</div>
        <Card>{t('info.missions.contract')}</Card>
        <Card>{t('info.missions.journal')}</Card>
        <Card>{t('info.missions.ngplus')}</Card>
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="space-y-3">
      <Heading>{t('info.guide.title')}</Heading>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t('info.guide.controlsTitle')}</div>
        <Card>{t('info.guide.desktop')}</Card>
        <Card>{t('info.guide.mobile')}</Card>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t('info.guide.stepsTitle')}</div>
        <Numbered keys={STEP_KEYS} prefix="info.guide" />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t('info.guide.tipsTitle')}</div>
        <Numbered keys={TIP_KEYS} prefix="info.guide" />
      </div>
    </div>
  );
}

/** Tab "Panduan & Info" di Pengaturan: deskripsi, skema game, misi, panduan, ketentuan, kebijakan privasi. */
export function InfoPanel() {
  const [section, setSection] = useState<InfoSection>('description');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {INFO_SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs font-medium ${
              section === id ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-stone-700 bg-stone-900 text-stone-300'
            }`}
          >
            {t(`info.sections.${id}`)}
          </button>
        ))}
      </div>

      {section === 'description' && (
        <div className="space-y-2">
          <Heading>{t('info.description.title')}</Heading>
          {DESCRIPTION_KEYS.map((k) => (
            <p key={k} className="text-sm leading-relaxed text-stone-300">
              {t(`info.description.${k}`)}
            </p>
          ))}
        </div>
      )}

      {section === 'scheme' && (
        <div className="space-y-2">
          <Heading>{t('info.scheme.title')}</Heading>
          {SCHEME_KEYS.map((k) => (
            <Card key={k} title={t(`info.scheme.${k}.t`)}>
              {t(`info.scheme.${k}.b`)}
            </Card>
          ))}
        </div>
      )}

      {section === 'missions' && <Missions />}
      {section === 'guide' && <Guide />}
      {section === 'terms' && <Doc root="info.terms" keys={TERMS_KEYS} />}
      {section === 'privacy' && <Doc root="info.privacy" keys={PRIVACY_KEYS} />}
    </div>
  );
}
