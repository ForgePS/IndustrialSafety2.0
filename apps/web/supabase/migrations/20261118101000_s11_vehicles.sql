-- Port slice 11 (vehicles): removing a vehicle from the fleet and restoring it, with one status history row
-- carrying the disposition source (the vehicle trigger alone would log it as a plain record edit).

create or replace function public.forge_fleet_set_disposition(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_status text,
  p_date date default null,
  p_notes text default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_id uuid;
begin
  if p_status not in ('removed','sold','disposed','inactive') then
    raise exception 'Choose removed, sold or disposed.' using errcode = '22023';
  end if;

  select status into v_old from public.forge_fleet_vehicles
  where id = p_vehicle_id and organization_id = p_organization_id and archived_at is null
  for update;

  if not found then
    raise exception 'Vehicle not found.' using errcode = 'P0002';
  end if;

  if p_status = 'inactive' and v_old not in ('removed','sold','disposed') then
    raise exception 'Only a removed vehicle can be restored.' using errcode = '22023';
  end if;

  if p_status <> 'inactive' and v_old in ('removed','sold','disposed') then
    raise exception 'This vehicle is already removed from the fleet.' using errcode = '22023';
  end if;

  perform set_config('forge.fleet_status_logged', 'on', true);

  update public.forge_fleet_vehicles
  set status = p_status,
      disposition_date = case when p_status = 'inactive' then null else coalesce(p_date, current_date) end,
      disposition_notes = case when p_status = 'inactive' then null else p_notes end,
      updated_by = coalesce(p_actor_user_id, updated_by)
  where id = p_vehicle_id;

  perform set_config('forge.fleet_status_logged', 'off', true);

  insert into public.forge_fleet_status_history (organization_id, vehicle_id, from_status, to_status, reason, source, actor_user_id)
  values (
    p_organization_id, p_vehicle_id, v_old, p_status,
    case when p_status = 'inactive' then 'Restored to the fleet' else p_notes end,
    case when p_status = 'inactive' then 'record_edit' else 'disposal' end,
    p_actor_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.forge_fleet_set_disposition(uuid, uuid, text, date, text, uuid) from public;
grant execute on function public.forge_fleet_set_disposition(uuid, uuid, text, date, text, uuid) to service_role;
