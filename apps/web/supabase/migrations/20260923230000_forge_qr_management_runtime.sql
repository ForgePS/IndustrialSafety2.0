-- Forge Industrial Safety 2.0 QR Management runtime.
-- Stable opaque scan tokens connected to internal Forge records and auditable scan history.

create table if not exists public.forge_qr_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id)
);

create or replace function public.next_forge_qr_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_qr_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_qr_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'QR-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_qr_number(uuid) from public;
grant execute on function public.next_forge_qr_number(uuid) to service_role;

create table if not exists public.forge_qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qr_number text not null,
  token text not null default encode(gen_random_bytes(24), 'hex'),
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active','disabled','archived')),
  target_type text not null default 'asset'
    check (target_type in ('asset')),
  target_id uuid not null,
  default_action text not null default 'asset_record'
    check (default_action in ('asset_record','maintenance','meter_reading')),
  expires_at timestamptz,
  scan_count bigint not null default 0 check (scan_count >= 0),
  last_scanned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qr_number),
  unique (token)
);

create index if not exists forge_qr_codes_org_status_idx
  on public.forge_qr_codes(organization_id, status, name);

create index if not exists forge_qr_codes_target_idx
  on public.forge_qr_codes(organization_id, target_type, target_id);

create table if not exists public.forge_qr_scans (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qr_code_id uuid not null references public.forge_qr_codes(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  destination_path text not null,
  user_agent text,
  referrer text,
  scanned_at timestamptz not null default now()
);

create index if not exists forge_qr_scans_qr_idx
  on public.forge_qr_scans(organization_id, qr_code_id, scanned_at desc);

alter table public.forge_qr_sequences enable row level security;
alter table public.forge_qr_codes enable row level security;
alter table public.forge_qr_scans enable row level security;

drop policy if exists forge_qr_codes_member_select on public.forge_qr_codes;
create policy forge_qr_codes_member_select
on public.forge_qr_codes for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_qr_scans_member_select on public.forge_qr_scans;
create policy forge_qr_scans_member_select
on public.forge_qr_scans for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_qr_codes to authenticated;
grant select on public.forge_qr_scans to authenticated;

grant all on public.forge_qr_sequences to service_role;
grant all on public.forge_qr_codes to service_role;
grant all on public.forge_qr_scans to service_role;
grant usage, select on sequence public.forge_qr_scans_id_seq to service_role;

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

  if v_qr.target_type = 'asset' then
    if v_qr.default_action = 'maintenance' then
      v_destination := '/assets/' || v_qr.target_id::text || '/maintenance/create';
    elsif v_qr.default_action = 'meter_reading' then
      v_destination := '/assets/' || v_qr.target_id::text || '/meter-readings/create';
    else
      v_destination := '/assets/' || v_qr.target_id::text;
    end if;
  else
    return;
  end if;

  insert into public.forge_qr_scans (
    organization_id,
    qr_code_id,
    auth_user_id,
    destination_path,
    user_agent,
    referrer
  )
  values (
    v_qr.organization_id,
    v_qr.id,
    p_auth_user_id,
    v_destination,
    left(p_user_agent, 1000),
    left(p_referrer, 1000)
  );

  update public.forge_qr_codes
  set scan_count = scan_count + 1,
      last_scanned_at = now(),
      updated_at = now()
  where id = v_qr.id;

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

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('qr_management.rotate_token','qr_management','Rotate QR Token','Invalidate the current printed QR token and generate a replacement token.','QR Management','rotate_token',true,true,'organization',true,true,true,'critical',50),
  ('qr_management.view_scans','qr_management','View QR Scan History','View managed QR scan history and usage.','QR Management','view_scans',true,true,'organization',false,false,true,'normal',60)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  tenant_can_scope=true,
  audit_use=true,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'qr_management.create','qr_management.edit','qr_management.view_scans'
)
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='qr_management.rotate_token'
where rt.template_key='company-admin'
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'qr_management.create','qr_management.edit','qr_management.view_scans'
)
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='qr_management.rotate_token'
where r.role_key in ('company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'QR Management',
  v.sort_order,
  true,
  true,
  false,
  false,
  false
from (
  values
    ('qr.status','QR Status','Lifecycle status for a managed QR code.',241),
    ('qr.action','QR Default Action','Destination opened when this QR code is scanned.',242)
) as v(lookup_key, name, description, sort_order)
join public.forge_feature_registry f on f.feature_key='qr_management'
on conflict (lookup_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('qr.status','active','Active','QR code resolves to its configured Forge destination.',10),
    ('qr.status','disabled','Disabled','QR code remains stored but scans do not resolve.',20),
    ('qr.status','archived','Archived','QR code has been retired from active use.',30),

    ('qr.action','asset_record','Open Asset Record','Open the linked Asset & Equipment record.',10),
    ('qr.action','maintenance','Add Maintenance','Open the maintenance entry workflow for the linked asset.',20),
    ('qr.action','meter_reading','Add Meter Reading','Open the meter-reading entry workflow for the linked asset.',30)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  'qr.profile',
  f.id,
  'Managed QR Code',
  'Create and configure a managed QR code linked to an internal Forge record.',
  'QR Management',
  'record',
  'Save QR Code',
  'Cancel',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  600
from public.forge_feature_registry f
where f.feature_key='qr_management'
on conflict (form_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('name','QR Name','Friendly name used in QR Management.','Enter QR name','text',null,'identity','QR Identity',10,'half',true,false,false,false),
    ('description','Description','Optional description of where this QR will be used.','Enter description','textarea',null,'identity','QR Identity',20,'full',false,true,true,false),
    ('asset_id','Linked Asset','Asset or equipment record this QR code points to.',null,'asset',null,'target','Destination',30,'half',true,false,false,false),
    ('default_action','Default Action','Choose what Forge opens after the QR is scanned.',null,'select','qr.action','target','Destination',40,'half',true,false,false,true),
    ('status','Status','Enable or temporarily disable this managed QR code.',null,'select','qr.status','control','Control',50,'half',true,false,false,true),
    ('expires_at','Expiration','Optional date and time after which this QR will stop resolving.',null,'datetime',null,'control','Control',60,'half',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='qr.profile'
left join public.forge_lookup_definitions ld on ld.lookup_key=v.lookup_key
on conflict (form_id, field_key) do update
set
  label=excluded.label,
  help_text=excluded.help_text,
  placeholder=excluded.placeholder,
  field_type=excluded.field_type,
  lookup_id=excluded.lookup_id,
  section_key=excluded.section_key,
  section_label=excluded.section_label,
  sort_order=excluded.sort_order,
  width=excluded.width,
  is_required=excluded.is_required,
  can_hide=excluded.can_hide,
  can_change_required=excluded.can_change_required,
  can_change_lookup=excluded.can_change_lookup,
  updated_at=now();

update public.forge_form_fields ff
set can_hide=false, can_change_required=false, can_change_input_type=false, updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='qr.profile'
  and ff.field_key in ('name','asset_id','default_action','status');

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"qr_management.view"}'::jsonb,
    updated_at=now()
where element_key='nav.qr_management';
