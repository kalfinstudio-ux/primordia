-- PRIMORDIA: dukungan login Google / OAuth (jalankan sekali di Supabase SQL Editor).
-- Aman dijalankan ulang. Tidak mengubah tabel/policy yang sudah ada.
-- Prasyarat: tabel public.profiles sudah ada (dari schema.sql atau project lama).

-- 1) Buat profil otomatis untuk setiap akun baru (Google, magic link, email/password).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_config)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Penjelajah'
    ),
    '{}'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Isi profil untuk akun yang sudah terlanjur dibuat tanpa profil.
insert into public.profiles (id, username, avatar_config)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Penjelajah'
  ),
  '{}'::jsonb
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
