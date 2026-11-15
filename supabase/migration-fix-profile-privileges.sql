-- PRIMORDIA: PERBAIKAN KEAMANAN (audit Nov 2026) — jalankan SEKALI di Supabase SQL Editor,
-- SETELAH migration-eden.sql dan migration-presence.sql.
--
-- Masalah: `revoke update (born_at, deaths)` pada migration-eden.sql tidak berlaku karena role
-- `authenticated` sudah punya izin UPDATE di TINGKAT TABEL (bawaan Supabase + policy
-- "Users update own profile"). Izin tabel mencakup semua kolom, jadi pemain bisa mengubah
-- born_at / deaths / last_seen_at miliknya sendiri lewat API.
--
-- Perbaikan: cabut izin tingkat tabel, lalu beri izin HANYA pada kolom yang memang boleh
-- diubah klien. born_at/deaths/last_seen_at hanya berubah lewat fungsi SECURITY DEFINER
-- (sync_immortal_age, record_death, presence_ping) yang tetap berjalan normal.
-- net/auth.ts melakukan upsert (id, username, avatar_config); PostgREST memasukkan `id` ke SET, jadi UPDATE (id) ikut diberi (RLS tetap mewajibkan auth.uid() = id).

revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, avatar_config) on public.profiles to authenticated;
grant update (id, username, avatar_config) on public.profiles to authenticated;

-- (Opsional tapi disarankan) pastikan RPC hanya bisa dipanggil pengguna login:
revoke execute on function public.sync_immortal_age() from anon, public;
revoke execute on function public.record_death() from anon, public;
revoke execute on function public.presence_ping() from anon, public;
grant execute on function public.sync_immortal_age() to authenticated;
grant execute on function public.record_death() to authenticated;
grant execute on function public.presence_ping() to authenticated;

-- VERIFIKASI 1: hasil query ini TIDAK boleh memuat born_at, deaths, atau last_seen_at.
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and privilege_type in ('INSERT', 'UPDATE')
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type, column_name;

-- VERIFIKASI 2 (dari konsol browser, login sebagai pemain biasa) — harus GAGAL "permission denied":
--   await supabase.from('profiles').update({ born_at: '2026-01-01T00:00:00Z' }).eq('id', userId)
--   await supabase.from('profiles').update({ deaths: 0 }).eq('id', userId)
