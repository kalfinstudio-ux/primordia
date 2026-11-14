# HANDOFF — PRIMORDIA (Era Adam & Hawa)

Dokumen serah-terima agar pengembangan bisa dilanjutkan oleh siapa pun (manusia atau Claude) tanpa konteks percakapan sebelumnya.
Terakhir diperbarui: 14 November 2026.

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
Project baru: `schema.sql` → `policies.sql` → `migration-eden.sql`.
Project lama: `migration-stage2.sql` → `migration-auth-google.sql` → `migration-eden.sql`.
`migration-eden.sql` menambah `profiles.born_at`, `deaths`, `last_seen_at`, serta RPC `sync_immortal_age()` dan `record_death()`.
**Wajib dijalankan** agar umur abadi tersimpan di profil.

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
4. Waktu offline & daftar perk berasal dari save lokal → bisa dimanipulasi (umur tetap dari server).
5. Cuaca di laporan adalah kronik deterministik dari kalender; cuaca saat bermain (`world/weather.ts`) masih acak → belum selaras.
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
- [ ] Login Supabase → `profiles.born_at` terisi; umur tidak reset setelah mati.

## 9. Backlog (urutan saran)
1. Hubungkan aset: tanya pemilik pembagian peran; konversi USDZ; ganti karakter Adam/Hawa.
2. Cuaca saat bermain mengikuti kronik (`weatherForBlock`) agar selaras dengan laporan.
3. Anti-curang offline: hitung waktu pergi di server (`last_seen_at` sudah ada di profil).
4. Offline lanjutan: tanaman tumbuh, tambang otomatis, badai merusak bangunan tanpa pelindung.
5. Peristiwa kalender nyata: musim memengaruhi gameplay; peringatan "Pergeseran Besar" beberapa jam sebelum tanggal 1.
6. Suku pertama: peti bersama & nama suku untuk satu room (maks 8 pemain).
7. Pindahkan teks Eden ke i18n (id/en).

## 10. Prompt awal untuk melanjutkan bersama Claude
> Baca `HANDOFF.md` dan `README.md` di repo PRIMORDIA. Lanjutkan dari bagian Backlog nomor …, ikuti Konvensi kode, tulis tes untuk logika murni, lalu perbarui HANDOFF.md.
