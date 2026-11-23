-- ============================================================
-- 001_domino_init.sql — Domino — Schéma initial + RLS + Realtime
-- Projet Supabase partagé avec Cloverly et Ludo : tout est préfixé domino_
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================

-- ---- Profils (pseudo + statistiques) ----
-- Les comptes Supabase (auth.users) sont communs avec Ludo : un même pseudo désigne le même joueur.
create table if not exists public.domino_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null unique check (pseudo ~ '^[a-z0-9_]{3,20}$'),
  games_played int not null default 0,
  games_won int not null default 0,
  points_total int not null default 0,
  created_at timestamptz not null default now()
);

-- ---- Salles ----
create table if not exists public.domino_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{6}$'),
  host_id uuid not null references public.domino_profiles(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un code n'est réservé que tant que la salle n'est pas fermée.
create unique index if not exists domino_rooms_code_active_idx
  on public.domino_rooms (code) where status <> 'closed';

-- ---- Joueurs d'une salle ----
create table if not exists public.domino_room_players (
  room_id uuid not null references public.domino_rooms(id) on delete cascade,
  user_id uuid not null references public.domino_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Renseigné quand un joueur quitte une partie en cours (il reste listé pour l'affichage).
  left_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists domino_room_players_user_idx on public.domino_room_players (user_id);

-- Garde-fou : 4 joueurs maximum par salle, même en cas d'arrivées simultanées.
create or replace function public.domino_enforce_room_capacity()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.domino_rooms where id = new.room_id for update;
  if (select count(*) from public.domino_room_players where room_id = new.room_id) >= 4 then
    raise exception 'DOMINO_ROOM_FULL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists domino_room_capacity on public.domino_room_players;
create trigger domino_room_capacity
  before insert on public.domino_room_players
  for each row execute function public.domino_enforce_room_capacity();

-- ---- Parties : état PUBLIC (chaîne, nombre de pièces en main, taille de la pioche) ----
create table if not exists public.domino_games (
  room_id uuid primary key references public.domino_rooms(id) on delete cascade,
  state jsonb not null,
  version int not null default 0,
  turn_deadline timestamptz,
  winner_id uuid references public.domino_profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---- Parties : état SECRET (mains et pioche) ----
-- Jamais lisible par les clients : RLS activée sans aucune policy, hors Realtime.
create table if not exists public.domino_game_secrets (
  room_id uuid primary key references public.domino_rooms(id) on delete cascade,
  state jsonb not null,
  version int not null default 0
);

-- ---- Historique des coups (événements publics uniquement) ----
create table if not exists public.domino_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.domino_rooms(id) on delete cascade,
  user_id uuid references public.domino_profiles(id) on delete set null,
  seq int not null,
  events jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists domino_moves_room_idx on public.domino_moves (room_id, seq);

-- ============================================================
-- Écriture atomique des deux états (public + secret), réservée au serveur (service_role)
-- ============================================================

-- Démarre (ou redémarre) la partie d'une salle, version 0.
create or replace function public.domino_start_game(
  p_room_id uuid,
  p_public jsonb,
  p_secret jsonb,
  p_deadline timestamptz
)
returns timestamptz
language plpgsql
as $$
declare
  v_started timestamptz := now();
begin
  insert into public.domino_games (room_id, state, version, turn_deadline, winner_id, started_at, finished_at)
  values (p_room_id, p_public, 0, p_deadline, null, v_started, null)
  on conflict (room_id) do update
    set state = excluded.state, version = 0, turn_deadline = excluded.turn_deadline,
        winner_id = null, started_at = excluded.started_at, finished_at = null;

  insert into public.domino_game_secrets (room_id, state, version)
  values (p_room_id, p_secret, 0)
  on conflict (room_id) do update set state = excluded.state, version = 0;

  return v_started;
end;
$$;

-- Enregistre un coup si la version attendue est toujours la bonne (verrou optimiste).
-- En fin de partie, met aussi à jour les statistiques des joueurs, une seule fois.
-- Renvoie false si la partie a changé entre-temps.
create or replace function public.domino_save_game(
  p_room_id uuid,
  p_expected_version int,
  p_public jsonb,
  p_secret jsonb,
  p_deadline timestamptz,
  p_finished boolean,
  p_winner_id uuid,
  p_points int,
  p_player_ids uuid[]
)
returns boolean
language plpgsql
as $$
begin
  update public.domino_games
    set state = p_public,
        version = p_expected_version + 1,
        turn_deadline = p_deadline,
        winner_id = case when p_finished then p_winner_id else winner_id end,
        finished_at = case when p_finished then now() else finished_at end
    where room_id = p_room_id and version = p_expected_version;
  if not found then
    return false;
  end if;

  update public.domino_game_secrets
    set state = p_secret, version = p_expected_version + 1
    where room_id = p_room_id;

  if p_finished then
    update public.domino_profiles
      set games_played = games_played + 1,
          games_won = games_won + case when id = p_winner_id then 1 else 0 end,
          points_total = points_total + case when id = p_winner_id then p_points else 0 end
      where id = any(p_player_ids);
  end if;
  return true;
end;
$$;

revoke all on function public.domino_start_game(uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.domino_save_game(uuid, int, jsonb, jsonb, timestamptz, boolean, uuid, int, uuid[]) from public, anon, authenticated;
grant execute on function public.domino_start_game(uuid, jsonb, jsonb, timestamptz) to service_role;
grant execute on function public.domino_save_game(uuid, int, jsonb, jsonb, timestamptz, boolean, uuid, int, uuid[]) to service_role;

-- ============================================================
-- RLS : lecture seule pour les membres. Toutes les écritures passent par le serveur
-- Next.js (clé service_role), qui applique les règles du jeu.
-- ============================================================

alter table public.domino_profiles enable row level security;
alter table public.domino_rooms enable row level security;
alter table public.domino_room_players enable row level security;
alter table public.domino_games enable row level security;
alter table public.domino_game_secrets enable row level security;
alter table public.domino_moves enable row level security;

-- Double sécurité pour l'état secret : aucun droit pour les rôles clients.
revoke all on public.domino_game_secrets from anon, authenticated;

create or replace function public.domino_is_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.domino_room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.domino_is_member(uuid) from public;
grant execute on function public.domino_is_member(uuid) to authenticated;

drop policy if exists "domino_profiles_read" on public.domino_profiles;
create policy "domino_profiles_read" on public.domino_profiles
  for select to authenticated using (true);

drop policy if exists "domino_rooms_read_members" on public.domino_rooms;
create policy "domino_rooms_read_members" on public.domino_rooms
  for select to authenticated using (public.domino_is_member(id));

drop policy if exists "domino_room_players_read_members" on public.domino_room_players;
create policy "domino_room_players_read_members" on public.domino_room_players
  for select to authenticated using (public.domino_is_member(room_id));

drop policy if exists "domino_games_read_members" on public.domino_games;
create policy "domino_games_read_members" on public.domino_games
  for select to authenticated using (public.domino_is_member(room_id));

drop policy if exists "domino_moves_read_members" on public.domino_moves;
create policy "domino_moves_read_members" on public.domino_moves
  for select to authenticated using (public.domino_is_member(room_id));

-- domino_game_secrets : volontairement AUCUNE policy.

-- ============================================================
-- Realtime (jamais domino_game_secrets)
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.domino_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.domino_games;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.domino_room_players;
  exception when duplicate_object then null;
  end;
end $$;
