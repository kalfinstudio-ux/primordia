# HANDOFF — PRIMORDIA (Era Adam & Hawa)

Dokumen serah-terima agar pengembangan bisa dilanjutkan oleh siapa pun (manusia atau AI) tanpa konteks percakapan sebelumnya.
Terakhir diperbarui: November 2026 (v25: pipeline kompresi aset 3D & decoder lokal, penguatan RPC umur abadi Supabase + UI profil/jeda, siklus waktu Hari/Bulan/Tahun + relokasi aman, cerita Bab 6–7 Era Adam & Hawa + Pasang Pertama, sinkronisasi penuh i18n `id.json`/`en.json`; v24: Bruk wujud 3D; v23: pilihan akhir Bruk).

## 0m. Perubahan v25 — Asset Pipeline, Immortal Age, World Age, Story Bab 6–7 & i18n

### 1) Asset Pipeline (`public/play/models/`) — KOMPRESI & LOADER OFFLINE
- **Skrip & Audit:**
  - `tools/audit-assets.mjs` mengaudit setiap `.glb` di `public/play/models/` (ukuran KB, jumlah segitiga, mesh, sendi, jumlah & format tekstur, klip animasi, ekstensi, status anggaran).
  - `tools/optimize-assets.sh` (pakai `@gltf-transform/cli` — **tanpa perlu Blender atau internet saat dijalankan**) mengompres geometri (`EXT_meshopt_compression` + `KHR_mesh_quantization`), mengecilkan tekstur ke WebP (`max 1024px` karakter, `512px` prop), dan memangkas/menyederhanakan mesh di atas batas segitiga (`simplify` hanya bila melebihi anggaran; model prosedural `primordia_*.glb` dipertahankan utuh karena memakai vertex/material warna tanpa tekstur).
  - Perintah yang bisa diulang:
    ```bash
    node tools/audit-assets.mjs          # audit tabel & cek budget (exit 1 jika lewat budget)
    ./tools/optimize-assets.sh           # optimasi aset over-budget di public/play/models/
    ```
- **Tabel Audit Sebelum vs Sesudah (total folder turun dari 4,44 MB → 1,15 MB, −74,0%; anggaran ≤ 15 MB):**

| File `.glb` | Sebelum (KB / Tris) | Sesudah (KB / Tris) | Tekstur & Ekstensi | Peran (`ASSET_FILES`) | Status Budget |
|---|---|---|---|---|---|
| `daren_-_lod_man_character.glb` | 3.015 KB / 30.398 tris | **403,8 KB / 19.093 tris** | 8 WebP · meshopt + quant | `player` / `adam` | PASS (≤1 MB, ≤30k) |
| `party_starter_-_layered_t-shirts.glb` | 933,8 KB / 9.495 tris | **186,9 KB / 9.495 tris** | 3 WebP · meshopt + quant | `player` / `adam` | PASS |
| `naked_dude.glb` | 230,9 KB / 2.054 tris | **121,9 KB / 2.054 tris** | 2 WebP · meshopt + quant | `player` / `adam` | PASS |
| `primordia_adam.glb` | 125,1 KB / 1.300 tris | **125,1 KB / 1.300 tris** | 19 sendi, 10 klip | Bawaan `player (male)` & `adam` | PASS |
| `primordia_hawa.glb` | 128,4 KB / 1.400 tris | **128,4 KB / 1.400 tris** | 19 sendi, 10 klip | Bawaan `player (female)` & `eve` | PASS |
| `primordia_bruk.glb` | 214,7 KB / 2.871 tris | **214,7 KB / 2.871 tris** | 8 mesh, tanpa tekstur | Penjaga Kawah `bruk` | PASS |

- **Loader offline (`src/game/core/gltfLoader.ts`):** membungkus `GLTFLoader` dengan `MeshoptDecoder` + `DRACOLoader` (`./draco/`) + `KTX2Loader` (`./basis/`, hanya saat renderer WebGL aktif). Decoder disalin dari `node_modules/three/examples/jsm/libs/{draco,basis}` ke `/public/play/draco/` & `/public/play/basis/` sehingga bekerja offline penuh tanpa CDN eksternal.
- **Integrasi karakter & fallback:** `SceneManager.syncPlayerCharacterAsset()` memetakan karakter pemain berdasarkan `avatar.gender` (`male` → `primordia_adam.glb`, `female` → `primordia_hawa.glb`) bila belum ada override valid di `localStorage`, dan otomatis jatuh kembali ke rig prosedural `CharacterRig` jika model gagal dimuat.
- **Bundle splitting (`vite.config.ts`):** `manualChunks` memisahkan `three`, `supabase`, `base44`, dan `lucide` agar chunk aplikasi tetap ramping dan model 3D tetap lazy-loaded.

### 2) Umur Abadi & Hardening RPC Supabase
- **`supabase/setup-all.sql` (idempoten, aman dijalankan berulang di SQL Editor):**
  - `sync_immortal_age(p_guest_born_at timestamptz default null)`: menerima opsional waktu lahir tamu lokal, membatasi klaim tamu maksimal **30 hari** ke belakang dan menolak stempel masa depan (anti-cheat / anti-rewind), membuat baris `profiles` secara atomik jika belum ada (`on conflict (id) do update`), dan **hanya** mengadopsi nilai lebih awal jika profil baru atau berada dalam jendela wajar tanpa mengizinkan pengurangan usia setelah akun menetap.
  - `record_death()`: otomatis memastikan baris `profiles` tersedia sebelum menambah `deaths`, tidak pernah menyentuh `born_at`.
  - `presence_ping()`: memastikan baris `profiles` tersedia saat memperbarui `last_seen_at` & menghitung `away_seconds` di server.
  - `get_public_profile(p_user_id uuid)`: kini ikut mengembalikan `wisdom_points` agar kartu profil publik (`SocialPanel.tsx`) menampilkan **Umur Abadi**, **Kematian**, dan **Poin Kebijaksanaan** secara sinkron.
- **UI:** Kartu profil di `SocialPanel.tsx` dan `PauseModal.tsx` menampilkan Umur Abadi, jumlah Kematian, dan Poin Kebijaksanaan.

### 3) Waktu Nyata & Peta Berubah (Hari, Bulan, Tahun)
- **Harian:** sumber daya tumbuh ulang (`dailyRegrowth`), kronik cuaca (`weatherChronicle`), detail mikro harian deterministik (`dailyMicroDetails`: kekuatan arus abu, ventilasi uap, semburat kristal).
- **Bulanan:** `MONTHLY_TERRAIN_SHIFT = true`, POI musiman/bulanan (`monthlyPois(existing, worldHalf, date)` di `world/poiGen.ts` yang ikut dirender di `MapScreen.tsx` & dunia), efek musim (`SEASON_FX`).
- **Tahunan (1 Januari 00:00 UTC):** `getWorldAge(date)` mengganti Era setiap 1 Jan UTC (`Year 1 = Era Adam & Hawa`, `Year 2 = Era Pasang Pertama`, `Year 3 = Era Mahkota Bara`, `Year 4 = Era Batu Hidup`). Masing-masing mengubah `seaLevelOffsetM` (`effectiveWaterLevel` di `water.ts`), pengali gunung api (`volcano.ts`), pengali kekayaan sumber daya, dan membuka bab misi baru.
- **Anti-manipulasi jam & DST:** `sanitizeClockSample` menolak jam mundur > 5 detik dan tanggal sebelum `ERA_START_YEAR`; seluruh kalender (`getEdenCalendar`) berbasis UTC agar tahun kabisat (29 Feb) & DST konsisten di semua zona waktu.
- **Perlindungan base & laporan offline:**
  - `terrain_anchor` (radius 60 m) tetap mengunci medan lokal.
  - `safeRelocateStructures` & `safeRelocatePlayer` (`data/eden.ts`, dipanggil di `SceneManager` saat shift/load) mencegah pemain dan bangunan terkubur medan atau tenggelam akibat kenaikan muka air zaman.
  - `shiftWarning` kini mendukung peringatan Pergeseran Tahunan (`kind: 'year'`, kunci `'YYYY-M:year:level'`) selain Pergeseran Bulanan (`kind: 'month'`, kunci `'YYYY-M:level'`).
  - `buildAwayReport` mencatat entri **Era berubah** dan **Pergeseran Besar** jika pemain pergi melintasi pergantian tahun/bulan.

### 4) Cerita Lanjutan — Era Adam & Hawa (Bab 6) & Era Pasang Pertama (Bab 7)
- `CAMPAIGN_QUESTS` mempertahankan **22 misi Prolog "Fajar Archean" (`q1..q22`, Bab 1–5)** secara penuh.
- Ditambahkan **Bab 6 (`q23..q29`, Era Adam & Hawa, `requiredAge: 1`)** dan **Bab 7 (`q30..q32`, Era Pasang Pertama, `requiredAge: 2`)**, difilter dinamis via `questsForAge(eraYear)` dan `journalEntriesForAge(eraYear)` (`j_adam_eve`, `j_first_garden`, `j_moon_tides`).
- Teks misi mendukung variasi narasi gender (`desc_male` / `desc_female` via `questText(id, field, gender)`) tanpa perbedaan balance mekanik apa pun.
- Penghitung misi di HUD/Jurnal (`questsTotalCount`, `activeCampaignTotal`) dihitung dinamis dari era aktif (tidak lagi hardcode `/22`).
- `index.html`, `infoContent.ts`, dan `gameInfo.ts` (`NUM_CHAPTERS = 7`) diperbarui selaras.

### 5) i18n (`id.json` & `en.json`), Verifikasi & Catatan Jujur
- Semua kunci terjemahan statis & dinamis (`regions.*`, `poiNames.*`, `bruk.*`, `quests.q23..q32` beserta `desc_male`/`desc_female`, `journal.entries.*`, `info.*`) telah disinkronkan simetris antara `id.json` dan `en.json` (0 kunci hilang).
- **Catatan jujur (belum dijalankan di lingkungan lokal ini):**
  - `supabase/setup-all.sql` belum dieksekusi ke proyek Supabase live (perlu dijalankan manual di Supabase SQL Editor bila memakai mode cloud).
  - Pengukuran FPS pada perangkat Android fisik kelas bawah tetap perlu diuji oleh pemilik.
  - `primordia_adam.glb`, `primordia_hawa.glb`, dan `primordia_bruk.glb` sengaja dipertahankan tidak melewati `meshopt` agar uji parser mentah (`characterAsset.test.ts`, `brukAsset.test.ts`) tetap dapat memverifikasi buffer glTF standar; ketiganya sudah berada jauh di bawah batas (125–215 KB).

### Cek Manual v25
- [ ] Jalankan `supabase/setup-all.sql` di Supabase SQL Editor; uji daftar/login akun → verifikasi `sync_immortal_age()`, `record_death()`, `presence_ping()`, `get_public_profile()`.
- [ ] Uji tamu bermain lalu login: umur lokal (maks 30 hari) tersinkron ke profil tanpa bisa rewind.
- [ ] Permainan Baru (Pria vs Wanita): verifikasi model 3D mengikuti gender (`primordia_adam.glb` vs `primordia_hawa.glb`) dan deskripsi Bab 6 menyesuaikan narasi.
- [ ] Buka Jeda & Kartu Profil Sosial: Umur Abadi, Kematian, dan Poin Kebijaksanaan tampil benar.
- [ ] Ubah jam ke 31 Des 23:55 UTC → tunggu/lewati 1 Jan 00:00 UTC → peringatan tahun baru, pergantian Era ke Tahun 2 (`Era Pasang Pertama`), relokasi aman bangunan/pemain, dan misi Bab 7 terbuka.


## 0l. Perubahan v24 — Bruk tingkat 2: wujud 3D di dunia (15 Nov 2026) — SEDANG DIKERJAKAN

**Status tahap:** M1 selesai (model + pratinjau, BELUM dilihat di three.js) · M2 selesai · M3 selesai di kode (BELUM dilihat di browser; lihat M3) · M4, M5 belum.

### M1 — Model dan pratinjau (SELESAI; model dinilai lewat render buatan sendiri, BUKAN three.js/browser)
- **Keputusan jalur: .glb dibuat skrip Python (numpy saja)**, bukan geometri dari kode TS. Alasan: pola yang sama sudah dipakai `make_character.py` (tanpa Blender/internet), hasilnya bisa diperiksa tanpa menjalankan game, dan anggaran ukuran/segitiga bisa dijaga oleh tes CI. Biayanya: satu berkas ±215 KB yang dimuat sekali lewat `GLTFLoader` (jalur sudah ada untuk karakter).
- Baru: `tools/make_bruk.py` (pembangun + pratinjau), `tools/dump-bruk-poses.ts` (pose dari M2 untuk pratinjau), `public/play/models/primordia_bruk.glb`, `src/game/brukAsset.test.ts` (gerbang aset, 6 tes).
- Hasil: **2.871 segitiga** (anggaran 3.000), **214,7 KB** (anggaran 500 KB), tanpa tekstur/kulit/animasi, flat-shaded, tinggi **3,32 m** (ujung tanduk; manusia 1,8 m), lebar 3,04 m. Tinggal ±130 segitiga headroom.
- Bentuk: golem basal bungkuk, kepala balok lebar di depan-atas dada, dua tanduk kristal toska, SATU mata amber hidup (pupil celah) + mata kiri mati bergores, punggung hidung bersudut (tanpa moncong/lubang hidung; profil samping berupa bidang datar), taring gading, bongkah emas di pipi (dari maskot), duri basalt di punuk/bahu untuk siluet jauh, tangan besar bercakar, retakan lava ditempel ke permukaan lewat raycast.
- **Kontrak untuk M3** (nama node/material tetap):
  - Node: `Bruk > Hips > {LegL, LegR, Torso}`; `Torso > {Head > Eye, ArmL, ArmR}`. Semua pose istirahat = rotasi nol, pivot di pinggul/leher/bahu.
  - Pemetaan pose → node: `Bruk.rotation.y = yaw`; `Torso.rotation.x = lean`; `Head.rotation.y = headYaw`; `Eye.scale.y = eyeOpen`; `ArmL.rotation = (-0.9·arms, 0, +0.4·arms)`, `ArmR.rotation = (-0.9·arms, 0, -0.4·arms)`; `crouch` menurunkan `Hips` (±0.4 m, tuning di M3); `back` menggeser `Bruk` ke belakang searah hadap; `sit` memutar `LegL/LegR.rotation.x` ke ±-1.4 dan menurunkan `Hips`.
  - Material (pakai SATU set bersama, `markShared`): `Lava.emissive = crackColor`, `emissiveIntensity = glow`; `Eye.emissive = eyeColor`, `emissiveIntensity = eyeGlow`. Material lain tetap. Clone material hanya sekali saat memuat.
  - Skala model sudah 1:1 meter. Arah hadap +Z.
- Pratinjau: `npx tsx tools/dump-bruk-poses.ts > /tmp/poses.json && python3 tools/make_bruk.py --preview /tmp/prev --poses /tmp/poses.json` (butuh numpy, PIL, scipy). Menghasilkan lembar depan/serong/belakang/samping/"ingame" untuk lima tingkat. **Pratinjau ini rasterizer sendiri (Lambert + bloom sederhana), bukan three.js**: warna, kilau, dan cahaya emissive di game akan berbeda (tanpa bloom, PBR).
- Yang dinilai baik: siluet terbaca dari jauh (tanduk + bahu lebar + wajah menyala), lima tingkat jelas berbeda, tingkat 0 membelakangi pemain dan dingin, tingkat 4 hangat dengan tangan terbuka, tidak terbaca seperti babi.
- **Kekurangan yang diketahui (jangan disembunyikan):** tangan dan kaki masih kasar/kotak; retakan lava tipis dan agak seperti coretan; mulut paling menyala di tingkat 3–4 (mungkin perlu diredam di M4); punuk dari belakang agak datar; di sudut serong tingkat 1 profil taring bisa sedikit terbaca "serigala"; bentuk akhir di game belum dilihat siapa pun.

### M2 — Logika perilaku murni (SELESAI, teruji)
- Baru: `src/game/data/brukBehavior.ts` (tanpa import three; hanya `utils/math`) dan `src/game/brukBehavior.test.ts` (30 tes).
- API: `brukPose(input, out)` → pose TARGET (`mode, yaw, headYaw, lean, glow, eyeGlow, eyeOpen, crackColor, eyeColor, breath, arms, crouch, back, sit, guard`); `smoothPose(cur, tgt, dt)` menghaluskan pose yang dirender (di tempat, tanpa alokasi); `smoothLevel(cur, target, dt)` menghaluskan tingkat 0..4 (±95% dalam 5 detik); `brukUpdateInterval(dist, onScreen, lowGfx)` untuk throttle/cull (>120 m atau di luar layar = lewati); `brukSitSpot` / `brukGuardSpot` untuk posisi duduk/berjaga.
- Mode & prioritas: guard > recoil > sit > watch > idle. `recoil` butuh `sinceFirstFire` (detik sejak api pertama dipasang SAAT sesi ini; `null` untuk save yang dimuat → tidak ada recoil). `sit` butuh momen `fire_third` + ada api. `guard` butuh badai + pemain di shelter + arah pintu.
- Konvensi sudut: yaw 0 = menghadap +Z, bearing = `atan2(dx, dz)` (sama dengan `controller.ts`).
- Tidak ada field save baru. Tidak ada perubahan peta/balance/SQL/multiplayer.
- Tes: `tsx --test src/game/brukBehavior.test.ts` 30/30 lulus; tipe strict file logika bersih. Seluruh `src/game/*.test.ts`: 170 lulus, 3 gagal (`audit`, `balance`, `stage2`) HANYA karena `@supabase/supabase-js` tidak terpasang di lingkungan ini (terjadi juga tanpa file baru); jalankan `npm test` di Codespace untuk angka resmi.
- **Belum dijalankan:** `npm run lint`, `npm run build`, apa pun di browser.

### M3 — Bruk muncul di dunia (SELESAI di kode; BELUM dilihat di three.js/browser)
- Baru: `src/game/data/brukWorld.ts` (logika murni, 8 tes di `brukWorld.test.ts`), `src/game/world/brukBody.ts` (memuat `primordia_bruk.glb`, memetakan pose M2 ke node), dan 7 baris di `scenes/SceneManager.ts` (konstruksi+muat, `reset` di `enterWorld`, `setVisible(false)` di menu, `update` di frame bermain, `dispose`). Dipasang oleh `tools/apply-bruk-m3.py`.
- **Rumah:** lereng luar Kawah Kristal, 16 m dari pusat (38, −22), titik paling landai di sisi yang menghadap spawn awal (0, 18); deterministik (tidak berpindah antar sesi). Menatap kawah saat tak ada pemain di dekatnya. Collider 1,3 m (`kind: 'poi'`, id `bruk_body`): pemain tidak bisa menembus.
- **Tingkat** mengikuti `brukLevel(brukTrust(...))` (dihitung tiap 0,5 dtk, ditampilkan lewat `smoothLevel`). Pose (watch/recoil/sit/guard) dari `brukPose` + `smoothPose` sesuai kontrak node/material M1.
- **Bergerak:** ke titik duduk (3,4 m dari api terdekat, bila momen `fire_third`) atau ke pintu shelter (3,6 m; badai + pemain di dalam shelter), 2,6 m/dtk, dengan ayunan kaki dan badan menghadap arah jalan; kembali ke rumah bila mode berakhir. **Recoil hanya untuk api pertama yang disaksikan** (transisi 0→1 selama sesi; save yang sudah punya api tidak memicunya).
- **Biaya:** selang pembaruan animasi dari `brukUpdateInterval` (jauh/di luar layar/grafis rendah lebih jarang; pose menyusul sekali jalan saat kembali terlihat); disembunyikan >120 m dan di menu. Bila model gagal dimuat, game jalan terus (dialog tingkat 1 tetap bekerja).
- **Verifikasi (jujur):** `tsx --test src/game/*.test.ts` 222/222 lulus (supabase di-stub sementara). Selain itu `BrukBody` dijalankan headless 10 skenario (tampil di tanah, tingkat naik bertahap, menoleh, recoil api pertama, duduk dekat api, berjaga saat badai, sembunyi >120 m, di luar layar, NaN, reset/dispose) memakai **three PALSU yang membaca pohon node GLB asli**. Itu menguji logika dan kontrak nama, BUKAN pemakaian API three yang sebenarnya dan BUKAN tampilan. `npm run lint`/`build` belum dijalankan.
- **Diketahui / risiko:**
  - Bruk berjalan lurus ke target tanpa mencari jalan: bisa menembus batu/kristal/bangunan dan melewati air dangkal; ketinggian hanya mengikuti medan.
  - Pemain terblok tubuh Bruk, tetapi Bruk tidak terblok pemain.
  - Tidak ada tombol E untuk bicara (dialog tetap dipicu momen, tingkat 1).
  - Kekurangan visual M1 (tangan/kaki kotak, retakan seperti coretan, profil taring tingkat 1) belum disentuh — itu M4, setelah dilihat di browser.
  - Frame pertama saat model muncul bisa tersendat sedikit (kompilasi shader).
- **Cek manual M3 (Codespace/HP):**
  - [ ] Permainan baru: jalan ke arah (38, −22) (peta/kompas); Bruk berdiri di lereng luar kawah, tidak melayang/tenggelam, menatap kawah.
  - [ ] Dekati (<40 m): kepala menoleh; di tingkat 0 badan membelakangi. Skala ±3,3 m terasa pas (tidak menutupi kawah/kamera).
  - [ ] Coba tembus tubuhnya: tertahan.
  - [ ] Pasang api pertama di dekatnya (<40 m): ia mengerut dan mundur ±7 dtk lalu normal. Muat save yang sudah punya api: tidak mengerut.
  - [ ] Naikkan kepercayaan (selesaikan misi / edit `brukMoments` di save): retakan menyala bertahap, tangan terbuka di tingkat 4. Perhatikan apakah mulut terlalu terang di tingkat 3–4.
  - [ ] Tingkat ≥ momen `fire_third` + api: ia berjalan ke api dan duduk; kakinya tidak menembus tanah.
  - [ ] Badai + masuk shelter: ia berjaga di dekat pintu.
  - [ ] Grafis rendah di HP: FPS tidak turun terasa saat Bruk terlihat; menjauh >120 m menghilang.
  - [ ] Keluar ke menu lalu Lanjutkan: Bruk tidak terduplikasi, tidak muncul di menu.
  - [ ] Matikan jaringan / hapus `primordia_bruk.glb` sementara: game tetap jalan, konsol memberi peringatan `[Bruk] model 3D gagal dimuat`.

## 0k. Perubahan v23 — Pilihan akhir Bruk: lepaskan atau tahan waktu (15 Nov 2026) — logika teruji (tsx), UI BELUM diuji di browser

Dikerjakan di atas repo terbaru (sudah memuat v22 Bruk + Shelter). `npm test` (dengan `@supabase/supabase-js` di-stub sementara) **178/178 lulus** (+7 tes baru di `bruk.test.ts`). `npm run lint`/`build` belum dijalankan untuk v23: jalankan di Codespace (file `.tsx` baru/diubah: `VictoryModal.tsx`).

### Keputusan
- Bab 5 berakhir dengan **pilihan pemain**, nada tetap BERAT. Bruk terlalu lelah memutuskan, jadi pemain yang memutuskan: **Lepaskan waktu** (Adam & Hawa akan menua lalu padam; Bruk mengingat sendirian) atau **Tahan waktu** (mereka tak menua, dunia tak beranjak; "hadiah atau kutukan, aku tidak tahu").

### Yang berubah
- `data/bruk.ts`: tipe `BrukChoice`, `sanitizeBrukChoice()`, `withEndingMoment()`; `BrukFacts.brukChoice`; momen `ending` kini terpenuhi hanya bila kampanye selesai DAN pilihan sudah dibuat.
- `core/state.ts`: `gameState.brukChoice` (null = belum memilih). Dikosongkan di permainan baru, dipertahankan di New Game+ (Bruk ingat).
- Save: `brukChoice` di `SaveData` (opsional, save lama aman), disanitasi saat memuat, ikut cloud (`world_state.brukChoice`, tanpa SQL baru).
- `systems/bruk.ts`: `chooseBrukEnding(choice)` menyimpan pilihan, menandai momen `ending`, lalu `saveGame()`. Bila memuat save dengan kampanye selesai tapi belum memilih (mis. app ditutup di layar kemenangan), `BrukSystem` membuka lagi layar kemenangan.
- `ui/VictoryModal.tsx`: sebelum memilih hanya ada dialog Bruk + 2 tombol (tombol Lanjutkan/New Game+/Menu Utama disembunyikan); setelah memilih tampil balasan Bruk lalu layar kemenangan lama.
- i18n: `bruk.lines.ending` ditulis ulang jadi pertanyaan; baru `bruk.choice.{release,hold}.{label,reply}` (id & en).

### Belum dikerjakan / diketahui
- **Pilihan belum mengubah mekanik apa pun.** Umur abadi tetap berjalan di kedua pilihan. Ide konsekuensi nyata (butuh keputusan pemilik): "Lepaskan" → Bruk makin pendiam dan dunia berubah musim lebih jelas; "Tahan" → Bruk sesekali bicara soal dunia yang membeku. Hanya teks dulu.
- Setelah memilih, dialog HUD Bruk tidak membedakan pilihan (belum ada baris lanjutan).
- Kata "kalian" di balasan merujuk Adam & Hawa; pastikan terasa benar untuk pemain yang memakai satu karakter.
- Layar kemenangan lama (skor, leaderboard) tidak diubah; skor tetap dikirim saat layar dibuka.

### Cek manual v23
- [ ] Selesaikan kampanye (atau set `campaignComplete` lewat save yang sudah di akhir): layar kemenangan menampilkan dialog Bruk + dua tombol saja.
- [ ] Pilih "Lepaskan waktu": balasan Bruk tampil, lalu skor dan tiga tombol lama. Ulangi di save lain dengan "Tahan waktu".
- [ ] Simpan, tutup, muat: pilihan tidak ditanyakan lagi; layar kemenangan tidak muncul sendiri.
- [ ] Tutup app saat dialog pilihan masih terbuka, muat lagi: layar kemenangan muncul kembali sampai memilih.
- [ ] HP 390×844 dan 844×390: tombol terjangkau tanpa menggulir; teks terbaca.
- [ ] New Game+: pilihan lama dipertahankan, tidak ditanya lagi sampai kampanye baru selesai.

### Langkah berikutnya yang disarankan
1. Konsekuensi mekanik/atmosfer untuk tiap pilihan (butuh keputusan pemilik).
2. Hadiah mekanik per tingkat kepercayaan (setelah simulasi keseimbangan).
3. Tingkat 2: model 3D Bruk di kawah pertama.

## 0j. Perubahan v22 — Bruk jadi NPC tingkat 1: suara, kepercayaan, dialog HUD (15 Nov 2026) — logika teruji (tsx), UI BELUM diuji di browser

Dikerjakan di sandbox tanpa `vite`/`three`/`react`: `npm test` (dengan `@supabase/supabase-js` di-stub sementara) **171/171 lulus** (161 lama + 10 baru di `bruk.test.ts`). `npm run lint` dan `npm run build` **belum dijalankan** — jalankan di Codespace. `BrukDialog.tsx` dan edit `HudScreen.tsx`/`SceneManager.ts` belum dicek tipe.

### Keputusan pemilik
- Bruk menjadi karakter, bukan hanya lore. Ide inti: game ini tentang **hal-hal pertama manusia**; Bruk belajar memahami manusia lewat tindakan pemain (api, atap, badai, tempa, benih).
- **Nada cerita: BERAT (kehilangan)**, bukan bittersweet. Bruk bicara sepotong-sepotong dan dingin di awal ("Panas. Pergi."), makin panjang dan makin terluka tiap bab. Akhir: menanam benih = waktu bergerak lagi, Bruk melepas Adam & Hawa dan menanggung ingatan sendirian ("itu harganya, dan aku membayarnya").
- Tingkat NPC: **tingkat 1 saja** (dialog + meter). Model 3D Bruk (tingkat 2) dan Bruk yang mengikuti pemain (tingkat 3) belum dikerjakan.
- Peta tidak diperluas.

### Yang dibuat
- `data/bruk.ts` (murni): `BRUK_MOMENTS` (9 momen: api pertama, shelter pertama, selamat dari badai, api ketiga, akhir bab 1–4, ending), `brukTrust()`, `brukLevel()` (ambang 0/10/30/55/80), `evaluateBruk()`, `sanitizeBrukMoments()`.
  - **Kepercayaan DIHITUNG, tidak disimpan**: jumlah poin momen + 2 per misi selesai, maks 100. Yang disimpan hanya `brukMoments` (id momen yang sudah diucapkan).
  - Bila banyak momen terpenuhi sekaligus (mis. memuat save lama), semua ditandai tetapi **hanya satu diucapkan** (yang terakhir menurut urutan) agar layar tidak banjir dialog. Naik tingkat karena momen baru → tambah satu baris "petunjuk" untuk tingkat sekarang.
- `systems/bruk.ts` (`BrukSystem`): dipanggil dari `SceneManager.fixedUpdate` setelah `tickStructures`; cek fakta tiap 1 dtk; badai terhitung selamat bila pemain berada ≥25 dtk dalam radius 4,5 m shelter/atap saat cuaca badai (`ash_storm`, `acid_rain`, `electrical_storm`, `meteor_shower`). Memancarkan event `bruk:say`. `reset()` dipanggil di `enterWorld`.
- `ui/BrukDialog.tsx`: kotak dialog di HUD (di bawah toast, ±30% dari atas), antrean, ketuk untuk menutup, lama tampil menurut panjang teks, warna aksen makin hangat tiap tingkat.
- State/save: `gameState.brukMoments`; masuk `SaveData` (opsional, save lama aman), `sanitizeBrukMoments` saat memuat, ikut cloud (`world_state.brukMoments`, tanpa perubahan SQL). `resetRunState`: dikosongkan kecuali New Game+ (`preserveKnowledge`).
- Teks: `bruk.*` di `i18n/id.json` dan `en.json` (nama, 9 dialog, 4 petunjuk tingkat).

### Yang BELUM dikerjakan / diketahui
- **Hadiah petunjuk saat ini hanya teks** (lokasi air, kristal, obsidian, atap). Belum ada hadiah mekanik (resep, jeda cuaca); sengaja tidak menyentuh `balance.ts` sebelum ada data main.
- **Pilihan pemain di bab 5** ("Bruk rela melepas waktu atau tidak") belum ada: saat ini ending bernada tetap (Bruk melepas). Mengubahnya jadi pilihan butuh UI baru di `VictoryModal` dan satu flag di save.
- **Momen "nama tempat"** (pemain menamai kawah/mata air, Bruk mengulang namanya) belum ada karena game belum punya fitur menamai tempat; `customWaypoints` punya `label` dan bisa jadi pintu masuk.
- Momen badai bergantung pada cuaca kronik 6 jam: uji dengan mengubah jam perangkat ke blok badai, berlindung ≥25 dtk, lalu tunggu cuaca berganti atau 25 dtk berlalu.
- Penampilan maskot 3D/2D belum berubah per tingkat (hanya warna aksen dialog).
- Nada berat dan isi dialog adalah **draf**; sebaiknya dibaca ulang pemilik, terutama `chapter_3` dan `ending`.

### Cek manual v22 (Codespace)
- [ ] `npm test && npm run lint && npm run build` hijau.
- [ ] Permainan Baru: pasang Api Unggun → kotak "Bruk" muncul: "Panas. Pergi." lalu petunjuk (mata air). Ketuk menutup; tidak muncul lagi setelah simpan/muat.
- [ ] Pasang shelter → dialog atap. Selesaikan misi bab 1 (q5) → dialog bab 1.
- [ ] Berlindung di shelter saat badai ≥25 dtk → dialog "Badai lewat".
- [ ] Muat save lama yang sudah jauh: hanya satu dialog, bukan banjir.
- [ ] HP 390×844 dan 844×390: kotak tidak menutup joystick/tombol AKSI; teks terbaca; tidak bentrok dengan toast.
- [ ] Mode HUD "Bersih": dialog Bruk tetap tampil (belum disaring `hudVisibility`; putuskan apakah perlu disembunyikan).
- [ ] Ganti bahasa ID↔EN: teks dialog ikut berganti pada dialog berikutnya.

### Langkah berikutnya yang disarankan
1. Playtest 15 menit di Codespace, catat nada dialog dan ritme kemunculan.
2. Pilihan bab 5 (lepas/tahan waktu) + flag save.
3. Hadiah mekanik per tingkat, setelah simulasi keseimbangan.
4. Tingkat 2: model 3D Bruk di kawah pertama (butuh aset baru; aset yang ada hanya manusia).

### Prompt untuk melanjutkan bersama Claude
> Baca `HANDOFF.md` bagian 0j dan `README.md` repo PRIMORDIA. Lanjutkan Bruk dari "Langkah berikutnya" nomor …, nada cerita BERAT, ikuti Konvensi kode (§7), tulis tes untuk logika murni (`bruk.test.ts`), lalu perbarui HANDOFF.md.

## 0i. Landing page disinkronkan dengan v21 (15 Nov 2026) — hanya teks `index.html`, belum dilihat di browser
- Dikoreksi (klaim salah): jumlah item/resep 42/33 → **45/36** (dihitung dari `ITEMS`/`RECIPES`); "peta berubah tiap bulan" di Features, Roadmap Stage 3, dan Help sekarang menyatakan **Great Shift dimatikan** (`MONTHLY_TERRAIN_SHIFT=false` sejak v14); Roadmap "karakter wanita" dihapus dari Planned (sudah ada, kode-dibangun).
- Ditambah: peta interaktif + wilayah bernama, Adam & Hawa bergerak (v20), satu simpanan + Lanjutkan (v21), tas penuh/Buang, tombol sentuh 48 px + petunjuk "Ketuk AKSI"; Help: Spasi/Shift, "Tas penuh", "Tombol Lanjutkan tidak muncul"; tabel privasi: satu simpanan, umur & perk ikut cloud.
- Roadmap: v0.8.0 jadi "Released", baru "Current · v0.9.0-Archean"; footer v0.9.0. **Nomor versi 0.9.0 adalah usulan**: ubah di `index.html` jika pemilik memilih lain.
- Belum dicek: tampilan HP (412 px) dan desktop setelah teks bertambah; `package.json` masih `0.0.0`.

## 0h. Perubahan v21 — Simpanan tunggal, audit bug, navigasi pemain baru (15 Nov 2026) — logika teruji (tsx), UI & visual BELUM diuji di browser

Dikerjakan di sandbox tanpa `vite`/`three`/`@types/react`: `npm test` (dengan paket `@supabase/supabase-js` di-stub sementara) **161/161 lulus**; `npm run lint` dan `npm run build` **belum dijalankan** (jalankan di Codespace). Semua file `.tsx` baru/diubah belum dicek tipe.

### A. Slot 1/2/3 dihapus → satu simpanan
- Kunci localStorage baru `primordia_save` (satu objek). `save_slots` dan `last_slot` hanya dibaca untuk migrasi lalu dihapus. `SAVE_VERSION` = 3; tipe `SaveSlotData` → `SaveData` (tanpa field `slot`).
- API (`systems/saveLoad.ts`): `saveGame(syncCloud)`, `getLocalSave()`, `migrateLegacySlots()`, `resolveLegacyChoice()`, `decideContinue()` (murni), `resolveContinue()` (lokal + cloud, timeout 4 dtk), `applyConflictChoice()`. Dihapus: `saveGameToSlot`, `getLocalSaves`, `getLatestLocalSave`, `getAllAvailableSaves`, `deleteSaveSlot`, `listCloudSaves`, `deleteCloudSave`, `SAVE_SLOT_COUNT`, layar `loadGame` (`LoadGameScreen.tsx`).
- **Migrasi**: satu save lama → dipindah diam-diam. Beberapa save lama berbeda → dialog `LegacySavePicker` di menu utama (terbaru di atas); sebelum dipilih TIDAK ada data lama yang dihapus; setelah dipilih, kunci lama dihapus. Entri rusak diabaikan; kunci lama baru dihapus setelah penulisan kunci baru sukses.
- **Cloud**: tabel `game_saves` tidak diubah (SQL tak perlu dijalankan ulang); selalu menulis `slot = 1` (`CLOUD_SAVE_SLOT`). Membaca = baris dengan `updated_at` terbaru (baris slot 2/3 lama dibiarkan yatim di server). Konflik (`detectSaveConflict`) → dialog dua pilihan; "Simpan Keduanya" dihapus. Tidak ada cadangan otomatis save yang ditimpa.
- UI: `MainMenuScreen` (Lanjutkan hanya bila ada save, ringkasan, Enter/Spasi = aksi utama), `PauseModal` (satu tombol "Simpan Sekarang"; tombol cloud terpisah dihapus karena duplikat), `NewGameScreen` (konfirmasi menimpa), i18n `save.*`, `pause.save*`, `newGame.overwrite*`.
- `saveGame()` mengembalikan null (dan tidak menyimpan) bila `activeWorldLoaded` false → mencegah keluar-game dari menu utama menimpa save dengan keadaan kosong.

### B. Bug yang ditemukan & diperbaiki (tes di `audit.test.ts` dan `stage2.test.ts`)
1. **Barang hilang saat tas penuh (28 slot)**: menambang/ambil dari kebun, bor, penampung air, garam; `craftItem` memakai bahan lalu hasil lenyap; ambil dari peti menghapus dari peti tapi tak masuk tas. Kini `canAddAll()` dicek dulu: node tidak habis, bahan tidak terpakai, muncul toast `survival.bagFull`. Penghitung misi (kristal/obsidian/meteor) tidak naik bila gagal.
2. **Peti memperbaiki alat**: `transferOne()` memindahkan slot asli (durability ikut).
3. **Kematian bisa dibatalkan**: `handlePlayerDeath` kini `saveGame()` seketika; memuat save dengan nyawa 0 (atau Lanjutkan dari Game Over lewat menu) membuka layar Game Over lagi (`openLoadedWorld` di `main.ts`) — kematian tidak dihitung dua kali.
4. **Cloud kehilangan data**: `bornAtMs` (umur) dan `wisdomPerks` kini ikut dikirim/dimuat.
5. **Save rusak**: `sanitizeSlots`/`sanitizeVitals` membuang barang tak dikenal, qty tak valid, dan vital NaN/null (nilai awal dipakai).
6. **Joystick/Lari tersangkut** bila HUD hilang saat jempol menekan: dilepas saat HudScreen unmount.
7. Baru: tombol **Buang 1 / Buang Semua** di Tas (Benih Kehidupan dikecualikan) agar tas penuh tidak mengunci pemain.

### C. Navigasi pemain baru
- Onboarding selesai → langsung ke Permainan Baru bila belum ada save (Skip → Mulai = 2 ketukan sebelum bermain; sebelumnya 3). Menu: Lanjutkan (bila ada save) / Permainan Baru / Pengaturan / Akun / Kredit. Galeri Aset pindah ke Pengaturan → Akun & Data.
- HUD sentuh: petunjuk konteks "Ketuk AKSI untuk …" (bukan "[E]") di perangkat sentuh; ikon menu HUD 48×48 px.
- Label tombol HUD (LARI/LOMPAT/AKSI/Bangun) ternyata sudah mengikuti bahasa (`hud.*Btn` di id/en).

### D. BELUM teruji / diketahui
- [ ] `npm run lint` & `npm run build` di Codespace (tipe semua `.tsx`: `MainMenuScreen`, `LegacySavePicker`, `CloudConflictDialog`, `NewGameScreen`, `PauseModal`, `StorageModal`, `InventoryModal`, `SettingsScreen`, `HudScreen`).
- [ ] Alur browser penuh: menu → Lanjutkan; Game Baru → konfirmasi timpa; migrasi dengan save lama 1/2/3 slot di localStorage asli; akun login dengan konflik cloud.
- [ ] Tata letak HP portrait 390×844 & landscape 844×390 belum dilihat: tombol aksi (74–97 px) sudah ≥48 px, tetapi tombol **Tas/Peta masih di kanan atas** (jauh dari jempol); kandidat v22: tombol Tas dekat klaster AKSI atau gestur geser. Lebar baris atas dengan ikon 48 px bisa membungkus ke dua baris.
- [ ] Verifikasi visual v20 (gerak manusia + wajah) belum bisa dilakukan di sandbox: daftar cek v20 di bawah masih berlaku.
- Tidak diubah: `hotbarItemIds` tidak ikut disimpan; `detectSaveConflict` tetap menandai konflik bila waktu beda >15 dtk dan isi beda (akun login di dua perangkat bisa sering melihat dialog); baris `game_saves` slot 2/3 lama tetap di server.

## 0g. Perubahan v20 — Gerak manusia, wajah baru, lore Bruk (15 Nov 2026) — BELUM diuji di browser/Codespace
- **Rig** (`player/character.ts`): lengan = bahu+siku, kaki = pinggul+lutut+pergelangan, `torsoGroup` = pinggul, `chestGroup` = dada+kepala (berputar berlawanan). Alat kini ikut siku kanan.
- **Pose** (`player/pose.ts`, baru, tanpa import three): `HumanPoser` dipakai pemain lokal (`animator.ts`) DAN pemain jauh (`remotePlayers.ts`). Jalan/lari dengan ayunan tangan ±0,9–1,4 rad (lama ±0,56), tekukan lutut, kepala distabilkan, tinggi pinggul dari panjang kaki; idle bernapas/menoleh/pindah tumpuan; lompat naik/jatuh + mendarat jongkok; renang gaya bebas. Aksi: `mine` (ayun dua tangan), `gather`, `drink`, `use`, `build` (palu) — dipilih `actionKindFor(kind, hasTool)`; `build` dipicu saat bangunan berhasil dipasang. Pemain jauh baru mendapat gerak dasar (protokol multiplayer belum membawa jenis aksi).
- **Wajah v2**: mata berkelopak + kedip acak, pupil+kilau, alis dua segmen, pangkal hidung, bibir atas/bawah, tulang pipi, dagu, semburat pipi, telinga dalam, bayangan jenggot (pria), bulu mata (wanita). `rig.setBlink(0..1)`.
- **Maskot** (`tools/make_mascot.py`): moncong+dua lubang hidung (terbaca seperti babi) diganti punggung hidung basal bersudut. `public/mascot*.svg|png`, favicon, ikon PWA dan blok hero `index.html` sudah dibuat ulang.
- **Lore**: Bruk memilih Adam & Hawa dan menahan penuaan mereka; slide onboarding baru (`onboarding.slideBruk*`) + paragraf landing page.
- Tes: `pose.test.ts` (6 tes, lulus di sandbox). Tipe `character.ts`/`remotePlayers.ts` belum dicek `tsc` penuh (sandbox tanpa `three`): jalankan `npm run lint`.

### Cek manual v20
- [ ] Lari/jalan: tangan mengayun lebar, siku menekuk, badan memutar, tidak kaku; kaki tidak menembus/melayang.
- [ ] Tekan Aksi di batu (dengan & tanpa alat), air, peti, bangun: tiap gerakan berbeda dan kembali netral.
- [ ] Lompat, jatuh, mendarat, berenang, keluar air: tidak ada lengan berputar liar.
- [ ] Wajah di layar Karakter Baru & dalam game: mata berkedip; pria & wanita berbeda; FPS tidak turun.

## 0f. Perubahan v19 — Peta langkah 2+3: titik penting dari generator & wilayah bernama (15 Nov 2026) — BELUM diuji di browser

- **Generator POI** (`world/poiGen.ts`): grid berjitter 256 m, deterministik, maks 36 titik tambahan (total 48 = 12 buatan tangan + 36). Jenis bergantung tingkat bahaya (dekat spawn: geyser/mata air/kawah; jauh: gunung api/tabung lava/meteor). Jarak min 170 m antar titik, bebas 220 m dari spawn.
- **Seed tata letak TETAP** (`LAYOUT_SEED`), bukan seed pemain: semua pemain/ruang multiplayer melihat titik yang sama. Menjadikannya bergantung seed = langkah 4.
- **Jenis baru** `lava_tube` (Tabung Lava) dan `hot_spring` (Mata Air Panas): untuk saat ini HANYA memengaruhi biome (volcanic_ridge r20 / geyser_basin r20), belum ada medan, prop, atau loot. Jenis `supply_cache` sengaja belum dibuat (butuh loot).
- **Wilayah bernama & bahaya** (`world/regions.ts`): 5 tingkat menurut jarak dari spawn (350/800/1400/2000 m) × 8 arah. Muncul di legenda peta, kartu info, cincin & latar peta (zoom keluar), dan toast saat memasuki wilayah (jeda 15 dtk). Tingkat bahaya SAAT INI HANYA INFORMASI; belum mengubah angka survival (itu tugas `balance.ts`, perlu uji main dulu).
- Optimasi: `getBiomeAt` memakai `nearPoiKind` (tanpa akar kuadrat, per jenis); loop POI di `terrainHeight` menolak cepat POI yang jauh. Siluet hanya untuk volcano/geyser/obsidian; jarak maks siluet 1400 m.
- Tes baru `poiRegions.test.ts` (7 tes). i18n: `poiNames.*`, `regions.*`.

### Cek manual v19
1. Peta zoom keluar: cincin dan nama wilayah terlihat; zoom masuk: label titik muncul. Jumlah titik "x/48" di legenda.
2. Jalan melintasi batas wilayah: toast muncul, tidak spam di perbatasan.
3. Dekati titik baru: terdeteksi (≤42 m), medan geyser/kawah/obsidian terbentuk di titik hasil generator.
4. FPS tidak turun dibanding v18 (terutama saat chunk baru dimuat).
5. Muat save lama: tidak error, titik lama tetap tertemu.

## 0e. Perubahan v18 — Peta langkah 1: atmosfer biome, siluet landmark jauh, peta interaktif (15 Nov 2026) — BELUM diuji di browser

- **Atmosfer per biome** (`data/atmosphere.ts`, `world/sky.ts`): kabut dan warna horizon/langit bergeser halus (±2-3 dtk) mengikuti biome pemain; biome dicek 2x/detik di `SceneManager`.
- **Siluet landmark jauh** (`world/landmarks.ts`, `world/landmarkMath.ts`): ≤12 mesh berbagi geometri, bidang 235 m dari kamera, skala perspektif, memudar masuk >235 m dan keluar >1800 m. Radius chunk TIDAK berubah.
- **Peta interaktif** (`ui/MapScreen.tsx`, `world/mapView.ts`): geser, cubit/roda mouse zoom, tombol +/−/ke posisiku/seluruh dunia, kanvas HiDPI, label POI saat zoom, batang skala, ketuk POI/Suar -> kartu info (nama, jarak, Jadikan Penanda, Teleportasi Suar). Ketuk kosong = penanda; geser TIDAK lagi menaruh penanda. Penanda tampil di HUD (panah + jarak) dan hilang otomatis <12 m.
- Tes baru: `atmosphere.test.ts`, `mapView.test.ts` (10 tes). i18n: kunci `map.*` baru + `hud.waypointHint`.

### Cek manual v18
1. Jalan dari spawn ke biome lain: warna kabut/horizon berubah halus, tanpa kedipan. Ukur FPS di HP lama (harus sama dengan v17).
2. Dari ±400-1000 m dari gunung api: siluet gunung terlihat di horizon, memudar saat mendekat, tidak "melompat".
3. Peta (HP): geser 1 jari, cubit 2 jari, ketuk POI -> kartu, ketuk kosong -> penanda; halaman tidak ikut scroll saat menyentuh kanvas.
4. Peta (desktop): roda mouse zoom ke arah kursor, panah/+/- saat kanvas fokus.
5. Penanda muncul di HUD, hilang saat tiba, tetap tersimpan setelah simpan/muat.

## 0d. Perubahan v17 — Fase 1 langkah (a): gerbang aset karakter (15 Nov 2026) — BELUM diuji di browser
Keputusan pemilik: sumber model = **Mixamo + model gratis**; perangkat terlemah = **HP murah/lama** (anggaran ketat).
- `data/assets.ts` (murni): `CHARACTER_BUDGET` (≤8.000 segitiga, ≤2 MB, tekstur ≤512 px bersaran / ≤1024 batas, ≤75 sendi), `ASSET_LICENSES` (kosong; wajib diisi per model), `characterGate()` → `{ok, blockers, warnings}`, `canAssignRole()`; peran karakter = `player`, `adam`, `hawa`.
- `ui/AssetGalleryScreen.tsx`: statistik baru (jumlah sendi, tekstur terbesar); kotak **Gerbang karakter**; tombol peran karakter **terkunci** bila model belum lolos. Tiga model lama (`naked_dude`, `party_starter…`, `daren…`) kini tidak lolos (tanpa rangka/klip/lisensi) → peran Karakter pemain kosong = karakter buatan kode (perilaku bawaan). Pilihan lama yang sudah tersimpan di localStorage TIDAK dihapus.
- i18n id/en: `assets.gateTitle/gatePass/gateFail/gateLocked/joints`.
- `tools/CHARACTER-PIPELINE.md`: langkah Mixamo → Blender → gltf-transform → masuk game.
- Tes: `assets.test.ts` +5 tes gerbang. Sandbox: 92 lulus (2 gagal = tes yang butuh paket Supabase).
- **Karakter buatan sendiri (tanpa Blender/Mixamo):** `tools/make_character.py` menghasilkan `public/play/models/primordia_adam.glb` dan `primordia_hawa.glb` (±1.300 segitiga, ±125 KB, 19 sendi bernama gaya Mixamo, 10 klip prosedural: Idle, Walk, Run, Jump, Fall, Swim, Mine, Craft, Hurt, Death; material Skin/Hair/Cloth/Eyes tanpa tekstur, mudah di-tint). Karya asli (`ASSET_LICENSES`: CC0). Jalankan ulang `python3 tools/make_character.py` setelah mengubah proporsi/animasi di skrip (`--preview <folder>` membuat PNG pratinjau, butuh numpy+matplotlib). Bentuk = low-poly bergaya, **bukan realistis**; jalur realistis (Mixamo/Blender) tetap di `tools/CHARACTER-PIPELINE.md`.
- `characterAsset.test.ts` membaca `.glb` langsung (tanpa three): struktur glTF, indeks, bobot kulit, klip inti, dan gerbang karakter lolos. Sandbox: 100 lulus (2 gagal = tes Supabase).
- **Belum dibuktikan di browser:** pemuatan GLTFLoader, arah hadap (+Z), skala/tinggi 1,8 m (Hawa 1,69 m), transisi klip, klip Death/Jump/Hurt yang tidak berulang (di game mungkin berulang-ulang), tabrakan kain dengan paha saat berlari.
- **Berikutnya (Fase 1 b):** uji model di Galeri Aset lalu jadikan peran Karakter pemain; satukan jalur gambar (lokal, jauh, pratinjau); Adam/Hawa terpisah; kustomisasi tint dari `AvatarConfig`.

### Cek manual v17
- [ ] Galeri Aset: pilih tiap model → kotak "Gerbang karakter" tampil dengan alasan penolakan; tombol Karakter pemain/Adam/Hawa abu-abu (terkunci); peran Gua/Hewan/Musuh tetap bisa dipilih.
- [ ] Jumlah sendi tampil (daren ≈ 68; dua lainnya 0).
- [ ] Galeri Aset: `primordia_adam.glb` & `primordia_hawa.glb` muncul, kotak Gerbang karakter **hijau**; putar klip (Idle/Walk/Run/…) di pratinjau; bentuk tubuh wajar.
- [ ] Pilih "Karakter pemain" = Adam → muat permainan: karakter tampil menghadap depan, kaki di tanah, ukuran wajar; idle→jalan→lari→lompat→jatuh→berenang→menambang berganti mulus; catat FPS (HP lama) dan hal yang janggal (kain menembus paha, tangan terpelintir).
- [ ] Tanpa pilihan peran, game tetap jalan dengan karakter buatan kode.

## 0c. Perubahan v16 — Fase 0: perapian dokumen & CI (15 Nov 2026) — v15 sudah diuji pemilik: game berjalan baik
- `GAME_VERSION` → `0.9.0-Archean` (`config.ts`).
- README: path model `public/play/models/` (bukan `public/models/`).
- CI: `npm run lint` **tidak lagi** `continue-on-error`; tes, type check, dan build semuanya memblokir deploy. Bila lint gagal setelah ini, perbaiki tipenya, jangan kembalikan `continue-on-error`.
- `supabase/setup-all.sql`: konflik merge diselesaikan (sudah di repo sejak `c3a1a1f`).
- Catatan Gerbang 1: v15 lolos uji pemilik di game; daftar cek lama §8/§0a di HP + desktop masih perlu dicentang pemilik.

## 0b. Perubahan v15 — Fase 0 / Minggu 2: dispose chunk & aset spire bersama (15 Nov 2026) — BELUM diuji di browser
- **Baru** `world/disposal.ts` (logika murni, tanpa import three): `disposeObject3D(root)` membuang geometri & material satu pohon objek (tiap objek sekali); `markShared(res)` menandai sumber daya bersama (`userData.sharedResource`) yang tidak pernah dibuang. Tekstur tidak pernah dibuang.
- `world/chunkManager.ts`: chunk prop yang keluar jangkauan kini lewat `releaseChunk()` (lepas dari scene, hapus collider, **dispose**). Spire memakai **satu** `SPIRE_GEOMETRY` + `SPIRE_MATERIAL` bersama (dulu material baru per chunk dan geometri baru per spire); ukuran lewat `mesh.scale` (bentuk sama persis). Mesh meteor tambahan dan mesh struktur (dibangun ulang tiap `syncPlacedStructures`) juga dibuang.
- `world/props.ts`: 13 material tingkat-modul ditandai `markShared` supaya dispose chunk tidak merusak prop lain. **Konvensi:** material/geometri baru yang dipakai bersama di `props.ts` wajib dibungkus `markShared(...)`; kalau tidak, akan ikut dibuang saat chunk dilepas dan prop lain bisa jadi tak tampak.
- Tes: `disposal.test.ts` (4 tes, lulus di 4 zona waktu). Total di sandbox 87 lulus; `balance.test.ts` & `stage2.test.ts` gagal hanya karena paket `@supabase/supabase-js` tak ada di sandbox (bukan akibat perubahan ini; di Codespace harus lulus).

### Cek manual v15
- [ ] `npm test && npm run build && npm run lint` hijau di Codespace.
- [ ] Jalan jauh melintasi banyak chunk: batu, mineral, kristal, obsidian, spire tetap tampil benar (warna/bentuk sama seperti sebelumnya), tidak ada prop yang menghilang atau hitam setelah chunk lama dilepas lalu didekati lagi.
- [ ] Spire: tinggi/ketebalan terlihat sama; tabrakan spire tetap bekerja.
- [ ] Pasang beberapa bangunan, simpan/muat, pasang lagi: semua bangunan tampil utuh (mesh struktur dibuang+dibuat ulang).
- [ ] Panel F3 (`DebugOverlay`): jalan 10 menit di area luas; **jumlah Geometries/Textures tidak naik terus** (sebelumnya naik tiap chunk). Kirim tangkapan layar sebelum & sesudah untuk baseline Fase 0.

## 0a. Perubahan v14 — hasil audit Minggu 1 (15 Nov 2026) — BELUM diuji di browser
Dokumen audit lengkap + roadmap ada di dokumen "Audit & Roadmap PRIMORDIA". Yang dikerjakan:
- **Keamanan:** `supabase/migration-fix-profile-privileges.sql` (**wajib dijalankan sekali** di SQL Editor). `revoke update (kolom)` lama tidak efektif karena izin UPDATE tingkat tabel; kini hanya `id, username, avatar_config` yang boleh ditulis klien. `born_at`, `deaths`, `last_seen_at` hanya lewat RPC. Verifikasi: query di akhir file harus tidak memuat ketiga kolom itu.
- **Kalender = UTC** (`data/eden.ts`): hari/bulan/musim/seed sama untuk semua zona waktu. Langit tetap memakai jam lokal (`realTimeOfDay`).
- **`MONTHLY_TERRAIN_SHIFT = false`**: medan TIDAK lagi diacak tiap bulan; bangunan tidak terkubur. Peringatan "Pergeseran Besar" dan baris laporan "Saat kamu pergi" ikut mati (parameter `enabled`/`terrainShift`, default = konstanta itu). Medan dunia yang sudah ada kini memakai seed dasar, jadi bentuknya bisa berbeda dari bulan lalu: **cek save lama**. Pengganti: lapisan Era (Fase 2 roadmap).
- **Multiplayer:** nama kamar memakai `effectiveTerrainSeed` (`SceneManager.enterWorld`), jadi medan berbeda tidak pernah satu kamar.
- **CI:** `npm ci` (lockfile diperbaiki: `@base44/sdk` di root lock kini `^0.8.26`, bukan `latest`), `npm test` kini memblokir deploy. `lint` masih `continue-on-error` sampai `npm run lint` terbukti bersih.
- **Tes:** `eden*.test.ts` dipindah ke tanggal UTC; baru `eden5.test.ts` (UTC, seed tetap, kamar). Total 83 tes lulus di TZ Asia/Jakarta, UTC, America/Los_Angeles, Pacific/Kiritimati (tes yang butuh paket supabase tidak dijalankan di sandbox).
- Teks i18n (id/en) yang menyebut "peta berubah tiap bulan" disesuaikan.

### Cek manual v14
- [ ] Jalankan `migration-fix-profile-privileges.sql`; dari konsol login biasa: `update profiles set born_at=...` → **permission denied**.
- [ ] Daftar akun baru / login Google / simpan avatar: profil tetap terbuat & tersimpan (uji upsert setelah izin dipersempit).
- [ ] `sync_immortal_age()` dan `presence_ping()` masih berjalan (umur tampil, panel "Saat kamu pergi").
- [ ] Buka save lama: bangunan tidak di bawah tanah / di udara; catat bila medan bergeser.
- [ ] Ubah zona waktu perangkat: bioma/medan identik; tidak ada toast "Pergeseran Besar".
- [ ] `npm ci && npm test && npm run build` hijau; `npm run lint` — catat jumlah error (target 0 lalu hapus `continue-on-error`).

## 0. Site layout (v13)
| URL | Source |
|---|---|
| `/primordia/` | `index.html` (landing page, self-contained) |
| `/primordia/play/` | `play/index.html` (the game, Vite entry `src/main.tsx`) |

- Game static files live in `public/play/` (models, `sw.js`, manifest, icons) so every relative path (`./models/`, `./sw.js`) keeps working from `/play/`.
- Landing assets (favicon, mascot) live in `public/`. `public/sw.js` is a stub that unregisters the old root service worker.
- Dev: landing `http://localhost:3000/`, game `http://localhost:3000/play/`. Edit `CONTACT_EMAIL` at the bottom of `index.html`.
- Mascot: **Bruk, the basalt warden** (`public/mascot.svg`, `mascot-512.png`).

## 1. Ringkasan
PRIMORDIA = game survival 3D di browser (React 19 + Three.js + Vite + Supabase opsional).
Lapisan terbaru **Era Adam & Hawa**: pemain berumur abadi, waktu mengikuti dunia nyata, peta berubah mengikuti kalender nyata.
Rancangan: pemilik proyek (kalfinstudio-ux) bersama Claude AI.

## 2. Cara menjalankan
```bash
npm install --legacy-peer-deps
npm test                                   # semua tes (tsx --test src/game/*.test.ts), v11: 92 tes
nohup ./tools/keepalive.sh > server.log 2>&1 &   # server dev anti-mati, port 3000
./tools/keepalive.sh stop                  # hentikan
tail -f server.log                         # lihat log
```
- `keepalive.sh`: restart otomatis bila mati, watchdog port 3000 (3× tidak menjawab → restart paksa), satu instance (lock `.keepalive.pid`).
- Codespace: `.devcontainer/devcontainer.json` menyalakan server saat Codespace hidup & membuat port 3000 publik. Codespace tetap berhenti saat idle (atur *Default idle timeout* di GitHub → Settings → Codespaces). Untuk 24 jam penuh pakai VPS/hosting.
- **Urutan saat memperbarui dari zip:** `stop` → `unzip -o` → nyalakan lagi. Kalau terbalik, Vite pindah ke port 3001/3002.
- `.env` berisi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (jangan commit kunci `service_role`). Tanpa itu game jalan mode tamu lokal.

## 3. Supabase — urutan SQL (SQL Editor)
Project baru: `schema.sql` → `policies.sql` → `migration-eden.sql` → `migration-presence.sql`.
Project lama: `migration-stage2.sql` → `migration-auth-google.sql` → `migration-eden.sql` → `migration-presence.sql`.
`migration-eden.sql` menambah `profiles.born_at`, `deaths`, `last_seen_at`, serta RPC `sync_immortal_age()` dan `record_death()`.
**Wajib dijalankan** agar umur abadi tersimpan di profil.
`migration-presence.sql` menambah RPC `presence_ping()` (lama pergi dihitung server) dan mengubah `sync_immortal_age()` agar tidak menimpa `last_seen_at`. Tanpanya game tetap jalan (jatuh ke waktu save lokal), tetapi anti-curang offline tidak aktif.

## 4. Fitur Era Adam & Hawa (sudah ada)
Semua logika murni ada di `src/game/data/eden.ts` (mudah dites). Angka yang boleh disetel ada di file itu.

| Fitur | Perilaku | File utama |
|---|---|---|
| Umur abadi | Tidak ada kematian karena usia. `bornAtMs` dihitung dari server (`born_at`) untuk akun login, lokal untuk tamu. Mati karena bahaya hanya menambah penghitung `deaths`; umur tidak reset. | `eden.ts`, `net/immortal.ts`, `core/state.ts`, `systems/deathBag.ts` |
| Waktu nyata | Langit mengikuti jam perangkat (0 = tengah malam, 0.5 = tengah hari). | `world/sky.ts` (`realTimeOfDay`) |
| Peta berubah (Hari/Bulan/Tahun) | Props/sumber daya tumbuh ulang & detail mikro tiap **hari**; medan berganti tiap **bulan** (`MONTHLY_TERRAIN_SHIFT=true`, seed `dunia\|Y{tahun}\|M{bulan}`) + POI bulanan; **Era** berganti tiap **1 Jan UTC** (mengubah muka air, vulkanik, sumber daya, & bab cerita). Dilindungi Jangkar Medan + `safeRelocateStructures`/`safeRelocatePlayer`. | `eden.ts`, `world/poiGen.ts`, `scenes/SceneManager.ts` |
| Jangkar Medan | Bangunan (`terrain_anchor`) mengunci medan radius 60 m dengan seed saat dipasang; tepi dicampur halus. Resep: 3 kristal inti + 4 besi meteorit + 6 bata basalt (stasiun riset). | `world/terrainHeight.ts`, `terrain.ts`, `terrainWorker.ts`, `systems/building.ts` |
| Offline berjalan | Maks 24 jam efek; <5 menit diabaikan. Penampung air +0,02/dtk (+8 per ~6 jam hujan). >30 menit = kelelahan pulih. | `eden.ts` (`buildAwayReport`), `systems/saveLoad.ts` |
| Laporan "Saat kamu pergi" | Panel sekali muncul: cuaca (kronik 6 jam, deterministik dari kalender), air, hari berganti, gunung berapi, Pergeseran Besar. | `systems/awayReport.ts`, `ui/AwayReportModal.tsx` |
| Kebijaksanaan | Poin dari umur: 7 hari=1, 30=2, 100=3, 365=5. Perk: Filter Awet, Kulit Abu, Resep Leluhur, Filter Abadi. Panel di menu Jeda. | `eden.ts`, `ui/WisdomPanel.tsx`, `player/stats.ts` |
| Anti-curang offline | Akun login: lama pergi = `presence_ping()` server (denyut tiap 60 dtk + saat tab disembunyikan). Mengubah `updatedAt` save lokal tidak berpengaruh. Tamu/gagal jaringan: waktu save lokal, waktu masa depan ditolak. | `eden.ts` (`resolveAwayWindow`), `net/presence.ts`, `systems/saveLoad.ts`, `supabase/migration-presence.sql` |
| Offline lanjutan | Per blok cuaca 6 jam (maks 24 jam): **Kebun Lumut** (`garden_plot`) tumbuh 12,5/jam × cuaca × musim, siap panen di 100; **Bor Otomatis** (`auto_drill`) +6 batu/jam (maks 48) hanya saat cerah/hujan asam; badai merusak bangunan tanpa tempat berteduh (abu 3, petir 5, meteor 6 HP/jam; ×0,25 bila ada shelter/atap radius 6 m). Bangunan **tidak pernah hancur** (HP min 10%); Jangkar kebal. Laju yang sama dipakai saat main. | `eden.ts` (`simulateOfflineEconomy`, `advanceProducer`), `systems/building.ts`, `systems/interaction.ts` |
| Musim | Kering/Hujan/Abu/Dingin (3 bulan masing-masing, dari kalender). Memengaruhi peluang cuaca kronik, laju isi penampung air, pertumbuhan kebun, dan suhu lingkungan (kering +2, abu +1, dingin −3 °C). | `eden.ts` (`SEASON_FX`, `currentSeasonFx`), `systems/survival.ts` |
| Peringatan Pergeseran Besar | ≤6 jam sebelum tanggal 1: toast + banner di EdenClock; ≤30 menit: merah berkedip. Toast tidak berulang (kunci per bulan+level). | `eden.ts` (`shiftWarning`), `scenes/SceneManager.ts`, `ui/EdenClock.tsx` |
| Nama karakter | Acak (Adar, Hawa, Liora, …) + tombol 🎲; pemain bebas mengganti. | `ui/NewGameScreen.tsx` |
| HUD | Jam/tanggal/umur ringkas di panel kiri; tombol ikon punya teks; tombol sentuh: LARI/BANGUN/AKSI/LOMPAT; notifikasi maks 2, kecil, 2,2 dtk. | `ui/HudScreen.tsx`, `EdenClock.tsx`, `ToastContainer.tsx` |

## 4b. Perubahan v11 (14 Nov 2026) — BELUM diuji visual di browser
Ditulis di sandbox tanpa vite/three (tanpa internet): hanya tes logika (`npm test`: 92 lulus) dan simulasi tata letak struktural yang dijalankan.

**HUD**
- **Joystick tidak lagi turun di landscape.** Penyebab: baris atas HUD (panel kiri setinggi ±385 px karena `transform: scale` tidak mengecilkan kotak layout) lebih tinggi dari layar 432 px, sehingga baris bawah terdorong keluar. Kini `.hud-root` (src/index.css) = grid dua baris `minmax(0,1fr) auto`: baris atas boleh menyusut/terpotong, baris bawah (joystick, tombol aksi, hotbar) selalu menempel di dasar layar. Landscape pendek (<440 px) memakai panel kiri ringkas (bar 2 kolom, jam 2 baris, misi satu baris).
- **Mode HUD (tombol mata di kanan atas, atau tombol H di desktop):** Penuh → Ringkas → Bersih, tersimpan di localStorage `primordia_hud_mode`. Logika murni di `utils/hudMode.ts` (`hudVisibility`), dipakai `HudScreen` dan `ToastContainer`.
  - Ringkas: nyawa (+oksigen bila rendah), peringatan bahaya/event/panah; tanpa jam, misi, minimap, kompas, tutorial. Toast hanya peringatan.
  - Bersih: tanpa info apa pun (tanpa toast); hanya joystick/tombol aksi, hotbar, tombol mata & jeda (transparan). Saat kritis (sesak, nyawa ≤30, air habis) tepi layar berkedip merah.
  - Di menu semua toast tetap tampil.

**10 menit pertama (balance.ts)**
- `safeStart`: 180→**600 dtk**, radius 150→**260 m**, `maxToxicLevel` 0.3→**0** (udara bersih penuh; oksigen pulih). Sebelumnya zona "aman" masih menguras oksigen (toxic 0.3×2×mode).
- `earlyEase`: setelah masa aman sampai menit ke-25 tekanan survival ×0,6 (`easeMult` di `stepVitals`). Hadean dikecualikan dari semuanya.
- `autoFilter`: Filter Gas dipasang otomatis bila oksigen <30%, terpapar gas, punya filter, bukan Hadean.
- Peringatan oksigen saat badai tanpa shelter memberi teks khusus (`survival.noRefuge`) — sebelumnya tidak ada panah/petunjuk sama sekali.
- **Panah tujuan misi** (`systems/questGuide.ts`): q1→kolam air, q5→kristal, q7→obsidian, q16→meteor; memakai node yang termuat + titik tetap (kolam awal 16,22; POI) sebagai cadangan. Tampil sebagai pill biru di tengah atas (`HudSnapshot.questGuide`).

**Visual (tahap 1)**
- `terrainHeight.ts › sampleTerrainColor`: palet ×0,62 (dulu tampak pucat/lavender), bercak hangat/dingin, tebing curam jadi batu gelap (param `slope` = 1−normal.y, dihitung setelah normal), makin tinggi makin gelap-kemerahan, debu abu di dataran, **urat bara** menyala di kaki gunung api & sungai lava.
- `sky.ts`: **semburat jingga gunung api terdekat** di horizon (lebih kuat malam & badai abu, berkedip pelan); warna langit & kepadatan kabut per cuaca (abu coklat, asam kuning-hijau, petir ungu-abu, meteor merah). Arah langit kini dari posisi lokal kubah (dulu posisi dunia → makin jauh dari (0,0) langit makin menempel ke warna horizon).
- `weather.ts`: cerah kini punya **bara kecil melayang naik** (44 partikel); meteor shower punya warna sendiri; partikel mengikuti pengaturan `graphics.particles`.
- `stats.ts`: error tipe lama baris 58 (literal `37`) diperbaiki.

**Cek manual v11 (HP landscape + desktop)**
- [ ] Landscape 360–440 px: joystick, hotbar, tombol LARI/Bangun/AKSI/LOMPAT terlihat penuh di dasar, termasuk saat panel misi dibuka.
- [ ] Tombol mata: Penuh→Ringkas→Bersih→Penuh; label mode muncul 1,6 dtk; setelah reload mode tetap. Tombol H di desktop sama.
- [ ] Mode Bersih: tak ada teks info; nyawa ≤30 → tepi merah berkedip; tombol jeda tetap bisa dipakai.
- [ ] Game baru: 10 menit pertama oksigen tidak turun di sekitar spawn (radius 260 m) & tidak ada badai; pill biru "Kolam air · N m" menunjuk kolam; setelah q1 selesai pill berganti sesuai misi.
- [ ] Setelah menit ke-10 di luar zona: Filter Gas terpasang otomatis saat oksigen <30%.
- [ ] Medan: tidak lagi pucat; ada urat bara di dekat gunung; horizon menyala jingga ke arah gunung (terutama malam). Bandingkan FPS dengan versi sebelumnya (warna medan kini 2 noise ekstra per titik di worker).
- [ ] Bara melayang saat cerah; matikan di Pengaturan → Partikel bila FPS turun.
- Jika medan terlalu gelap/terang: ubah `TERRAIN_DARKEN` di `terrainHeight.ts`. Ambang urat bara: `smoothstep(0.66, 0.84, …)` di fungsi yang sama.

## 5. Aset 3D
Tiga model sudah di `public/models/` (tekstur dikompres): `naked_dude.glb` (0,23 MB), `party_starter_-_layered_t-shirts.glb` (0,93 MB), `daren_-_lod_man_character.glb` (3,0 MB — geometri berat). Empat aset lain (gua, karakter perempuan, hewan purba, zombie) **belum ada di repo** — format aslinya USDZ; boleh sudah diganti format, taruh hasilnya (.glb/.gltf) di `public/models/`.

**Sistem aset (v10, belum diuji di browser — sandbox tanpa three/vite):**
- `src/game/data/assets.ts` (murni, dites `assets.test.ts`): daftar peran (`ASSET_ROLES`: player, adam, hawa, cave, animal, enemy), daftar file (`ASSET_FILES` — **edit di sini bila nama/format file berubah**), pembersih nama file, peringatan (berat >2 MB, >60 ribu segitiga, tanpa klip Idle/Walk/Run, format .usdz perlu konversi).
- `src/game/utils/assetPrefs.ts`: pilihan peran tersimpan di localStorage (`primordia_asset_assignments`).
- **Galeri Aset 3D** (`ui/AssetGalleryScreen.tsx`, tombol di menu utama): pratinjau putar/zoom, statistik (ukuran, segitiga, mesh, tekstur, tinggi, klip animasi — bisa diputar), peringatan, tombol "pakai sebagai …" per peran, kolom untuk mencoba file lain di `public/models/`.
- **Hanya peran `player` yang terhubung ke game**: `SceneManager` memuat model pilihan (atau `explorer.glb` bawaan bila ada, atau karakter buatan kode bila tidak ada). Berlaku saat dunia dimuat berikutnya. Peran lain hanya disimpan.
- `player/glbCharacter.ts`: model otomatis diskalakan ke ±1,8 m (bila di luar 1,5–2,2 m) dan kakinya diletakkan di y=0 (`fitModelToHeight`). Klip dicocokkan lewat alias nama (`CLIP_ALIASES`). Model tanpa animasi akan kaku.
- Risiko: arah hadap model (game mengharapkan +Z), pose T/A, dan rig tanpa klip belum dicek; `daren_-_lod…` kemungkinan terlalu berat untuk HP.
- Konversi USDZ→GLB: `tools/optimize-assets.sh` (Blender + gltf-transform, butuh internet); `tools/compress_glb.py` untuk mengecilkan tekstur.

## 6. Belum diverifikasi / risiko (BACA)
1. Perubahan Era Adam & Hawa **belum dijalankan di browser** oleh penulisnya (sandbox tanpa internet); hanya tes logika yang lulus. Cek manual di §8.
2. `npm run lint` (tsc) belum pernah dijalankan penuh setelah perubahan. Di CI, lint & test `continue-on-error`, tapi `npm run build` harus lolos agar deploy jalan — cek tab Actions setelah push.
3. Medan berganti tiap bulan bisa mengubur bangunan di luar zona Jangkar.
4. Daftar perk & isi save tetap dari save lokal (bisa dimanipulasi). Lama pergi untuk akun login kini dari server (Backlog #3); untuk tamu masih bisa dimanipulasi lewat jam perangkat.
5. ~~Cuaca saat bermain masih acak~~ → **selesai (Backlog #2)**: `world/weather.ts` kini mengikuti `weatherAtTime()` (blok 6 jam kalender nyata). Belum dicoba di browser.
7. Musim mengubah peluang cuaca kronik → cuaca/laporan untuk tanggal lampau berbeda dari versi sebelum v9 (tidak ada data tersimpan yang terdampak).
8. Struktur baru (Kebun Lumut, Bor Otomatis): mesh, resep, dan angka belum diuji di browser; keseimbangan (hasil panen: 3 tanah liat + 15 HP; bor: batu) hanyalah tebakan awal.
10. ~~`npm run lint` error tipe di `player/stats.ts` baris 58~~ → diperbaiki di v11. Catatan: TypeScript 7 memakai mode `strict` secara bawaan, jadi `npm run lint` bisa menampilkan error lain di file tes lama (mis. `eden3.test.ts`, `multiplayerProtocol.test.ts`: 'possibly undefined/null') — tidak memengaruhi `npm run build`.
9. Jaringan sandbox mati: `tsc` penuh & build Vite belum dijalankan. Tes `tsx` (73) lulus; tipe diperiksa terbatas (tanpa tipe three/react).
6. Teks Era Adam & Hawa (eden.ts, EdenClock, WisdomPanel, AwayReportModal) masih di-hardcode Bahasa Indonesia, belum lewat `src/i18n`.

## 7. Konvensi kode
- Logika game murni → `src/game/data/*.ts` + tes `src/game/*.test.ts` (pola `tsx --test`).
- Angka keseimbangan → `src/game/data/balance.ts`. Teks UI → `src/i18n/id.json` & `en.json` (kunci harus ada di keduanya).
- Notifikasi: `eventBus.emit('toast:show', { text, type })`.
- Struktur baru butuh: tipe di `core/state.ts` (`StructureType`), item di `data/items.ts`, resep di `data/recipes.ts`, mesh di `world/props.ts`, i18n item, dan pemetaan field di `systems/saveLoad.ts`.
- Medan: semua pemanggil tinggi medan harus lewat `sampleHeightAnchored`/`TerrainSystem.groundHeightAt` agar jangkar berlaku.

## 8. Daftar cek manual (urutan disarankan)
- [ ] Server hidup di port 3000, game terbuka, tidak ada error merah di konsol.
- [ ] Permainan Baru: nama acak muncul, 🎲 mengganti nama, nama bisa diketik sendiri.
- [ ] HUD: jam/tanggal/umur terbaca, tidak menabrak tombol; semua tombol ikon punya teks.
- [ ] Langit sesuai jam perangkat.
- [ ] Menu Jeda: panel Kebijaksanaan tampil (poin 0 di hari pertama).
- [ ] Stasiun riset → resep Jangkar Medan; pasang jangkar; save/load, struktur tetap ada.
- [ ] Simpan, tutup tab >5 menit, muat lagi → panel "Saat kamu pergi" muncul.
- [ ] Cuaca: ubah jam perangkat melewati 00/06/12/18 → cuaca berganti sesuai kronik, dan sama dengan laporan "Saat kamu pergi".
- [ ] Menu utama → Galeri Aset 3D: 3 model muncul, bisa diputar/zoom, statistik & peringatan tampil; "Karakter pemain" lalu muat permainan → model tampil di dunia (ukuran & arah benar).
- [ ] Kebun Lumut & Bor Otomatis muncul di menu bangun/resep, bisa dipasang, dipanen/diambil; tersimpan setelah save/load.
- [ ] Musim tampil di panel jam (🍂); suhu terasa berbeda antar musim.
- [ ] Login Supabase → `profiles.born_at` terisi; umur tidak reset setelah mati.

## 9. Backlog (urutan saran)
1. 🔶 SEBAGIAN — Galeri Aset + registri + karakter pemain bisa diganti (lihat §5). Sisa: tentukan peran tiap model, Adam/Hawa terpisah, gua/hewan/zombie (butuh file & konversi), animasi untuk model tanpa klip, uji di HP.
2. ✅ SELESAI — Cuaca saat bermain mengikuti kronik (`weatherAtTime` di `eden.ts`, dipakai `WeatherSystem`). Masa aman awal tetap cerah + jeda 40 dtk; transisi cuaca mengikuti blok 6 jam. Tes: `eden3.test.ts`. Cek manual: ubah jam perangkat lintas batas blok (00/06/12/18) → cuaca & kabut berganti dalam ≤1 dtk.
3. ✅ SELESAI — Anti-curang offline lewat `presence_ping()` server. Cek manual: login, simpan, ubah `updatedAt` save lokal ke 20 hari lalu, muat ulang → laporan tetap hanya menghitung waktu sebenarnya.
4. ✅ SELESAI — Kebun Lumut, Bor Otomatis, kerusakan badai (lihat tabel §4). Cek manual: buat keduanya di Meja Kerja, pasang, simpan, tinggal >1 jam, muat → panen/ambil hasil; bangunan jauh dari shelter berkurang HP-nya. Belum ada cara **memperbaiki** HP bangunan (HP saat ini hanya informasi) → kandidat berikutnya.
5. ✅ SELESAI — Musim memengaruhi gameplay + peringatan Pergeseran Besar. Cek manual: ubah jam perangkat ke 30 Nov 20:00 → toast & banner muncul dalam ≤30 dtk.
6. Suku pertama: peti bersama & nama suku untuk satu room (maks 8 pemain).
7. Pindahkan teks Eden ke i18n (id/en) — kini juga mencakup teks peringatan/laporan baru.
8. Perbaikan bangunan (pulihkan HP, bahan bata/besi), visual kebun menurut `growth`, dan tombol "panen semua".

## 10. Prompt awal untuk melanjutkan bersama Claude
> Baca `HANDOFF.md` dan `README.md` di repo PRIMORDIA. Lanjutkan dari bagian Backlog nomor …, ikuti Konvensi kode, tulis tes untuk logika murni, lalu perbarui HANDOFF.md.

## 11. v12 — Info Game & login Base44 (14 Nov 2026) — BELUM diuji di browser
Ditulis di sandbox tanpa vite/three/react: hanya `gameInfo.test.ts` (9 tes, lulus) yang dijalankan. `npm run build` dan tampilan belum dicoba.

**Info Game** (Pengaturan → tab "Info Game", `ui/GameInfoPanel.tsx`)
- Enam bagian: Deskripsi, Skema Game, Misi, Panduan, Ketentuan, Kebijakan Privasi.
- Teks ada di `src/i18n/id.json` & `en.json` → kunci `info.*` (struktur harus identik; dijaga tes). Placeholder `{nama}` diisi dari data game asli lewat `data/gameInfo.ts › buildInfoVars` (jumlah item/resep/misi, angka balance, konstanta Eden). Ubah angka di `balance.ts`/`eden.ts` → teks ikut berubah.
- Bagian Misi membaca `CAMPAIGN_QUESTS` + `quests.*` + `ACHIEVEMENTS`; status Selesai/Berjalan hanya tampil bila Pengaturan dibuka dari menu Jeda (data game sedang dimuat).
- Bagian Panduan menampilkan tombol keyboard dari pengaturan pemain (`controls.keys`).
- **Menambah fitur/misi baru → perbarui teks `info.scheme`, `info.guide`, dan Kebijakan bila ada data baru yang dikirim ke server.**
- Kontak & nama pengelola: `VITE_CONTACT_EMAIL`, `VITE_OWNER_NAME` (`config.ts › LEGAL_CONFIG`). Tanggal pembaruan: `LEGAL_CONFIG.updatedAt` — ubah tiap teks hukum diedit. Teks hukum adalah titik awal, bukan nasihat hukum; sebaiknya ditinjau pemilik/ahli hukum.

**Login Base44** (`net/base44Client.ts`, `net/auth.ts`, `ui/AuthScreen.tsx`)
- Aktif bila `VITE_BASE44_APP_ID` diisi (appId ada di URL editor Base44). Tanpa itu tombol tidak muncul dan game berjalan seperti sebelumnya.
- Alur: tombol → `base44.auth.loginWithProvider('google', <url game>)` → kembali ke game → `initAuthSession` memanggil `isAuthenticated()` + `me()` → `gameState.user = { mode:'guest', provider:'base44', email, displayName }`.
- **Batas penting:** sesi Base44 TIDAK membuat sesi Supabase. Karena itu `mode` tetap `'guest'` supaya semua fitur Supabase (simpan cloud, teman/pesan, papan peringkat, umur server, presence) tetap tertutup dan tidak error. Menu/Akun menampilkan identitas Base44 lewat `isSignedIn(user)` (`core/state.ts`).
- Supaya Base44 juga membuka fitur cloud, perlu jembatan: fungsi backend Base44 yang menukar identitas Base44 jadi JWT Supabase (butuh JWT secret Supabase, hanya di server), atau memindahkan simpanan cloud ke entitas Base44. Belum dikerjakan.
- Di aplikasi Base44: aktifkan Google di pengaturan autentikasi dan pastikan alamat game (mis. `https://<user>.github.io/primordia/`) diizinkan sebagai asal/pengalihan bila pengaturannya ada.
- Token yang kembali lewat `?access_token=` disimpan lewat `auth.setToken` sebagai cadangan, lalu dihapus dari URL.

**Cek manual v12**
- [ ] `npm install --legacy-peer-deps` (memasang `@base44/sdk`), `npm test`, `npm run build` lolos.
- [ ] Pengaturan → Info Game: enam bagian tampil, bisa digulir di HP; ganti bahasa ID↔EN mengganti isi.
- [ ] Misi: dari menu Jeda → Pengaturan, misi selesai bertanda dan misi aktif disorot.
- [ ] Panduan: tombol sesuai Kontrol; ubah tombol di tab Kontrol → Info Game ikut berubah.
- [ ] Dengan `VITE_BASE44_APP_ID`: tombol "Masuk dengan Base44 (Google)" → Google → kembali ke game, menu menampilkan nama/email, refresh tetap masuk, Keluar menghapus sesi.
- [ ] Tanpa `VITE_BASE44_APP_ID`: tombol tidak ada, login Supabase tidak berubah.


## 4c. Perubahan v13 (15 Nov 2026) — BELUM diuji di browser
- **Panel Info Game** (Pengaturan → Info Game) sebelumnya menampilkan kunci mentah (`info.title`, dst.) karena bagian `info` hilang dari `src/i18n/id.json` & `en.json`. Kini lengkap (Tentang, Mekanik, Misi, Panduan, Ketentuan, Privasi) + `settings.tabs.info`, `auth.base44`, `auth.base44NoCloud`. `npm test` (gameInfo.test.ts) memeriksa struktur kedua bahasa & placeholder.
- **Keluar Game**: `ui/ExitGameButton.tsx` (dengan konfirmasi) di menu Jeda dan Pengaturan → Akun & Data. `exitGame()` di `game/main.ts`: simpan (hanya bila ada dunia aktif; sejak v21 `saveGame()` menolak menyimpan tanpa dunia aktif), keluar layar penuh, lalu ke `../` (landing).
- **Detektor pemain sekitar**: `ui/NearbyPlayers.tsx` di bawah jam HUD (mode Penuh): jumlah pemain dalam 120 m, jarak & panah arah pemain terdekat; ketuk membuka panel Pemain & Teman. Perlu Mode Online aktif.
- HUD atas: pil kompas/bioma tidak lagi menimpa panel jam & tombol kanan (dipotong dengan elipsis).
- `LEGAL_CONFIG`: pengelola bawaan "Jurkon Studio", tanggal 2026-11-15.

## 0g. Perubahan v20 — Landing page: maskot Bruk realistis (15 Nov 2026) — sudah dicek di Chromium (HP 412px & desktop 1280px)
- Hero `index.html` kini 3 lapis SVG bertumpuk (`.mascot` > `.m-base` statis berfilter, `.m-eye` & `.m-lava` cahaya blend-screen berdenyut, `.m-fx` uap+bara). Filter berat tidak ikut dianimasikan → hemat baterai HP.
- Sumber tunggal: `tools/make_mascot.py` + `tools/mascot_shapes.json` (siluet lama). Ubah tampilan → jalankan `python3 tools/make_mascot.py <folder>` lalu salin `hero_inline.html` ke index.html, `mascot.svg`/`favicon.svg` ke `public/`. PNG (`mascot-512.png`, `apple-touch-icon.png`, `favicon.ico`) dirender ulang dari SVG.
- Perbaikan bug: di HP, badan maskot menutupi baris pertama judul (margin negatif −60px). Kini −22px dan dasar badan memudar.
- Bobot: index.html ±115 KB (gzip jauh lebih kecil). Belum diuji di HP asli (Galaxy A36): cek FPS scroll & kedip.
