# Supabase Cloud Setup Guide — PRIMORDIA

PRIMORDIA works 100% offline in **Local Guest Mode** out of the box. To enable cloud saves, conflict resolution, settings synchronization, and the validated global leaderboard, connect a free Supabase project:

## 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open **Project Settings → API** and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (Never copy or expose the `service_role` secret key in the frontend).

## 2. Run Database Schema & RLS Policies
**Cara cepat:** jalankan satu file `supabase/setup-all.sql` di SQL Editor (gabungan semua di bawah, aman diulang), lalu lanjut ke langkah 3.

Atau manual:
1. In the Supabase dashboard, open **SQL Editor**.
2. Paste and run `supabase/schema.sql` (creates `cloud_saves`, `user_settings`, `leaderboard`, and the rate-limited `submit_validated_score` Postgres RPC).
3. Paste and run `supabase/policies.sql` (configures row-level security policies and restricts direct leaderboard writes).

## 3. Configure Environment Variables
Create a `.env` file (or set GitHub Actions Repository Secrets for GitHub Pages builds):

```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-public-anon-key"
```

## 4. Enable Email / Magic Link Auth
In **Authentication → Providers**, ensure **Email** is enabled and add your GitHub Pages URL (e.g. `https://username.github.io/primordia/`) to **Authentication → URL Configuration → Redirect URLs**.

## 5. Login dengan Google (opsional)
1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID (Web)**. Tambahkan **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → **Authentication → Providers → Google**: aktifkan, isi Client ID dan Client Secret.
3. Supabase → **Authentication → URL Configuration**: isi **Site URL** dan **Redirect URLs** dengan alamat game (mis. `https://kalfinstudio-ux.github.io/primordia/`).
4. Jalankan `supabase/migration-auth-google.sql` di SQL Editor (membuat profil otomatis untuk akun baru).
5. Project lama: jalankan juga `supabase/migration-stage2.sql` sekali. Project baru: cukup `schema.sql` lalu `policies.sql`.

## 6. Mode Online / Multiplayer Tahap A (opsional)
Tidak perlu SQL tambahan. Fitur ini hanya memakai **Realtime Broadcast + Presence**, yang aktif secara bawaan di project Supabase.
- Pemain dengan **seed dunia yang sama** masuk ke kamar yang sama (`primordia:<seed>:<nomor>`), maksimal 8 pemain per kamar; pemain ke-9 dan seterusnya otomatis pindah ke kamar berikutnya.
- Yang dikirim ke pemain lain: nama, penampilan, posisi, arah, dan animasi. Inventaris, save, dan data akun tidak pernah dikirim.
- Bawaan: aktif untuk semua pemain (tamu maupun login). Pemain bisa mematikannya di menu Jeda → Mode Online.
- Agar pemain saling bertemu, mereka harus memakai **seed dunia yang sama** (bawaan `HADEAN-01`).
- Kamar bersifat publik (siapa pun yang tahu nama kamar dan anon key bisa ikut mendengar). Data yang beredar hanya yang tercantum di atas. Pelanggaran/cheat belum dicegah di Tahap A (tanpa server otoritatif).
- Free tier Supabase memiliki batas koneksi Realtime bersamaan dan pesan per detik; cek **Project Settings → Realtime** / halaman harga untuk angka terbarunya.
