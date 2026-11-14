-- PRIMORDIA Supabase Row Level Security Policies
-- Run this after schema.sql in your Supabase SQL Editor

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.game_saves enable row level security;
alter table public.leaderboard enable row level security;

-- Profiles: users can only read/write their own profile
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- User Settings: users can only read/write their own settings
create policy "Users read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users upsert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Game Saves: users can only read/write/delete their own save slots
create policy "Users read own saves"
  on public.game_saves for select
  using (auth.uid() = user_id);

create policy "Users insert own saves"
  on public.game_saves for insert
  with check (auth.uid() = user_id);

create policy "Users update own saves"
  on public.game_saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own saves"
  on public.game_saves for delete
  using (auth.uid() = user_id);

-- Leaderboard: publicly readable, users can only write their own score
create policy "Public read leaderboard"
  on public.leaderboard for select
  using (true);

create policy "Users insert own score"
  on public.leaderboard for insert
  with check (auth.uid() = user_id);

create policy "Users update own score"
  on public.leaderboard for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
