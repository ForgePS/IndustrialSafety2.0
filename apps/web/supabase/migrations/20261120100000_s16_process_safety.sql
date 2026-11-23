-- Port slice 16: Process Safety (Industrial 1.0 "process-safety" module).
--
-- Management of change (MOC) with named approvers, a pre-startup safety review (PSSR), linked controlled
-- documents and an activity history nobody can edit; process hazard analyses (PHA) with five-year
-- revalidation. MOC actions and PHA recommendations are Corrective Actions, so they get owners, due dates,
-- reminders and verification from that module; forge_psm_actions links each one to its MOC or PHA.
--
-- 1.0 had a single generic table of titled rows ("moc" category) with a status and nothing else. This slice is
-- built from the parity matrix's description of the module.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('process_safety', 'Process Safety', 'Management of change with approvals and pre-startup safety review, and process hazard analyses with revalidation.', 'Compliance', 'module', 'enabled', true, true, true, true, false, 170)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'process_safety'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.process_safety', f.id, 'menu', 'Process Safety', 'Process Safety', 'Management of change and process hazard analyses.', '/process-safety', 'process-safety', 'Compliance Programs', 170, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "process_safety.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'process_safety'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Numbering: MOC-2026-0001, PHA-2026-0001 (per company, per year)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_psm_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('moc', 'pha')),
  seq_year integer not null,
  next_value integer not null default 1,
  primary key (organization_id, kind, seq_year)
);

create or replace function public.next_forge_psm_number(p_organization_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  if p_kind not in ('moc', 'pha') then
    raise exception 'Unknown process safety record kind.' using errcode = '22023';
  end if;

  insert into public.forge_psm_sequences (organization_id, kind, seq_year, next_value)
  values (p_organization_id, p_kind, v_year, 2)
  on conflict (organization_id, kind, seq_year)
  do update set next_value = public.forge_psm_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return upper(p_kind) || '-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.next_forge_psm_number(uuid, text) from public, anon, authenticated;
grant execute on function public.next_forge_psm_number(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Management of change
-- ---------------------------------------------------------------------------

create table if not exists public.forge_moc_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  moc_number text not null check (moc_number ~ '^MOC-[0-9]{4}-[0-9]{4,}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  change_type text not null check (change_type in ('process', 'equipment', 'chemical', 'procedure', 'controls', 'facility', 'organizational', 'other')),
  location_id uuid not null references public.locations(id) on delete restrict,
  asset_id uuid references public.forge_assets(id) on delete set null,
  description text not null check (char_length(btrim(description)) between 1 and 10000),
  reason text not null check (char_length(btrim(reason)) between 1 and 5000),
  technical_basis text check (technical_basis is null or char_length(technical_basis) <= 10000),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  impacts text[] not null default '{}'
    check (impacts <@ array['psi', 'procedures', 'training', 'mechanical_integrity', 'hazard_review', 'emergency', 'permits']::text[]),
  is_temporary boolean not null default false,
  temporary_until date,
  requires_pssr boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'rejected', 'implemented', 'closed', 'canceled')),
  owner_user_id uuid references auth.users(id) on delete set null,
  pssr_answers jsonb,
  pssr_completed_at timestamptz,
  pssr_completed_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  implemented_at timestamptz,
  implemented_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_moc_changes_number_unique unique (organization_id, moc_number),
  -- A temporary change always has its revert-by date; a permanent one never does.
  constraint forge_moc_changes_temporary check (is_temporary = (temporary_until is not null)),
  constraint forge_moc_changes_pssr_pair check ((pssr_answers is null) = (pssr_completed_at is null)),
  constraint forge_moc_changes_pssr_needed check (requires_pssr or pssr_completed_at is null),
  -- Each step's timestamp is set exactly when the change has reached that step.
  constraint forge_moc_changes_implemented check ((implemented_at is not null) = (status in ('implemented', 'closed'))),
  constraint forge_moc_changes_closed check ((closed_at is not null) = (status = 'closed')),
  constraint forge_moc_changes_canceled check ((status = 'canceled') = (canceled_at is not null and cancel_reason is not null)),
  constraint forge_moc_changes_startup_review check (status not in ('implemented', 'closed') or not requires_pssr or pssr_completed_at is not null)
);

create index if not exists forge_moc_changes_org_status_idx on public.forge_moc_changes (organization_id, status);
create index if not exists forge_moc_changes_location_idx on public.forge_moc_changes (organization_id, location_id);

create table if not exists public.forge_moc_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  moc_id uuid not null references public.forge_moc_changes(id) on delete cascade,
  approver_user_id uuid not null references auth.users(id) on delete cascade,
  role_label text check (role_label is null or char_length(role_label) <= 80),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  comment text check (comment is null or char_length(comment) <= 2000),
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_moc_approvals_unique unique (moc_id, approver_user_id),
  constraint forge_moc_approvals_decided check ((decision = 'pending') = (decided_at is null)),
  constraint forge_moc_approvals_reject_reason check (decision <> 'rejected' or comment is not null)
);

create index if not exists forge_moc_approvals_approver_idx on public.forge_moc_approvals (organization_id, approver_user_id, decision);

create table if not exists public.forge_moc_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  moc_id uuid not null references public.forge_moc_changes(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_moc_documents_unique unique (moc_id, document_id)
);

-- ---------------------------------------------------------------------------
-- Process hazard analyses
-- ---------------------------------------------------------------------------

create table if not exists public.forge_pha_studies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pha_number text not null check (pha_number ~ '^PHA-[0-9]{4}-[0-9]{4,}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  process_unit text not null check (char_length(btrim(process_unit)) between 1 and 200),
  location_id uuid not null references public.locations(id) on delete restrict,
  method text not null check (method in ('hazop', 'what_if', 'checklist', 'what_if_checklist', 'fmea', 'fault_tree', 'lopa', 'other')),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  leader_name text check (leader_name is null or char_length(leader_name) <= 120),
  team text check (team is null or char_length(team) <= 2000),
  started_on date,
  completed_on date,
  revalidate_by date,
  summary text check (summary is null or char_length(summary) <= 10000),
  moc_id uuid references public.forge_moc_changes(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_pha_studies_number_unique unique (organization_id, pha_number),
  constraint forge_pha_studies_completed check ((status = 'completed') = (completed_on is not null)),
  constraint forge_pha_studies_dates check (started_on is null or completed_on is null or completed_on >= started_on),
  -- OSHA 1910.119(e)(6): revalidate at least every five years.
  constraint forge_pha_studies_revalidation check (
    (completed_on is null and revalidate_by is null)
    or (completed_on is not null and revalidate_by is not null and revalidate_by > completed_on and revalidate_by <= (completed_on + interval '5 years')::date)
  )
);

create index if not exists forge_pha_studies_org_idx on public.forge_pha_studies (organization_id, revalidate_by);

-- ---------------------------------------------------------------------------
-- Actions (MOC actions and PHA recommendations), each tracked as a Corrective Action
-- ---------------------------------------------------------------------------

create table if not exists public.forge_psm_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  moc_id uuid references public.forge_moc_changes(id) on delete cascade,
  pha_id uuid references public.forge_pha_studies(id) on delete cascade,
  phase text check (phase is null or phase in ('before_startup', 'after_startup')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  capa_id uuid references public.forge_corrective_actions(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_psm_actions_parent check (num_nonnulls(moc_id, pha_id) = 1),
  -- MOC actions say whether they block startup; PHA recommendations don't.
  constraint forge_psm_actions_phase check ((moc_id is not null) = (phase is not null)),
  constraint forge_psm_actions_removed check ((removed_at is null) = (removed_reason is null))
);

create index if not exists forge_psm_actions_moc_idx on public.forge_psm_actions (moc_id) where moc_id is not null;
create index if not exists forge_psm_actions_pha_idx on public.forge_psm_actions (pha_id) where pha_id is not null;
create unique index if not exists forge_psm_actions_capa_idx on public.forge_psm_actions (capa_id) where capa_id is not null;

-- ---------------------------------------------------------------------------
-- Activity history (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_psm_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  moc_id uuid references public.forge_moc_changes(id) on delete cascade,
  pha_id uuid references public.forge_pha_studies(id) on delete cascade,
  activity_type text not null check (char_length(activity_type) between 1 and 60),
  message text not null check (char_length(message) between 1 and 1000),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint forge_psm_activity_parent check (num_nonnulls(moc_id, pha_id) = 1)
);

create index if not exists forge_psm_activity_moc_idx on public.forge_psm_activity (moc_id, created_at) where moc_id is not null;
create index if not exists forge_psm_activity_pha_idx on public.forge_psm_activity (pha_id, created_at) where pha_id is not null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Linked records stay in one company; numbers and parents never change; closed or canceled changes are frozen;
-- approval decisions are only made while the change is in review.
create or replace function public.forge_psm_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_status text;
begin
  if tg_table_name = 'forge_moc_changes' then
    if tg_op = 'UPDATE' then
      if new.organization_id <> old.organization_id or new.moc_number <> old.moc_number then
        raise exception 'A change''s company and number can''t change.' using errcode = '42501';
      end if;
      -- Frozen, except for links cleared by "on delete set null" when equipment or a user is deleted.
      if old.status in ('closed', 'canceled')
        and (to_jsonb(new) - array['asset_id', 'owner_user_id', 'pssr_completed_by', 'implemented_by', 'closed_by', 'canceled_by', 'created_by', 'updated_by'])
          is distinct from (to_jsonb(old) - array['asset_id', 'owner_user_id', 'pssr_completed_by', 'implemented_by', 'closed_by', 'canceled_by', 'created_by', 'updated_by']) then
        raise exception 'A closed or canceled change can''t be edited.' using errcode = '42501';
      end if;
    end if;
    if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    if new.asset_id is not null and not exists (select 1 from public.forge_assets a where a.id = new.asset_id and a.organization_id = new.organization_id) then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    if new.owner_user_id is not null and (tg_op = 'INSERT' or new.owner_user_id is distinct from old.owner_user_id) and not exists (
      select 1 from public.organization_memberships m where m.organization_id = new.organization_id and m.user_id = new.owner_user_id and m.is_active
    ) then
      raise exception 'The change owner must be an active member of the company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_pha_studies' then
    if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.pha_number <> old.pha_number) then
      raise exception 'A study''s company and number can''t change.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    if new.moc_id is not null and not exists (select 1 from public.forge_moc_changes c where c.id = new.moc_id and c.organization_id = new.organization_id) then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_moc_approvals' then
    select organization_id, status into v_org, v_status from public.forge_moc_changes where id = new.moc_id;
    if v_org is distinct from new.organization_id then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
      if v_status not in ('draft', 'rejected') then
        raise exception 'Approvers can only be changed before the change is submitted.' using errcode = '42501';
      end if;
      if not exists (select 1 from public.organization_memberships m where m.organization_id = new.organization_id and m.user_id = new.approver_user_id and m.is_active) then
        raise exception 'Approvers must be active members of the company.' using errcode = '23514';
      end if;
    else
      if new.moc_id <> old.moc_id or new.approver_user_id <> old.approver_user_id or new.organization_id <> old.organization_id then
        raise exception 'An approval belongs to one change and one approver.' using errcode = '42501';
      end if;
      if new.decision <> 'pending' and new.decision is distinct from old.decision and v_status <> 'in_review' then
        raise exception 'Approvals can only be decided while the change is in review.' using errcode = '42501';
      end if;
      if new.decision = 'pending' and old.decision <> 'pending' and v_status not in ('draft', 'rejected') then
        raise exception 'Approvals are only reset when the change goes back for review.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_moc_documents' then
    select organization_id into v_org from public.forge_moc_changes where id = new.moc_id;
    if v_org is distinct from new.organization_id
      or not exists (select 1 from public.forge_documents d where d.id = new.document_id and d.organization_id = new.organization_id) then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name in ('forge_psm_actions', 'forge_psm_activity') then
    if tg_op = 'UPDATE' then
      if tg_table_name = 'forge_psm_activity' then
        raise exception 'Process safety history can''t be changed.' using errcode = '42501';
      end if;
      if new.moc_id is distinct from old.moc_id or new.pha_id is distinct from old.pha_id or new.organization_id <> old.organization_id
        or (old.capa_id is not null and new.capa_id is distinct from old.capa_id) then
        raise exception 'An action stays with its change or study and its Corrective Action.' using errcode = '42501';
      end if;
    end if;
    if new.moc_id is not null then
      select organization_id into v_org from public.forge_moc_changes where id = new.moc_id;
    else
      select organization_id into v_org from public.forge_pha_studies where id = new.pha_id;
    end if;
    if v_org is distinct from new.organization_id then
      raise exception 'Process safety records must stay in one company.' using errcode = '23514';
    end if;
    -- Nested: plpgsql doesn't short-circuit, and activity rows have no capa_id.
    if tg_table_name = 'forge_psm_actions' then
      if new.capa_id is not null
        and not exists (select 1 from public.forge_corrective_actions ca where ca.id = new.capa_id and ca.organization_id = new.organization_id) then
        raise exception 'Process safety records must stay in one company.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_moc_changes_guard on public.forge_moc_changes;
create trigger forge_moc_changes_guard before insert or update on public.forge_moc_changes for each row execute function public.forge_psm_guard();

drop trigger if exists forge_moc_approvals_guard on public.forge_moc_approvals;
create trigger forge_moc_approvals_guard before insert or update on public.forge_moc_approvals for each row execute function public.forge_psm_guard();

drop trigger if exists forge_moc_documents_guard on public.forge_moc_documents;
create trigger forge_moc_documents_guard before insert or update on public.forge_moc_documents for each row execute function public.forge_psm_guard();

drop trigger if exists forge_pha_studies_guard on public.forge_pha_studies;
create trigger forge_pha_studies_guard before insert or update on public.forge_pha_studies for each row execute function public.forge_psm_guard();

drop trigger if exists forge_psm_actions_guard on public.forge_psm_actions;
create trigger forge_psm_actions_guard before insert or update on public.forge_psm_actions for each row execute function public.forge_psm_guard();

drop trigger if exists forge_psm_activity_guard on public.forge_psm_activity;
create trigger forge_psm_activity_guard before insert or update on public.forge_psm_activity for each row execute function public.forge_psm_guard();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_psm_sequences enable row level security;
alter table public.forge_moc_changes enable row level security;
alter table public.forge_moc_approvals enable row level security;
alter table public.forge_moc_documents enable row level security;
alter table public.forge_pha_studies enable row level security;
alter table public.forge_psm_actions enable row level security;
alter table public.forge_psm_activity enable row level security;

revoke all on public.forge_psm_sequences, public.forge_moc_changes, public.forge_moc_approvals, public.forge_moc_documents,
  public.forge_pha_studies, public.forge_psm_actions, public.forge_psm_activity
  from anon, authenticated;

grant all on public.forge_psm_sequences, public.forge_moc_changes, public.forge_moc_approvals, public.forge_moc_documents,
  public.forge_pha_studies, public.forge_psm_actions, public.forge_psm_activity
  to service_role;

revoke all on function public.forge_psm_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('process_safety.view', 'process_safety', 'View Process Safety', 'See management of change records, their approvals, actions and documents, and process hazard analyses. Location scope sees its own locations.', 'Process Safety', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('process_safety.manage', 'process_safety', 'Manage Process Safety', 'Raise and edit changes, pick approvers, add actions and documents, submit, implement, close or cancel changes, and record process hazard analyses.', 'Process Safety', 'manage', true, true, 'organization', false, false, true, 'normal', 20),
  ('process_safety.approve', 'process_safety', 'Approve Changes', 'Be named as an approver on a management of change and approve or reject it. Nobody approves a change they raised or own.', 'Process Safety', 'approve', true, true, 'organization', false, true, true, 'sensitive', 30),
  ('process_safety.pssr', 'process_safety', 'Sign Off Pre-Startup Safety Reviews', 'Complete the pre-startup safety review that must be done before a change is put into service.', 'Process Safety', 'pssr', true, true, 'organization', false, true, true, 'sensitive', 40)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('read-only', 'process_safety.view', 'organization'),
  ('supervisor', 'process_safety.view', 'location'),
  ('safety-manager', 'process_safety.view', 'organization'),
  ('safety-manager', 'process_safety.manage', 'organization'),
  ('safety-manager', 'process_safety.approve', 'organization'),
  ('safety-manager', 'process_safety.pssr', 'organization'),
  ('company-admin', 'process_safety.view', 'organization'),
  ('company-admin', 'process_safety.manage', 'organization'),
  ('company-admin', 'process_safety.approve', 'organization'),
  ('company-admin', 'process_safety.pssr', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('read-only', 'process_safety.view', 'organization'),
  ('supervisor', 'process_safety.view', 'location'),
  ('location-administrator', 'process_safety.view', 'location'),
  ('location-administrator', 'process_safety.manage', 'location'),
  ('location-administrator', 'process_safety.approve', 'location'),
  ('location-administrator', 'process_safety.pssr', 'location'),
  ('company-administrator', 'process_safety.view', 'organization'),
  ('company-administrator', 'process_safety.manage', 'organization'),
  ('company-administrator', 'process_safety.approve', 'organization'),
  ('company-administrator', 'process_safety.pssr', 'organization'),
  ('company-owner', 'process_safety.view', 'organization'),
  ('company-owner', 'process_safety.manage', 'organization'),
  ('company-owner', 'process_safety.approve', 'organization'),
  ('company-owner', 'process_safety.pssr', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
