import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, capToxicLevelForSafeStart, getDifficultyMultiplier, isSafeStartActive } from './data/balance';
import { createInitialVitals, type DeathBag } from './core/state';
import { computeHazardState, isSuffocating, stepVitals, type SurvivalEnvironment } from './player/stats';
import { findNearestCleanAir, isCleanAirAt, pickRespawnPoint, relativeBearingDeg } from './systems/cleanAir';
import { dropInventoryAsBag, findBagInRange, mergeBagIntoInventory, mergeSlots } from './systems/deathBag';

function toxicEnv(over: Partial<SurvivalEnvironment> = {}): SurvivalEnvironment {
  return {
    ambientTempC: 37,
    toxicLevel: 0.5,
    radiationLevel: 0,
    weather: 'clear_haze',
    isNight: false,
    inShelter: false,
    nearCampfire: false,
    hasHeatShield: false,
    inLava: false,
    inMeteorDanger: false,
    difficulty: 'survivor',
    ...over,
  };
}

/** Simulasikan sampai kondisi terpenuhi; kembalikan detik. */
function simulate(
  env: SurvivalEnvironment,
  until: (v: ReturnType<typeof createInitialVitals>) => boolean,
  start = createInitialVitals(),
  maxSec = 600
): { sec: number; vitals: ReturnType<typeof createInitialVitals> } {
  let v = start;
  const dt = 0.1;
  for (let t = 0; t < maxSec; t += dt) {
    v = stepVitals(v, env, dt).vitals;
    if (until(v)) return { sec: t + dt, vitals: v };
  }
  return { sec: maxSec, vitals: v };
}

test('oksigen: toxic 0,5 mode Survivor bertahan >= 90 dtk sebelum nol', () => {
  const r = simulate(toxicEnv(), (v) => v.oxygen <= BALANCE.oxygen.depletedAtPct);
  assert.ok(r.sec >= 90, `hanya ${r.sec.toFixed(1)} dtk`);
  assert.ok(r.sec <= 130, 'jangan terlalu longgar');
});

test('oksigen: Explorer lebih lama, Hadean tetap lebih cepat dari Survivor', () => {
  const t = (d: 'explorer' | 'survivor' | 'hadean') =>
    simulate(toxicEnv({ difficulty: d }), (v) => v.oxygen <= 1).sec;
  assert.ok(t('explorer') > t('survivor'));
  assert.ok(t('hadean') < t('survivor'));
  assert.equal(getDifficultyMultiplier('hadean'), 1.5);
});

test('oksigen: regen di udara bersih lebih cepat dari sebelumnya (14/dtk)', () => {
  assert.ok(BALANCE.oxygen.regenClean > 14);
  const low = { ...createInitialVitals(), oxygen: 10 };
  const r = simulate(toxicEnv({ toxicLevel: 0 }), (v) => v.oxygen >= 100, low);
  assert.ok(r.sec <= 5, `pulih ${r.sec.toFixed(1)} dtk`);
});

test('sesak: nyawa baru turun setelah 5 dtk sejak oksigen habis, dan damage kecil', () => {
  const empty = { ...createInitialVitals(), oxygen: 0 };
  const env = toxicEnv();
  let v = empty;
  for (let i = 0; i < 49; i++) v = stepVitals(v, env, 0.1).vitals; // 4,9 dtk
  assert.equal(v.health, 100, 'nyawa belum boleh turun');
  assert.ok(isSuffocating(v));
  for (let i = 0; i < 30; i++) v = stepVitals(v, env, 0.1).vitals; // total 7,9 dtk
  assert.ok(v.health < 100, 'nyawa mulai turun setelah masa sesak');

  // Dari oksigen nol sampai mati: jauh lebih lama dari ±12 dtk lama.
  const death = simulate(env, (x) => x.health <= 0, empty);
  assert.ok(death.sec >= 30, `mati dalam ${death.sec.toFixed(1)} dtk`);
  assert.ok(BALANCE.suffocation.damagePerSec < 8);
});

test('sesak: timer di-reset setelah oksigen pulih', () => {
  const empty = { ...createInitialVitals(), oxygen: 0, suffocationTimer: 4 };
  const v = simulate(toxicEnv({ toxicLevel: 0 }), (x) => x.oxygen >= 50, empty).vitals;
  assert.equal(v.suffocationTimer, 0);
});

test('total waktu hidup di zona gas tanpa filter >= 90 dtk + 5 dtk sesak + damage', () => {
  const r = simulate(toxicEnv(), (v) => v.health <= 0);
  assert.ok(r.sec >= 90 + BALANCE.suffocation.graceSec + 25, `${r.sec.toFixed(1)} dtk`);
});

test('gas_filter melindungi oksigen sementara dan terkuras', () => {
  const v0 = { ...createInitialVitals(), filterDurability: 100 };
  const r = simulate(toxicEnv(), (v) => v.filterDurability <= 0, v0);
  assert.ok(r.sec >= 50);
  assert.ok(r.vitals.oxygen >= 99);
});

test('hazard toxic tetap memakai ambang dari balance', () => {
  assert.equal(computeHazardState(toxicEnv({ toxicLevel: BALANCE.hazard.toxicLevelThreshold })), 'toxic');
  assert.equal(computeHazardState(toxicEnv({ toxicLevel: BALANCE.hazard.toxicLevelThreshold - 0.01 })), 'safe');
});

test('masa aman awal: 3 menit, radius 150 m, Hadean dikecualikan', () => {
  assert.equal(BALANCE.safeStart.durationSec, 180);
  assert.equal(BALANCE.safeStart.radiusM, 150);
  assert.ok(isSafeStartActive('explorer', 179));
  assert.ok(isSafeStartActive('survivor', 0));
  assert.ok(!isSafeStartActive('survivor', 180));
  assert.ok(!isSafeStartActive('hadean', 10));

  const { spawn } = BALANCE.safeStart;
  const capped = capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'survivor', 30);
  assert.ok(capped < BALANCE.hazard.toxicLevelThreshold, 'gas pekat tidak boleh ada di radius');
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 151, spawn.z, 'survivor', 30), 0.62);
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'survivor', 181), 0.62);
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'hadean', 30), 0.62);
});

test('pemain baru: gas_filter dasar untuk Explorer/Survivor, Explorer jadi default', () => {
  assert.equal(BALANCE.difficulty.defaultForNewPlayer, 'explorer');
  assert.ok(BALANCE.newPlayer.gasFilterQty.explorer >= 1);
  assert.ok(BALANCE.newPlayer.gasFilterQty.survivor >= 1);
  assert.equal(BALANCE.newPlayer.gasFilterQty.hadean, 0);
});

test('udara bersih: panah menunjuk arah yang benar dan jarak terdekat', () => {
  // Dunia sintetis datar: gas pekat tidak bisa disimulasikan lewat biome, jadi uji geometri bantu.
  const flat = () => 3;
  const here = findNearestCleanAir(0, 18, flat);
  assert.ok(here); // spawn dataran basalt: sudah bersih
  assert.equal(here!.dist, 0);

  const shelter = findNearestCleanAir(500, 500, flat, [{ type: 'basic_shelter', x: 530, z: 500 }], true);
  assert.equal(shelter?.kind, 'shelter');
  assert.ok(Math.abs((shelter?.dist ?? 0) - 30) < 1e-6);

  // Cuaca beracun tanpa shelter dekat -> tidak ada udara bersih
  assert.equal(findNearestCleanAir(0, 0, flat, [], true), null);
});

test('udara bersih: di dalam zona lava_rift mencari titik bersih di luar', () => {
  // (0, -42) ada di dekat kawah gunung utama
  const high = () => 9;
  const px = 0;
  const pz = -40;
  const found = findNearestCleanAir(px, pz, high);
  assert.ok(found, 'harus ketemu udara bersih');
  assert.ok(isCleanAirAt(found!.x, found!.z, high));
  assert.ok(found!.dist > 0 && found!.dist <= BALANCE.cleanAir.maxRadiusM);
});

test('relativeBearingDeg: utara=-z, timur=+x, relatif terhadap arah pandang', () => {
  assert.equal(relativeBearingDeg(0, 0, 0, -10, 0), 0); // menghadap utara, target utara
  assert.equal(relativeBearingDeg(0, 0, 10, 0, 0), 90); // target di timur -> kanan
  assert.equal(relativeBearingDeg(0, 0, -10, 0, 0), -90); // barat -> kiri
  assert.equal(Math.abs(relativeBearingDeg(0, 0, 0, 10, 0)), 180); // selatan -> belakang
  assert.equal(relativeBearingDeg(0, 0, 10, 0, Math.PI / 2), 0); // menghadap timur
});

test('respawn: shelter terdekat bila ada, kalau tidak titik spawn', () => {
  const flat = () => 3;
  const none = pickRespawnPoint(300, 300, [], flat);
  assert.deepEqual(none, { x: BALANCE.safeStart.spawn.x, z: BALANCE.safeStart.spawn.z });
  const near = pickRespawnPoint(300, 300, [
    { type: 'basic_shelter', x: 900, z: 900 },
    { type: 'basic_shelter', x: 310, z: 300 },
  ], flat);
  assert.ok(Math.hypot(near.x - 310, near.z - 300) < BALANCE.respawn.offsetFromShelterM + 0.01);
});

test('kantong kematian: semua barang pindah, durability terjaga, ambil kembali', () => {
  const inv = [
    { itemId: 'basalt_rock', qty: 12 },
    { itemId: 'stone_axe', qty: 1, durability: 33 },
    { itemId: 'gas_filter', qty: 2 },
  ];
  const res = dropInventoryAsBag([], inv, { x: 10, y: 2, z: -5 }, 321);
  assert.equal(res.inventory.length, 0);
  assert.equal(res.bags.length, 1);
  assert.equal(res.bags[0].items.length, 3);

  assert.equal(findBagInRange(res.bags, 10.5, -5)?.id, res.bags[0].id);
  assert.equal(findBagInRange(res.bags, 40, 40), null);

  const back = mergeBagIntoInventory([{ itemId: 'basalt_rock', qty: 3 }], res.bags[0]);
  assert.equal(back.remaining.length, 0);
  assert.equal(back.inventory.find((s) => s.itemId === 'basalt_rock')?.qty, 15);
  assert.equal(back.inventory.find((s) => s.itemId === 'stone_axe')?.durability, 33);
});

test('kantong kematian: batas jumlah kantong menggabungkan, tidak menghilangkan barang', () => {
  let bags: DeathBag[] = [];
  const total = BALANCE.deathBag.maxBags + 2;
  for (let i = 0; i < total; i++) {
    const r = dropInventoryAsBag(bags, [{ itemId: 'basalt_rock', qty: 5 }], { x: i, y: 0, z: 0 }, i);
    bags = r.bags;
  }
  assert.equal(bags.length, BALANCE.deathBag.maxBags);
  const sum = bags.flatMap((b) => b.items).reduce((a, s) => a + s.qty, 0);
  assert.equal(sum, 5 * total);
});

test('kantong kematian: inventaris penuh -> sisa tetap di kantong', () => {
  const full = Array.from({ length: 28 }, (_, i) => ({ itemId: 'stone_axe', qty: 1, durability: i + 1 }));
  const bag: DeathBag = { id: 'b', x: 0, y: 0, z: 0, createdAtSec: 0, items: [{ itemId: 'gas_filter', qty: 2 }] };
  const r = mergeBagIntoInventory(full, bag);
  assert.equal(r.inventory.length, 28);
  assert.equal(r.remaining.length, 1);
  assert.equal(mergeSlots([], [{ itemId: 'basalt_rock', qty: 120 }]).slots.length, 3); // maxStack 50
});
