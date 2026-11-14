-- PRIMORDIA Supabase Database Schema
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
  score integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_saves_user_slot on public.game_saves (user_id, slot);
create index if not exists idx_leaderboard_score on public.leaderboard (score desc);
