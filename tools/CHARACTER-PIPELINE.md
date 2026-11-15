# Menyiapkan karakter manusia berangka (Fase 1)

Target: HP murah/lama. Anggaran ada di `CHARACTER_BUDGET` (`src/game/data/assets.ts`):
**≤ 8.000 segitiga, ≤ 2 MB, tekstur ≤ 512 px (maks 1024), rangka ≤ 75 sendi, klip inti idle/walk/run.**
Model yang tidak lolos tidak bisa dipasang ke peran Karakter pemain / Adam / Hawa di Galeri Aset.

## 1. Pilih tubuh dan rangka (Mixamo)
1. Masuk ke mixamo.com (akun Adobe gratis). Pilih karakter bawaan Mixamo **atau** unggah model sendiri (FBX/OBJ, pose-T) agar dirigkan otomatis.
2. Unduh karakter: FBX, **With Skin**, pose-T.
3. Unduh klip satu per satu: **Without Skin**, FPS 30, "In Place" dicentang untuk locomotion:
   `Idle`, `Walking`, `Running`, `Jump`, `Falling Idle`, `Treading Water` (renang), `Mining`/`Gathering` (mine), `Hit Reaction` (hurt), `Dying` (death).
4. **Periksa lisensi** di halaman FAQ/Terms Mixamo (Adobe) sebelum rilis publik; catat hasilnya. Saya (Claude) tidak bisa memverifikasi syaratnya dari sandbox.

## 2. Gabung & ekspor (Blender)
1. Impor karakter ber-skin, lalu impor tiap klip (tanpa skin) dan pindahkan Action-nya ke rangka karakter (NLA/Action Editor). Beri nama klip: `Idle`, `Walk`, `Run`, `Jump`, `Fall`, `Swim`, `Mine`, `Hurt`, `Death` (nama harus memuat alias di `CLIP_ALIASES`).
2. Kurangi poligon: Decimate pada badan/pakaian sampai ≤ 8.000 segitiga total (lihat statistik di Galeri Aset).
3. Ekspor **glTF Binary (.glb)**, centang *Animation*, *Skinning*; bentuk badan menghadap **+Z**, kaki di y = 0.

## 3. Kecilkan
```bash
npx @gltf-transform/cli optimize hero.glb hero-opt.glb --compress meshopt --texture-compress webp --texture-size 512
```
(butuh internet; jalankan di Codespace). Bila gagal, `tools/compress_glb.py` untuk tekstur.

## 4. Masukkan ke game
1. Taruh `.glb` di `public/play/models/`, tambahkan ke `ASSET_FILES` (`assets.ts`).
2. Tambahkan entri di `ASSET_LICENSES` (`license` + `source`) **setelah** lisensi diperiksa, dan tulis atribusi di `ui/CreditsScreen.tsx`.
3. Buka Galeri Aset: kotak **Gerbang karakter** harus hijau. Lalu pilih "Karakter pemain" dan muat permainan; cek arah hadap, skala, dan transisi animasi di HP.
