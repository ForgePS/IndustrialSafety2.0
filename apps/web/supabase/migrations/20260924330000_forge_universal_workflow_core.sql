-- NX-01 Universal Workflow + Shared Evidence Core
-- Shared infrastructure for future modules. CAPA remains lifecycle SoR; workflow syncs as adapter.

-- ----------------------------------------------------------------------------
-- Workflow definitions / states / transitions
-- ----------------------------------------------------------------------------

create table if not exists public.forge_workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  workflow_key text not null,
  name text not null,
  description text,
  resource_type text not null,
  version integer not null default 1 check (version >= 1),
  is_core boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint forge_workflow_definitions_key_len check (char_length(workflow_key) between 1 and 120),
  constraint forge_workflow_definitions_name_len check (char_length(name) between 1 and 200),
  constraint forge_workflow_definitions_core_org check (
    (is_core = true and organization_id is null) or (is_core = false)
  )
);

create unique index if not exists forge_workflow_definitions_core_uniq
  on public.forge_workflow_definitions (workflow_key, version)
  where organization_id is null;

create unique index if not exists forge_workflow_definitions_tenant_uniq
  on public.forge_workflow_definitions (organization_id, workflow_key, version)
  where organization_id is not null;

create index if not exists forge_workflow_definitions_resource_idx
  on public.forge_workflow_definitions (resource_type, is_active);

create table if not exists public.forge_workflow_states (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.forge_workflow_definitions(id) on delete cascade,
  state_key text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  locks_record boolean not null default false,
  created_at timestamptz not null default now(),
  constraint forge_workflow_states_key_len check (char_length(state_key) between 1 and 80),
  unique (workflow_definition_id, state_key)
);

create unique index if not exists forge_workflow_states_one_initial
  on public.forge_workflow_states (workflow_definition_id)
  where is_initial = true;

create table if not exists public.forge_workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.forge_workflow_definitions(id) on delete cascade,
  transition_key text not null,
  name text not null,
  from_state_key text not null,
  to_state_key text not null,
  required_permission text,
  requires_comment boolean not null default false,
  requires_confirmation boolean not null default false,
  requires_approval boolean not null default false,
  approval_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  rule_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_workflow_transitions_key_len check (char_length(transition_key) between 1 and 120),
  unique (workflow_definition_id, transition_key)
);

create index if not exists forge_workflow_transitions_from_idx
  on public.forge_workflow_transitions (workflow_definition_id, from_state_key, is_active);

-- ----------------------------------------------------------------------------
-- Workflow instances + immutable events + idempotency
-- ----------------------------------------------------------------------------

create table if not exists public.forge_workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_definition_id uuid not null references public.forge_workflow_definitions(id),
  workflow_version integer not null check (workflow_version >= 1),
  resource_type text not null,
  resource_id uuid not null,
  current_state_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resource_type, resource_id, workflow_definition_id)
);

create index if not exists forge_workflow_instances_resource_idx
  on public.forge_workflow_instances (organization_id, resource_type, resource_id);

create index if not exists forge_workflow_instances_state_idx
  on public.forge_workflow_instances (organization_id, current_state_key, updated_at desc);

create table if not exists public.forge_workflow_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_instance_id uuid not null references public.forge_workflow_instances(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  transition_key text,
  from_state_key text,
  to_state_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_personnel_id uuid,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists forge_workflow_events_instance_idx
  on public.forge_workflow_events (organization_id, workflow_instance_id, occurred_at);

create index if not exists forge_workflow_events_resource_idx
  on public.forge_workflow_events (organization_id, resource_type, resource_id, occurred_at);

create table if not exists public.forge_workflow_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_instance_id uuid not null references public.forge_workflow_instances(id) on delete cascade,
  idempotency_key text not null,
  transition_key text not null,
  result_event_id uuid references public.forge_workflow_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, workflow_instance_id, idempotency_key)
);

-- ----------------------------------------------------------------------------
-- Shared record links (polymorphic; keep forge_incident_assets specialized)
-- ----------------------------------------------------------------------------

create table if not exists public.forge_record_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_resource_type text not null,
  source_resource_id uuid not null,
  target_resource_type text not null,
  target_resource_id uuid not null,
  relationship_type text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  constraint forge_record_links_types_len check (
    char_length(source_resource_type) between 1 and 80
    and char_length(target_resource_type) between 1 and 80
    and char_length(relationship_type) between 1 and 80
  ),
  constraint forge_record_links_not_self check (
    source_resource_type <> target_resource_type or source_resource_id <> target_resource_id
  )
);

create unique index if not exists forge_record_links_active_uniq
  on public.forge_record_links (
    organization_id,
    source_resource_type,
    source_resource_id,
    target_resource_type,
    target_resource_id,
    relationship_type
  )
  where archived_at is null;

create index if not exists forge_record_links_source_idx
  on public.forge_record_links (organization_id, source_resource_type, source_resource_id)
  where archived_at is null;

create index if not exists forge_record_links_target_idx
  on public.forge_record_links (organization_id, target_resource_type, target_resource_id)
  where archived_at is null;

-- ----------------------------------------------------------------------------
-- Approvals
-- ----------------------------------------------------------------------------

create table if not exists public.forge_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  workflow_instance_id uuid references public.forge_workflow_instances(id) on delete set null,
  approval_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'canceled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_approval_requests_resource_idx
  on public.forge_approval_requests (organization_id, resource_type, resource_id, status);

create table if not exists public.forge_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_request_id uuid not null references public.forge_approval_requests(id) on delete cascade,
  step_order integer not null default 1,
  approver_user_id uuid references auth.users(id) on delete set null,
  approver_role_key text,
  required_count integer not null default 1 check (required_count >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'canceled', 'skipped')),
  decision text check (decision is null or decision in ('approved', 'rejected')),
  comment text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (approval_request_id, step_order)
);

-- ----------------------------------------------------------------------------
-- Acknowledgments
-- ----------------------------------------------------------------------------

create table if not exists public.forge_record_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  resource_version text,
  acknowledgement_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  personnel_id uuid,
  acknowledged_at timestamptz not null default now(),
  statement_version text,
  signature_method text not null default 'click_confirm'
    check (signature_method in ('click_confirm', 'typed_name', 'drawn', 'external')),
  signature_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists forge_record_acknowledgements_uniq
  on public.forge_record_acknowledgements (
    organization_id,
    resource_type,
    resource_id,
    acknowledgement_type,
    user_id,
    (coalesce(resource_version, ''))
  );

create index if not exists forge_record_acknowledgements_resource_idx
  on public.forge_record_acknowledgements (organization_id, resource_type, resource_id, acknowledged_at desc);

-- ----------------------------------------------------------------------------
-- Shared comments (polymorphic; module comment tables remain for existing UIs)
-- ----------------------------------------------------------------------------

create table if not exists public.forge_record_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  body text not null check (char_length(body) between 1 and 10000),
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists forge_record_comments_resource_idx
  on public.forge_record_comments (organization_id, resource_type, resource_id, created_at)
  where archived_at is null;

create table if not exists public.forge_record_comment_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  comment_id uuid not null references public.forge_record_comments(id) on delete cascade,
  body text not null,
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Shared activity (read model / cross-module feed; module activity tables remain)
-- ----------------------------------------------------------------------------

create table if not exists public.forge_record_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  activity_type text not null,
  message text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_record_activity_resource_idx
  on public.forge_record_activity (organization_id, resource_type, resource_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Shared evidence / attachments (private bucket, service-role brokered)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-evidence', 'forge-evidence', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create table if not exists public.forge_record_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  evidence_type text not null default 'other'
    check (evidence_type in ('photo', 'document', 'video', 'form', 'signature', 'measurement', 'other')),
  description text,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists forge_record_evidence_resource_idx
  on public.forge_record_evidence (organization_id, resource_type, resource_id, uploaded_at desc)
  where archived_at is null;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.forge_workflow_definitions enable row level security;
alter table public.forge_workflow_states enable row level security;
alter table public.forge_workflow_transitions enable row level security;
alter table public.forge_workflow_instances enable row level security;
alter table public.forge_workflow_events enable row level security;
alter table public.forge_workflow_idempotency_keys enable row level security;
alter table public.forge_record_links enable row level security;
alter table public.forge_approval_requests enable row level security;
alter table public.forge_approval_steps enable row level security;
alter table public.forge_record_acknowledgements enable row level security;
alter table public.forge_record_comments enable row level security;
alter table public.forge_record_comment_revisions enable row level security;
alter table public.forge_record_activity enable row level security;
alter table public.forge_record_evidence enable row level security;

-- Core definitions readable by authenticated users; tenant defs by org members.
drop policy if exists forge_workflow_definitions_select on public.forge_workflow_definitions;
create policy forge_workflow_definitions_select
on public.forge_workflow_definitions for select to authenticated
using (organization_id is null or public.is_org_member(organization_id));

drop policy if exists forge_workflow_states_select on public.forge_workflow_states;
create policy forge_workflow_states_select
on public.forge_workflow_states for select to authenticated
using (
  exists (
    select 1 from public.forge_workflow_definitions d
    where d.id = workflow_definition_id
      and (d.organization_id is null or public.is_org_member(d.organization_id))
  )
);

drop policy if exists forge_workflow_transitions_select on public.forge_workflow_transitions;
create policy forge_workflow_transitions_select
on public.forge_workflow_transitions for select to authenticated
using (
  exists (
    select 1 from public.forge_workflow_definitions d
    where d.id = workflow_definition_id
      and (d.organization_id is null or public.is_org_member(d.organization_id))
  )
);

drop policy if exists forge_workflow_instances_select on public.forge_workflow_instances;
create policy forge_workflow_instances_select
on public.forge_workflow_instances for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_workflow_events_select on public.forge_workflow_events;
create policy forge_workflow_events_select
on public.forge_workflow_events for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_record_links_select on public.forge_record_links;
create policy forge_record_links_select
on public.forge_record_links for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_approval_requests_select on public.forge_approval_requests;
create policy forge_approval_requests_select
on public.forge_approval_requests for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_approval_steps_select on public.forge_approval_steps;
create policy forge_approval_steps_select
on public.forge_approval_steps for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_record_acknowledgements_select on public.forge_record_acknowledgements;
create policy forge_record_acknowledgements_select
on public.forge_record_acknowledgements for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_record_comments_select on public.forge_record_comments;
create policy forge_record_comments_select
on public.forge_record_comments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_record_comment_revisions_select on public.forge_record_comment_revisions;
create policy forge_record_comment_revisions_select
on public.forge_record_comment_revisions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_record_activity_select on public.forge_record_activity;
create policy forge_record_activity_select
on public.forge_record_activity for select to authenticated
using (public.is_org_member(organization_id));

-- Evidence and idempotency: service-role only (brokered by server)
revoke all on public.forge_workflow_idempotency_keys from anon, authenticated;
revoke all on public.forge_record_evidence from anon, authenticated;
grant select on public.forge_workflow_definitions to authenticated;
grant select on public.forge_workflow_states to authenticated;
grant select on public.forge_workflow_transitions to authenticated;
grant select on public.forge_workflow_instances to authenticated;
grant select on public.forge_workflow_events to authenticated;
grant select on public.forge_record_links to authenticated;
grant select on public.forge_approval_requests to authenticated;
grant select on public.forge_approval_steps to authenticated;
grant select on public.forge_record_acknowledgements to authenticated;
grant select on public.forge_record_comments to authenticated;
grant select on public.forge_record_comment_revisions to authenticated;
grant select on public.forge_record_activity to authenticated;

grant all on public.forge_workflow_definitions to service_role;
grant all on public.forge_workflow_states to service_role;
grant all on public.forge_workflow_transitions to service_role;
grant all on public.forge_workflow_instances to service_role;
grant all on public.forge_workflow_events to service_role;
grant all on public.forge_workflow_idempotency_keys to service_role;
grant all on public.forge_record_links to service_role;
grant all on public.forge_approval_requests to service_role;
grant all on public.forge_approval_steps to service_role;
grant all on public.forge_record_acknowledgements to service_role;
grant all on public.forge_record_comments to service_role;
grant all on public.forge_record_comment_revisions to service_role;
grant all on public.forge_record_activity to service_role;
grant all on public.forge_record_evidence to service_role;
grant usage, select on sequence public.forge_record_activity_id_seq to service_role;

-- ----------------------------------------------------------------------------
-- Atomic transition RPC
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_workflow_transition(
  p_organization_id uuid,
  p_instance_id uuid,
  p_expected_state text,
  p_transition_key text,
  p_to_state text,
  p_actor_user_id uuid,
  p_comment text,
  p_metadata jsonb,
  p_idempotency_key text,
  p_complete boolean,
  p_cancel boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
begin
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select result_event_id into v_existing
    from public.forge_workflow_idempotency_keys
    where organization_id = p_organization_id
      and workflow_instance_id = p_instance_id
      and idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'event_id', v_existing);
    end if;
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where id = p_instance_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Workflow instance not found.');
  end if;

  if v_instance.current_state_key is distinct from p_expected_state then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state changed. Reload and try again.',
      'current_state', v_instance.current_state_key
    );
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = p_to_state,
    updated_at = now(),
    completed_at = case when p_complete then now() else completed_at end,
    canceled_at = case when p_cancel then now() else canceled_at end
  where id = p_instance_id;

  insert into public.forge_workflow_events (
    organization_id,
    workflow_instance_id,
    resource_type,
    resource_id,
    transition_key,
    from_state_key,
    to_state_key,
    actor_user_id,
    comment,
    metadata
  ) values (
    p_organization_id,
    p_instance_id,
    v_instance.resource_type,
    v_instance.resource_id,
    p_transition_key,
    p_expected_state,
    p_to_state,
    p_actor_user_id,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    insert into public.forge_workflow_idempotency_keys (
      organization_id,
      workflow_instance_id,
      idempotency_key,
      transition_key,
      result_event_id
    ) values (
      p_organization_id,
      p_instance_id,
      p_idempotency_key,
      p_transition_key,
      v_event_id
    )
    on conflict (organization_id, workflow_instance_id, idempotency_key) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'event_id', v_event_id, 'to_state', p_to_state);
end;
$$;

revoke all on function public.forge_perform_workflow_transition(uuid, uuid, text, text, text, uuid, text, jsonb, text, boolean, boolean) from public;
grant execute on function public.forge_perform_workflow_transition(uuid, uuid, text, text, text, uuid, text, jsonb, text, boolean, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- Seed core CAPA workflow definition (v1)
-- ----------------------------------------------------------------------------

do $$
declare
  v_def_id uuid;
begin
  select id into v_def_id
  from public.forge_workflow_definitions
  where organization_id is null
    and workflow_key = 'corrective_actions.lifecycle'
    and version = 1;

  if v_def_id is null then
    insert into public.forge_workflow_definitions (
      organization_id, workflow_key, name, description, resource_type, version, is_core, is_active
    ) values (
      null,
      'corrective_actions.lifecycle',
      'Corrective Action Lifecycle',
      'Forge core CAPA workflow synchronized with forge_corrective_actions.status.',
      'corrective_action',
      1,
      true,
      true
    )
    returning id into v_def_id;
  end if;

  insert into public.forge_workflow_states (
    workflow_definition_id, state_key, name, sort_order, is_initial, is_terminal, locks_record
  ) values
    (v_def_id, 'open', 'Open', 10, true, false, false),
    (v_def_id, 'in_progress', 'In Progress', 20, false, false, false),
    (v_def_id, 'pending_verification', 'Pending Verification', 30, false, false, false),
    (v_def_id, 'verified', 'Verified', 40, false, false, false),
    (v_def_id, 'closed', 'Closed', 50, false, true, true),
    (v_def_id, 'canceled', 'Canceled', 60, false, true, true)
  on conflict (workflow_definition_id, state_key) do nothing;

  insert into public.forge_workflow_transitions (
    workflow_definition_id, transition_key, name, from_state_key, to_state_key,
    required_permission, requires_comment, requires_confirmation, requires_approval, sort_order, rule_config
  ) values
    (v_def_id, 'start_work', 'Start Work', 'open', 'in_progress', 'corrective_actions.edit', false, false, false, 10, '{}'::jsonb),
    (v_def_id, 'submit_for_verification', 'Submit for Verification', 'open', 'pending_verification', 'corrective_actions.submit', false, true, false, 20, '{"require_owner":true,"require_due_date":true,"require_action_plan":true}'::jsonb),
    (v_def_id, 'submit_for_verification_from_progress', 'Submit for Verification', 'in_progress', 'pending_verification', 'corrective_actions.submit', false, true, false, 30, '{"require_owner":true,"require_due_date":true,"require_action_plan":true}'::jsonb),
    (v_def_id, 'verify_effective', 'Verify Effective', 'pending_verification', 'verified', 'corrective_actions.verify', true, false, false, 40, '{"verification_result":"effective"}'::jsonb),
    (v_def_id, 'verify_ineffective', 'Return Ineffective', 'pending_verification', 'in_progress', 'corrective_actions.verify', true, false, false, 50, '{"verification_result":"ineffective"}'::jsonb),
    (v_def_id, 'close', 'Close', 'verified', 'closed', 'corrective_actions.close', true, true, false, 60, '{}'::jsonb),
    (v_def_id, 'cancel_from_open', 'Cancel', 'open', 'canceled', 'corrective_actions.close', true, true, false, 70, '{}'::jsonb),
    (v_def_id, 'cancel_from_progress', 'Cancel', 'in_progress', 'canceled', 'corrective_actions.close', true, true, false, 80, '{}'::jsonb),
    (v_def_id, 'cancel_from_pending', 'Cancel', 'pending_verification', 'canceled', 'corrective_actions.close', true, true, false, 90, '{}'::jsonb)
  on conflict (workflow_definition_id, transition_key) do nothing;
end;
$$;

-- Backfill workflow instances for existing CAPA records (deterministic, rerunnable)
insert into public.forge_workflow_instances (
  organization_id,
  workflow_definition_id,
  workflow_version,
  resource_type,
  resource_id,
  current_state_key,
  started_at,
  completed_at,
  canceled_at
)
select
  ca.organization_id,
  d.id,
  d.version,
  'corrective_action',
  ca.id,
  ca.status,
  coalesce(ca.created_at, now()),
  case when ca.status in ('closed', 'canceled') then coalesce(ca.closed_at, ca.updated_at, now()) else null end,
  case when ca.status = 'canceled' then coalesce(ca.closed_at, ca.updated_at, now()) else null end
from public.forge_corrective_actions ca
join public.forge_workflow_definitions d
  on d.organization_id is null
 and d.workflow_key = 'corrective_actions.lifecycle'
 and d.version = 1
on conflict (organization_id, resource_type, resource_id, workflow_definition_id) do nothing;

insert into public.forge_workflow_events (
  organization_id,
  workflow_instance_id,
  resource_type,
  resource_id,
  transition_key,
  from_state_key,
  to_state_key,
  comment,
  metadata,
  occurred_at
)
select
  i.organization_id,
  i.id,
  i.resource_type,
  i.resource_id,
  'backfill',
  null,
  i.current_state_key,
  'Workflow instance backfilled from existing CAPA status.',
  jsonb_build_object('source', 'nx01_backfill'),
  i.started_at
from public.forge_workflow_instances i
where i.resource_type = 'corrective_action'
  and not exists (
    select 1 from public.forge_workflow_events e where e.workflow_instance_id = i.id
  );

-- ----------------------------------------------------------------------------
-- Permissions + feature registration
-- ----------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('workflow_core','Universal Workflow Core','Shared workflow, record links, approvals, acknowledgments, comments, and evidence foundation.','Platform','module','enabled',true,false,false,true,false,50)
on conflict (feature_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  platform_state=excluded.platform_state,
  tenant_configurable=excluded.tenant_configurable,
  requires_entitlement=excluded.requires_entitlement,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo','enterprise')
  and f.feature_key='workflow_core'
on conflict (plan_id, feature_id) do update set enabled=excluded.enabled;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('workflow.view','workflow_core','View Workflows','View workflow definitions and instance status.','Workflow','view',true,true,'organization',false,false,false,'normal',10),
  ('workflow.configure','workflow_core','Configure Workflows','Configure tenant workflow presentation within Forge ceilings.','Workflow','configure',true,true,'organization',true,true,true,'sensitive',20),
  ('workflow.transition','workflow_core','Transition Workflows','Perform permitted workflow transitions where domain permission also allows.','Workflow','transition',true,true,'own',false,false,true,'normal',30),
  ('workflow.approve','workflow_core','Approve Workflow Steps','Decide approval steps for workflow-gated actions.','Workflow','approve',true,true,'organization',true,true,true,'sensitive',40),
  ('records.links.view','workflow_core','View Record Links','View cross-module record relationships.','Records','view',true,true,'own',false,false,false,'normal',50),
  ('records.links.manage','workflow_core','Manage Record Links','Create or archive cross-module record relationships.','Records','manage',true,true,'own',false,false,true,'normal',60),
  ('records.comments.view','workflow_core','View Shared Comments','View shared polymorphic comments.','Records','view',true,true,'own',false,false,false,'normal',70),
  ('records.comments.create','workflow_core','Create Shared Comments','Add shared comments on accessible records.','Records','create',true,true,'own',false,false,true,'normal',80),
  ('records.comments.manage','workflow_core','Manage Shared Comments','Edit or archive shared comments.','Records','manage',true,true,'organization',false,false,true,'normal',90),
  ('records.evidence.view','workflow_core','View Evidence','View evidence attached to accessible records.','Records','view',true,true,'own',false,false,false,'normal',100),
  ('records.evidence.upload','workflow_core','Upload Evidence','Upload evidence to accessible records.','Records','upload',true,true,'own',false,false,true,'normal',110),
  ('records.evidence.manage','workflow_core','Manage Evidence','Archive evidence on accessible records.','Records','manage',true,true,'organization',false,false,true,'normal',120),
  ('records.acknowledgements.view','workflow_core','View Acknowledgments','View record acknowledgments.','Records','view',true,true,'own',false,false,false,'normal',130),
  ('records.acknowledgements.create','workflow_core','Create Acknowledgments','Acknowledge controlled records.','Records','create',true,true,'own',false,false,true,'normal',140)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  permission_group=excluded.permission_group,
  action=excluded.action,
  tenant_assignable=true,
  tenant_can_scope=true,
  default_scope=excluded.default_scope,
  is_sensitive=excluded.is_sensitive,
  requires_confirmation=excluded.requires_confirmation,
  audit_use=excluded.audit_use,
  danger_level=excluded.danger_level,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key='workflow_core'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'workflow.view','workflow.transition',
  'records.links.view','records.links.manage',
  'records.comments.view','records.comments.create',
  'records.evidence.view','records.evidence.upload',
  'records.acknowledgements.view','records.acknowledgements.create'
)
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key='workflow_core'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'workflow.view','workflow.transition',
  'records.links.view','records.links.manage',
  'records.comments.view','records.comments.create',
  'records.evidence.view','records.evidence.upload',
  'records.acknowledgements.view','records.acknowledgements.create'
)
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';
