-- Forge Creator 2.0 tenant-specific Forms & Fields Builder.

create table if not exists public.forge_form_definitions (
  id uuid primary key default gen_random_uuid(),
  form_key text not null unique,
  feature_id uuid references public.forge_feature_registry(id) on delete set null,
  name text not null,
  description text,
  category text not null default 'General',
  form_type text not null default 'record'
    check (form_type in ('record','wizard','inspection','assessment','request','profile')),
  submit_label text not null default 'Save',
  cancel_label text not null default 'Cancel',
  tenant_edit_mode text not null default 'presentation'
    check (tenant_edit_mode in ('none','presentation','fields','full')),
  tenant_can_add_fields boolean not null default false,
  tenant_can_hide_fields boolean not null default true,
  tenant_can_reorder_fields boolean not null default true,
  tenant_can_change_required boolean not null default false,
  tenant_can_change_input_type boolean not null default false,
  tenant_can_change_lookup boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forge_form_definitions(id) on delete cascade,
  field_key text not null,
  label text not null,
  help_text text,
  placeholder text,
  field_type text not null
    check (field_type in (
      'text','textarea','email','phone','number','currency','date','datetime','time',
      'select','multi_select','checkbox','switch','radio','file','photo','signature',
      'person','location','division','asset','vehicle','read_only'
    )),
  lookup_id uuid references public.forge_lookup_definitions(id) on delete set null,
  section_key text not null default 'general',
  section_label text not null default 'General',
  sort_order integer not null default 0,
  width text not null default 'full'
    check (width in ('quarter','third','half','two_thirds','three_quarters','full')),
  is_required boolean not null default false,
  is_visible boolean not null default true,
  is_read_only boolean not null default false,
  is_core boolean not null default true,
  can_rename boolean not null default true,
  can_change_help boolean not null default true,
  can_change_placeholder boolean not null default true,
  can_hide boolean not null default true,
  can_reorder boolean not null default true,
  can_change_required boolean not null default false,
  can_change_input_type boolean not null default false,
  can_change_lookup boolean not null default false,
  validation jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, field_key)
);

create table if not exists public.forge_tenant_form_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_id uuid not null references public.forge_form_definitions(id) on delete cascade,
  name text,
  description text,
  submit_label text,
  cancel_label text,
  tenant_edit_mode_override text
    check (tenant_edit_mode_override is null or tenant_edit_mode_override in ('none','presentation','fields','full')),
  tenant_can_add_fields_override boolean,
  tenant_can_hide_fields_override boolean,
  tenant_can_reorder_fields_override boolean,
  tenant_can_change_required_override boolean,
  tenant_can_change_input_type_override boolean,
  tenant_can_change_lookup_override boolean,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, form_id)
);

create table if not exists public.forge_tenant_form_field_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_id uuid not null references public.forge_form_definitions(id) on delete cascade,
  field_id uuid not null references public.forge_form_fields(id) on delete cascade,
  label text,
  help_text text,
  placeholder text,
  field_type text,
  lookup_id uuid references public.forge_lookup_definitions(id) on delete set null,
  section_key text,
  section_label text,
  sort_order integer,
  width text,
  is_required boolean,
  is_visible boolean,
  is_read_only boolean,
  validation jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, field_id)
);

create index if not exists forge_form_fields_form_order_idx
  on public.forge_form_fields(form_id, section_key, sort_order);

create index if not exists forge_tenant_form_field_overrides_form_idx
  on public.forge_tenant_form_field_overrides(organization_id, form_id, sort_order);

alter table public.forge_form_definitions enable row level security;
alter table public.forge_form_fields enable row level security;
alter table public.forge_tenant_form_overrides enable row level security;
alter table public.forge_tenant_form_field_overrides enable row level security;

grant all on public.forge_form_definitions to service_role;
grant all on public.forge_form_fields to service_role;
grant all on public.forge_tenant_form_overrides to service_role;
grant all on public.forge_tenant_form_field_overrides to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
('tenant.forms.view',null,'View Form Designer','View tenant form and field configuration.','Company Administration','forms_view',true,false,'organization',false,false,true,'normal',90),
('tenant.forms.manage',null,'Manage Form Designer','Customize Forge forms and fields within Creator-defined limits.','Company Administration','forms_manage',true,false,'organization',true,true,true,'sensitive',100)
on conflict (permission_key) do update
set name=excluded.name, description=excluded.description, tenant_assignable=true, audit_use=true;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('tenant.forms.view','tenant.forms.manage')
where rt.template_key = 'company-admin'
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('tenant.forms.view','tenant.forms.manage')
where r.role_key = 'company-administrator'
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_experience_elements (
  element_key, element_type, name, default_label, default_description, route, component_key,
  category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode,
  user_edit_mode, can_hide, can_rename, can_reorder, settings
)
values (
  'nav.company_forms',
  'menu',
  'Form Designer',
  'Form Designer',
  'Customize tenant forms and fields within Forge Creator rules.',
  '/company/settings/forms',
  'company-form-designer',
  'Administration',
  910,
  true,
  'configurable',
  'presentation',
  'none',
  'none',
  false,
  true,
  true,
  '{"route_live":true,"required_permission":"tenant.forms.view"}'::jsonb
)
on conflict (element_key) do update
set
  default_label=excluded.default_label,
  default_description=excluded.default_description,
  route=excluded.route,
  settings=excluded.settings,
  updated_at=now();

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select v.form_key, f.id, v.name, v.description, v.category, v.form_type, v.submit_label, 'Cancel', 'fields', false, true, true, true, false, true, v.sort_order
from (
  values
    ('personnel.profile','personnel','Personnel Profile','Primary personnel profile and employment information.','Personnel','profile','Save Personnel',100),
    ('incidents.report','incidents','Incident Report','Initial incident reporting form.','Incidents','record','Save Incident',200),
    ('inspections.general','inspections','General Inspection','General safety inspection form.','Inspections','inspection','Save Inspection',300)
) as v(form_key, feature_key, name, description, category, form_type, submit_label, sort_order)
join public.forge_feature_registry f on f.feature_key=v.feature_key
on conflict (form_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_change_required, can_change_lookup)
select fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id, v.section_key, v.section_label, v.sort_order, v.width, v.required, v.can_required, v.can_lookup
from (
  values
    ('personnel.profile','first_name','First Name',null,'Enter first name','text',null,'identity','Identity',10,'half',true,false,false),
    ('personnel.profile','last_name','Last Name',null,'Enter last name','text',null,'identity','Identity',20,'half',true,false,false),
    ('personnel.profile','employee_number','Employee Number','Company-issued employee identifier.','Enter employee number','text',null,'employment','Employment',30,'half',true,true,false),
    ('personnel.profile','employment_status','Employment Status','Current personnel status.',null,'select','personnel.employment_status','employment','Employment',40,'half',true,true,true),
    ('personnel.profile','email','Email','Primary work email address.','name@company.com','email',null,'contact','Contact',50,'half',false,true,false),
    ('personnel.profile','phone','Phone','Primary contact number.','Enter phone number','phone',null,'contact','Contact',60,'half',false,true,false),

    ('incidents.report','occurred_at','Date & Time','When the incident occurred.',null,'datetime',null,'incident','Incident Details',10,'half',true,false,false),
    ('incidents.report','severity','Severity','Select the incident severity.',null,'select','incidents.severity','incident','Incident Details',20,'half',true,true,true),
    ('incidents.report','location','Location','Location where the incident occurred.',null,'location',null,'incident','Incident Details',30,'half',true,true,false),
    ('incidents.report','summary','Summary','Briefly describe what happened.','Enter incident summary','textarea',null,'incident','Incident Details',40,'full',true,true,false),
    ('incidents.report','immediate_actions','Immediate Actions','Actions taken immediately after the incident.','Enter immediate actions','textarea',null,'response','Response',50,'full',false,true,false),

    ('inspections.general','inspection_date','Inspection Date',null,null,'date',null,'inspection','Inspection',10,'half',true,false,false),
    ('inspections.general','location','Location',null,null,'location',null,'inspection','Inspection',20,'half',true,true,false),
    ('inspections.general','result','Overall Result','Overall inspection result.',null,'select','inspections.result','results','Results',30,'half',true,true,true),
    ('inspections.general','notes','Inspector Notes','Additional inspection notes.','Enter notes','textarea',null,'results','Results',40,'full',false,true,false)
) as v(form_key, field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_required, can_lookup)
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
  updated_at=now();
