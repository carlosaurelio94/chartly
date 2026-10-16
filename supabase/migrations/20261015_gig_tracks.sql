-- Recorridos medidos con el GPS del teléfono durante la jornada.
-- Un registro por recorrido (botón "Empezar" → "Terminar"). Los puntos se
-- guardan filtrados y redondeados a ~1 m: alcanzan para el mapa de calor y
-- para recalcular la distancia, sin guardar cada lectura cruda del GPS.
create table if not exists public.gig_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shift_id uuid references public.gig_shifts(id) on delete set null,
  shift_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_km numeric(9,3) not null default 0 check (distance_km >= 0 and distance_km < 3000),
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

comment on table public.gig_tracks is
  'Recorridos GPS de la jornada. points = [[lat, lng, epoch_s], ...] filtrados del ruido del GPS.';

create index if not exists gig_tracks_user_date_idx on public.gig_tracks (user_id, shift_date desc);

alter table public.gig_tracks enable row level security;

drop policy if exists "gig_tracks owner" on public.gig_tracks;
create policy "gig_tracks owner" on public.gig_tracks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
