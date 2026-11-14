# HANDOFF — PRIMORDIA (Era Adam & Hawa)

Dokumen serah-terima agar pengembangan bisa dilanjutkan oleh siapa pun (manusia atau Claude) tanpa konteks percakapan sebelumnya.
Terakhir diperbarui: 14 November 2026 (v9: Backlog #1–#5 selesai kecuali #1 aset 3D).

## 1. Ringkasan
PRIMORDIA = game survival 3D di browser (React 19 + Three.js + Vite + Supabase opsional).
Lapisan terbaru **Era Adam & Hawa**: pemain berumur abadi, waktu mengikuti dunia nyata, peta berubah mengikuti kalender nyata.
Rancangan: pemilik proyek (kalfinstudio-ux) bersama Claude AI.

## 2. Cara menjalankan
```bash
npm install --legacy-peer-deps
npm test                                   # semua tes (tsx --test src/game/*.test.ts)
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

## 5. Aset 3D
Sudah di `public/models/` (teksturnya dikompres, **belum dihubungkan ke game**):
`naked_dude.glb` (0,23 MB), `party_starter_-_layered_t-shirts.glb` (0,93 MB), `daren_-_lod_man_character.glb` (3,0 MB — geometri berat).
**Belum diproses:** `Cave.usdz`, `Female_character.usdz`, `Haiwan_zaman_purba_…usdz`, `Zombie_Walk_Zealot.usdz`.
- `tools/compress_glb.py` — kecilkan tekstur GLB (Pillow saja). `tools/optimize-assets.sh` — konversi USDZ→GLB (Blender) + meshopt/WebP (gltf-transform), butuh internet.
- Loader karakter: `src/game/player/glbCharacter.ts` memuat `./models/explorer.glb` (klip: Idle, Walk, Run, Jump, Swim, Mine). Belum ada pemetaan Adam/Hawa/gua/hewan/zombie → **tanya pemilik: aset mana untuk apa.**

## 6. Belum diverifikasi / risiko (BACA)
1. Perubahan Era Adam & Hawa **belum dijalankan di browser** oleh penulisnya (sandbox tanpa internet); hanya tes logika yang lulus. Cek manual di §8.
2. `npm run lint` (tsc) belum pernah dijalankan penuh setelah perubahan. Di CI, lint & test `continue-on-error`, tapi `npm run build` harus lolos agar deploy jalan — cek tab Actions setelah push.
3. Medan berganti tiap bulan bisa mengubur bangunan di luar zona Jangkar.
4. Daftar perk & isi save tetap dari save lokal (bisa dimanipulasi). Lama pergi untuk akun login kini dari server (Backlog #3); untuk tamu masih bisa dimanipulasi lewat jam perangkat.
5. ~~Cuaca saat bermain masih acak~~ → **selesai (Backlog #2)**: `world/weather.ts` kini mengikuti `weatherAtTime()` (blok 6 jam kalender nyata). Belum dicoba di browser.
7. Musim mengubah peluang cuaca kronik → cuaca/laporan untuk tanggal lampau berbeda dari versi sebelum v9 (tidak ada data tersimpan yang terdampak).
8. Struktur baru (Kebun Lumut, Bor Otomatis): mesh, resep, dan angka belum diuji di browser; keseimbangan (hasil panen: 3 tanah liat + 15 HP; bor: batu) hanyalah tebakan awal.
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
- [ ] Kebun Lumut & Bor Otomatis muncul di menu bangun/resep, bisa dipasang, dipanen/diambil; tersimpan setelah save/load.
- [ ] Musim tampil di panel jam (🍂); suhu terasa berbeda antar musim.
- [ ] Login Supabase → `profiles.born_at` terisi; umur tidak reset setelah mati.

## 9. Backlog (urutan saran)
1. Hubungkan aset: tanya pemilik pembagian peran; konversi USDZ; ganti karakter Adam/Hawa.
2. ✅ SELESAI — Cuaca saat bermain mengikuti kronik (`weatherAtTime` di `eden.ts`, dipakai `WeatherSystem`). Masa aman awal tetap cerah + jeda 40 dtk; transisi cuaca mengikuti blok 6 jam. Tes: `eden3.test.ts`. Cek manual: ubah jam perangkat lintas batas blok (00/06/12/18) → cuaca & kabut berganti dalam ≤1 dtk.
3. ✅ SELESAI — Anti-curang offline lewat `presence_ping()` server. Cek manual: login, simpan, ubah `updatedAt` save lokal ke 20 hari lalu, muat ulang → laporan tetap hanya menghitung waktu sebenarnya.
4. ✅ SELESAI — Kebun Lumut, Bor Otomatis, kerusakan badai (lihat tabel §4). Cek manual: buat keduanya di Meja Kerja, pasang, simpan, tinggal >1 jam, muat → panen/ambil hasil; bangunan jauh dari shelter berkurang HP-nya. Belum ada cara **memperbaiki** HP bangunan (HP saat ini hanya informasi) → kandidat berikutnya.
5. ✅ SELESAI — Musim memengaruhi gameplay + peringatan Pergeseran Besar. Cek manual: ubah jam perangkat ke 30 Nov 20:00 → toast & banner muncul dalam ≤30 dtk.
6. Suku pertama: peti bersama & nama suku untuk satu room (maks 8 pemain).
7. Pindahkan teks Eden ke i18n (id/en) — kini juga mencakup teks peringatan/laporan baru.
8. Perbaikan bangunan (pulihkan HP, bahan bata/besi), visual kebun menurut `growth`, dan tombol "panen semua".

## 10. Prompt awal untuk melanjutkan bersama Claude
> Baca `HANDOFF.md` dan `README.md` di repo PRIMORDIA. Lanjutkan dari bagian Backlog nomor …, ikuti Konvensi kode, tulis tes untuk logika murni, lalu perbarui HANDOFF.md.
