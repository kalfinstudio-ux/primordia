import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE,
  capRadiationForSafeStart,
  capToxicLevelForSafeStart,
  earlyEaseMultiplier,
  getDifficultyMultiplier,
  isSafeStartActive,
  isSafeTempActive,
  shouldAutoEquipFilter,
} from './data/balance';
import { stepPlayerWetness } from './data/survivalRates';
import { createInitialVitals, gameState, resetRunState, type DeathBag } from './core/state';
import { DEFAULT_AVATAR, ITEMS, RECIPES } from './config';
import { computeHazardState, isSuffocating, stepVitals, type SurvivalEnvironment } from './player/stats';
import { findNearestCleanAir, findNearestHeatSource, isCleanAirAt, pickRespawnPoint, relativeBearingDeg } from './systems/cleanAir';
import { dropInventoryAsBag, findBagInRange, mergeBagIntoInventory, mergeSlots } from './systems/deathBag';
import { SEASON_FX } from './data/eden';
import idLocale from '../i18n/id.json';
import enLocale from '../i18n/en.json';

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

test('masa aman awal: 10 menit, radius 260 m, udara bersih penuh, Hadean dikecualikan', () => {
  assert.equal(BALANCE.safeStart.durationSec, 600);
  assert.equal(BALANCE.safeStart.radiusM, 260);
  assert.ok(isSafeStartActive('explorer', 599));
  assert.ok(isSafeStartActive('survivor', 0));
  assert.ok(!isSafeStartActive('survivor', 600));
  assert.ok(!isSafeStartActive('hadean', 10));

  const { spawn } = BALANCE.safeStart;
  const capped = capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'survivor', 30);
  assert.ok(capped < BALANCE.hazard.toxicLevelThreshold, 'gas pekat tidak boleh ada di radius');
  assert.equal(capped, 0, 'zona awal bebas gas sehingga oksigen pulih');
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 261, spawn.z, 'survivor', 30), 0.62);
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'survivor', 601), 0.62);
  assert.equal(capToxicLevelForSafeStart(0.62, spawn.x + 100, spawn.z, 'hadean', 30), 0.62);
});

test('masa aman: oksigen pemain pulih penuh di zona awal walau sebelumnya habis', () => {
  const start = { ...createInitialVitals(), oxygen: 0 };
  const env = toxicEnv({ toxicLevel: capToxicLevelForSafeStart(0.62, 0, 18, 'survivor', 30) });
  const r = simulate(env, (v) => v.oxygen >= 100, start);
  assert.ok(r.sec < 10, `oksigen harus pulih cepat, dapat ${r.sec}s`);
});

test('kemudahan awal: x0,6 sampai menit ke-25, bukan di masa aman/Hadean/sesudahnya', () => {
  assert.equal(earlyEaseMultiplier('survivor', 100), 1, 'masa aman: gas sudah dihapus, pengali tidak perlu');
  assert.equal(earlyEaseMultiplier('survivor', 601), BALANCE.earlyEase.multiplier);
  assert.equal(earlyEaseMultiplier('explorer', 1499), BALANCE.earlyEase.multiplier);
  assert.equal(earlyEaseMultiplier('survivor', 1500), 1);
  assert.equal(earlyEaseMultiplier('hadean', 700), 1);
});

test('kemudahan awal: oksigen bertahan lebih lama dari pengali normal', () => {
  const normal = simulate(toxicEnv(), (v) => v.oxygen <= 1).sec;
  const eased = simulate(toxicEnv({ easeMult: BALANCE.earlyEase.multiplier }), (v) => v.oxygen <= 1).sec;
  assert.ok(eased > normal * 1.5, `eased ${eased}s vs normal ${normal}s`);
});

test('filter gas otomatis: hanya bila terpapar, punya filter, oksigen rendah, bukan Hadean', () => {
  const base = { oxygen: 20, filterDurability: 0, exposed: true, hasFilter: true, diff: 'survivor' as const };
  assert.equal(shouldAutoEquipFilter(base), true);
  assert.equal(shouldAutoEquipFilter({ ...base, oxygen: 60 }), false);
  assert.equal(shouldAutoEquipFilter({ ...base, filterDurability: 40 }), false);
  assert.equal(shouldAutoEquipFilter({ ...base, exposed: false }), false);
  assert.equal(shouldAutoEquipFilter({ ...base, hasFilter: false }), false);
  assert.equal(shouldAutoEquipFilter({ ...base, diff: 'hadean' }), false);
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

const NON_LAVA_BIOMES: ReadonlyArray<{ id: string; ambientTempC: number }> = [
  { id: 'shallow_ocean', ambientTempC: 35 },
  { id: 'black_basalt_plains', ambientTempC: 37.5 },
  { id: 'volcanic_ridge', ambientTempC: 48 },
  { id: 'sulfur_flats', ambientTempC: 43 },
  { id: 'obsidian_fields', ambientTempC: 40 },
  { id: 'geyser_basin', ambientTempC: 42 },
  { id: 'crystal_crater', ambientTempC: 39 },
  { id: 'ash_dunes', ambientTempC: 36 },
  { id: 'meteor_impact', ambientTempC: 41 },
];

test('pemain baru Explorer: 600 detik tanpa item di semua bioma aman x 4 musim x siang/malam x basah tidak mati suhu/haus', () => {
  assert.equal(isSafeTempActive('explorer', 100), true);
  assert.equal(isSafeTempActive('explorer', 1499), true);
  assert.equal(isSafeTempActive('hadean', 100), false);

  for (const biome of NON_LAVA_BIOMES) {
    for (const [seasonId, fx] of Object.entries(SEASON_FX)) {
      for (const isNight of [false, true]) {
        for (const wet of [0, 1]) {
          let v = createInitialVitals();
          for (let sec = 0; sec < 600; sec += 10) {
            const res = stepVitals(
              v,
              {
                ambientTempC: biome.ambientTempC + fx.tempOffsetC,
                toxicLevel: 0,
                radiationLevel: 0,
                weather: 'clear_haze',
                isNight,
                inShelter: false,
                nearCampfire: false,
                hasHeatShield: false,
                inLava: false,
                inMeteorDanger: false,
                difficulty: 'explorer',
                playtimeSec: sec,
                biomeId: biome.id,
                wetness: wet,
                windStrength: wet > 0 ? 5 : 2,
              },
              10
            );
            v = res.vitals;
            assert.equal(res.deathReason, null, `${biome.id} ${seasonId} night=${isNight} wet=${wet} mati di ${sec}s`);
          }
          assert.ok(v.health > 0, `${biome.id} ${seasonId} HP=${v.health}`);
          assert.ok(v.temperature >= BALANCE.temperature.safeMinC - 0.05, `${biome.id} ${seasonId} temp=${v.temperature}`);
          assert.ok(v.temperature <= BALANCE.temperature.safeMaxC + 0.05, `${biome.id} ${seasonId} temp=${v.temperature}`);
          assert.ok(v.water > 0, `${biome.id} ${seasonId} water=${v.water}`);
        }
      }
    }
  }
});

test('masa aman radiasi & meteor: POI dekat spawn (-180, 140) aman di masa aman, di luar tetap berbahaya', () => {
  // poi_meteor_sw berjarak 217 m dari spawn (0, 18) -> masuk radius 260 m safeStart
  assert.equal(capRadiationForSafeStart(0.65, -180, 140, 'explorer', 120), 0);
  assert.equal(capRadiationForSafeStart(0.65, -180, 140, 'survivor', 599), 0);
  assert.equal(capRadiationForSafeStart(0.65, -180, 140, 'explorer', 601), 0.65);
  assert.equal(capRadiationForSafeStart(0.65, -180, 140, 'hadean', 120), 0.65);
  assert.equal(capRadiationForSafeStart(0.65, 500, 500, 'explorer', 120), 0.65);
  assert.ok(BALANCE.safeStart.minMeteorDistM >= 20);
});

test('gradien damage suhu & jeda 15 detik: tidak langsung bunuh dan reset saat pulih', () => {
  const coldEnv = toxicEnv({
    ambientTempC: 35,
    toxicLevel: 0,
    isNight: true,
    wetness: 1,
    difficulty: 'hadean',
    playtimeSec: 100,
    biomeId: 'shallow_ocean',
  });

  // Mulai tepat di bawah dangerLow: selama <15 detik nyawa belum tergerus oleh suhu
  let v = { ...createInitialVitals(), temperature: BALANCE.temperature.dangerLow - 0.5, tempDangerTimer: 0 };
  for (let i = 0; i < 10; i++) {
    v = stepVitals(v, { ...coldEnv, wetness: 1 }, 1).vitals;
  }
  assert.ok(v.tempDangerTimer >= 9.9);
  assert.equal(v.health, 100, 'jeda 15 detik mencegah damage instan');

  // Setelah melewati 15 detik pada suhu ekstrem (-2°C di bawah dangerLow -> ramp penuh), HP mulai turun
  let extremeV = {
    ...createInitialVitals(),
    temperature: BALANCE.temperature.dangerLow - BALANCE.temperature.dangerRampWidthC - 0.5,
    tempDangerTimer: BALANCE.temperature.dangerGraceSec,
  };
  const step1 = stepVitals(extremeV, coldEnv, 1).vitals;
  assert.ok(step1.health < 100, 'setelah jeda habis dan melewati ambang, damage suhu aktif');

  // Gradien linear: tepat di dekat ambang (-0.2°C) jauh lebih ringan daripada -2.0°C
  let mildV = {
    ...createInitialVitals(),
    temperature: BALANCE.temperature.dangerLow - 0.2,
    tempDangerTimer: BALANCE.temperature.dangerGraceSec,
  };
  const mildStep = stepVitals(mildV, coldEnv, 1).vitals;
  const severeDrop = 100 - step1.health;
  const mildDrop = 100 - mildStep.health;
  assert.ok(mildDrop > 0 && mildDrop < severeDrop * 0.25, `mildDrop=${mildDrop} vs severeDrop=${severeDrop}`);

  // Pemulihan suhu di dalam margin mereset tempDangerTimer ke 0
  const warmed = stepVitals(
    { ...createInitialVitals(), temperature: BALANCE.temperature.dangerLow + BALANCE.temperature.dangerRecoverMarginC + 0.1, tempDangerTimer: 12 },
    toxicEnv({ toxicLevel: 0, ambientTempC: 37 }),
    0.5
  ).vitals;
  assert.equal(warmed.tempDangerTimer, 0);
});

test('mode Hadean tetap keras: dingin musim dingin basah malam menembus dangerLow dan bisa mematikan', () => {
  let v = createInitialVitals();
  const env: SurvivalEnvironment = {
    ambientTempC: 35 + SEASON_FX.dingin.tempOffsetC,
    toxicLevel: 0,
    weather: 'clear_haze',
    isNight: true,
    inShelter: false,
    nearCampfire: false,
    hasHeatShield: false,
    inLava: false,
    inMeteorDanger: false,
    difficulty: 'hadean',
    playtimeSec: 120,
    biomeId: 'shallow_ocean',
    wetness: 1,
    windStrength: 6,
  };
  let death: string | null = null;
  for (let i = 0; i < 600; i++) {
    const r = stepVitals(v, env, 1);
    v = r.vitals;
    if (r.deathReason) {
      death = r.deathReason;
      break;
    }
  }
  assert.equal(death, 'reasonTemp', 'Hadean tanpa api unggun di musim dingin basah harus tetap mematikan');
});

test('pemulihan HP pasif di luar ruangan hanya aktif saat vital & suhu aman', () => {
  const safeHurt = { ...createInitialVitals(), health: 60, temperature: 37.0, water: 80, oxygen: 100 };
  const recovered = stepVitals(safeHurt, toxicEnv({ toxicLevel: 0, ambientTempC: 37 }), 10).vitals;
  assert.ok(recovered.health > 63 && recovered.health < 65, `expected ~64 HP, got ${recovered.health}`);

  // Jika sedang haus berat (< passiveRegenMinWater), regen pasif berhenti
  const thirsty = { ...safeHurt, water: 20 };
  const noRegen = stepVitals(thirsty, toxicEnv({ toxicLevel: 0, ambientTempC: 37 }), 10).vitals;
  assert.equal(noRegen.health, 60);
});

test('pengeringan dekat api unggun bekerja saat gerimis ringan & Selimut Abu mengurangi dingin malam', () => {
  const dryNearFire = stepPlayerWetness(1, 5, {
    rainWeight: 0.5,
    inWater: false,
    immersed: false,
    inShelter: false,
    nearCampfire: true,
    windStrength: 3,
  });
  assert.ok(dryNearFire < 0.2, `api unggun harus mengeringkan meski gerimis ringan, dapat ${dryNearFire}`);

  assert.ok(ITEMS.ash_cloak, 'item ash_cloak Tier 1 harus ada');
  assert.ok(RECIPES.some((r) => r.id === 'recipe_ash_cloak' && r.tier === 1));
  const bare = stepVitals(createInitialVitals(), toxicEnv({ toxicLevel: 0, ambientTempC: 33, isNight: true }), 20).vitals;
  const cloaked = stepVitals(
    createInitialVitals(),
    toxicEnv({ toxicLevel: 0, ambientTempC: 33, isNight: true, hasStarterCloak: true }),
    20
  ).vitals;
  assert.ok(cloaked.temperature > bare.temperature, 'Selimut Abu Hangat harus menjaga tubuh lebih hangat');
});

test('perlindungan bangkit 60 detik menahan bahaya lingkungan & resetRunState memberi Perapian di slot 5', () => {
  const shielded = { ...createInitialVitals(), respawnGraceTimer: 60, oxygen: 0, water: 1, radiation: 90, temperature: 31 };
  const after = stepVitals(shielded, toxicEnv({ ambientTempC: 30, toxicLevel: 1, radiationLevel: 1 }), 10).vitals;
  assert.equal(after.health, 100, 'perlindungan bangkit 60 dtk menahan damage lingkungan');
  assert.ok(after.respawnGraceTimer < 51 && after.respawnGraceTimer > 49);

  resetRunState('new-game-test', DEFAULT_AVATAR);
  assert.ok(gameState.inventory.some((s) => s.itemId === 'campfire_kit' && s.qty >= 1));
  assert.equal(gameState.hotbarItemIds[4], 'campfire_kit');
});

test('pencari sumber panas mengutamakan api unggun / gejser / shelter terdekat & lokalisasi ID/EN selaras', () => {
  const heat = findNearestHeatSource(0, 0, [{ type: 'campfire_kit', x: 18, z: 0 }], [{ x: 120, z: 0 }], []);
  assert.deepEqual(heat, { x: 18, z: 0, dist: 18, kind: 'campfire' });

  for (const key of ['coldWarning', 'heatWarning', 'lowWater', 'respawnShield'] as const) {
    assert.ok(idLocale.survival[key], `id.survival.${key}`);
    assert.ok(enLocale.survival[key], `en.survival.${key}`);
  }
  assert.ok(idLocale.items.ash_cloak?.name && enLocale.items.ash_cloak?.name);
  assert.deepEqual(Object.keys(idLocale.gameOver.advice).sort(), Object.keys(enLocale.gameOver.advice).sort());
  assert.deepEqual(Object.keys(idLocale.hud.heatSource).sort(), Object.keys(enLocale.hud.heatSource).sort());
});
