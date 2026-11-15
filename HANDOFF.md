# HANDOFF — PRIMORDIA (Era Adam & Hawa)

Dokumen serah-terima agar pengembangan bisa dilanjutkan oleh siapa pun (manusia atau Claude) tanpa konteks percakapan sebelumnya.
Terakhir diperbarui: 15 November 2026 (v22: Bruk NPC tingkat 1, kepercayaan, dialog HUD; v21: simpanan tunggal, audit bug, navigasi pemain baru; v20: gerak manusia, wajah v2, lore Bruk; v17: gerbang aset karakter; v16: perapian dokumen & CI; v15: dispose chunk & aset spire bersama; v14: audit Minggu 1; v12: Info Game di Pengaturan + login Base44; v11: HUD landscape + mode sembunyi, 10 menit pertama lebih ramah, identitas visual tahap 1; v10: Backlog #2–#5 selesai; #1 aset 3D tahap awal).


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
| Peta berubah (NONAKTIF sejak v14) | Medan berganti tiap **bulan** (seed `dunia\|Y{tahun}\|M{bulan}`); props/sumber daya tumbuh ulang tiap **hari**. Dicek tiap 30 dtk. Matikan lewat `MONTHLY_TERRAIN_SHIFT=false`. | `eden.ts`, `scenes/SceneManager.ts` |
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
