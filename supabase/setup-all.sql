-- ============================================================================
-- PRIMORDIA — SETUP SUPABASE LENGKAP (satu file, aman dijalankan berulang)
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste semua → Run.
-- Gabungan: schema + policies + eden + presence + auth-google.
-- Multiplayer (Realtime Broadcast/Presence) TIDAK butuh tabel; ia aktif otomatis.
-- ============================================================================

-- ---------- 1) TABEL ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists born_at timestamptz;
alter table public.profiles add column if not exists deaths integer not null default 0;
alter table public.profiles add column if not exists last_seen_at timestamptz;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot integer not null check (slot >= 1 and slot <= 5),
  world_seed text not null,
  player_state jsonb not null default '{}'::jsonb,
  world_state jsonb not null default '{}'::jsonb,
  playtime integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, slot)
);

create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.leaderboard drop constraint if exists leaderboard_score_range;
alter table public.leaderboard add constraint leaderboard_score_range check (score >= 0 and score <= 1000000);

create index if not exists idx_game_saves_user_slot on public.game_saves (user_id, slot);
create index if not exists idx_leaderboard_score on public.leaderboard (score desc);

-- ---------- 2) ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.game_saves enable row level security;
alter table public.leaderboard enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users read own settings" on public.user_settings;
create policy "Users read own settings" on public.user_settings for select using (auth.uid() = user_id);
drop policy if exists "Users upsert own settings" on public.user_settings;
create policy "Users upsert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own settings" on public.user_settings;
create policy "Users update own settings" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own saves" on public.game_saves;
create policy "Users read own saves" on public.game_saves for select using (auth.uid() = user_id);
drop policy if exists "Users insert own saves" on public.game_saves;
create policy "Users insert own saves" on public.game_saves for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own saves" on public.game_saves;
create policy "Users update own saves" on public.game_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete own saves" on public.game_saves;
create policy "Users delete own saves" on public.game_saves for delete using (auth.uid() = user_id);

drop policy if exists "Users insert own score" on public.leaderboard;
drop policy if exists "Users update own score" on public.leaderboard;
drop policy if exists "Public read leaderboard" on public.leaderboard;
create policy "Public read leaderboard" on public.leaderboard for select using (true);

revoke insert, update, delete on public.leaderboard from anon, authenticated;
revoke update (born_at, deaths, last_seen_at) on public.profiles from anon, authenticated;

-- ---------- 3) FUNGSI (RPC) ----------
create or replace function public.submit_validated_score(p_score integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing integer;
  v_last_update timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_score < 0 or p_score > 250000 then raise exception 'Invalid score bounds'; end if;

  select score, updated_at into v_existing, v_last_update
  from public.leaderboard where user_id = v_uid;

  if v_last_update is not null and (now() - v_last_update) < interval '15 seconds' then
    return false;
  end if;

  if v_existing is null then
    insert into public.leaderboard (user_id, score, updated_at) values (v_uid, p_score, now());
  elsif p_score > v_existing and (p_score - v_existing) <= 25000 then
    update public.leaderboard set score = p_score, updated_at = now() where user_id = v_uid;
  end if;
  return true;
end;
$$;

create or replace function public.sync_immortal_age()
returns table (born_at timestamptz, age_seconds bigint, deaths integer)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  insert into public.profiles (id, username, born_at, last_seen_at)
  values (v_uid, 'Adam', now(), now())
  on conflict (id) do update
    set born_at = coalesce(public.profiles.born_at, now());

  return query
    select p.born_at, floor(extract(epoch from (now() - p.born_at)))::bigint, p.deaths
    from public.profiles p where p.id = v_uid;
end;
$$;

create or replace function public.record_death()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deaths integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.profiles set deaths = deaths + 1 where id = v_uid returning deaths into v_deaths;
  return v_deaths;
end;
$$;

create or replace function public.presence_ping()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prev timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select last_seen_at into v_prev from public.profiles where id = v_uid for update;
  update public.profiles set last_seen_at = now() where id = v_uid;

  if v_prev is null then return null; end if;
  return greatest(0, floor(extract(epoch from (now() - v_prev))))::bigint;
end;
$$;

grant execute on function public.submit_validated_score(integer) to authenticated;
grant execute on function public.sync_immortal_age() to authenticated;
grant execute on function public.record_death() to authenticated;
grant execute on function public.presence_ping() to authenticated;

-- ---------- 4) PROFIL OTOMATIS UNTUK AKUN BARU (Google / email / magic link) ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

insert into public.profiles (id, username, avatar_config)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'name', ''),
                nullif(u.raw_user_meta_data->>'full_name', ''),
                nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                'Penjelajah'),
       '{}'::jsonb
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------- SELESAI ----------
-- Multiplayer: tidak ada SQL tambahan. Pastikan di Dashboard →
-- Project Settings → Realtime: "Allow public access" tetap ON.
