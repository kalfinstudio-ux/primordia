#!/usr/bin/env python3
"""Tempelkan Bruk M3 ke SceneManager.ts dan HANDOFF.md. Aman dijalankan ulang (lewati yang sudah terpasang)
dan berhenti dengan pesan jelas bila ada titik yang tidak ditemukan (tidak menulis setengah jadi)."""
import sys

def patch(path, edits):
    s = open(path, encoding='utf-8').read()
    out = s
    for marker, old, new in edits:
        if marker in out:
            continue  # sudah terpasang
        if out.count(old) != 1:
            sys.exit(f"GAGAL: {path}: titik tempel tidak ditemukan/ganda untuk: {old[:70]!r}\n(file tidak diubah)")
        out = out.replace(old, new, 1)
    if out != s:
        open(path, 'w', encoding='utf-8').write(out)
        print(f"diubah : {path}")
    else:
        print(f"sudah  : {path}")

patch('src/game/scenes/SceneManager.ts', [
    ("import { BrukBody }", "import { RemotePlayersSystem } from '../world/remotePlayers';\n",
     "import { RemotePlayersSystem } from '../world/remotePlayers';\nimport { BrukBody } from '../world/brukBody';\n"),
    ("private brukBody!", "  private remotePlayers!: RemotePlayersSystem;\n",
     "  private remotePlayers!: RemotePlayersSystem;\n  private brukBody!: BrukBody;\n"),
    ("new BrukBody(", "    this.remotePlayers = new RemotePlayersSystem(this.engine.scene, this.assets.contactShadowTexture);\n",
     "    this.remotePlayers = new RemotePlayersSystem(this.engine.scene, this.assets.contactShadowTexture);\n    this.brukBody = new BrukBody(this.engine.scene, this.spatialHash);\n    void this.brukBody.load();\n"),
    ("this.brukBody.reset(", "    this.bruk.reset();\n",
     "    this.bruk.reset();\n    this.brukBody.reset(this.terrain);\n"),
    ("this.brukBody.setVisible(false)", "    this.character.root.visible = false;\n    multiplayer.leave();",
     "    this.character.root.visible = false;\n    this.brukBody.setVisible(false);\n    multiplayer.leave();"),
    ("this.brukBody.update(", "      this.buildingGhost.update(this.terrain);\n",
     "      this.buildingGhost.update(this.terrain);\n      this.brukBody.update(dt, elapsed, {\n        playerX: pos.x,\n        playerZ: pos.z,\n        camera: this.engine.camera,\n        weather: this.weather.currentWeather,\n        lowGfx: gameState.settings.graphics.preset === 'low',\n      });\n"),
    ("this.brukBody?.dispose()", "    this.remotePlayers?.dispose();\n",
     "    this.remotePlayers?.dispose();\n    this.brukBody?.dispose();\n"),
])

M3 = """### M3 — Bruk muncul di dunia (SELESAI di kode; BELUM dilihat di three.js/browser)
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

"""
patch('HANDOFF.md', [
    ("### M3 — Bruk muncul di dunia", "## 0k. Perubahan v23", M3 + "## 0k. Perubahan v23"),
    ("M3 selesai di kode", "M1 selesai (model + pratinjau, BELUM dilihat di three.js) · M2 selesai · M3, M4, M5 belum.",
     "M1 selesai (model + pratinjau, BELUM dilihat di three.js) · M2 selesai · M3 selesai di kode (BELUM dilihat di browser; lihat M3) · M4, M5 belum."),
])
