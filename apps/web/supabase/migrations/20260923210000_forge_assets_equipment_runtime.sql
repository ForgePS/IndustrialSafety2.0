-- Forge Industrial Safety 2.0 Assets & Equipment runtime.
-- Shared equipment identity for Fleet, LOTO, QR, Inspections, maintenance and future operational modules.

create table if not exists public.forge_asset_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id)
);

create or replace function public.next_forge_asset_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_asset_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_asset_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'AST-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_asset_number(uuid) from public;
grant execute on function public.next_forge_asset_number(uuid) to service_role;

create table if not exists public.forge_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_number text not null,
  asset_type text not null default 'equipment',
  name text not null,
  description text,
  status text not null default 'active',
  condition text not null default 'good',
  criticality text not null default 'standard',
  manufacturer text,
  model text,
  serial_number text,
  barcode text,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  parent_asset_id uuid references public.forge_assets(id) on delete set null,
  custodian_personnel_id uuid references public.forge_personnel(id) on delete set null,
  custodian_user_id uuid references auth.users(id) on delete set null,
  purchase_date date,
  in_service_date date,
  warranty_expires_on date,
  purchase_cost numeric(14,2),
  replacement_cost numeric(14,2),
  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete set null,
  retirement_reason text,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, asset_number)
);

create unique index if not exists forge_assets_serial_unique_idx
  on public.forge_assets(organization_id, serial_number)
  where serial_number is not null and retired_at is null;

create index if not exists forge_assets_org_status_idx
  on public.forge_assets(organization_id, status, name);

create index if not exists forge_assets_location_idx
  on public.forge_assets(organization_id, location_id, status);

create index if not exists forge_assets_division_idx
  on public.forge_assets(organization_id, division_id, status);

create index if not exists forge_assets_custodian_idx
  on public.forge_assets(organization_id, custodian_user_id, status);

create table if not exists public.forge_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  assignment_type text not null default 'custody'
    check (assignment_type in ('custody','location','division','temporary','checkout')),
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  notes text,
  assigned_by uuid references auth.users(id) on delete set null,
  returned_by uuid references auth.users(id) on delete set null
);

create index if not exists forge_asset_assignments_asset_idx
  on public.forge_asset_assignments(organization_id, asset_id, assigned_at desc);

create table if not exists public.forge_asset_maintenance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  maintenance_type text not null default 'preventive',
  status text not null default 'completed'
    check (status in ('scheduled','in_progress','completed','canceled')),
  performed_on date,
  scheduled_for date,
  vendor text,
  technician text,
  work_order_number text,
  description text not null,
  findings text,
  corrective_action text,
  labor_cost numeric(14,2),
  parts_cost numeric(14,2),
  total_cost numeric(14,2),
  next_due_date date,
  next_due_meter numeric(14,2),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_asset_maintenance_asset_idx
  on public.forge_asset_maintenance(organization_id, asset_id, coalesce(performed_on, scheduled_for) desc);

create table if not exists public.forge_asset_meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  meter_type text not null,
  reading numeric(16,3) not null check (reading >= 0),
  unit text,
  recorded_at timestamptz not null default now(),
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_asset_meter_readings_asset_idx
  on public.forge_asset_meter_readings(organization_id, asset_id, meter_type, recorded_at desc);

create table if not exists public.forge_asset_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_asset_activity_idx
  on public.forge_asset_activity(organization_id, asset_id, created_at desc);

alter table public.forge_asset_sequences enable row level security;
alter table public.forge_assets enable row level security;
alter table public.forge_asset_assignments enable row level security;
alter table public.forge_asset_maintenance enable row level security;
alter table public.forge_asset_meter_readings enable row level security;
alter table public.forge_asset_activity enable row level security;

drop policy if exists forge_assets_member_select on public.forge_assets;
create policy forge_assets_member_select
on public.forge_assets for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_asset_assignments_member_select on public.forge_asset_assignments;
create policy forge_asset_assignments_member_select
on public.forge_asset_assignments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_asset_maintenance_member_select on public.forge_asset_maintenance;
create policy forge_asset_maintenance_member_select
on public.forge_asset_maintenance for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_asset_meter_readings_member_select on public.forge_asset_meter_readings;
create policy forge_asset_meter_readings_member_select
on public.forge_asset_meter_readings for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_asset_activity_member_select on public.forge_asset_activity;
create policy forge_asset_activity_member_select
on public.forge_asset_activity for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_assets to authenticated;
grant select on public.forge_asset_assignments to authenticated;
grant select on public.forge_asset_maintenance to authenticated;
grant select on public.forge_asset_meter_readings to authenticated;
grant select on public.forge_asset_activity to authenticated;

grant all on public.forge_asset_sequences to service_role;
grant all on public.forge_assets to service_role;
grant all on public.forge_asset_assignments to service_role;
grant all on public.forge_asset_maintenance to service_role;
grant all on public.forge_asset_meter_readings to service_role;
grant all on public.forge_asset_activity to service_role;
grant usage, select on sequence public.forge_asset_activity_id_seq to service_role;

-- Operational permissions beyond CRUD.
insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('assets_equipment.assign','assets_equipment','Assign Assets & Equipment','Assign or transfer custody, Location, or Division for assets.','Assets & Equipment','assign',true,true,'organization',false,false,true,'normal',35),
  ('assets_equipment.maintenance','assets_equipment','Manage Asset Maintenance','Create and update maintenance history and scheduled service.','Assets & Equipment','maintenance',true,true,'organization',false,false,true,'normal',36),
  ('assets_equipment.meter','assets_equipment','Record Asset Meter Readings','Record hours, mileage, cycles, or other supported equipment meter readings.','Assets & Equipment','meter',true,true,'organization',false,false,true,'normal',37)
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
  'assets_equipment.assign','assets_equipment.maintenance','assets_equipment.meter'
)
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'assets_equipment.assign','assets_equipment.maintenance','assets_equipment.meter'
)
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

-- Asset lookup sets.
insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Assets & Equipment',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('assets.type','Asset Type','Primary classification for assets and equipment.',171,true),
    ('assets.status','Asset Status','Operational lifecycle status for assets.',172,false),
    ('assets.condition','Asset Condition','Condition classification for assets and equipment.',173,true),
    ('assets.criticality','Asset Criticality','Operational importance of an asset.',174,true),
    ('assets.maintenance_type','Maintenance Type','Classification used for maintenance records.',175,true),
    ('assets.meter_type','Meter Type','Supported equipment meter reading types.',176,true)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='assets_equipment'
on conflict (lookup_key) do update
set
  name=excluded.name,
  description=excluded.description,
  feature_id=excluded.feature_id,
  category=excluded.category,
  sort_order=excluded.sort_order,
  tenant_can_add_options=excluded.tenant_can_add_options,
  updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('assets.type','equipment','Equipment','General operational equipment.',10),
    ('assets.type','tool','Tool','Hand tool, powered tool, or specialty tool.',20),
    ('assets.type','ppe','PPE','Personal protective equipment or ensemble.',30),
    ('assets.type','safety_device','Safety Device','Safety-specific device or protective equipment.',40),
    ('assets.type','facility_system','Building / Facility System','Fixed building or operational system.',50),
    ('assets.type','vehicle_equipment','Vehicle-Mounted Equipment','Equipment primarily assigned to a vehicle.',60),
    ('assets.type','technology','Technology','Computer, tablet, radio, sensor, or related technology.',70),
    ('assets.type','other','Other','Other asset classification.',80),

    ('assets.status','active','Active','Available for normal use.',10),
    ('assets.status','out_of_service','Out of Service','Temporarily unavailable for use.',20),
    ('assets.status','maintenance','Maintenance','Currently undergoing maintenance.',30),
    ('assets.status','reserved','Reserved','Reserved or staged for a specific use.',40),
    ('assets.status','retired','Retired','Removed from active service.',50),

    ('assets.condition','excellent','Excellent','No known condition concerns.',10),
    ('assets.condition','good','Good','Serviceable with normal wear.',20),
    ('assets.condition','fair','Fair','Serviceable but showing notable wear.',30),
    ('assets.condition','poor','Poor','Condition requires attention or repair.',40),
    ('assets.condition','unserviceable','Unserviceable','Not suitable for operational use.',50),

    ('assets.criticality','standard','Standard','Normal operational asset.',10),
    ('assets.criticality','important','Important','Operationally important asset.',20),
    ('assets.criticality','critical','Critical','Failure could significantly affect safety or operations.',30),

    ('assets.maintenance_type','preventive','Preventive Maintenance','Scheduled preventive service.',10),
    ('assets.maintenance_type','corrective','Corrective Maintenance','Repair following a defect or failure.',20),
    ('assets.maintenance_type','inspection','Inspection / Service Check','Condition inspection or routine service check.',30),
    ('assets.maintenance_type','calibration','Calibration','Calibration or accuracy verification.',40),
    ('assets.maintenance_type','certification','Certification','Required certification or recertification.',50),
    ('assets.maintenance_type','other','Other','Other maintenance activity.',60),

    ('assets.meter_type','hours','Operating Hours','Equipment operating hours.',10),
    ('assets.meter_type','miles','Mileage','Vehicle or mobile-equipment mileage.',20),
    ('assets.meter_type','cycles','Cycles','Operating or duty cycles.',30),
    ('assets.meter_type','uses','Uses','Count of uses or activations.',40),
    ('assets.meter_type','other','Other','Other meter or counter type.',50)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

-- Creator-driven asset forms.
insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  v.form_key,
  f.id,
  v.name,
  v.description,
  'Assets & Equipment',
  'record',
  v.submit_label,
  'Cancel',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  v.sort_order
from (
  values
    ('assets.profile','Asset / Equipment Record','Primary asset identity, ownership, assignment and lifecycle information.','Save Asset',500),
    ('assets.maintenance','Asset Maintenance','Maintenance, repair, calibration and service history.','Save Maintenance',510),
    ('assets.meter_reading','Meter Reading','Record equipment hours, mileage, cycles or other supported meter readings.','Save Reading',520)
) as v(form_key, name, description, submit_label, sort_order)
join public.forge_feature_registry f on f.feature_key='assets_equipment'
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
    ('assets.profile','name','Asset Name','Name used to identify this asset.','Enter asset name','text',null,'identity','Identity',10,'half',true,false,false,false),
    ('assets.profile','asset_type','Asset Type','Primary asset classification.',null,'select','assets.type','identity','Identity',20,'half',true,false,false,true),
    ('assets.profile','status','Status','Current operational lifecycle status.',null,'select','assets.status','identity','Identity',30,'third',true,false,false,true),
    ('assets.profile','condition','Condition','Current equipment condition.',null,'select','assets.condition','identity','Identity',40,'third',true,true,true,true),
    ('assets.profile','criticality','Criticality','Operational importance of this asset.',null,'select','assets.criticality','identity','Identity',50,'third',false,true,true,true),
    ('assets.profile','description','Description','Additional asset description.','Enter description','textarea',null,'identity','Identity',60,'full',false,true,true,false),

    ('assets.profile','manufacturer','Manufacturer','Asset manufacturer or maker.','Enter manufacturer','text',null,'details','Equipment Details',70,'half',false,true,true,false),
    ('assets.profile','model','Model','Manufacturer model number or name.','Enter model','text',null,'details','Equipment Details',80,'half',false,true,true,false),
    ('assets.profile','serial_number','Serial Number','Manufacturer serial number.','Enter serial number','text',null,'details','Equipment Details',90,'half',false,true,true,false),
    ('assets.profile','barcode','Barcode / Tag','Existing barcode, tag, or external identifier.','Enter barcode or tag','text',null,'details','Equipment Details',100,'half',false,true,true,false),

    ('assets.profile','location_id','Location','Primary assigned Location.',null,'location',null,'assignment','Assignment',110,'half',false,true,true,false),
    ('assets.profile','division_id','Division','Primary assigned Division.',null,'division',null,'assignment','Assignment',120,'half',false,true,true,false),
    ('assets.profile','custodian_personnel_id','Custodian','Personnel responsible for this asset.',null,'person',null,'assignment','Assignment',130,'half',false,true,true,false),

    ('assets.profile','purchase_date','Purchase Date','Date the asset was purchased.',null,'date',null,'financial','Lifecycle',140,'half',false,true,true,false),
    ('assets.profile','in_service_date','In-Service Date','Date the asset entered service.',null,'date',null,'financial','Lifecycle',150,'half',false,true,true,false),
    ('assets.profile','warranty_expires_on','Warranty Expires','Warranty expiration date.',null,'date',null,'financial','Lifecycle',160,'half',false,true,true,false),
    ('assets.profile','purchase_cost','Purchase Cost','Original purchase cost.','0.00','currency',null,'financial','Lifecycle',170,'half',false,true,true,false),
    ('assets.profile','replacement_cost','Replacement Cost','Estimated current replacement cost.','0.00','currency',null,'financial','Lifecycle',180,'half',false,true,true,false),

    ('assets.maintenance','maintenance_type','Maintenance Type','Type of maintenance or service performed.',null,'select','assets.maintenance_type','service','Service Details',10,'half',true,false,false,true),
    ('assets.maintenance','status','Maintenance Status','Current maintenance work status.',null,'select',null,'service','Service Details',20,'half',true,false,false,false),
    ('assets.maintenance','scheduled_for','Scheduled Date','Date service is scheduled.',null,'date',null,'service','Service Details',30,'half',false,true,true,false),
    ('assets.maintenance','performed_on','Performed Date','Date work was completed.',null,'date',null,'service','Service Details',40,'half',false,true,true,false),
    ('assets.maintenance','description','Work Description','Describe the maintenance, repair, calibration, or service.','Enter work description','textarea',null,'service','Service Details',50,'full',true,false,false,false),
    ('assets.maintenance','vendor','Vendor','Outside vendor or service provider.','Enter vendor','text',null,'service','Service Details',60,'half',false,true,true,false),
    ('assets.maintenance','technician','Technician','Technician or person performing service.','Enter technician','text',null,'service','Service Details',70,'half',false,true,true,false),
    ('assets.maintenance','work_order_number','Work Order','Work order or service ticket number.','Enter work order','text',null,'service','Service Details',80,'half',false,true,true,false),
    ('assets.maintenance','findings','Findings','Condition or issues identified during service.','Enter findings','textarea',null,'results','Results',90,'full',false,true,true,false),
    ('assets.maintenance','corrective_action','Corrective Action','Repairs or corrective actions completed.','Enter corrective action','textarea',null,'results','Results',100,'full',false,true,true,false),
    ('assets.maintenance','labor_cost','Labor Cost','Labor portion of service cost.','0.00','currency',null,'costs','Costs & Next Due',110,'third',false,true,true,false),
    ('assets.maintenance','parts_cost','Parts Cost','Parts/material portion of service cost.','0.00','currency',null,'costs','Costs & Next Due',120,'third',false,true,true,false),
    ('assets.maintenance','next_due_date','Next Due Date','Next scheduled service date.',null,'date',null,'costs','Costs & Next Due',130,'third',false,true,true,false),

    ('assets.meter_reading','meter_type','Meter Type','Type of meter or counter being recorded.',null,'select','assets.meter_type','reading','Meter Reading',10,'half',true,false,false,true),
    ('assets.meter_reading','reading','Reading','Current meter reading.','0','number',null,'reading','Meter Reading',20,'half',true,false,false,false),
    ('assets.meter_reading','unit','Unit','Optional unit label when not implied by meter type.','Enter unit','text',null,'reading','Meter Reading',30,'half',false,true,true,false),
    ('assets.meter_reading','recorded_at','Recorded Date & Time','When this reading was captured.',null,'datetime',null,'reading','Meter Reading',40,'half',true,false,false,false),
    ('assets.meter_reading','notes','Notes','Optional context for this reading.','Enter notes','textarea',null,'reading','Meter Reading',50,'full',false,true,true,false)
) as v(form_key, field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key=v.form_key
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
  and (
    (fd.form_key='assets.profile' and ff.field_key in ('name','asset_type','status'))
    or (fd.form_key='assets.maintenance' and ff.field_key in ('maintenance_type','status','description'))
    or (fd.form_key='assets.meter_reading' and ff.field_key in ('meter_type','reading','recorded_at'))
  );

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"assets_equipment.view"}'::jsonb,
    updated_at=now()
where element_key='nav.assets_equipment';
