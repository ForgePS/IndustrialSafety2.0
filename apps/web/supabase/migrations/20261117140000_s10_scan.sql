-- Port slice 10: Scan (1.0's unified QR action menu) on top of 2.0 QR Links.
--
-- * A QR can point to an asset, a location or a form template, and can open a scan action menu
--   (default_action 'scan_menu') instead of jumping straight to a record.
-- * Per-QR access mode and action configuration (which actions show, inspection template per frequency,
--   linked forms, whether field workers may return equipment to service).
-- * Employee-number identification with server-side sessions and rate limiting (1.0 had neither).
-- * Public issue reports that create a Corrective Action, asset out of service / return to service with a
--   real status history, inspections started from a scan, and a scan log with the action taken.

-- ---------------------------------------------------------------------------
-- QR codes: more target types, access mode, action configuration
-- ---------------------------------------------------------------------------

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_target_asset_fk;
alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_target_type_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_target_type_check check (target_type in ('asset','location','form'));

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_default_action_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_default_action_check
  check (default_action in ('asset_record','maintenance','meter_reading','loto_view','scan_menu'));

alter table public.forge_qr_codes
  add column if not exists access_mode text not null default 'signed_in',
  add column if not exists action_config jsonb not null default '{}'::jsonb;

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_access_mode_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_access_mode_check check (access_mode in ('signed_in','employee_number','public_report'));

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_action_config_object;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_action_config_object check (jsonb_typeof(action_config) = 'object');

-- Record actions only make sense for assets.
alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_action_target_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_action_target_check
  check (target_type = 'asset' or default_action = 'scan_menu');

-- The target must exist in the same company (replaces the asset-only foreign key).
create or replace function public.forge_guard_qr_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_type = 'asset' then
    if not exists (select 1 from public.forge_assets where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target asset does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'location' then
    if not exists (select 1 from public.locations where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target location does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'form' then
    if not exists (select 1 from public.forge_form_templates where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target form does not belong to this company.' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_qr_codes_guard_target on public.forge_qr_codes;
create trigger forge_qr_codes_guard_target
  before insert or update of target_type, target_id, organization_id on public.forge_qr_codes
  for each row execute function public.forge_guard_qr_target();

-- Assets that still have a QR cannot be hard-deleted (the old foreign key's on delete restrict).
create or replace function public.forge_guard_asset_qr_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.forge_qr_codes where target_type = 'asset' and target_id = old.id) then
    raise exception 'This asset has QR codes. Archive it instead of deleting it.' using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists forge_assets_guard_qr_delete on public.forge_assets;
create trigger forge_assets_guard_qr_delete
  before delete on public.forge_assets
  for each row execute function public.forge_guard_asset_qr_delete();

-- ---------------------------------------------------------------------------
-- Scan log: the action taken, the person and the result (1.0's scan events)
-- ---------------------------------------------------------------------------

alter table public.forge_qr_scans alter column destination_path drop not null;
alter table public.forge_qr_scans
  add column if not exists action text not null default 'open',
  add column if not exists result text not null default 'ok',
  add column if not exists personnel_id uuid references public.forge_personnel(id) on delete set null,
  add column if not exists record_type text,
  add column if not exists record_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.forge_qr_scans drop constraint if exists forge_qr_scans_result_check;
alter table public.forge_qr_scans
  add constraint forge_qr_scans_result_check check (result in ('ok','denied','failed'));

create index if not exists forge_qr_scans_org_action_idx
  on public.forge_qr_scans (organization_id, action, scanned_at desc);

-- Logs one scan-menu event and bumps the code's counters. Only 'open' counts as a scan.
create or replace function public.forge_record_qr_event(
  p_qr_code_id uuid,
  p_action text,
  p_result text default 'ok',
  p_auth_user_id uuid default null,
  p_personnel_id uuid default null,
  p_record_type text default null,
  p_record_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id bigint;
begin
  select organization_id into v_org from public.forge_qr_codes where id = p_qr_code_id;
  if v_org is null then
    return null;
  end if;

  insert into public.forge_qr_scans (
    organization_id, qr_code_id, auth_user_id, destination_path, user_agent, action, result,
    personnel_id, record_type, record_id, metadata
  )
  values (
    v_org, p_qr_code_id, p_auth_user_id, null, left(p_user_agent, 1000), left(p_action, 64), coalesce(p_result, 'ok'),
    p_personnel_id, p_record_type, p_record_id, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  if p_action = 'open' then
    update public.forge_qr_codes
    set scan_count = scan_count + 1, last_scanned_at = now()
    where id = p_qr_code_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.forge_record_qr_event(uuid, text, text, uuid, uuid, text, uuid, jsonb, text) from public;
grant execute on function public.forge_record_qr_event(uuid, text, text, uuid, uuid, text, uuid, jsonb, text) to service_role;

-- The redirect route: scan_menu codes (and every non-asset code) go to the public scan page.
create or replace function public.resolve_and_record_forge_qr_scan(
  p_token text,
  p_auth_user_id uuid default null,
  p_user_agent text default null,
  p_referrer text default null
)
returns table (
  qr_code_id uuid,
  organization_id uuid,
  target_type text,
  target_id uuid,
  default_action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qr public.forge_qr_codes%rowtype;
  v_destination text;
begin
  select *
  into v_qr
  from public.forge_qr_codes
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return;
  end if;

  if v_qr.default_action = 'scan_menu' or v_qr.target_type <> 'asset' then
    -- Logged by the scan page itself (action 'open'), so the token is never stored.
    v_destination := null;
  elsif v_qr.default_action = 'maintenance' then
    v_destination := '/assets/' || v_qr.target_id::text || '/maintenance/create';
  elsif v_qr.default_action = 'meter_reading' then
    v_destination := '/assets/' || v_qr.target_id::text || '/meter-readings/create';
  elsif v_qr.default_action = 'loto_view' then
    v_destination := '/q/' || v_qr.qr_number || '/loto';
  else
    v_destination := '/assets/' || v_qr.target_id::text;
  end if;

  if v_destination is not null then
    insert into public.forge_qr_scans (organization_id, qr_code_id, auth_user_id, destination_path, user_agent, referrer)
    values (v_qr.organization_id, v_qr.id, p_auth_user_id, v_destination, left(p_user_agent, 1000), left(p_referrer, 1000));

    update public.forge_qr_codes
    set scan_count = scan_count + 1, last_scanned_at = now(), updated_at = now()
    where id = v_qr.id;
  end if;

  qr_code_id := v_qr.id;
  organization_id := v_qr.organization_id;
  target_type := v_qr.target_type;
  target_id := v_qr.target_id;
  default_action := v_qr.default_action;
  return next;
end;
$$;

revoke all on function public.resolve_and_record_forge_qr_scan(text, uuid, text, text) from public;
grant execute on function public.resolve_and_record_forge_qr_scan(text, uuid, text, text) to service_role;

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, 'scan_menu', 'Scan Action Menu', 'Open the scan menu: inspect, report an issue, out of service / return to service, history, LOTO and linked forms.', 5, true, true
from public.forge_lookup_definitions d
where d.lookup_key = 'qr.action'
on conflict (lookup_id, option_key) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ---------------------------------------------------------------------------
-- Employee-number identification: sessions and rate limits
-- ---------------------------------------------------------------------------

create table if not exists public.forge_qr_scan_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qr_code_id uuid not null references public.forge_qr_codes(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists forge_qr_scan_sessions_expires_idx on public.forge_qr_scan_sessions (expires_at);

create table if not exists public.forge_qr_scan_rate_limits (
  qr_code_id uuid not null references public.forge_qr_codes(id) on delete cascade,
  bucket_key text not null,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (qr_code_id, bucket_key)
);

-- Records a failed employee-number attempt; 8 failures within 15 minutes block the bucket for 15 minutes.
create or replace function public.forge_qr_scan_register_failure(p_qr_code_id uuid, p_bucket_key text)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_row public.forge_qr_scan_rate_limits;
begin
  insert into public.forge_qr_scan_rate_limits (qr_code_id, bucket_key, failed_count, window_started_at)
  values (p_qr_code_id, p_bucket_key, 1, now())
  on conflict (qr_code_id, bucket_key) do update
  set
    failed_count = case
      when public.forge_qr_scan_rate_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.forge_qr_scan_rate_limits.failed_count + 1
    end,
    window_started_at = case
      when public.forge_qr_scan_rate_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.forge_qr_scan_rate_limits.window_started_at
    end
  returning * into v_row;

  if v_row.failed_count >= 8 then
    update public.forge_qr_scan_rate_limits
    set blocked_until = now() + interval '15 minutes'
    where qr_code_id = p_qr_code_id and bucket_key = p_bucket_key
    returning * into v_row;
  end if;

  return v_row.blocked_until;
end;
$$;

revoke all on function public.forge_qr_scan_register_failure(uuid, text) from public;
grant execute on function public.forge_qr_scan_register_failure(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Asset status history (out of service / return to service, and every other status change)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_asset_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  notes text,
  source text not null default 'record_edit'
    check (source in ('record_edit','qr_scan','qr_issue','qr_inspection','inspection','import')),
  qr_code_id uuid references public.forge_qr_codes(id) on delete set null,
  related_record_type text,
  related_record_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_personnel_id uuid references public.forge_personnel(id) on delete set null,
  actor_name text,
  changed_at timestamptz not null default now()
);

create index if not exists forge_asset_status_history_asset_idx
  on public.forge_asset_status_history (organization_id, asset_id, changed_at desc);

-- Any status change made outside forge_set_asset_service_status is still recorded (source 'record_edit').
create or replace function public.forge_track_asset_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('forge.asset_status_logged', true), '') <> 'on' then
    insert into public.forge_asset_status_history (organization_id, asset_id, from_status, to_status, source, actor_user_id)
    values (new.organization_id, new.id, old.status, new.status, 'record_edit', new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists forge_assets_track_status on public.forge_assets;
create trigger forge_assets_track_status
  after update of status on public.forge_assets
  for each row execute function public.forge_track_asset_status();

-- Sets an asset's status and writes one history row with the reason, in one transaction.
-- Returns the history row id, or null when the asset already had that status.
create or replace function public.forge_set_asset_service_status(
  p_organization_id uuid,
  p_asset_id uuid,
  p_status text,
  p_reason text default null,
  p_notes text default null,
  p_source text default 'qr_scan',
  p_qr_code_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_personnel_id uuid default null,
  p_actor_name text default null,
  p_related_record_type text default null,
  p_related_record_id uuid default null
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
  if p_status not in ('active','out_of_service') then
    raise exception 'Scan can only set an asset in service or out of service.' using errcode = '22023';
  end if;

  select status into v_old
  from public.forge_assets
  where id = p_asset_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Asset not found.' using errcode = 'P0002';
  end if;

  if v_old = 'retired' then
    raise exception 'A retired asset cannot change service status.' using errcode = '22023';
  end if;

  if v_old = p_status then
    return null;
  end if;

  perform set_config('forge.asset_status_logged', 'on', true);

  update public.forge_assets
  set status = p_status, updated_at = now(), updated_by = coalesce(p_actor_user_id, updated_by)
  where id = p_asset_id;

  perform set_config('forge.asset_status_logged', 'off', true);

  insert into public.forge_asset_status_history (
    organization_id, asset_id, from_status, to_status, reason, notes, source, qr_code_id,
    related_record_type, related_record_id, actor_user_id, actor_personnel_id, actor_name
  )
  values (
    p_organization_id, p_asset_id, v_old, p_status, p_reason, p_notes, p_source, p_qr_code_id,
    p_related_record_type, p_related_record_id, p_actor_user_id, p_actor_personnel_id, p_actor_name
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.forge_set_asset_service_status(uuid, uuid, text, text, text, text, uuid, uuid, uuid, text, text, uuid) from public;
grant execute on function public.forge_set_asset_service_status(uuid, uuid, text, text, text, text, uuid, uuid, uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Issue reports from a scan (each creates a Corrective Action)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_qr_issue_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qr_code_id uuid not null references public.forge_qr_codes(id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  asset_id uuid references public.forge_assets(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 5000),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  category text,
  immediate_hazard boolean not null default false,
  marked_out_of_service boolean not null default false,
  anonymous boolean not null default false,
  reporter_name text,
  reporter_personnel_id uuid references public.forge_personnel(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  corrective_action_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists forge_qr_issue_reports_org_idx
  on public.forge_qr_issue_reports (organization_id, created_at desc);
create index if not exists forge_qr_issue_reports_qr_idx
  on public.forge_qr_issue_reports (qr_code_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Inspections started from a scan
-- ---------------------------------------------------------------------------

alter table public.forge_inspections
  add column if not exists qr_code_id uuid references public.forge_qr_codes(id) on delete set null,
  add column if not exists asset_id uuid references public.forge_assets(id) on delete set null,
  add column if not exists inspection_frequency text;

alter table public.forge_inspections drop constraint if exists forge_inspections_frequency_check;
alter table public.forge_inspections
  add constraint forge_inspections_frequency_check
  check (inspection_frequency is null or inspection_frequency in ('daily','weekly','monthly','quarterly','annual','other'));

create index if not exists forge_inspections_asset_idx
  on public.forge_inspections (organization_id, asset_id, inspection_date desc)
  where asset_id is not null;

-- ---------------------------------------------------------------------------
-- Access: all scan tables are server-mediated (service_role only)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'forge_qr_scan_sessions','forge_qr_scan_rate_limits','forge_asset_status_history','forge_qr_issue_reports'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry (
  permission_key, feature_key, name, description, permission_group, action, tenant_assignable,
  tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order
)
values
  ('qr_management.service_status', 'qr_management', 'Change Service Status From a Scan',
   'Mark scanned equipment out of service or return it to service from the scan menu.',
   'Scan', 'edit', true, true, 'location', true, false, true, 'sensitive', 70),
  ('qr_management.view_issues', 'qr_management', 'View Scan Issue Reports',
   'See the issues reported from QR scans.',
   'Scan', 'view', true, true, 'location', false, false, false, 'normal', 71)
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, case when rt.template_key = 'supervisor' then 'location' else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('qr_management.service_status', 'qr_management.view_issues')
where rt.template_key in ('supervisor', 'safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, case when r.role_key in ('supervisor', 'location-administrator') then 'location' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('qr_management.service_status', 'qr_management.view_issues')
where r.role_key in ('supervisor', 'location-administrator', 'company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
