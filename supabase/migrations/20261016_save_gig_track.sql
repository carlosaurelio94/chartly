-- Guarda un recorrido GPS y lo suma a la jornada del día en una sola
-- transacción. Idempotente por p_client_id: si el teléfono reintenta (red
-- inestable), no se duplican km ni horas. security invoker: corre con los
-- permisos del usuario, así que RLS sigue aplicando.
create or replace function public.save_gig_track(
  p_client_id uuid,
  p_shift_date date,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_distance_km numeric,
  p_points jsonb,
  p_add_hours boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_shift uuid;
  v_hours numeric;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if exists (select 1 from gig_tracks where id = p_client_id and user_id = v_uid) then
    return p_client_id;
  end if;

  insert into gig_shifts (user_id, shift_date)
  values (v_uid, p_shift_date)
  on conflict do nothing;
  select id into v_shift from gig_shifts where user_id = v_uid and shift_date = p_shift_date limit 1;

  insert into gig_tracks (id, user_id, shift_id, shift_date, started_at, ended_at, distance_km, points)
  values (p_client_id, v_uid, v_shift, p_shift_date, p_started_at, p_ended_at, round(p_distance_km, 3), p_points);

  v_hours := case when p_add_hours then extract(epoch from (p_ended_at - p_started_at)) / 3600.0 else 0 end;
  update gig_shifts
     set km_driven = coalesce(km_driven, 0) + round(p_distance_km, 2),
         hours_worked = coalesce(hours_worked, 0) + round(v_hours, 2)
   where id = v_shift;

  return p_client_id;
end;
$$;
revoke all on function public.save_gig_track(uuid, date, timestamptz, timestamptz, numeric, jsonb, boolean) from public, anon;
grant execute on function public.save_gig_track(uuid, date, timestamptz, timestamptz, numeric, jsonb, boolean) to authenticated;
