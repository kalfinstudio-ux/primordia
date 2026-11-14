-- PRIMORDIA: Era Adam & Hawa — umur abadi tersimpan di profil Supabase (jalankan sekali di SQL Editor).
-- Umur dihitung di SERVER dari born_at sehingga tidak bisa dipalsukan client.

alter table public.profiles add column if not exists born_at timestamptz;
alter table public.profiles add column if not exists deaths integer not null default 0;
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Pemain tidak boleh mengubah born_at / deaths lewat update langsung
revoke update (born_at, deaths) on public.profiles from anon, authenticated;

-- Ambil (atau buat sekali) tanggal lahir abadi + umur dalam detik
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
    set born_at = coalesce(public.profiles.born_at, now()),
        last_seen_at = now();

  return query
    select p.born_at,
           floor(extract(epoch from (now() - p.born_at)))::bigint,
           p.deaths
    from public.profiles p
    where p.id = v_uid;
end;
$$;

-- Catat kematian (respawn). Umur TIDAK direset — hanya penghitung kematian.
create or replace function public.record_death()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deaths integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  update public.profiles set deaths = deaths + 1 where id = v_uid returning deaths into v_deaths;
  return v_deaths;
end;
$$;

grant execute on function public.sync_immortal_age() to authenticated;
grant execute on function public.record_death() to authenticated;
