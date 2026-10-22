-- NX-02H: JSA atomic version lifecycle + execution crew/ack/stop-work

-- ----------------------------------------------------------------------------
-- Schema: forge_jsas template + active version pointer
-- ----------------------------------------------------------------------------

alter table public.forge_jsas
  add column if not exists is_template boolean not null default false;

alter table public.forge_jsas
  add column if not exists active_version_id uuid references public.forge_jsas(id) on delete set null;

comment on column public.forge_jsas.is_template is
  'When true, this JSA is a reusable template (clone into operational drafts).';

comment on column public.forge_jsas.active_version_id is
  'On the root lineage row, points at the currently active version JSA.';

-- One ACTIVE JSA per organization per root lineage.
create unique index if not exists forge_jsas_one_active_per_lineage_idx
  on public.forge_jsas (organization_id, (coalesce(parent_jsa_id, id)))
  where status = 'active';

create index if not exists forge_jsas_template_idx
  on public.forge_jsas (organization_id, is_template)
  where is_template = true;

-- ----------------------------------------------------------------------------
-- PPE items + training requirements
-- ----------------------------------------------------------------------------

create table if not exists public.forge_jsa_ppe_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  label text not null,
  required boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_jsa_ppe_items_jsa_idx
  on public.forge_jsa_ppe_items (organization_id, jsa_id, sort_order);

create table if not exists public.forge_jsa_training_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  training_course_id uuid not null references public.forge_training_courses(id) on delete restrict,
  required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, jsa_id, training_course_id)
);

create index if not exists forge_jsa_training_requirements_jsa_idx
  on public.forge_jsa_training_requirements (organization_id, jsa_id);

alter table public.forge_jsa_ppe_items enable row level security;
alter table public.forge_jsa_training_requirements enable row level security;

drop policy if exists forge_jsa_ppe_items_member_select on public.forge_jsa_ppe_items;
create policy forge_jsa_ppe_items_member_select
on public.forge_jsa_ppe_items for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_training_requirements_member_select on public.forge_jsa_training_requirements;
create policy forge_jsa_training_requirements_member_select
on public.forge_jsa_training_requirements for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_jsa_ppe_items to authenticated;
grant select on public.forge_jsa_training_requirements to authenticated;
grant all on public.forge_jsa_ppe_items to service_role;
grant all on public.forge_jsa_training_requirements to service_role;

-- ----------------------------------------------------------------------------
-- Execution status expansion + stop-work + concurrency
-- ----------------------------------------------------------------------------

alter table public.forge_jsa_executions
  drop constraint if exists forge_jsa_executions_status_check;

update public.forge_jsa_executions
set status = 'active'
where status = 'in_progress';

alter table public.forge_jsa_executions
  add constraint forge_jsa_executions_status_check
  check (status in ('planned', 'briefing', 'active', 'stopped', 'completed', 'canceled'));

alter table public.forge_jsa_executions
  add column if not exists stopped_at timestamptz;

alter table public.forge_jsa_executions
  add column if not exists stopped_by uuid references auth.users(id) on delete set null;

alter table public.forge_jsa_executions
  add column if not exists stop_reason text;

alter table public.forge_jsa_executions
  add column if not exists stop_requires_revision boolean not null default false;

alter table public.forge_jsa_executions
  add column if not exists row_version bigint not null default 1;

comment on column public.forge_jsa_executions.row_version is
  'Optimistic concurrency token for execution status transitions.';

-- Participants: link to NX-01 acknowledgements when practical
alter table public.forge_jsa_execution_participants
  add column if not exists acknowledgment_id uuid
    references public.forge_record_acknowledgements(id) on delete set null;

alter table public.forge_jsa_execution_participants
  add column if not exists requires_acknowledgement boolean not null default true;

-- Lookup options for expanded execution statuses
insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select
  d.id,
  v.option_key,
  v.label,
  v.description,
  v.sort_order,
  true,
  true
from public.forge_lookup_definitions d
join (
  values
    ('briefing', 'Briefing', 'Crew briefing / acknowledgment in progress.', 15),
    ('active', 'Active', 'Work is underway under this JSA execution.', 20),
    ('stopped', 'Stopped', 'Stop-work invoked; execution paused.', 25)
) as v(option_key, label, description, sort_order)
  on d.lookup_key = 'jsa_jha.execution_status'
on conflict (lookup_id, option_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

update public.forge_lookup_options o
set
  is_active = false
from public.forge_lookup_definitions d
where d.id = o.lookup_id
  and d.lookup_key = 'jsa_jha.execution_status'
  and o.option_key = 'in_progress';

-- ----------------------------------------------------------------------------
-- Immutability: child content only editable while JSA is draft
-- ----------------------------------------------------------------------------

create or replace function public.forge_jsa_reject_non_draft_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jsa_id uuid;
  v_status text;
begin
  v_jsa_id := coalesce(new.jsa_id, old.jsa_id);

  select status into v_status
  from public.forge_jsas
  where id = v_jsa_id;

  if v_status is distinct from 'draft' then
    raise exception 'JSA content can only be modified while status is draft (current: %).', coalesce(v_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_jsa_steps_draft_only on public.forge_jsa_steps;
create trigger forge_jsa_steps_draft_only
  before insert or update or delete on public.forge_jsa_steps
  for each row execute function public.forge_jsa_reject_non_draft_content();

drop trigger if exists forge_jsa_hazards_draft_only on public.forge_jsa_hazards;
create trigger forge_jsa_hazards_draft_only
  before insert or update or delete on public.forge_jsa_hazards
  for each row execute function public.forge_jsa_reject_non_draft_content();

drop trigger if exists forge_jsa_controls_draft_only on public.forge_jsa_controls;
create trigger forge_jsa_controls_draft_only
  before insert or update or delete on public.forge_jsa_controls
  for each row execute function public.forge_jsa_reject_non_draft_content();

drop trigger if exists forge_jsa_ppe_items_draft_only on public.forge_jsa_ppe_items;
create trigger forge_jsa_ppe_items_draft_only
  before insert or update or delete on public.forge_jsa_ppe_items
  for each row execute function public.forge_jsa_reject_non_draft_content();

drop trigger if exists forge_jsa_training_requirements_draft_only on public.forge_jsa_training_requirements;
create trigger forge_jsa_training_requirements_draft_only
  before insert or update or delete on public.forge_jsa_training_requirements
  for each row execute function public.forge_jsa_reject_non_draft_content();

-- ----------------------------------------------------------------------------
-- Helper: resolve JSA lineage root id
-- ----------------------------------------------------------------------------

create or replace function public.forge_jsa_lineage_root_id(p_jsa_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root uuid;
  v_current uuid := p_jsa_id;
  v_parent uuid;
  i integer;
begin
  select jsa_id into v_root
  from public.forge_jsa_revisions
  where version_jsa_id = p_jsa_id
  limit 1;

  if v_root is not null then
    return v_root;
  end if;

  for i in 1..50 loop
    select parent_jsa_id into v_parent
    from public.forge_jsas
    where id = v_current;

    if v_parent is null then
      return v_current;
    end if;
    v_current := v_parent;
  end loop;

  return p_jsa_id;
end;
$$;

revoke all on function public.forge_jsa_lineage_root_id(uuid) from public;
grant execute on function public.forge_jsa_lineage_root_id(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- forge_perform_jsa_version_transition
-- Single-row status change with workflow mirror + approve gates.
-- p_fail_after_domain_update raises to force full rollback (tests only).
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_jsa_version_transition(
  p_organization_id uuid,
  p_jsa_id uuid,
  p_expected_status text,
  p_to_status text,
  p_transition_key text,
  p_actor_user_id uuid,
  p_comment text,
  p_jsa_patch jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_expected_row_version bigint default null,
  p_fail_after_domain_update boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jsa public.forge_jsas%rowtype;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
  v_complete boolean;
  v_cancel boolean;
  v_activity_id bigint;
  v_audit_id bigint;
  v_step_count integer;
  v_hazard_count integer;
  v_bad_hazard integer;
begin
  select * into v_jsa
  from public.forge_jsas
  where organization_id = p_organization_id
    and id = p_jsa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'JSA not found.');
  end if;

  if v_jsa.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived JSAs cannot transition.');
  end if;

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'jsa.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'JSA workflow definition missing.');
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'jsa'
    and resource_id = p_jsa_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1,
      'jsa', p_jsa_id, v_jsa.status
    )
    returning * into v_instance;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'jsa', p_jsa_id,
      'initialize', null, v_jsa.status, p_actor_user_id,
      'Workflow instance created during JSA transition.',
      jsonb_build_object('source', 'forge_perform_jsa_version_transition')
    );
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select result_event_id into v_existing
    from public.forge_workflow_idempotency_keys
    where organization_id = p_organization_id
      and workflow_instance_id = v_instance.id
      and idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'event_id', v_existing,
        'jsa_status', v_jsa.status,
        'workflow_state', v_instance.current_state_key,
        'instance_id', v_instance.id,
        'row_version', v_jsa.row_version
      );
    end if;
  end if;

  if v_jsa.status is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'JSA status changed. Reload and try again.',
      'current_status', v_jsa.status,
      'row_version', v_jsa.row_version
    );
  end if;

  if p_expected_row_version is not null and v_jsa.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This JSA changed after you opened it. Refresh before continuing.',
      'row_version', v_jsa.row_version
    );
  end if;

  if v_instance.current_state_key is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state diverges from JSA status. Reconciliation required.',
      'jsa_status', v_jsa.status,
      'workflow_state', v_instance.current_state_key
    );
  end if;

  -- Approve business rules
  if p_to_status = 'approved' then
    if v_jsa.risk_matrix_id is null then
      return jsonb_build_object('ok', false, 'error', 'JSA must have a risk matrix before approval.');
    end if;

    select count(*) into v_step_count
    from public.forge_jsa_steps
    where organization_id = p_organization_id and jsa_id = p_jsa_id;

    if v_step_count < 1 then
      return jsonb_build_object('ok', false, 'error', 'JSA must have at least one step before approval.');
    end if;

    select count(*) into v_hazard_count
    from public.forge_jsa_hazards
    where organization_id = p_organization_id and jsa_id = p_jsa_id;

    if v_hazard_count < 1 then
      return jsonb_build_object('ok', false, 'error', 'JSA must have at least one hazard before approval.');
    end if;

    select count(*) into v_bad_hazard
    from public.forge_jsa_hazards h
    where h.organization_id = p_organization_id
      and h.jsa_id = p_jsa_id
      and (
        h.residual_likelihood_key is null
        or h.residual_severity_key is null
        or h.residual_score is null
        or not exists (
          select 1
          from public.forge_jsa_controls c
          where c.organization_id = p_organization_id
            and c.hazard_id = h.id
        )
      );

    if v_bad_hazard > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'Each hazard must have ≥1 control and residual likelihood/severity/score before approval.'
      );
    end if;
  end if;

  -- Activate must use forge_activate_jsa_revision
  if p_to_status = 'active' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Use forge_activate_jsa_revision to activate a JSA version.'
    );
  end if;

  v_complete := p_to_status in ('retired', 'superseded');
  v_cancel := false;

  update public.forge_jsas j
  set
    status = p_to_status,
    updated_by = p_actor_user_id,
    updated_at = now(),
    row_version = j.row_version + 1,
    approved_by = case
      when p_to_status = 'approved' and j.approved_at is null then p_actor_user_id
      else j.approved_by
    end,
    approved_at = case
      when p_to_status = 'approved' and j.approved_at is null then now()
      else j.approved_at
    end
  where j.id = p_jsa_id
    and j.organization_id = p_organization_id
  returning * into v_jsa;

  if coalesce(p_fail_after_domain_update, false) then
    raise exception 'NX02H_FORCED_FAILURE_AFTER_DOMAIN_UPDATE';
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = p_to_status,
    updated_at = now(),
    completed_at = case when v_complete then now() else completed_at end,
    canceled_at = case when v_cancel then now() else canceled_at end
  where id = v_instance.id
    and organization_id = p_organization_id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_instance.id, 'jsa', p_jsa_id,
    p_transition_key, p_expected_status, p_to_status, p_actor_user_id,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('adapter', 'jsa_atomic')
  )
  returning id into v_event_id;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    insert into public.forge_workflow_idempotency_keys (
      organization_id, workflow_instance_id, idempotency_key, transition_key, result_event_id
    ) values (
      p_organization_id, v_instance.id, p_idempotency_key, p_transition_key, v_event_id
    )
    on conflict (organization_id, workflow_instance_id, idempotency_key) do nothing;
  end if;

  insert into public.forge_jsa_activity (
    organization_id, jsa_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_jsa_id,
    'workflow_' || p_transition_key,
    'JSA transitioned from ' || p_expected_status || ' to ' || p_to_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'jsa',
    p_jsa_id,
    'workflow_transition',
    'Workflow transitioned to ' || p_to_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'jsa.lifecycle_transitioned',
    'jsa',
    p_jsa_id,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object(
      'status', p_to_status,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'row_version', v_jsa.row_version
    )
  )
  returning id into v_audit_id;

  insert into public.forge_domain_event_outbox (
    organization_id, event_type, resource_type, resource_id, payload
  ) values (
    p_organization_id,
    'jsa.lifecycle_transitioned',
    'jsa',
    p_jsa_id,
    jsonb_build_object(
      'from_status', p_expected_status,
      'to_status', p_to_status,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'audit_id', v_audit_id,
      'activity_id', v_activity_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_event_id,
    'jsa_status', p_to_status,
    'workflow_state', p_to_status,
    'instance_id', v_instance.id,
    'audit_id', v_audit_id,
    'row_version', v_jsa.row_version
  );
end;
$$;

revoke all on function public.forge_perform_jsa_version_transition(
  uuid, uuid, text, text, text, uuid, text, jsonb, jsonb, text, bigint, boolean
) from public;
grant execute on function public.forge_perform_jsa_version_transition(
  uuid, uuid, text, text, text, uuid, text, jsonb, jsonb, text, bigint, boolean
) to service_role;

-- ----------------------------------------------------------------------------
-- forge_activate_jsa_revision — atomic supersede + activate + root pointer
-- ----------------------------------------------------------------------------

create or replace function public.forge_activate_jsa_revision(
  p_organization_id uuid,
  p_jsa_id uuid,
  p_actor_user_id uuid,
  p_comment text,
  p_metadata jsonb,
  p_idempotency_key text,
  p_expected_row_version bigint default null,
  p_fail_after_supersede boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.forge_jsas%rowtype;
  v_prior public.forge_jsas%rowtype;
  v_root_id uuid;
  v_def_id uuid;
  v_cand_instance public.forge_workflow_instances%rowtype;
  v_prior_instance public.forge_workflow_instances%rowtype;
  v_cand_event uuid;
  v_prior_event uuid;
  v_existing uuid;
  v_audit_id bigint;
  v_lineage_key uuid;
begin
  select * into v_candidate
  from public.forge_jsas
  where organization_id = p_organization_id
    and id = p_jsa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'JSA not found.');
  end if;

  if v_candidate.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived JSAs cannot be activated.');
  end if;

  if v_candidate.status is distinct from 'approved' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Only approved JSAs can be activated.',
      'current_status', v_candidate.status
    );
  end if;

  if p_expected_row_version is not null
     and v_candidate.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This JSA changed after you opened it. Refresh before continuing.',
      'row_version', v_candidate.row_version
    );
  end if;

  v_root_id := public.forge_jsa_lineage_root_id(p_jsa_id);
  v_lineage_key := coalesce(v_candidate.parent_jsa_id, v_candidate.id);

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'jsa.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'JSA workflow definition missing.');
  end if;

  -- Ensure candidate workflow instance
  select * into v_cand_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'jsa'
    and resource_id = p_jsa_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1, 'jsa', p_jsa_id, v_candidate.status
    )
    returning * into v_cand_instance;
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select result_event_id into v_existing
    from public.forge_workflow_idempotency_keys
    where organization_id = p_organization_id
      and workflow_instance_id = v_cand_instance.id
      and idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'event_id', v_existing,
        'jsa_status', v_candidate.status,
        'instance_id', v_cand_instance.id,
        'row_version', v_candidate.row_version,
        'root_jsa_id', v_root_id
      );
    end if;
  end if;

  -- Lock and supersede current active for same lineage
  select * into v_prior
  from public.forge_jsas
  where organization_id = p_organization_id
    and status = 'active'
    and coalesce(parent_jsa_id, id) = v_lineage_key
    and id is distinct from p_jsa_id
  for update;

  if found then
    update public.forge_jsas
    set
      status = 'superseded',
      updated_by = p_actor_user_id,
      updated_at = now(),
      row_version = row_version + 1
    where id = v_prior.id
      and organization_id = p_organization_id
    returning * into v_prior;

    select * into v_prior_instance
    from public.forge_workflow_instances
    where organization_id = p_organization_id
      and resource_type = 'jsa'
      and resource_id = v_prior.id
      and workflow_definition_id = v_def_id
    for update;

    if not found then
      insert into public.forge_workflow_instances (
        organization_id, workflow_definition_id, workflow_version,
        resource_type, resource_id, current_state_key
      ) values (
        p_organization_id, v_def_id, 1, 'jsa', v_prior.id, 'active'
      )
      returning * into v_prior_instance;
    end if;

    update public.forge_workflow_instances
    set current_state_key = 'superseded', updated_at = now()
    where id = v_prior_instance.id;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_prior_instance.id, 'jsa', v_prior.id,
      'supersede', 'active', 'superseded', p_actor_user_id,
      nullif(trim(coalesce(p_comment, '')), ''),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'adapter', 'jsa_activate',
        'superseded_by', p_jsa_id
      )
    )
    returning id into v_prior_event;

    insert into public.forge_jsa_activity (
      organization_id, jsa_id, activity_type, message, actor_user_id, metadata
    ) values (
      p_organization_id,
      v_prior.id,
      'workflow_supersede',
      'JSA superseded by activation of another version.',
      p_actor_user_id,
      jsonb_build_object('event_id', v_prior_event, 'superseded_by', p_jsa_id)
    );
  end if;

  if coalesce(p_fail_after_supersede, false) then
    raise exception 'NX02H_FORCED_FAILURE_AFTER_SUPERSEDE';
  end if;

  update public.forge_jsas
  set
    status = 'active',
    updated_by = p_actor_user_id,
    updated_at = now(),
    row_version = row_version + 1,
    approved_by = coalesce(approved_by, p_actor_user_id),
    approved_at = coalesce(approved_at, now()),
    effective_at = coalesce(effective_at, now())
  where id = p_jsa_id
    and organization_id = p_organization_id
  returning * into v_candidate;

  -- Point root at this active version
  update public.forge_jsas
  set
    active_version_id = p_jsa_id,
    updated_by = p_actor_user_id,
    updated_at = now()
  where id = v_root_id
    and organization_id = p_organization_id;

  update public.forge_workflow_instances
  set current_state_key = 'active', updated_at = now()
  where id = v_cand_instance.id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_cand_instance.id, 'jsa', p_jsa_id,
    'activate', 'approved', 'active', p_actor_user_id,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'adapter', 'jsa_activate',
      'prior_jsa_id', v_prior.id,
      'root_jsa_id', v_root_id
    )
  )
  returning id into v_cand_event;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    insert into public.forge_workflow_idempotency_keys (
      organization_id, workflow_instance_id, idempotency_key, transition_key, result_event_id
    ) values (
      p_organization_id, v_cand_instance.id, p_idempotency_key, 'activate', v_cand_event
    )
    on conflict (organization_id, workflow_instance_id, idempotency_key) do nothing;
  end if;

  insert into public.forge_jsa_activity (
    organization_id, jsa_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_jsa_id,
    'workflow_activate',
    'JSA activated as the current version for its lineage.',
    p_actor_user_id,
    jsonb_build_object(
      'event_id', v_cand_event,
      'prior_jsa_id', v_prior.id,
      'root_jsa_id', v_root_id
    )
  );

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'jsa',
    p_jsa_id,
    'workflow_transition',
    'JSA activated.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_cand_event, 'root_jsa_id', v_root_id)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'jsa.revision_activated',
    'jsa',
    p_jsa_id,
    jsonb_build_object('status', 'approved', 'prior_active_id', v_prior.id),
    jsonb_build_object(
      'status', 'active',
      'root_jsa_id', v_root_id,
      'event_id', v_cand_event,
      'prior_event_id', v_prior_event,
      'row_version', v_candidate.row_version
    )
  )
  returning id into v_audit_id;

  insert into public.forge_domain_event_outbox (
    organization_id, event_type, resource_type, resource_id, payload
  ) values (
    p_organization_id,
    'jsa.revision_activated',
    'jsa',
    p_jsa_id,
    jsonb_build_object(
      'root_jsa_id', v_root_id,
      'prior_jsa_id', v_prior.id,
      'event_id', v_cand_event,
      'audit_id', v_audit_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_cand_event,
    'prior_event_id', v_prior_event,
    'jsa_status', 'active',
    'workflow_state', 'active',
    'instance_id', v_cand_instance.id,
    'prior_jsa_id', v_prior.id,
    'root_jsa_id', v_root_id,
    'audit_id', v_audit_id,
    'row_version', v_candidate.row_version
  );
end;
$$;

revoke all on function public.forge_activate_jsa_revision(
  uuid, uuid, uuid, text, jsonb, text, bigint, boolean
) from public;
grant execute on function public.forge_activate_jsa_revision(
  uuid, uuid, uuid, text, jsonb, text, bigint, boolean
) to service_role;

-- ----------------------------------------------------------------------------
-- forge_perform_jsa_execution_transition
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_jsa_execution_transition(
  p_organization_id uuid,
  p_execution_id uuid,
  p_expected_status text,
  p_to_status text,
  p_actor_user_id uuid,
  p_comment text,
  p_patch jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_expected_row_version bigint default null,
  p_fail_after_domain_update boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exec public.forge_jsa_executions%rowtype;
  v_allowed boolean := false;
  v_missing_acks integer;
  v_audit_id bigint;
  v_activity_id bigint;
  v_stop_reason text;
  v_stop_requires_revision boolean;
begin
  select * into v_exec
  from public.forge_jsa_executions
  where organization_id = p_organization_id
    and id = p_execution_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Execution not found.');
  end if;

  if v_exec.status is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'Execution status changed. Reload and try again.',
      'current_status', v_exec.status,
      'row_version', v_exec.row_version
    );
  end if;

  if p_expected_row_version is not null
     and v_exec.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This execution changed after you opened it. Refresh before continuing.',
      'row_version', v_exec.row_version
    );
  end if;

  -- Allowed paths
  if p_expected_status = 'planned' and p_to_status in ('briefing', 'canceled') then
    v_allowed := true;
  elsif p_expected_status = 'briefing' and p_to_status in ('active', 'canceled') then
    v_allowed := true;
  elsif p_expected_status = 'active' and p_to_status in ('completed', 'stopped', 'canceled') then
    v_allowed := true;
  elsif p_expected_status = 'stopped' and p_to_status in ('briefing', 'canceled') then
    v_allowed := true;
  end if;

  if not v_allowed then
    return jsonb_build_object(
      'ok', false,
      'error', 'Invalid execution transition ' || p_expected_status || ' → ' || p_to_status || '.'
    );
  end if;

  if p_to_status = 'active' then
    select count(*) into v_missing_acks
    from public.forge_jsa_execution_participants p
    where p.organization_id = p_organization_id
      and p.execution_id = p_execution_id
      and p.requires_acknowledgement = true
      and p.acknowledged_at is null
      and p.acknowledgment_id is null;

    if v_missing_acks > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'All required participants must acknowledge before activating execution.',
        'missing_acknowledgements', v_missing_acks
      );
    end if;
  end if;

  if p_to_status = 'stopped' then
    v_stop_reason := nullif(trim(coalesce(p_patch->>'stop_reason', coalesce(p_comment, ''))), '');
    if v_stop_reason is null then
      return jsonb_build_object('ok', false, 'error', 'Stop-work requires a reason.');
    end if;
    v_stop_requires_revision := coalesce((p_patch->>'stop_requires_revision')::boolean, false);
  end if;

  update public.forge_jsa_executions e
  set
    status = p_to_status,
    updated_at = now(),
    row_version = e.row_version + 1,
    started_at = case
      when p_to_status in ('briefing', 'active') and e.started_at is null then now()
      else e.started_at
    end,
    completed_at = case
      when p_to_status = 'completed' then now()
      else e.completed_at
    end,
    stopped_at = case
      when p_to_status = 'stopped' then now()
      when p_to_status in ('briefing', 'active') then null
      else e.stopped_at
    end,
    stopped_by = case
      when p_to_status = 'stopped' then p_actor_user_id
      when p_to_status in ('briefing', 'active') then null
      else e.stopped_by
    end,
    stop_reason = case
      when p_to_status = 'stopped' then v_stop_reason
      when p_to_status in ('briefing', 'active') then null
      else e.stop_reason
    end,
    stop_requires_revision = case
      when p_to_status = 'stopped' then coalesce(v_stop_requires_revision, false)
      when p_to_status in ('briefing', 'active') then false
      else e.stop_requires_revision
    end,
    notes = case
      when p_patch ? 'notes' then nullif(p_patch->>'notes', '')
      else e.notes
    end
  where e.id = p_execution_id
    and e.organization_id = p_organization_id
  returning * into v_exec;

  if coalesce(p_fail_after_domain_update, false) then
    raise exception 'NX02H_FORCED_FAILURE_AFTER_EXEC_UPDATE';
  end if;

  insert into public.forge_jsa_activity (
    organization_id, jsa_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    v_exec.jsa_id,
    'execution_' || p_to_status,
    'Execution ' || v_exec.execution_number || ' transitioned from ' ||
      p_expected_status || ' to ' || p_to_status || '.',
    p_actor_user_id,
    jsonb_build_object(
      'execution_id', p_execution_id,
      'from_status', p_expected_status,
      'to_status', p_to_status,
      'stop_reason', v_exec.stop_reason
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_activity_id;

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'jsa_execution.transitioned',
    'jsa_execution',
    p_execution_id,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object(
      'status', p_to_status,
      'row_version', v_exec.row_version,
      'stop_reason', v_exec.stop_reason
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'execution_status', p_to_status,
    'row_version', v_exec.row_version,
    'activity_id', v_activity_id,
    'audit_id', v_audit_id,
    'jsa_id', v_exec.jsa_id
  );
end;
$$;

revoke all on function public.forge_perform_jsa_execution_transition(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, text, bigint, boolean
) from public;
grant execute on function public.forge_perform_jsa_execution_transition(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, text, bigint, boolean
) to service_role;
