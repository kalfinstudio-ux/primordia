-- PRIMORDIA Supabase Row Level Security Policies (Stage 2)
-- Run this after schema.sql in your Supabase SQL Editor

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.game_saves enable row level security;
alter table public.leaderboard enable row level security;

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

-- Leaderboard: public read only; writes are enforced exclusively through submit_validated_score() RPC
create policy "Public read leaderboard"
  on public.leaderboard for select
  using (true);

revoke insert, update, delete on public.leaderboard from anon, authenticated;
grant execute on function public.submit_validated_score(integer) to authenticated;
