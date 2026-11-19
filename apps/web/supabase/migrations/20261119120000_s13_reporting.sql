-- Port slice 13: Reporting (Industrial 1.0 reporting module).
--
-- A report library built on each module's own scoped data, saved reports (private or shared with the company),
-- scheduled delivery and run history. The built-in reports are defined in code (src/lib/forgeReportCatalog.ts);
-- these tables only hold what people save and what ran.
--
-- Fixes over 1.0:
-- - A report needs that module's view permission and follows its scope (1.0 let anyone with basic Industrial
--   access run every report, workers' comp and personnel included).
-- - Shared reports run with the viewer's own permissions; 1.0 stored shares and never checked them.
-- - Saved reports, history and schedules belong to a person: you see your own and the ones shared with the
--   company, not everyone's.
-- - A schedule runs for each recipient with that recipient's permissions, and recipients must be members of the
--   company (1.0 ran schedules as an arbitrary admin with full access and mailed any address).
-- - Schedules keep their time zone (1.0 stored it and ran in UTC).
-- - Exports are made on demand; no files are kept in the database (1.0 kept base64 copies forever).

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

update public.forge_feature_registry
set name = 'Reporting',
    description = 'Report library across modules, saved reports, scheduled delivery and CSV / PDF exports.',
    platform_state = 'enabled',
    updated_at = now()
where feature_key = 'reporting';

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'reporting'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

update public.forge_experience_elements
set default_description = 'Reports across modules, saved reports and scheduled delivery.',
    route = '/reporting',
    category = 'System Tools',
    settings = coalesce(settings, '{}'::jsonb) || '{"route_live": true, "required_permission": "reporting.view"}'::jsonb,
    updated_at = now()
where element_key = 'nav.reporting';

-- ---------------------------------------------------------------------------
-- Saved reports
-- ---------------------------------------------------------------------------

create table if not exists public.forge_saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- A built-in report key from the catalog in code.
  report_key text not null check (report_key ~ '^[a-z_]+\.[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  -- The person's picks (period, location, status, group by, columns), cleaned against the report on save and
  -- again on every run.
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  -- private: only the owner. organization: everyone in the company who may run the report.
  visibility text not null default 'private' check (visibility in ('private', 'organization')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_saved_reports_owner_idx on public.forge_saved_reports (organization_id, owner_user_id) where archived_at is null;
create index if not exists forge_saved_reports_shared_idx on public.forge_saved_reports (organization_id) where archived_at is null and visibility = 'organization';

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

create table if not exists public.forge_report_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  saved_report_id uuid not null unique references public.forge_saved_reports(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  -- Local hour in the schedule's own time zone.
  hour integer not null check (hour between 0 and 23),
  -- 0 = Sunday.
  weekday integer not null default 1 check (weekday between 0 and 6),
  -- 1-28 so every month has it.
  monthday integer not null default 1 check (monthday between 1 and 28),
  timezone text not null check (char_length(timezone) between 1 and 64),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_status text check (last_status is null or last_status in ('sent', 'skipped', 'failed')),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_report_schedules_due_idx on public.forge_report_schedules (next_run_at) where enabled;

-- Recipients are company members only; each gets the report as their own permissions allow.
create table if not exists public.forge_report_schedule_recipients (
  schedule_id uuid not null references public.forge_report_schedules(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

create index if not exists forge_report_schedule_recipients_user_idx on public.forge_report_schedule_recipients (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- Run history
-- ---------------------------------------------------------------------------

create table if not exists public.forge_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Who the report ran for (the viewer, or the recipient of a scheduled run).
  user_id uuid not null references auth.users(id) on delete cascade,
  report_key text not null,
  saved_report_id uuid references public.forge_saved_reports(id) on delete set null,
  schedule_id uuid references public.forge_report_schedules(id) on delete set null,
  kind text not null check (kind in ('view', 'csv', 'pdf', 'scheduled')),
  params jsonb not null default '{}'::jsonb,
  row_count integer check (row_count is null or row_count >= 0),
  status text not null check (status in ('succeeded', 'failed', 'denied')),
  error text check (error is null or char_length(error) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists forge_report_runs_user_idx on public.forge_report_runs (organization_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- A schedule, its recipients and its runs stay in the saved report's company.
create or replace function public.forge_report_same_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if tg_table_name = 'forge_report_schedules' then
    select organization_id into v_org from public.forge_saved_reports where id = new.saved_report_id;
  elsif tg_table_name = 'forge_report_schedule_recipients' then
    select organization_id into v_org from public.forge_report_schedules where id = new.schedule_id;

    if not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = new.organization_id and m.user_id = new.user_id and m.is_active
    ) then
      raise exception 'Report recipients must be active members of the company.' using errcode = '23514';
    end if;
  end if;

  if v_org is distinct from new.organization_id then
    raise exception 'Report records must stay in one company.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_report_schedules_same_org on public.forge_report_schedules;
create trigger forge_report_schedules_same_org
  before insert or update on public.forge_report_schedules
  for each row execute function public.forge_report_same_organization();

drop trigger if exists forge_report_schedule_recipients_same_org on public.forge_report_schedule_recipients;
create trigger forge_report_schedule_recipients_same_org
  before insert or update on public.forge_report_schedule_recipients
  for each row execute function public.forge_report_same_organization();

-- Run history is a record of what happened: it can't be edited. The one change allowed is dropping the link to a
-- saved report or schedule that was deleted (the foreign keys' "on delete set null"); everything else stays.
create or replace function public.forge_report_runs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'saved_report_id' - 'schedule_id') = (to_jsonb(old) - 'saved_report_id' - 'schedule_id')
    and (new.saved_report_id is null or new.saved_report_id = old.saved_report_id)
    and (new.schedule_id is null or new.schedule_id = old.schedule_id) then
    return new;
  end if;

  raise exception 'Report run history can''t be changed.' using errcode = '42501';
end;
$$;

drop trigger if exists forge_report_runs_no_update on public.forge_report_runs;
create trigger forge_report_runs_no_update
  before update on public.forge_report_runs
  for each row execute function public.forge_report_runs_immutable();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_saved_reports enable row level security;
alter table public.forge_report_schedules enable row level security;
alter table public.forge_report_schedule_recipients enable row level security;
alter table public.forge_report_runs enable row level security;

revoke all on public.forge_saved_reports, public.forge_report_schedules, public.forge_report_schedule_recipients, public.forge_report_runs
  from anon, authenticated;

grant all on public.forge_saved_reports, public.forge_report_schedules, public.forge_report_schedule_recipients, public.forge_report_runs
  to service_role;

revoke all on function public.forge_report_same_organization() from public, anon, authenticated;
revoke all on function public.forge_report_runs_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

update public.forge_permission_registry
set name = 'View Reports',
    description = 'Open the report library and run the reports for modules you can already see, with your own scope.',
    updated_at = now()
where permission_key = 'reporting.view';

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('reporting.export', 'reporting', 'Export Reports', 'Download reports as CSV or PDF.', 'Reporting', 'export', true, false, 'organization', false, false, true, 'normal', 20),
  ('reporting.share', 'reporting', 'Share Saved Reports', 'Share saved reports with everyone in the company. They still see only what their own permissions allow.', 'Reporting', 'edit', true, false, 'organization', false, false, true, 'normal', 30),
  ('reporting.schedule', 'reporting', 'Schedule Reports', 'Send saved reports on a schedule to people in the company.', 'Reporting', 'edit', true, false, 'organization', false, false, true, 'normal', 40),
  ('reporting.view_sensitive', 'reporting', 'View Sensitive Report Columns', 'See sensitive columns such as workers'' comp claim notes and body parts in reports.', 'Reporting', 'view', true, false, 'organization', true, false, true, 'sensitive', 50)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level, sort_order = excluded.sort_order, updated_at = now();

-- Role templates. reporting.view is already granted to read-only, supervisor, safety-manager and company-admin.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('reporting.export', 'reporting.schedule')
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'reporting'
where rt.template_key in ('safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('reporting.export', 'reporting.schedule')
where r.role_key in ('supervisor', 'location-administrator')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'reporting'
where r.role_key in ('company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
