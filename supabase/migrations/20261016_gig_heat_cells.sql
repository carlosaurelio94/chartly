-- Mapa de calor de la jornada: agrupa los puntos GPS del usuario en celdas de
-- ~p_cell_m metros y devuelve el centro de cada celda y cuántos puntos tiene.
-- Se calcula en la base para no bajar miles de puntos al teléfono.
create or replace function public.gig_heat_cells(p_from date, p_cell_m integer default 250)
returns table (lat double precision, lng double precision, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with pts as (
    select (p->>0)::float8 as lat, (p->>1)::float8 as lng
    from gig_tracks t
    cross join lateral jsonb_array_elements(t.points) p
    where t.user_id = auth.uid() and t.shift_date >= p_from
  ), g as (
    select
      floor(lat / (greatest(50, p_cell_m) / 111320.0)) as i,
      floor(lng / (greatest(50, p_cell_m) / (111320.0 * greatest(0.01, cos(radians(lat)))))) as j,
      lat, lng
    from pts
  )
  select avg(lat), avg(lng), count(*)
  from g
  group by i, j
  order by count(*) desc
  limit 3000;
$$;
revoke all on function public.gig_heat_cells(date, integer) from public, anon;
grant execute on function public.gig_heat_cells(date, integer) to authenticated;
