-- Forge Creator 2.0 control-plane foundation
-- Platform-level control tables are intentionally isolated from tenant operational data.
-- Creator mutations should be performed through trusted server-side code using the service role.

create extension if not exists pgcrypto;

create table if not exists public.forge_platform_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_role text not null check (platform_role in ('forge_owner','forge_creator','forge_support','forge_billing','forge_read_only')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_feature_registry (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text,
  category text not null,
  feature_type text not null default 'feature' check (feature_type in ('module','feature','page','action','field','workflow','integration')),
  platform_state text not null default 'enabled' check (platform_state in ('enabled','disabled','beta','maintenance','deprecated')),
  tenant_configurable boolean not null default false,
  location_configurable boolean not null default false,
  user_configurable boolean not null default false,
  requires_entitlement boolean not null default true,
  is_sensitive boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_permission_registry (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  feature_key text references public.forge_feature_registry(feature_key) on delete set null,
  name text not null,
  description text,
  permission_group text not null,
  action text not null,
  scope_options text[] not null default array['own','assigned','location','division','organization']::text[],
  tenant_assignable boolean not null default true,
  requires_confirmation boolean not null default false,
  audit_use boolean not null default false,
  is_sensitive boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('draft','active','retired','archived')),
  billing_interval text not null default 'annual' check (billing_interval in ('monthly','annual','multi_year','custom')),
  base_price_cents bigint,
  currency text not null default 'USD',
  included_storage_gb numeric(12,2),
  included_emails_monthly integer,
  included_sms_segments_monthly integer,
  included_users integer,
  included_locations integer,
  overage_settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_plan_entitlements (
  plan_id uuid not null references public.forge_plans(id) on delete cascade,
  feature_id uuid not null references public.forge_feature_registry(id) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  primary key (plan_id, feature_id)
);

create table if not exists public.forge_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.forge_plans(id) on delete set null,
  status text not null default 'active' check (status in ('trial','onboarding','active','past_due','suspended','canceled','archived')),
  starts_at timestamptz not null default now(),
  current_term_starts_at timestamptz,
  current_term_ends_at timestamptz,
  contract_ends_at timestamptz,
  canceled_at timestamptz,
  custom_price_cents bigint,
  currency text not null default 'USD',
  price_escalation_percent numeric(7,4),
  price_escalation_starts_at date,
  billing_provider text,
  billing_external_id text,
  contract_metadata jsonb not null default '{}'::jsonb,
  usage_limits jsonb not null default '{}'::jsonb,
  overage_rules jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_subscriptions_one_current_idx
  on public.forge_subscriptions(organization_id)
  where status in ('trial','onboarding','active','past_due','suspended');

create table if not exists public.forge_tenant_entitlement_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_id uuid not null references public.forge_feature_registry(id) on delete cascade,
  enabled boolean,
  tenant_can_configure boolean,
  config jsonb not null default '{}'::jsonb,
  reason text,
  primary key (organization_id, feature_id)
);

create table if not exists public.forge_configuration_definitions (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  feature_id uuid references public.forge_feature_registry(id) on delete cascade,
  name text not null,
  description text,
  value_type text not null check (value_type in ('boolean','text','number','json','select','multi_select','color','date','datetime')),
  default_value jsonb,
  creator_control text not null default 'configurable' check (creator_control in ('locked_on','configurable','locked_off')),
  tenant_can_override boolean not null default false,
  location_can_override boolean not null default false,
  user_can_override boolean not null default false,
  validation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_configuration_values (
  id uuid primary key default gen_random_uuid(),
  config_definition_id uuid not null references public.forge_configuration_definitions(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  value jsonb not null,
  source text not null default 'creator' check (source in ('creator','plan','tenant','location','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_configuration_values_scope_check check (
    (organization_id is null and location_id is null and user_id is null)
    or organization_id is not null
  )
);

create index if not exists forge_configuration_values_lookup_idx
  on public.forge_configuration_values(config_definition_id, organization_id, location_id, user_id);

create table if not exists public.forge_lookup_definitions (
  id uuid primary key default gen_random_uuid(),
  lookup_key text not null unique,
  feature_id uuid references public.forge_feature_registry(id) on delete cascade,
  name text not null,
  description text,
  tenant_can_rename boolean not null default false,
  tenant_can_reorder boolean not null default false,
  tenant_can_add_options boolean not null default false,
  tenant_can_hide_core_options boolean not null default false,
  tenant_can_delete_core_options boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_lookup_options (
  id uuid primary key default gen_random_uuid(),
  lookup_id uuid not null references public.forge_lookup_definitions(id) on delete cascade,
  option_key text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_core boolean not null default true,
  color text,
  icon text,
  metadata jsonb not null default '{}'::jsonb,
  unique (lookup_id, option_key)
);

create table if not exists public.forge_tenant_lookup_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lookup_id uuid not null references public.forge_lookup_definitions(id) on delete cascade,
  base_option_id uuid references public.forge_lookup_options(id) on delete cascade,
  custom_option_key text,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_custom boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  constraint forge_tenant_lookup_option_identity check (
    base_option_id is not null or custom_option_key is not null
  )
);

create unique index if not exists forge_tenant_lookup_base_unique_idx
  on public.forge_tenant_lookup_options(organization_id, lookup_id, base_option_id)
  where base_option_id is not null;

create unique index if not exists forge_tenant_lookup_custom_unique_idx
  on public.forge_tenant_lookup_options(organization_id, lookup_id, custom_option_key)
  where custom_option_key is not null;

create table if not exists public.forge_tenant_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  role_key text,
  is_system_role boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, role_key)
);

create table if not exists public.forge_tenant_role_permissions (
  role_id uuid not null references public.forge_tenant_roles(id) on delete cascade,
  permission_id uuid not null references public.forge_permission_registry(id) on delete cascade,
  allowed boolean not null default false,
  scope text,
  constraints jsonb not null default '{}'::jsonb,
  primary key (role_id, permission_id)
);

create table if not exists public.forge_tenant_user_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.forge_tenant_roles(id) on delete cascade,
  primary key (organization_id, user_id, role_id)
);

create table if not exists public.forge_user_permission_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.forge_permission_registry(id) on delete cascade,
  override_state text not null check (override_state in ('inherit','allow','deny')),
  scope text,
  constraints jsonb not null default '{}'::jsonb,
  primary key (organization_id, user_id, permission_id)
);

create table if not exists public.forge_navigation_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  parent_id uuid references public.forge_navigation_items(id) on delete cascade,
  feature_id uuid references public.forge_feature_registry(id) on delete set null,
  label text not null,
  href text,
  icon text,
  item_type text not null default 'link' check (item_type in ('group','link','dropdown','divider')),
  sort_order integer not null default 0,
  platform_enabled boolean not null default true,
  tenant_can_hide boolean not null default false,
  tenant_can_rename boolean not null default false,
  tenant_can_reorder boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.forge_tenant_navigation_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  navigation_item_id uuid not null references public.forge_navigation_items(id) on delete cascade,
  label text,
  hidden boolean,
  sort_order integer,
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, navigation_item_id)
);

create table if not exists public.forge_creator_audit_log (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists forge_creator_audit_log_org_created_idx
  on public.forge_creator_audit_log(organization_id, created_at desc);

alter table public.forge_platform_users enable row level security;
alter table public.forge_feature_registry enable row level security;
alter table public.forge_permission_registry enable row level security;
alter table public.forge_plans enable row level security;
alter table public.forge_plan_entitlements enable row level security;
alter table public.forge_subscriptions enable row level security;
alter table public.forge_tenant_entitlement_overrides enable row level security;
alter table public.forge_configuration_definitions enable row level security;
alter table public.forge_configuration_values enable row level security;
alter table public.forge_lookup_definitions enable row level security;
alter table public.forge_lookup_options enable row level security;
alter table public.forge_tenant_lookup_options enable row level security;
alter table public.forge_tenant_roles enable row level security;
alter table public.forge_tenant_role_permissions enable row level security;
alter table public.forge_tenant_user_roles enable row level security;
alter table public.forge_user_permission_overrides enable row level security;
alter table public.forge_navigation_items enable row level security;
alter table public.forge_tenant_navigation_overrides enable row level security;
alter table public.forge_creator_audit_log enable row level security;

grant all on public.forge_platform_users to service_role;
grant all on public.forge_feature_registry to service_role;
grant all on public.forge_permission_registry to service_role;
grant all on public.forge_plans to service_role;
grant all on public.forge_plan_entitlements to service_role;
grant all on public.forge_subscriptions to service_role;
grant all on public.forge_tenant_entitlement_overrides to service_role;
grant all on public.forge_configuration_definitions to service_role;
grant all on public.forge_configuration_values to service_role;
grant all on public.forge_lookup_definitions to service_role;
grant all on public.forge_lookup_options to service_role;
grant all on public.forge_tenant_lookup_options to service_role;
grant all on public.forge_tenant_roles to service_role;
grant all on public.forge_tenant_role_permissions to service_role;
grant all on public.forge_tenant_user_roles to service_role;
grant all on public.forge_user_permission_overrides to service_role;
grant all on public.forge_navigation_items to service_role;
grant all on public.forge_tenant_navigation_overrides to service_role;
grant all on public.forge_creator_audit_log to service_role;
grant usage, select on sequence public.forge_creator_audit_log_id_seq to service_role;

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, requires_entitlement, sort_order)
values
  ('platform.creator', 'Forge Creator', 'Forge platform control plane and SaaS administration.', 'Platform', 'module', 'enabled', false, false, 10),
  ('personnel', 'Personnel', 'Personnel records and organization workforce management.', 'People', 'module', 'enabled', true, true, 100),
  ('training', 'Training', 'Training records, assignments, courses, certifications and completion tracking.', 'People', 'module', 'enabled', true, true, 110),
  ('incidents', 'Incidents', 'Incident reporting, investigation, claims and follow-up.', 'Safety', 'module', 'enabled', true, true, 120),
  ('inspections', 'Inspections', 'Safety inspections, findings and corrective actions.', 'Safety', 'module', 'enabled', true, true, 130),
  ('osha', 'OSHA', 'OSHA recordkeeping and regulatory workflows.', 'Compliance', 'module', 'enabled', false, true, 140),
  ('workers_comp', 'Workers Compensation', 'Workers compensation case management.', 'Safety', 'module', 'enabled', true, true, 150),
  ('dot', 'DOT Compliance', 'DOT compliance records and operational controls.', 'Compliance', 'module', 'enabled', true, true, 160),
  ('assets_equipment', 'Assets & Equipment', 'Asset and equipment management.', 'Operations', 'module', 'enabled', true, true, 170),
  ('fleet', 'Fleet', 'Vehicle, driver and fleet management.', 'Operations', 'module', 'enabled', true, true, 180),
  ('loto', 'Lockout / Tagout', 'LOTO procedures and equipment-specific energy control.', 'Safety', 'module', 'enabled', true, true, 190),
  ('emergency_management', 'Emergency Management', 'Emergency plans, alerts, drills and response readiness.', 'Safety', 'module', 'enabled', true, true, 200),
  ('qr_management', 'QR Management', 'Managed QR codes connected to Forge records and workflows.', 'Operations', 'module', 'enabled', true, true, 210),
  ('reporting', 'Reporting', 'Dashboards, analytics and reporting.', 'Analytics', 'module', 'enabled', true, true, 220)
on conflict (feature_key) do nothing;

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, is_sensitive, requires_confirmation, audit_use, sort_order)
values
  ('personnel.view', 'personnel', 'View Personnel', 'View personnel records within the assigned access scope.', 'Personnel', 'view', true, false, false, false, 10),
  ('personnel.create', 'personnel', 'Create Personnel', 'Create new personnel records.', 'Personnel', 'create', true, false, false, true, 20),
  ('personnel.edit', 'personnel', 'Edit Personnel', 'Edit personnel records within the assigned scope.', 'Personnel', 'edit', true, false, false, true, 30),
  ('personnel.archive', 'personnel', 'Archive Personnel', 'Archive personnel records.', 'Personnel', 'archive', true, true, true, true, 40),
  ('personnel.delete', 'personnel', 'Delete Personnel', 'Permanently delete eligible personnel records.', 'Personnel', 'delete', true, true, true, true, 50),
  ('training.view', 'training', 'View Training', 'View training records.', 'Training', 'view', true, false, false, false, 10),
  ('training.assign', 'training', 'Assign Training', 'Assign training to personnel.', 'Training', 'assign', true, false, false, true, 20),
  ('training.approve', 'training', 'Approve Training', 'Approve training completions and records.', 'Training', 'approve', true, true, true, true, 30),
  ('incidents.view', 'incidents', 'View Incidents', 'View incident records.', 'Incidents', 'view', true, false, false, false, 10),
  ('incidents.create', 'incidents', 'Create Incidents', 'Create incident records.', 'Incidents', 'create', true, false, false, true, 20),
  ('incidents.edit', 'incidents', 'Edit Incidents', 'Edit eligible incident records.', 'Incidents', 'edit', true, false, false, true, 30),
  ('incidents.approve', 'incidents', 'Approve Incidents', 'Approve or return submitted incidents.', 'Incidents', 'approve', true, true, true, true, 40),
  ('incidents.delete', 'incidents', 'Delete Incidents', 'Permanently delete eligible incident records.', 'Incidents', 'delete', true, true, true, true, 50),
  ('inspections.view', 'inspections', 'View Inspections', 'View inspection records.', 'Inspections', 'view', true, false, false, false, 10),
  ('inspections.create', 'inspections', 'Create Inspections', 'Create inspections.', 'Inspections', 'create', true, false, false, true, 20),
  ('inspections.approve', 'inspections', 'Approve Inspections', 'Approve inspections and close findings.', 'Inspections', 'approve', true, true, true, true, 30),
  ('reporting.view', 'reporting', 'View Reports', 'View allowed reports and dashboards.', 'Reporting', 'view', true, false, false, false, 10),
  ('reporting.export', 'reporting', 'Export Reports', 'Export report data.', 'Reporting', 'export', true, true, true, true, 20)
on conflict (permission_key) do nothing;
