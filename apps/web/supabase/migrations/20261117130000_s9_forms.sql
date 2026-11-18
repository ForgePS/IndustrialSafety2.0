-- Port slice 9: Forms (Industrial 1.0 → 2.0).
--
-- Tenant form templates with published, immutable versions; submissions pinned to the version they were
-- filled on; signatures (with the EHS Director gate) kept in the answers; remote sign links; activity.
-- These are separate from forge_form_definitions, which configures the fixed module record forms.
--
-- Access: org members may SELECT templates and versions. Submissions, sign requests and activity are read
-- and written only by the server (service role) after the app's own permission and scope checks, because
-- forms can hold personal information and the scope rules (own / location) live in the app.

-- ---------------------------------------------------------------------------
-- Feature and entitlement
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('forms', 'Forms', 'Company form library: build forms, fill them in, collect signatures and print them.', 'Risk & Prevention', 'module', 'enabled', true, true, true, true, false, 118)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, category = excluded.category, feature_type = excluded.feature_type,
    platform_state = excluded.platform_state, requires_entitlement = excluded.requires_entitlement, sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'forms'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.forge_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  category text check (category is null or char_length(category) <= 100),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- The working copy edited in the builder. Publishing copies it into forge_form_template_versions.
  schema jsonb not null default '{"fields": []}'::jsonb check (jsonb_typeof(schema) = 'object' and pg_column_size(schema) <= 262144),
  current_version integer not null default 0 check (current_version >= 0),
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  source_system text,
  source_id text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create unique index if not exists forge_form_templates_source_idx
  on public.forge_form_templates (organization_id, source_system, source_id)
  where source_id is not null;

create index if not exists forge_form_templates_org_idx
  on public.forge_form_templates (organization_id, status, title);

create table if not exists public.forge_form_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.forge_form_templates(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  schema jsonb not null check (jsonb_typeof(schema) = 'object' and pg_column_size(schema) <= 262144),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (template_id, version)
);

-- A published version never changes: submissions are read against the exact form they were filled on.
create or replace function public.forge_form_template_versions_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Published form versions cannot be changed.';
end;
$$;

drop trigger if exists forge_form_template_versions_immutable on public.forge_form_template_versions;
create trigger forge_form_template_versions_immutable
before update on public.forge_form_template_versions
for each row execute function public.forge_form_template_versions_immutable();

create table if not exists public.forge_form_submission_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, submission_year)
);

create or replace function public.next_forge_form_submission_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  insert into public.forge_form_submission_sequences (organization_id, submission_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, submission_year)
  do update set next_value = public.forge_form_submission_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'FRM-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_form_submission_number(uuid) from public;
grant execute on function public.next_forge_form_submission_number(uuid) to service_role;

create table if not exists public.forge_form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_number text not null,
  template_id uuid not null references public.forge_form_templates(id) on delete restrict,
  template_version_id uuid references public.forge_form_template_versions(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 300),
  status text not null default 'draft' check (status in ('draft', 'pending_signature', 'submitted', 'archived')),
  -- Field id → answer. A signature answer is {image, signedAt, signedByName, signedByUserId, method}.
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 4194304),
  subject_personnel_id uuid references public.forge_personnel(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  row_version bigint not null default 1,
  source_system text,
  source_id text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (organization_id, submission_number)
);

create unique index if not exists forge_form_submissions_source_idx
  on public.forge_form_submissions (organization_id, source_system, source_id)
  where source_id is not null;

create index if not exists forge_form_submissions_org_idx
  on public.forge_form_submissions (organization_id, status, submitted_at desc);

create index if not exists forge_form_submissions_template_idx
  on public.forge_form_submissions (template_id);

create index if not exists forge_form_submissions_subject_idx
  on public.forge_form_submissions (subject_personnel_id)
  where subject_personnel_id is not null;

-- Remote "send a link to sign" requests. Only the sha256 of the token is stored.
create table if not exists public.forge_form_sign_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.forge_form_submissions(id) on delete cascade,
  field_id text not null check (char_length(field_id) between 1 and 200),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  requested_for_personnel_id uuid references public.forge_personnel(id) on delete set null,
  requested_for_user_id uuid references auth.users(id) on delete set null,
  requested_for_name text check (requested_for_name is null or char_length(requested_for_name) <= 200),
  requested_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists forge_form_sign_requests_submission_idx
  on public.forge_form_sign_requests (submission_id);

create table if not exists public.forge_form_submission_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.forge_form_submissions(id) on delete cascade,
  activity_type text not null,
  message text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_form_submission_activity_idx
  on public.forge_form_submission_activity (submission_id, created_at);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.forge_form_templates enable row level security;
alter table public.forge_form_template_versions enable row level security;
alter table public.forge_form_submission_sequences enable row level security;
alter table public.forge_form_submissions enable row level security;
alter table public.forge_form_sign_requests enable row level security;
alter table public.forge_form_submission_activity enable row level security;

drop policy if exists forge_form_templates_member_select on public.forge_form_templates;
create policy forge_form_templates_member_select
on public.forge_form_templates for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_form_template_versions_member_select on public.forge_form_template_versions;
create policy forge_form_template_versions_member_select
on public.forge_form_template_versions for select to authenticated
using (public.is_org_member(organization_id));

revoke all on public.forge_form_templates, public.forge_form_template_versions, public.forge_form_submission_sequences,
  public.forge_form_submissions, public.forge_form_sign_requests, public.forge_form_submission_activity
  from anon, authenticated;

grant select on public.forge_form_templates, public.forge_form_template_versions to authenticated;

grant all on public.forge_form_templates, public.forge_form_template_versions, public.forge_form_submission_sequences,
  public.forge_form_submissions, public.forge_form_sign_requests, public.forge_form_submission_activity
  to service_role;

grant usage, select on sequence public.forge_form_submission_activity_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forms.view', 'forms', 'View Form Submissions', 'See the form library and form submissions within the assigned scope.', 'Forms', 'view', true, true, 'own', false, false, false, 'normal', 10),
  ('forms.submit', 'forms', 'Fill Out Forms', 'Fill out forms, save drafts and submit them.', 'Forms', 'create', true, true, 'own', false, false, true, 'normal', 20),
  ('forms.edit', 'forms', 'Edit Form Submissions', 'Edit and re-save other people''s form submissions within the assigned scope.', 'Forms', 'edit', true, true, 'location', false, false, true, 'normal', 30),
  ('forms.sign_director', 'forms', 'Sign as EHS Director', 'Sign the EHS Director / Safety Director signature on forms.', 'Forms', 'approve', true, true, 'organization', true, false, true, 'sensitive', 40),
  ('forms.manage', 'forms', 'Manage Form Templates', 'Build, publish, import and archive the company''s form templates.', 'Forms', 'configure', true, false, 'organization', true, false, true, 'sensitive', 50),
  ('forms.export', 'forms', 'Print and Export Forms', 'Print blank forms and filled submissions.', 'Forms', 'export', true, true, 'own', false, false, true, 'normal', 60),
  ('forms.archive', 'forms', 'Archive Form Submissions', 'Archive form submissions.', 'Forms', 'archive', true, true, 'organization', true, true, true, 'sensitive', 70)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_assignable = excluded.tenant_assignable, tenant_can_scope = excluded.tenant_can_scope,
    default_scope = excluded.default_scope, is_sensitive = excluded.is_sensitive, requires_confirmation = excluded.requires_confirmation,
    audit_use = excluded.audit_use, danger_level = excluded.danger_level, sort_order = excluded.sort_order, updated_at = now();

-- Role templates.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'forms.view'
where rt.template_key = 'read-only'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('forms.view', 'forms.submit', 'forms.export')
where rt.template_key = 'standard-user'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('forms.view', 'forms.submit', 'forms.edit', 'forms.export')
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'forms'
where rt.template_key in ('safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'forms.view'
where r.role_key = 'read-only'
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('forms.view', 'forms.submit', 'forms.export')
where r.role_key = 'employee'
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('forms.view', 'forms.submit', 'forms.edit', 'forms.export')
where r.role_key in ('supervisor', 'location-administrator')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'forms'
where r.role_key in ('company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order,
   platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.forms', f.id, 'menu', 'Forms', 'Forms', 'Company forms, submissions and signatures.', '/forms', 'forms', 'Risk & Prevention', 118,
       true, 'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
       '{"route_live": true, "required_permission": "forms.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'forms'
on conflict (element_key) do update
set feature_id = excluded.feature_id, name = excluded.name, route = excluded.route, category = excluded.category,
    sort_order = excluded.sort_order, settings = excluded.settings, updated_at = now();
