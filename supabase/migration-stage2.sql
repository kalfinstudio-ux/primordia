-- PRIMORDIA: Stage 2 migration for an EXISTING Supabase project (run once in SQL Editor).
-- Use this instead of re-running schema.sql / policies.sql, which are meant for fresh projects.

-- 1) Limit score range on the existing table
alter table public.leaderboard drop constraint if exists leaderboard_score_range;
alter table public.leaderboard add constraint leaderboard_score_range check (score >= 0 and score <= 1000000);

-- 2) Server-validated score submission (15s rate limit, only increases, capped jumps)
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

-- 3) Remove direct client writes; only the RPC may write scores
drop policy if exists "Users insert own score" on public.leaderboard;
drop policy if exists "Users update own score" on public.leaderboard;
revoke insert, update, delete on public.leaderboard from anon, authenticated;
grant execute on function public.submit_validated_score(integer) to authenticated;
