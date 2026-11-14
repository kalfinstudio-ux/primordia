-- ============================================================================
-- PRIMORDIA — FITUR SOSIAL: profil publik, teman, pesan.
-- Jalankan sekali di Supabase SQL Editor (aman diulang). Prasyarat: setup-all.sql
-- (atau schema.sql + migration-eden.sql) sudah dijalankan.
-- Privasi: email & username akun TIDAK pernah dibagikan; hanya nama karakter
-- (display_name), umur, jumlah kematian, dan skor.
-- ============================================================================

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
