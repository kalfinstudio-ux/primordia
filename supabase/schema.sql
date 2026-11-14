-- PRIMORDIA Supabase Database Schema (Stage 2)
-- Run this first in your Supabase SQL Editor

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
  score integer not null default 0 check (score >= 0 and score <= 1000000),
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_saves_user_slot on public.game_saves (user_id, slot);
create index if not exists idx_leaderboard_score on public.leaderboard (score desc);

-- Server-validated score submission RPC with rate-limit cooldown (15s) and non-decreasing/anti-spike check
create or replace function public.submit_validated_score(p_score integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing integer;
  v_last_update timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_score < 0 or p_score > 250000 then
    raise exception 'Invalid score bounds';
  end if;

  select score, updated_at into v_existing, v_last_update
  from public.leaderboard
  where user_id = v_uid;

  if v_last_update is not null and (now() - v_last_update) < interval '15 seconds' then
    return false;
  end if;

  if v_existing is null then
    insert into public.leaderboard (user_id, score, updated_at)
    values (v_uid, p_score, now());
  elsif p_score > v_existing and (p_score - v_existing) <= 25000 then
    update public.leaderboard
    set score = p_score, updated_at = now()
    where user_id = v_uid;
  end if;

  return true;
end;
$$;
