-- Port slice 15: Contractor Safety (Industrial 1.0 "contractor-safety" module).
--
-- Contractor companies with approval, a sponsor and the sites they may work at; their insurance certificates
-- and other documents with expiry dates and files; their workers with site orientation, badge and
-- qualifications; and a site sign-in / sign-out log that only lets cleared workers in.
--
-- 1.0 had a single generic table of titled rows ("onboarding" category) with a status and nothing else: no
-- companies, workers, insurance, orientation, qualifications or sign-in. This slice is built from the parity
-- matrix's description of the module.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('contractor_safety', 'Contractor Safety', 'Contractor companies, insurance and documents, workers with orientation and qualifications, and site sign-in.', 'Compliance', 'module', 'enabled', true, true, true, true, false, 165)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'contractor_safety'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.contractor_safety', f.id, 'menu', 'Contractor Safety', 'Contractor Safety', 'Contractor companies, insurance, workers and site sign-in.', '/contractors', 'contractor-safety', 'Compliance Programs', 165, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "contractor_safety.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'contractor_safety'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.forge_contractor_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Document types every approved company must have current to be cleared to work.
  required_documents text[] not null default array['general_liability', 'workers_comp']::text[]
    check (required_documents <@ array['general_liability', 'workers_comp', 'auto_liability', 'umbrella', 'safety_program', 'license', 'w9', 'other']::text[]),
  orientation_valid_months integer not null default 12 check (orientation_valid_months between 1 and 60),
  warning_days integer not null default 30 check (warning_days between 1 and 180),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------

create table if not exists public.forge_contractor_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  trade text check (trade is null or char_length(trade) <= 120),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  -- The employee responsible for the contractor while on site.
  sponsor_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended', 'inactive')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  status_changed_by uuid references auth.users(id) on delete set null,
  status_changed_at timestamptz,
  -- The locations the company may work at; empty = any.
  location_ids uuid[] not null default '{}',
  emr numeric(4, 2) check (emr is null or emr between 0 and 10),
  trir numeric(6, 2) check (trir is null or trir between 0 and 100),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_contractor_companies_name_idx on public.forge_contractor_companies (organization_id, lower(name)) where archived_at is null;
create index if not exists forge_contractor_companies_org_status_idx on public.forge_contractor_companies (organization_id, status);

-- ---------------------------------------------------------------------------
-- Documents (insurance certificates and others), files in the private 'forge-contractors' bucket
-- ---------------------------------------------------------------------------

create table if not exists public.forge_contractor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.forge_contractor_companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('general_liability', 'workers_comp', 'auto_liability', 'umbrella', 'safety_program', 'license', 'w9', 'other')),
  title text check (title is null or char_length(title) <= 200),
  coverage_amount numeric(14, 2) check (coverage_amount is null or coverage_amount between 0 and 1000000000),
  effective_on date,
  expires_on date,
  file_name text check (file_name is null or char_length(file_name) <= 200),
  content_type text check (content_type is null or content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer check (size_bytes is null or size_bytes between 1 and 12582912),
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint forge_contractor_documents_dates check (effective_on is null or expires_on is null or expires_on >= effective_on),
  constraint forge_contractor_documents_insurance_expiry check (doc_type not in ('general_liability', 'workers_comp', 'auto_liability', 'umbrella') or expires_on is not null),
  constraint forge_contractor_documents_other_title check (doc_type <> 'other' or title is not null),
  constraint forge_contractor_documents_file check ((storage_path is null) = (file_name is null) and (storage_path is null) = (content_type is null))
);

create index if not exists forge_contractor_documents_company_idx on public.forge_contractor_documents (company_id, doc_type);

-- ---------------------------------------------------------------------------
-- Workers and qualifications
-- ---------------------------------------------------------------------------

create table if not exists public.forge_contractor_workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.forge_contractor_companies(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  trade text check (trade is null or char_length(trade) <= 120),
  badge_number text check (badge_number is null or char_length(badge_number) <= 40),
  active boolean not null default true,
  orientation_completed_on date,
  orientation_recorded_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_contractor_workers_company_idx on public.forge_contractor_workers (company_id);
create unique index if not exists forge_contractor_workers_badge_idx on public.forge_contractor_workers (organization_id, badge_number) where badge_number is not null and archived_at is null;

create table if not exists public.forge_contractor_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null references public.forge_contractor_workers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  issued_on date,
  expires_on date,
  -- Required qualifications block sign-in when expired; others only warn.
  required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_contractor_qualifications_dates check (issued_on is null or expires_on is null or expires_on >= issued_on)
);

create index if not exists forge_contractor_qualifications_worker_idx on public.forge_contractor_qualifications (worker_id);

-- ---------------------------------------------------------------------------
-- Site sign-in / sign-out
-- ---------------------------------------------------------------------------

create table if not exists public.forge_contractor_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null references public.forge_contractor_workers(id) on delete cascade,
  company_id uuid not null references public.forge_contractor_companies(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  host_name text check (host_name is null or char_length(host_name) <= 120),
  purpose text check (purpose is null or char_length(purpose) <= 300),
  signed_in_at timestamptz not null default now(),
  signed_in_by uuid references auth.users(id) on delete set null,
  signed_out_at timestamptz,
  signed_out_by uuid references auth.users(id) on delete set null,
  -- Set when someone signed a worker in who wasn't cleared; the problems at the time are kept.
  override_reason text check (override_reason is null or char_length(override_reason) <= 500),
  override_problems jsonb,
  constraint forge_contractor_visits_out_after_in check (signed_out_at is null or signed_out_at >= signed_in_at),
  constraint forge_contractor_visits_override check ((override_reason is null) = (override_problems is null))
);

-- One open visit per worker.
create unique index if not exists forge_contractor_visits_open_idx on public.forge_contractor_visits (worker_id) where signed_out_at is null;
create index if not exists forge_contractor_visits_location_idx on public.forge_contractor_visits (organization_id, location_id, signed_out_at);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-contractors', 'forge-contractors', false, 12582912)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Linked records stay in one company; a visit's company is its worker's company; visits only ever close.
create or replace function public.forge_contractor_same_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_company uuid;
  v_location uuid;
begin
  if tg_table_name = 'forge_contractor_companies' then
    if new.sponsor_user_id is not null and not exists (
      select 1 from public.organization_memberships m where m.organization_id = new.organization_id and m.user_id = new.sponsor_user_id and m.is_active
    ) and (tg_op = 'INSERT' or new.sponsor_user_id is distinct from old.sponsor_user_id) then
      raise exception 'The sponsor must be an active member of the company.' using errcode = '23514';
    end if;
    foreach v_location in array new.location_ids loop
      if not exists (select 1 from public.locations l where l.id = v_location and l.organization_id = new.organization_id) then
        raise exception 'Contractor records must stay in one company.' using errcode = '23514';
      end if;
    end loop;
    return new;
  elsif tg_table_name in ('forge_contractor_documents', 'forge_contractor_workers') then
    select organization_id into v_org from public.forge_contractor_companies where id = new.company_id;
  elsif tg_table_name = 'forge_contractor_qualifications' then
    select organization_id into v_org from public.forge_contractor_workers where id = new.worker_id;
  elsif tg_table_name = 'forge_contractor_visits' then
    if tg_op = 'UPDATE' then
      if old.signed_out_at is not null or new.signed_out_at is null
        or (to_jsonb(new) - 'signed_out_at' - 'signed_out_by') <> (to_jsonb(old) - 'signed_out_at' - 'signed_out_by') then
        raise exception 'A sign-in can only be closed with a sign-out time.' using errcode = '42501';
      end if;
      return new;
    end if;
    select organization_id, company_id into v_org, v_company from public.forge_contractor_workers where id = new.worker_id;
    if v_company is distinct from new.company_id then
      raise exception 'A visit belongs to the worker''s own company.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
      raise exception 'Contractor records must stay in one company.' using errcode = '23514';
    end if;
  end if;

  if v_org is distinct from new.organization_id then
    raise exception 'Contractor records must stay in one company.' using errcode = '23514';
  end if;

  -- A worker can't move to another contractor company. (Nested: plpgsql doesn't short-circuit, and a
  -- qualification row has no company_id.)
  if tg_table_name = 'forge_contractor_workers' and tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then
      raise exception 'A worker can''t move to another contractor company. Add them to the new one.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_contractor_companies_same_org on public.forge_contractor_companies;
create trigger forge_contractor_companies_same_org
  before insert or update on public.forge_contractor_companies
  for each row execute function public.forge_contractor_same_organization();

drop trigger if exists forge_contractor_documents_same_org on public.forge_contractor_documents;
create trigger forge_contractor_documents_same_org
  before insert or update on public.forge_contractor_documents
  for each row execute function public.forge_contractor_same_organization();

drop trigger if exists forge_contractor_workers_same_org on public.forge_contractor_workers;
create trigger forge_contractor_workers_same_org
  before insert or update on public.forge_contractor_workers
  for each row execute function public.forge_contractor_same_organization();

drop trigger if exists forge_contractor_qualifications_same_org on public.forge_contractor_qualifications;
create trigger forge_contractor_qualifications_same_org
  before insert or update on public.forge_contractor_qualifications
  for each row execute function public.forge_contractor_same_organization();

drop trigger if exists forge_contractor_visits_same_org on public.forge_contractor_visits;
create trigger forge_contractor_visits_same_org
  before insert or update on public.forge_contractor_visits
  for each row execute function public.forge_contractor_same_organization();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_contractor_settings enable row level security;
alter table public.forge_contractor_companies enable row level security;
alter table public.forge_contractor_documents enable row level security;
alter table public.forge_contractor_workers enable row level security;
alter table public.forge_contractor_qualifications enable row level security;
alter table public.forge_contractor_visits enable row level security;

revoke all on public.forge_contractor_settings, public.forge_contractor_companies, public.forge_contractor_documents, public.forge_contractor_workers,
  public.forge_contractor_qualifications, public.forge_contractor_visits
  from anon, authenticated;

grant all on public.forge_contractor_settings, public.forge_contractor_companies, public.forge_contractor_documents, public.forge_contractor_workers,
  public.forge_contractor_qualifications, public.forge_contractor_visits
  to service_role;

revoke all on function public.forge_contractor_same_organization() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('contractor_safety.view', 'contractor_safety', 'View Contractors', 'See contractor companies, their documents and workers, whether they are cleared, and who is on site. Location scope sees the companies allowed at its locations.', 'Contractor Safety', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('contractor_safety.sign_in', 'contractor_safety', 'Sign Contractors In and Out', 'Sign contractor workers in and out at a site. Only cleared workers can be signed in.', 'Contractor Safety', 'sign_in', true, true, 'organization', false, false, true, 'normal', 20),
  ('contractor_safety.manage', 'contractor_safety', 'Manage Contractors', 'Add and edit contractor companies, documents, workers, orientation and qualifications, and sign in a worker who isn''t cleared (with a reason).', 'Contractor Safety', 'manage', true, true, 'organization', false, false, true, 'normal', 30),
  ('contractor_safety.approve', 'contractor_safety', 'Approve Contractors', 'Approve, suspend or deactivate contractor companies.', 'Contractor Safety', 'approve', true, false, 'organization', false, true, true, 'sensitive', 40),
  ('contractor_safety.settings', 'contractor_safety', 'Contractor Settings', 'Choose the required documents, how long site orientation lasts and the expiry warning window.', 'Contractor Safety', 'settings', true, false, 'organization', false, false, true, 'normal', 50)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('read-only', 'contractor_safety.view', 'organization'),
  ('supervisor', 'contractor_safety.view', 'location'),
  ('supervisor', 'contractor_safety.sign_in', 'location'),
  ('safety-manager', 'contractor_safety.view', 'organization'),
  ('safety-manager', 'contractor_safety.sign_in', 'organization'),
  ('safety-manager', 'contractor_safety.manage', 'organization'),
  ('safety-manager', 'contractor_safety.approve', 'organization'),
  ('safety-manager', 'contractor_safety.settings', 'organization'),
  ('company-admin', 'contractor_safety.view', 'organization'),
  ('company-admin', 'contractor_safety.sign_in', 'organization'),
  ('company-admin', 'contractor_safety.manage', 'organization'),
  ('company-admin', 'contractor_safety.approve', 'organization'),
  ('company-admin', 'contractor_safety.settings', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('read-only', 'contractor_safety.view', 'organization'),
  ('supervisor', 'contractor_safety.view', 'location'),
  ('supervisor', 'contractor_safety.sign_in', 'location'),
  ('location-administrator', 'contractor_safety.view', 'location'),
  ('location-administrator', 'contractor_safety.sign_in', 'location'),
  ('location-administrator', 'contractor_safety.manage', 'location'),
  ('company-administrator', 'contractor_safety.view', 'organization'),
  ('company-administrator', 'contractor_safety.sign_in', 'organization'),
  ('company-administrator', 'contractor_safety.manage', 'organization'),
  ('company-administrator', 'contractor_safety.approve', 'organization'),
  ('company-administrator', 'contractor_safety.settings', 'organization'),
  ('company-owner', 'contractor_safety.view', 'organization'),
  ('company-owner', 'contractor_safety.sign_in', 'organization'),
  ('company-owner', 'contractor_safety.manage', 'organization'),
  ('company-owner', 'contractor_safety.approve', 'organization'),
  ('company-owner', 'contractor_safety.settings', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
