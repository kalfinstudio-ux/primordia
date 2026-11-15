import test from 'node:test';
import assert from 'node:assert/strict';
import idDict from '../i18n/id.json';
import enDict from '../i18n/en.json';
import {
  BRUK_LEVEL_THRESHOLDS,
  BRUK_MAX_TRUST,
  BRUK_MOMENTS,
  brukLevel,
  brukTrust,
  evaluateBruk,
  sanitizeBrukChoice,
  sanitizeBrukMoments,
  withEndingMoment,
  type BrukFacts,
} from './data/bruk';

const none: BrukFacts = { completedQuests: [], campfireCount: 0, hasShelter: false, stormSurvived: false, campaignComplete: false, brukChoice: null };
const get = (d: unknown, key: string): unknown => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], d);

test('tanpa fakta: tidak ada dialog, kepercayaan 0, tingkat 0', () => {
  const r = evaluateBruk([], none);
  assert.deepEqual(r.lines, []);
  assert.equal(r.trust, 0);
  assert.equal(r.level, 0);
});

test('api pertama: Bruk bicara sekali, tidak diulang pada evaluasi berikutnya', () => {
  const r1 = evaluateBruk([], { ...none, campfireCount: 1 });
  assert.deepEqual(r1.lines.slice(0, 1), ['bruk.lines.first_fire']);
  assert.ok(r1.moments.includes('first_fire'));
  const r2 = evaluateBruk(r1.moments, { ...none, campfireCount: 1 });
  assert.deepEqual(r2.lines, []);
});

test('api ketiga memicu momen terpisah', () => {
  const r1 = evaluateBruk([], { ...none, campfireCount: 1 });
  const r3 = evaluateBruk(r1.moments, { ...none, campfireCount: 3 });
  assert.equal(r3.lines[0], 'bruk.lines.fire_third');
});

test('naik tingkat karena momen baru menambah petunjuk tingkat sekarang', () => {
  const r = evaluateBruk([], { ...none, campfireCount: 1 }); // trust 10 → level 1
  assert.equal(r.level, 1);
  assert.deepEqual(r.lines, ['bruk.lines.first_fire', 'bruk.hints.level1']);
});

test('save lama dengan banyak progres: hanya SATU momen diucapkan, semua ditandai', () => {
  const quests = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14'];
  const r = evaluateBruk([], { ...none, completedQuests: quests, campfireCount: 1, hasShelter: true });
  const spoken = r.lines.filter((k) => k.startsWith('bruk.lines.'));
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0], 'bruk.lines.chapter_3'); // yang terakhir menurut urutan
  for (const id of ['first_fire', 'first_shelter', 'chapter_1', 'chapter_2', 'chapter_3']) assert.ok(r.moments.includes(id), id);
  assert.ok(r.lines.length <= 2);
});

test('kepercayaan dihitung dari momen + misi, dibatasi 100', () => {
  assert.equal(brukTrust([], 0), 0);
  assert.equal(brukTrust(['first_fire'], 3), 10 + 6);
  assert.equal(brukTrust(BRUK_MOMENTS.map((m) => m.id), 22), BRUK_MAX_TRUST);
});

test('tingkat mengikuti ambang', () => {
  assert.equal(brukLevel(0), 0);
  assert.equal(brukLevel(9), 0);
  assert.equal(brukLevel(10), 1);
  assert.equal(brukLevel(55), 3);
  assert.equal(brukLevel(100), BRUK_LEVEL_THRESHOLDS.length - 1);
});

test('ending menunggu pilihan pemain: kampanye selesai saja tidak cukup', () => {
  const r = evaluateBruk([], { ...none, campaignComplete: true });
  assert.ok(!r.moments.includes('ending'));
  assert.ok(!r.lines.includes('bruk.lines.ending'));
});

test('withEndingMoment menandai ending sekali; setelahnya Bruk tidak mengulang dialog ending', () => {
  const m = withEndingMoment(['first_fire']);
  assert.deepEqual(m, ['first_fire', 'ending']);
  assert.deepEqual(withEndingMoment(m), m);
  const r = evaluateBruk(m, { ...none, campaignComplete: true, brukChoice: 'release' });
  assert.ok(!r.lines.includes('bruk.lines.ending'));
});

test('sanitizeBrukChoice hanya menerima release/hold', () => {
  assert.equal(sanitizeBrukChoice('release'), 'release');
  assert.equal(sanitizeBrukChoice('hold'), 'hold');
  assert.equal(sanitizeBrukChoice('xxx'), null);
  assert.equal(sanitizeBrukChoice(undefined), null);
});

test('kepercayaan penuh hanya dengan ending', () => {
  const noEnding = BRUK_MOMENTS.filter((m) => m.id !== 'ending').map((m) => m.id);
  assert.ok(brukTrust(noEnding, 22) <= BRUK_MAX_TRUST);
});

test('sanitizeBrukMoments membuang id tak dikenal, duplikat, dan bukan-string', () => {
  assert.deepEqual(sanitizeBrukMoments(['first_fire', 'first_fire', 'xxx', 7, null]), ['first_fire']);
  assert.deepEqual(sanitizeBrukMoments('bukan array'), []);
});

test('i18n: tiap momen dan petunjuk tingkat ada di id & en, tidak kosong', () => {
  const keys = [
    'bruk.name',
    'bruk.hintLabel',
    ...BRUK_MOMENTS.map((m) => `bruk.lines.${m.id}`),
    ...BRUK_LEVEL_THRESHOLDS.slice(1).map((_, i) => `bruk.hints.level${i + 1}`),
    'bruk.choice.release.label',
    'bruk.choice.release.reply',
    'bruk.choice.hold.label',
    'bruk.choice.hold.reply',
  ];
  for (const k of keys) {
    for (const [name, dict] of [['id', idDict], ['en', enDict]] as const) {
      const v = get(dict, k);
      assert.equal(typeof v, 'string', `${name}:${k}`);
      assert.ok((v as string).length > 0, `${name}:${k}`);
    }
  }
});
