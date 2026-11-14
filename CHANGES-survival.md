# Penyeimbangan survival (tanpa ubah arsitektur)

Semua angka ada di `src/game/data/balance.ts`; tes di `src/game/balance.test.ts`.

1. **Oksigen** – drain gas 6,5 → 2,0 per level toksik (toxic 0,5 Survivor ≈ 100 dtk, dulu ±30); regen udara bersih 14 → 24/dtk.
2. **Peringatan** – bar oksigen berkedip <40%, toast, panah ke udara bersih/shelter terdekat, status SESAK 5 dtk sebelum nyawa turun, damage oksigen 8 → 3/dtk.
3. **Masa aman awal** – 3 menit tanpa event dunia & tanpa cuaca berbahaya; radius 150 m dari spawn dibatasi gas (maks 0,3). Tidak berlaku di Hadean.
4. **gas_filter awal** – 2 buah (Explorer/Survivor); Hadean 0.
5. **Kematian ramah** – respawn di shelter/beacon terdekat (atau spawn), barang jadi “kantong” (pilar cahaya kuning, tekan [E]); maks 3 kantong (kelebihan digabung); tersimpan di save/cloud. Bekal darurat 1 filter saat bangkit (bukan Hadean).
6. **Explorer** jadi default pemain baru; pengali Hadean tetap 1,5.
7. Angka dipindah ke `balance.ts` + 17 tes baru.
