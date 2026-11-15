-- ============================================================================
-- PRIMORDIA — SETUP SUPABASE LENGKAP (satu file, aman dijalankan berulang)
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste semua → Run.
-- Gabungan: schema + policies + eden + presence + auth-google + sosial (teman & pesan).
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

-- ---------- 5) FITUR SOSIAL: profil publik, teman, pesan ----------
-- ---------- 1) NAMA TAMPIL PUBLIK ----------
alter table public.profiles add column if not exists display_name text;
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 16);

-- ---------- 2) TABEL ----------
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists uq_friend_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists idx_friend_addressee on public.friendships (addressee);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender <> recipient)
);
create index if not exists idx_messages_pair
  on public.messages (least(sender, recipient), greatest(sender, recipient), id desc);
create index if not exists idx_messages_unread
  on public.messages (recipient) where read_at is null;

-- ---------- 3) RLS: baca hanya milik sendiri, tulis hanya lewat fungsi ----------
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Read own friendships" on public.friendships;
create policy "Read own friendships" on public.friendships
  for select using (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "Read own messages" on public.messages;
create policy "Read own messages" on public.messages
  for select using (auth.uid() = sender or auth.uid() = recipient);

revoke insert, update, delete on public.friendships from anon, authenticated;
revoke insert, update, delete on public.messages from anon, authenticated;

-- ---------- 4) FUNGSI ----------
create or replace function public.set_display_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_name := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>[:cntrl:]]', '', 'g')), 16);
  if v_name = '' then v_name := 'Penjelajah'; end if;
  insert into public.profiles (id, username, display_name)
  values (v_uid, 'Penjelajah', v_name)
  on conflict (id) do update set display_name = excluded.display_name;
  return v_name;
end;
$$;

create or replace function public.get_public_profile(p_user uuid)
returns table (display_name text, born_at timestamptz, age_seconds bigint,
               deaths integer, score integer, friend_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_f public.friendships;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_f from public.friendships f
  where (f.requester = v_uid and f.addressee = p_user)
     or (f.requester = p_user and f.addressee = v_uid);

  return query
    select coalesce(p.display_name, 'Penjelajah'),
           p.born_at,
           case when p.born_at is null then 0::bigint
                else floor(extract(epoch from (now() - p.born_at)))::bigint end,
           p.deaths,
           coalesce((select l.score from public.leaderboard l where l.user_id = p.id), 0),
           case when p.id = v_uid then 'self'
                when v_f.id is null then 'none'
                when v_f.status = 'accepted' then 'friends'
                when v_f.requester = v_uid then 'sent'
                else 'received' end
    from public.profiles p
    where p.id = p_user;
end;
$$;

create or replace function public.send_friend_request(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_f public.friendships;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_user is null or p_user = v_uid then raise exception 'Invalid user'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  select * into v_f from public.friendships f
  where (f.requester = v_uid and f.addressee = p_user)
     or (f.requester = p_user and f.addressee = v_uid);

  if v_f.id is not null then
    if v_f.status = 'accepted' then return 'friends'; end if;
    if v_f.requester = p_user then
      update public.friendships set status = 'accepted' where id = v_f.id;
      return 'friends';
    end if;
    return 'sent';
  end if;

  if (select count(*) from public.friendships
      where requester = v_uid and status = 'pending') >= 50 then
    raise exception 'Too many pending requests';
  end if;

  insert into public.friendships (requester, addressee) values (v_uid, p_user);
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
    where requester = p_user and addressee = v_uid and status = 'pending';
    return 'friends';
  end if;
  delete from public.friendships
  where requester = p_user and addressee = v_uid and status = 'pending';
  return 'none';
end;
$$;

-- Hapus teman, atau batalkan permintaan yang kamu kirim.
create or replace function public.remove_friend(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  delete from public.friendships f
  where (f.requester = v_uid and f.addressee = p_user)
     or (f.requester = p_user and f.addressee = v_uid and f.status = 'accepted');
  return true;
end;
$$;

create or replace function public.list_social()
returns table (other_id uuid, name text, relation text, unread bigint, last_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  return query
    select o.other_id,
           coalesce(p.display_name, 'Penjelajah'),
           o.relation,
           (select count(*) from public.messages m
             where m.sender = o.other_id and m.recipient = v_uid and m.read_at is null),
           (select max(m.created_at) from public.messages m
             where (m.sender = o.other_id and m.recipient = v_uid)
                or (m.sender = v_uid and m.recipient = o.other_id))
    from (
      select case when f.requester = v_uid then f.addressee else f.requester end as other_id,
             case when f.status = 'accepted' then 'friend'
                  when f.requester = v_uid then 'outgoing'
                  else 'incoming' end as relation
      from public.friendships f
      where f.requester = v_uid or f.addressee = v_uid
    ) o
    left join public.profiles p on p.id = o.other_id
    order by o.relation, 5 desc nulls last;
end;
$$;

create or replace function public.send_message(p_user uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'Invalid message length';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = v_uid and f.addressee = p_user)
        or (f.requester = p_user and f.addressee = v_uid))
  ) then
    raise exception 'Not friends';
  end if;
  if exists (select 1 from public.messages m
             where m.sender = v_uid and m.created_at > now() - interval '1 second') then
    raise exception 'Too fast';
  end if;
  insert into public.messages (sender, recipient, body) values (v_uid, p_user, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ambil percakapan (terbaru max p_limit, urut lama→baru) dan tandai pesan masuk sudah dibaca.
create or replace function public.get_messages(p_user uuid, p_limit integer default 50)
returns table (msg_id bigint, mine boolean, body text, sent_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.messages set read_at = now()
  where recipient = v_uid and sender = p_user and read_at is null;
  return query
    select s.id, s.sender = v_uid, s.body, s.created_at
    from (
      select m.id, m.sender, m.body, m.created_at
      from public.messages m
      where (m.sender = v_uid and m.recipient = p_user)
         or (m.sender = p_user and m.recipient = v_uid)
      order by m.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) s
    order by s.id;
end;
$$;

create or replace function public.unread_count()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  return (select count(*) from public.messages m where m.recipient = v_uid and m.read_at is null);
end;
$$;

-- ---------- 5) HAK AKSES ----------
revoke execute on function
  public.set_display_name(text), public.get_public_profile(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.list_social(), public.send_message(uuid, text),
  public.get_messages(uuid, integer), public.unread_count()
from public, anon;
grant execute on function
  public.set_display_name(text), public.get_public_profile(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.list_social(), public.send_message(uuid, text),
  public.get_messages(uuid, integer), public.unread_count()
to authenticated;

-- ---------- SELESAI ----------
-- Multiplayer: tidak ada SQL tambahan. Pastikan di Dashboard →
-- Project Settings → Realtime: "Allow public access" tetap ON.

-- ============================================================
-- PERBAIKAN KEAMANAN profiles (audit Nov 2026) — lihat migration-fix-profile-privileges.sql
-- ============================================================
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, avatar_config) on public.profiles to authenticated;
grant update (id, username, avatar_config) on public.profiles to authenticated;

-- ============================================================
-- HARDENING UMUR ABADI, MERGE TAMU, & PROFIL PUBLIK (idempoten)
-- Aman dijalankan ulang berkali-kali di SQL Editor.
-- ============================================================
create or replace function public.compute_wisdom_points(p_age_seconds bigint)
returns integer language sql immutable as $$
  select (
    case when coalesce(p_age_seconds, 0) >= 7 * 86400 then 1 else 0 end +
    case when coalesce(p_age_seconds, 0) >= 30 * 86400 then 2 else 0 end +
    case when coalesce(p_age_seconds, 0) >= 100 * 86400 then 3 else 0 end +
    case when coalesce(p_age_seconds, 0) >= 365 * 86400 then 5 else 0 end
  )::integer;
$$;

drop function if exists public.sync_immortal_age();
drop function if exists public.sync_immortal_age(timestamptz);
create or replace function public.sync_immortal_age(p_guest_born_at timestamptz default null)
returns table (born_at timestamptz, age_seconds bigint, deaths integer, wisdom_points integer)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_min_born timestamptz := greatest(timestamptz '2026-01-01T00:00:00Z', now() - interval '30 days');
  v_safe_born timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if p_guest_born_at is not null then
    v_safe_born := least(now(), greatest(v_min_born, p_guest_born_at));
  else
    v_safe_born := now();
  end if;

  -- Atomik & anti-rewind: born_at HANYA diisi jika belum ada; akun lama tidak bisa dimundurkan.
  insert into public.profiles (id, username, born_at, last_seen_at)
  values (v_uid, 'Adam', v_safe_born, now())
  on conflict (id) do update
    set born_at = coalesce(public.profiles.born_at, excluded.born_at),
        last_seen_at = coalesce(public.profiles.last_seen_at, now());

  return query
    select p.born_at,
           greatest(0, floor(extract(epoch from (now() - p.born_at))))::bigint as age_seconds,
           p.deaths,
           public.compute_wisdom_points(greatest(0, floor(extract(epoch from (now() - p.born_at))))::bigint)
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
  -- Pastikan baris profil selalu ada agar kematian pertama tidak mengembalikan null.
  insert into public.profiles (id, username, born_at, deaths, last_seen_at)
  values (v_uid, 'Adam', now(), 1, now())
  on conflict (id) do update
    set deaths = public.profiles.deaths + 1,
        born_at = coalesce(public.profiles.born_at, now())
  returning deaths into v_deaths;
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

  insert into public.profiles (id, username, born_at, last_seen_at)
  values (v_uid, 'Adam', now(), null)
  on conflict (id) do nothing;

  select last_seen_at into v_prev from public.profiles where id = v_uid for update;
  update public.profiles set last_seen_at = now() where id = v_uid;

  if v_prev is null then return null; end if;
  return greatest(0, floor(extract(epoch from (now() - v_prev))))::bigint;
end;
$$;

drop function if exists public.get_public_profile(uuid);
create or replace function public.get_public_profile(p_user uuid)
returns table (display_name text, born_at timestamptz, age_seconds bigint,
               deaths integer, wisdom_points integer, score integer, friend_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_f public.friendships;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_f from public.friendships f
  where (f.requester = v_uid and f.addressee = p_user)
     or (f.requester = p_user and f.addressee = v_uid);

  return query
    select coalesce(p.display_name, 'Penjelajah'),
           p.born_at,
           case when p.born_at is null then 0::bigint
                else greatest(0, floor(extract(epoch from (now() - p.born_at))))::bigint end,
           p.deaths,
           case when p.born_at is null then 0
                else public.compute_wisdom_points(greatest(0, floor(extract(epoch from (now() - p.born_at))))::bigint) end,
           coalesce((select l.score from public.leaderboard l where l.user_id = p.id), 0),
           case when p.id = v_uid then 'self'
                when v_f.id is null then 'none'
                when v_f.status = 'accepted' then 'friends'
                when v_f.requester = v_uid then 'sent'
                else 'received' end
    from public.profiles p
    where p.id = p_user;
end;
$$;

revoke execute on function
  public.sync_immortal_age(timestamptz), public.record_death(),
  public.presence_ping(), public.get_public_profile(uuid)
from public, anon;
grant execute on function
  public.sync_immortal_age(timestamptz), public.record_death(),
  public.presence_ping(), public.get_public_profile(uuid)
to authenticated;

