create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id bigint generated always as identity primary key,
  played_at date not null,
  map_name text not null,
  replay_url text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id),
  placement int not null check (placement >= 1),
  points int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, player_id),
  unique (game_id, placement)
);

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_results enable row level security;

-- Public can read standings and games.
drop policy if exists players_public_read on public.players;
create policy players_public_read on public.players
for select to anon, authenticated
using (true);

drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games
for select to anon, authenticated
using (true);

drop policy if exists results_public_read on public.game_results;
create policy results_public_read on public.game_results
for select to anon, authenticated
using (true);

-- Only admin email can insert new matches.
drop policy if exists games_insert_auth on public.games;
drop policy if exists games_insert_admin on public.games;
create policy games_insert_admin on public.games
for insert to authenticated
with check (lower(coalesce((auth.jwt() ->> 'email'), '')) = 'aliabzakh77@gmail.com');

drop policy if exists results_insert_auth on public.game_results;
drop policy if exists results_insert_admin on public.game_results;
create policy results_insert_admin on public.game_results
for insert to authenticated
with check (lower(coalesce((auth.jwt() ->> 'email'), '')) = 'aliabzakh77@gmail.com');

drop policy if exists players_insert_admin on public.players;
create policy players_insert_admin on public.players
for insert to authenticated
with check (lower(coalesce((auth.jwt() ->> 'email'), '')) = 'aliabzakh77@gmail.com');

-- Seed your 7 players.
insert into public.players (name) values
  ('Player 1'),
  ('Player 2'),
  ('Player 3'),
  ('Player 4'),
  ('Player 5'),
  ('Player 6'),
  ('Player 7')
on conflict (name) do nothing;
