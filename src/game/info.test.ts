import test from 'node:test';
import assert from 'node:assert/strict';
import id from '../i18n/id.json';
import en from '../i18n/en.json';
import { CAMPAIGN_QUESTS, ACHIEVEMENTS } from './data/quests';
import {
  CHAPTERS,
  DESCRIPTION_KEYS,
  PRIVACY_KEYS,
  SCHEME_KEYS,
  STEP_KEYS,
  TERMS_KEYS,
  TIP_KEYS,
} from './data/infoContent';

type Tree = { [k: string]: string | Tree };
const langs: Array<[string, Tree]> = [
  ['id', id as unknown as Tree],
  ['en', en as unknown as Tree],
];

function get(tree: Tree, path: string): string | undefined {
  let cur: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`)));
}

test('panel info: semua kunci yang dipakai UI ada teksnya (id & en)', () => {
  const paths: string[] = [
    'settings.tabs.info', 'info.updated',
    ...['description', 'scheme', 'missions', 'guide', 'terms', 'privacy'].map((s) => `info.sections.${s}`),
    'info.description.title', 'info.scheme.title', 'info.missions.title', 'info.missions.intro',
    'info.missions.achievements', 'info.missions.extra', 'info.missions.contract', 'info.missions.journal', 'info.missions.ngplus',
    'info.guide.title', 'info.guide.controlsTitle', 'info.guide.desktop', 'info.guide.mobile', 'info.guide.stepsTitle', 'info.guide.tipsTitle',
    'info.terms.title', 'info.privacy.title',
    ...CHAPTERS.map((c) => `info.missions.chapter${c}`),
    ...DESCRIPTION_KEYS.map((k) => `info.description.${k}`),
    ...SCHEME_KEYS.flatMap((k) => [`info.scheme.${k}.t`, `info.scheme.${k}.b`]),
    ...STEP_KEYS.map((k) => `info.guide.${k}`),
    ...TIP_KEYS.map((k) => `info.guide.${k}`),
    ...TERMS_KEYS.flatMap((k) => [`info.terms.${k}.t`, `info.terms.${k}.b`]),
    ...PRIVACY_KEYS.flatMap((k) => [`info.privacy.${k}.t`, `info.privacy.${k}.b`]),
    ...CAMPAIGN_QUESTS.flatMap((q) => [`quests.${q.id}.title`, `quests.${q.id}.desc`]),
    ...ACHIEVEMENTS.flatMap((a) => [`achievements.${a.id}.name`, `achievements.${a.id}.desc`]),
  ];
  for (const [lang, tree] of langs) {
    const missing = paths.filter((p) => !get(tree, p));
    assert.deepEqual(missing, [], `${lang}: kunci hilang`);
  }
});

test('panel info: struktur id dan en identik', () => {
  const a = flatten((id as unknown as Tree).info as Tree).sort();
  const b = flatten((en as unknown as Tree).info as Tree).sort();
  assert.deepEqual(a, b);
});

test('panel info: misi kampanye 22 dan tiap bab terisi', () => {
  assert.equal(CAMPAIGN_QUESTS.length, 22);
  for (const c of CHAPTERS) assert.ok(CAMPAIGN_QUESTS.some((q) => q.chapter === c));
});
