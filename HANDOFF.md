# HANDOFF — PRIMORDIA (Era Adam & Hawa)

Dokumen serah-terima agar pengembangan bisa dilanjutkan oleh siapa pun (manusia atau Claude) tanpa konteks percakapan sebelumnya.
Terakhir diperbarui: 14 November 2026 (v11: HUD landscape + mode sembunyi, 10 menit pertama lebih ramah, identitas visual tahap 1; v10: Backlog #2–#5 selesai; #1 aset 3D tahap awal).

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
| Peta berubah | Medan berganti tiap **bulan** (seed `dunia\|Y{tahun}\|M{bulan}`); props/sumber daya tumbuh ulang tiap **hari**. Dicek tiap 30 dtk. Matikan lewat `MONTHLY_TERRAIN_SHIFT=false`. | `eden.ts`, `scenes/SceneManager.ts` |
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
