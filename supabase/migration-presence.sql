-- PRIMORDIA: anti-curang offline (Backlog #3). Jalankan SETELAH migration-eden.sql, sekali di SQL Editor.
-- Lama pemain pergi dihitung di SERVER dari profiles.last_seen_at — client tidak bisa memalsukannya.

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Client tidak boleh menulis last_seen_at langsung (hanya lewat presence_ping)
revoke update (last_seen_at) on public.profiles from anon, authenticated;

-- sync_immortal_age TIDAK lagi menimpa last_seen_at (kalau tidak, waktu pergi hilang sebelum sempat dibaca)
create or replace function public.sync_immortal_age()
returns table (born_at timestamptz, age_seconds bigint, deaths integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, username, born_at, last_seen_at)
  values (v_uid, 'Adam', now(), now())
  on conflict (id) do update
    set born_at = coalesce(public.profiles.born_at, now());

  return query
    select p.born_at,
           floor(extract(epoch from (now() - p.born_at)))::bigint,
           p.deaths
    from public.profiles p
    where p.id = v_uid;
end;
$$;

-- Kembalikan detik sejak terakhir terlihat (null bila belum pernah), lalu perbarui last_seen_at.
-- Dipanggil saat memuat dunia (hasilnya dipakai) dan tiap 60 dtk sebagai denyut (hasilnya diabaikan).
create or replace function public.presence_ping()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prev timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select last_seen_at into v_prev from public.profiles where id = v_uid for update;
  update public.profiles set last_seen_at = now() where id = v_uid;

  if v_prev is null then
    return null;
  end if;
  return greatest(0, floor(extract(epoch from (now() - v_prev))))::bigint;
end;
$$;

grant execute on function public.sync_immortal_age() to authenticated;
grant execute on function public.presence_ping() to authenticated;
