-- Forge Creator 2.0 universal editability and experience framework.
-- Stable system keys remain protected while labels, content, visibility, order and
-- allowed customization layers can be managed without changing source code.

create table if not exists public.forge_experience_elements (
  id uuid primary key default gen_random_uuid(),
  element_key text not null unique,
  parent_id uuid references public.forge_experience_elements(id) on delete cascade,
  feature_id uuid references public.forge_feature_registry(id) on delete set null,
  element_type text not null check (
    element_type in (
      'page','section','tab','card','field','button','menu','menu_group','dropdown',
      'dashboard','widget','form','report','template','help_text','empty_state',
      'notification','email_template','sms_template','document_template'
    )
  ),
  name text not null,
  default_label text,
  default_description text,
  route text,
  component_key text,
  category text not null default 'General',
  sort_order integer not null default 0,
  platform_enabled boolean not null default true,
  protection_level text not null default 'configurable'
    check (protection_level in ('core','configurable','custom')),
  tenant_edit_mode text not null default 'none'
    check (tenant_edit_mode in ('none','content','presentation','full')),
  location_edit_mode text not null default 'none'
    check (location_edit_mode in ('none','content','presentation','full')),
  user_edit_mode text not null default 'none'
    check (user_edit_mode in ('none','preference','presentation')),
  can_hide boolean not null default false,
  can_rename boolean not null default false,
  can_reorder boolean not null default false,
  can_duplicate boolean not null default false,
  can_delete boolean not null default false,
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_experience_elements_parent_idx
  on public.forge_experience_elements(parent_id, sort_order);

create index if not exists forge_experience_elements_feature_idx
  on public.forge_experience_elements(feature_id, sort_order);

create index if not exists forge_experience_elements_type_idx
  on public.forge_experience_elements(element_type, category, sort_order);

create table if not exists public.forge_tenant_experience_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  element_id uuid not null references public.forge_experience_elements(id) on delete cascade,
  label text,
  description text,
  hidden boolean,
  sort_order integer,
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, element_id)
);

create table if not exists public.forge_location_experience_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  element_id uuid not null references public.forge_experience_elements(id) on delete cascade,
  label text,
  description text,
  hidden boolean,
  sort_order integer,
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, location_id, element_id)
);

create table if not exists public.forge_user_experience_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  element_id uuid not null references public.forge_experience_elements(id) on delete cascade,
  hidden boolean,
  sort_order integer,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, element_id)
);

create table if not exists public.forge_experience_versions (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references public.forge_experience_elements(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (element_id, version_number)
);

alter table public.forge_experience_elements enable row level security;
alter table public.forge_tenant_experience_overrides enable row level security;
alter table public.forge_location_experience_overrides enable row level security;
alter table public.forge_user_experience_preferences enable row level security;
alter table public.forge_experience_versions enable row level security;

grant all on public.forge_experience_elements to service_role;
grant all on public.forge_tenant_experience_overrides to service_role;
grant all on public.forge_location_experience_overrides to service_role;
grant all on public.forge_user_experience_preferences to service_role;
grant all on public.forge_experience_versions to service_role;

-- Initial high-level experience registry.
insert into public.forge_experience_elements
(element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete)
select
  v.element_key,
  f.id,
  v.element_type,
  v.name,
  v.default_label,
  v.default_description,
  v.route,
  v.component_key,
  v.category,
  v.sort_order,
  true,
  v.protection_level,
  v.tenant_edit_mode,
  v.location_edit_mode,
  v.user_edit_mode,
  v.can_hide,
  v.can_rename,
  v.can_reorder,
  v.can_duplicate,
  v.can_delete
from (
  values
    ('nav.personnel','personnel','menu','Personnel','Personnel','Personnel records and workforce management.','/personnel','personnel','Navigation',100,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.training','training','menu','Training','Training','Training, certifications and qualifications.','/training','training','Navigation',110,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.my_training','my_training','menu','My Training','My Training','Assigned training and personal transcript.','/my-training','my-training','Navigation',115,'configurable','presentation','none','preference',true,true,true,false,false),
    ('nav.incidents','incidents','menu','Incidents','Incidents','Incident reporting and investigation.','/incidents','incidents','Navigation',120,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.inspections','inspections','menu','Inspections','Inspections','Inspections and corrective actions.','/inspections','inspections','Navigation',130,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.osha','osha','menu','OSHA','OSHA','OSHA recordkeeping.','/osha','osha','Navigation',140,'core','none','none','none',false,false,false,false,false),
    ('nav.workers_comp','workers_comp','menu','Workers Compensation','Workers Comp','Workers compensation case management.','/workers-comp','workers-comp','Navigation',150,'configurable','presentation','none','none',true,true,true,false,false),
    ('nav.dot','dot','menu','DOT Compliance','DOT','DOT compliance.','/dot','dot','Navigation',160,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.assets_equipment','assets_equipment','menu','Assets & Equipment','Assets & Equipment','Assets and equipment management.','/assets','assets-equipment','Navigation',170,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.fleet','fleet','menu','Fleet','Fleet','Fleet management.','/fleet','fleet','Navigation',180,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.loto','loto','menu','Lockout / Tagout','Lockout / Tagout','LOTO procedures and controls.','/loto','loto','Navigation',190,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.tasks','tasks','menu','Tasks','Tasks','Tasks and corrective actions.','/tasks','tasks','Navigation',205,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.calendar','calendar','menu','Calendar','Calendar','Shared operational calendar.','/calendar','calendar','Navigation',215,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.reminders','reminders','menu','Reminders','Reminders','Personal and assigned reminders.','/reminders','reminders','Navigation',225,'configurable','presentation','none','preference',true,true,true,false,false),
    ('nav.messaging','messaging','menu','Messaging','Messaging','Direct and group messaging.','/messaging','messaging','Navigation',235,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('nav.qr_management','qr_management','menu','QR Management','QR Management','Managed QR codes and workflows.','/qr','qr-management','Navigation',245,'configurable','presentation','presentation','none',true,true,true,false,false),
    ('nav.reporting','reporting','menu','Reporting','Reporting','Dashboards, analytics and reports.','/reporting','reporting','Navigation',260,'configurable','presentation','presentation','preference',true,true,true,false,false),
    ('dashboard.home',null,'dashboard','Home Dashboard','Dashboard','Role-aware home dashboard.','/dashboard','home-dashboard','Dashboards',500,'configurable','presentation','presentation','presentation',false,true,true,true,false)
) as v(element_key, feature_key, element_type, name, default_label, default_description, route, component_key, category, sort_order, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete)
left join public.forge_feature_registry f on f.feature_key = v.feature_key
on conflict (element_key) do update
set
  feature_id = excluded.feature_id,
  name = excluded.name,
  default_label = excluded.default_label,
  default_description = excluded.default_description,
  route = excluded.route,
  component_key = excluded.component_key,
  category = excluded.category,
  sort_order = excluded.sort_order,
  protection_level = excluded.protection_level,
  tenant_edit_mode = excluded.tenant_edit_mode,
  location_edit_mode = excluded.location_edit_mode,
  user_edit_mode = excluded.user_edit_mode,
  can_hide = excluded.can_hide,
  can_rename = excluded.can_rename,
  can_reorder = excluded.can_reorder,
  can_duplicate = excluded.can_duplicate,
  can_delete = excluded.can_delete,
  updated_at = now();
