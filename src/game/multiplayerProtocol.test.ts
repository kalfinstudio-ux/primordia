import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MP_MAX_PER_ROOM,
  makeSessionId,
  parseEmote,
  parsePos,
  parsePresence,
  roomName,
  sanitizeAvatar,
  sanitizeName,
  shouldMoveToNextShard,
  shouldSendPos,
} from './net/multiplayerProtocol';

test('roomName memakai seed dan shard, aman untuk karakter aneh', () => {
  assert.equal(roomName('HADEAN-01', 0), 'primordia:HADEAN-01:0');
  assert.equal(roomName('a b/c?d', 2), 'primordia:a_b_c_d:2');
  assert.equal(roomName('', 1), 'primordia:HADEAN-01:1');
});

test('makeSessionId valid dan acak', () => {
  const a = makeSessionId();
  assert.match(a, /^p_[a-z0-9]{8}$/);
  assert.notEqual(a, makeSessionId());
});

test('sanitizeName membuang karakter kontrol/tag dan membatasi panjang', () => {
  assert.equal(sanitizeName('  Arka-01 '), 'Arka-01');
  assert.equal(sanitizeName('<b>X</b>\u0007'), 'bX/b');
  assert.equal(sanitizeName('a'.repeat(40)).length, 16);
  assert.equal(sanitizeName(''), 'Penjelajah');
  assert.equal(sanitizeName(123), 'Penjelajah');
});

test('sanitizeAvatar menolak warna/enum tidak valid dan menjepit tinggi', () => {
  const a = sanitizeAvatar({ height: 99, build: 'giant', skinTone: 'red', hairStyle: 'hood', suitColor: '#12abEF', packStyle: 'x' }, 'N');
  assert.equal(a.height, 1.15);
  assert.equal(a.build, 'standard');
  assert.equal(a.skinTone, '#c68b59');
  assert.equal(a.hairStyle, 'hood');
  assert.equal(a.suitColor, '#12abEF');
  assert.equal(a.packStyle, 'o2_pack');
  assert.equal(sanitizeAvatar(null, 'N').name, 'N');
});

test('sanitizeAvatar: gender dan gaya rambut baru divalidasi', () => {
  assert.equal(sanitizeAvatar({ gender: 'female', hairStyle: 'braid' }, 'N').gender, 'female');
  assert.equal(sanitizeAvatar({ gender: 'female', hairStyle: 'braid' }, 'N').hairStyle, 'braid');
  assert.equal(sanitizeAvatar({ gender: 'alien' }, 'N').gender, 'male');
  assert.equal(sanitizeAvatar({}, 'N').gender, 'male');
  assert.equal(sanitizeAvatar({ hairStyle: 'mohawk' }, 'N').hairStyle, 'short');
});

test('parsePresence menolak key/payload tidak valid', () => {
  assert.equal(parsePresence('bad key!', {}), null);
  assert.equal(parsePresence('p_abc12345', 'x'), null);
  const p = parsePresence('p_abc12345', { name: 'Eva', joinedAt: 5, avatar: {} });
  assert.equal(p?.name, 'Eva');
  assert.equal(p?.joinedAt, 5);
});

test('parsePos memvalidasi dan menjepit nilai', () => {
  assert.equal(parsePos({ id: 'p_1', x: NaN, y: 0, z: 0 }, 2048), null);
  assert.equal(parsePos({ id: 'bad id', x: 0, y: 0, z: 0 }, 2048), null);
  assert.equal(parsePos('x', 2048), null);
  const m = parsePos({ id: 'p_1', x: 99999, y: -999, z: -99999, yaw: 1, anim: 'fly', speed: 99 }, 2048);
  assert.ok(m);
  assert.equal(m.x, 2148);
  assert.equal(m.z, -2148);
  assert.equal(m.y, -50);
  assert.equal(m.anim, 'idle');
  assert.equal(m.speed, 20);
});

test('parseEmote hanya menerima emote yang dikenal', () => {
  assert.deepEqual(parseEmote({ id: 'p_1', emote: 'hello' }), { id: 'p_1', emote: 'hello' });
  assert.equal(parseEmote({ id: 'p_1', emote: 'hack' }), null);
  assert.equal(parseEmote(null), null);
});

test('shouldMoveToNextShard: hanya pendatang terbaru di atas kapasitas yang pindah', () => {
  const entries = Array.from({ length: MP_MAX_PER_ROOM + 1 }, (_, i) => ({ id: `p_${i}`, joinedAt: 100 + i }));
  assert.equal(shouldMoveToNextShard(`p_${MP_MAX_PER_ROOM}`, entries), true);
  assert.equal(shouldMoveToNextShard('p_0', entries), false);
  assert.equal(shouldMoveToNextShard(`p_${MP_MAX_PER_ROOM - 1}`, entries), false);
  assert.equal(shouldMoveToNextShard('p_0', entries.slice(0, MP_MAX_PER_ROOM)), false);
});

test('shouldSendPos: interval, gerak, dan heartbeat', () => {
  const cur = { x: 0, y: 0, z: 0, yaw: 0, anim: 'idle' as const };
  assert.equal(shouldSendPos(null, cur, 0), true);
  const last = { ...cur, at: 1000 };
  assert.equal(shouldSendPos(last, { ...cur, x: 5 }, 1100), false); // terlalu cepat
  assert.equal(shouldSendPos(last, cur, 1300), false); // diam
  assert.equal(shouldSendPos(last, { ...cur, x: 1 }, 1300), true); // bergerak
  assert.equal(shouldSendPos(last, { ...cur, anim: 'walk' }, 1300), true); // ganti animasi
  assert.equal(shouldSendPos(last, cur, 2100), true); // heartbeat
});

test('parsePresence membaca uid akun hanya bila berformat UUID', () => {
  const uid = '123e4567-e89b-12d3-a456-426614174000';
  const ok = parsePresence('p_abc12345', { name: 'Adam', avatar: {}, joinedAt: 1, uid: uid.toUpperCase() });
  assert.equal(ok?.userId, uid);
  const bad = parsePresence('p_abc12345', { name: 'Adam', avatar: {}, joinedAt: 1, uid: "x'; drop table" });
  assert.equal(bad?.userId, undefined);
  const guest = parsePresence('p_abc12345', { name: 'Tamu', avatar: {}, joinedAt: 1 });
  assert.equal(guest?.userId, undefined);
});
