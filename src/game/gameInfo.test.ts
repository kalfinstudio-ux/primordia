import assert from 'node:assert/strict';
import test from 'node:test';
import idDict from '../i18n/id.json';
import enDict from '../i18n/en.json';
import { ACHIEVEMENTS, CAMPAIGN_QUESTS, ITEMS, RECIPES } from './config';
import {
  INFO_SECTIONS,
  NUM_CHAPTERS,
  buildInfoVars,
  fillInfo,
  parseBlocks,
  prettyKey,
  questsByChapter,
} from './data/gameInfo';

type Json = Record<string, unknown>;
const id = idDict as unknown as Json;
const en = enDict as unknown as Json;

function shape(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(shape);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Json).map(([k, v]) => [k, shape(v)]));
  return typeof x;
}

function collectStrings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => collectStrings(v, out));
  else if (x && typeof x === 'object') Object.values(x as Json).forEach((v) => collectStrings(v, out));
  return out;
}

const vars = buildInfoVars({ biomeCount: Object.keys(id.biomes as Json).length, updatedAt: '2026-11-14', contactEmail: 'a@b.c', ownerName: 'X' });

test('info: struktur id.json dan en.json sama persis (kunci & panjang array)', () => {
  assert.deepEqual(shape(id.info), shape(en.info));
});

test('info: semua placeholder dikenal dan tidak ada yang tersisa setelah diisi', () => {
  for (const [lang, dict] of [['id', id], ['en', en]] as const) {
    for (const s of collectStrings(dict.info)) {
      const filled = fillInfo(s, vars);
      assert.ok(!/\{\w+\}/.test(filled), `[${lang}] placeholder tak dikenal di: ${s}`);
    }
  }
});

test('info: setiap bagian punya blok teks yang valid', () => {
  const keys: Record<string, string[]> = {
    about: ['about'],
    scheme: ['scheme'],
    missions: ['missions'],
    guide: ['guide'],
    terms: ['terms'],
    privacy: ['privacy'],
  };
  for (const sec of INFO_SECTIONS) {
    for (const dict of [id, en]) {
      const node = (dict.info as Json)[keys[sec]![0]!] as Json;
      assert.ok(node, `bagian ${sec} hilang`);
      assert.ok(parseBlocks(node.blocks).length > 0, `bagian ${sec} tanpa blok`);
    }
    assert.ok(typeof ((id.info as Json).nav as Json)[sec] === 'string');
  }
});

test('misi: semua misi kampanye muncul sekali, urut, dan punya judul/deskripsi di kedua bahasa', () => {
  const grouped = questsByChapter();
  assert.equal(grouped.length, NUM_CHAPTERS);
  const flat = grouped.flatMap((g) => g.ids);
  assert.deepEqual(flat, [...CAMPAIGN_QUESTS].sort((a, b) => a.order - b.order).map((q) => q.id));
  for (const dict of [id, en]) {
    const quests = dict.quests as Json;
    for (const qid of flat) {
      const q = quests[qid] as Json;
      assert.ok(q && typeof q.title === 'string' && typeof q.desc === 'string', `misi ${qid} tanpa teks`);
    }
    for (const g of grouped) {
      const ch = ((dict.info as Json).missions as Json).chapters as Json;
      const c = ch[String(g.chapter)] as Json;
      assert.ok(c && typeof c.title === 'string' && typeof c.desc === 'string', `bab ${g.chapter} tanpa teks`);
    }
    for (const a of ACHIEVEMENTS) {
      const t = (dict.achievements as Json)[a.id] as Json;
      assert.ok(t && typeof t.name === 'string', `pencapaian ${a.id} tanpa teks`);
    }
  }
});

test('vars: angka mengikuti data game sungguhan', () => {
  assert.equal(vars.items, String(Object.keys(ITEMS).length));
  assert.equal(vars.recipes, String(RECIPES.length));
  assert.equal(vars.quests, String(CAMPAIGN_QUESTS.length));
  assert.equal(vars.worldKm, '4');
  assert.equal(vars.tierCounts.split(' / ').length, 5);
  assert.equal(
    vars.tierCounts.split(' / ').reduce((a, b) => a + Number(b), 0),
    Object.keys(ITEMS).length,
  );
  assert.equal(vars.safeMin, '10');
});

test('fillInfo: mengganti placeholder dan membiarkan yang tak dikenal', () => {
  assert.equal(fillInfo('a {x} b {y}', { x: '1' }), 'a 1 b {y}');
});

test('parseBlocks: membuang entri rusak', () => {
  const out = parseBlocks([{ title: 'A', body: 'b', items: ['x', 5] }, { body: 'tanpa judul' }, null, 'str']);
  assert.deepEqual(out, [{ title: 'A', body: 'b', items: ['x'] }]);
  assert.deepEqual(parseBlocks('bukan array'), []);
});

test('prettyKey: nama tombol mudah dibaca', () => {
  assert.equal(prettyKey('KeyW'), 'W');
  assert.equal(prettyKey('Space'), 'Spasi');
  assert.equal(prettyKey('ShiftLeft'), 'Shift');
  assert.equal(prettyKey('Digit1'), '1');
  assert.equal(prettyKey('ArrowUp'), 'Up');
});

test('i18n: kunci baru tab info & login Base44 ada di kedua bahasa', () => {
  for (const dict of [id, en]) {
    assert.equal(typeof ((dict.settings as Json).tabs as Json).info, 'string');
    assert.equal(typeof (dict.auth as Json).base44, 'string');
    assert.equal(typeof (dict.auth as Json).base44NoCloud, 'string');
  }
});
