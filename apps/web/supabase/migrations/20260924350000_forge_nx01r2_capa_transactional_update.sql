-- NX-01R2: transactional CAPA form saves with row_version concurrency.
-- Generic form updates must never write lifecycle status.
-- Field edits + optional open→in_progress are one atomic command.

alter table public.forge_corrective_actions
  add column if not exists row_version bigint not null default 1;

comment on column public.forge_corrective_actions.row_version is
  'Optimistic concurrency token. Incremented on every controlled CAPA mutation.';

create table if not exists public.forge_capa_command_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capa_id uuid not null references public.forge_corrective_actions(id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, capa_id, idempotency_key)
);

create index if not exists forge_capa_command_idempotency_capa_idx
  on public.forge_capa_command_idempotency(organization_id, capa_id, created_at desc);

alter table public.forge_capa_command_idempotency enable row level security;
revoke all on public.forge_capa_command_idempotency from anon, authenticated;
grant all on public.forge_capa_command_idempotency to service_role;

-- Bump row_version on lifecycle-only transitions for concurrency with form saves.
create or replace function public.forge_perform_capa_lifecycle_transition(
  p_organization_id uuid,
  p_capa_id uuid,
  p_expected_capa_status text,
  p_to_capa_status text,
  p_transition_key text,
  p_actor_user_id uuid,
  p_comment text,
  p_capa_patch jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_fail_after_capa_update boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capa public.forge_corrective_actions%rowtype;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
  v_workflow_from text;
  v_workflow_to text;
  v_complete boolean;
  v_cancel boolean;
  v_activity_id bigint;
  v_audit_id bigint;
begin
  select * into v_capa
  from public.forge_corrective_actions
  where organization_id = p_organization_id
    and id = p_capa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Corrective Action not found.');
  end if;

  v_workflow_from := p_expected_capa_status;
  v_workflow_to := p_to_capa_status;

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'corrective_actions.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'CAPA workflow definition missing.');
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'corrective_action'
    and resource_id = p_capa_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1,
      'corrective_action', p_capa_id, v_capa.status
    )
    returning * into v_instance;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
      'initialize', null, v_capa.status, p_actor_user_id,
      'Workflow instance created during CAPA transition.',
      jsonb_build_object('source', 'forge_perform_capa_lifecycle_transition')
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
        'capa_status', v_capa.status,
        'workflow_state', v_instance.current_state_key,
        'instance_id', v_instance.id,
        'row_version', v_capa.row_version
      );
    end if;
  end if;

  if v_capa.status is distinct from p_expected_capa_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'CAPA status changed. Reload and try again.',
      'current_status', v_capa.status,
      'row_version', v_capa.row_version
    );
  end if;

  if v_instance.current_state_key is distinct from v_workflow_from then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state diverges from CAPA status. Reconciliation required.',
      'capa_status', v_capa.status,
      'workflow_state', v_instance.current_state_key
    );
  end if;

  v_complete := p_to_capa_status in ('closed', 'canceled');
  v_cancel := p_to_capa_status = 'canceled';

  update public.forge_corrective_actions ca
  set
    status = p_to_capa_status,
    row_version = ca.row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    completed_at = case
      when p_capa_patch ? 'completed_at' then nullif(p_capa_patch->>'completed_at', '')::timestamptz
      else ca.completed_at
    end,
    completed_by = case
      when p_capa_patch ? 'completed_by' then nullif(p_capa_patch->>'completed_by', '')::uuid
      else ca.completed_by
    end,
    verification_result = case
      when p_capa_patch ? 'verification_result' then nullif(p_capa_patch->>'verification_result', '')
      else ca.verification_result
    end,
    verification_notes = case
      when p_capa_patch ? 'verification_notes' then nullif(p_capa_patch->>'verification_notes', '')
      else ca.verification_notes
    end,
    verified_at = case
      when p_capa_patch ? 'verified_at' then nullif(p_capa_patch->>'verified_at', '')::timestamptz
      else ca.verified_at
    end,
    verified_by = case
      when p_capa_patch ? 'verified_by' then nullif(p_capa_patch->>'verified_by', '')::uuid
      else ca.verified_by
    end,
    closure_notes = case
      when p_capa_patch ? 'closure_notes' then nullif(p_capa_patch->>'closure_notes', '')
      else ca.closure_notes
    end,
    closed_at = case
      when p_capa_patch ? 'closed_at' then nullif(p_capa_patch->>'closed_at', '')::timestamptz
      else ca.closed_at
    end,
    closed_by = case
      when p_capa_patch ? 'closed_by' then nullif(p_capa_patch->>'closed_by', '')::uuid
      else ca.closed_by
    end
  where ca.id = p_capa_id
    and ca.organization_id = p_organization_id;

  if coalesce(p_fail_after_capa_update, false) then
    raise exception 'NX01H_FORCED_FAILURE';
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = v_workflow_to,
    updated_at = now(),
    completed_at = case when v_complete then now() else completed_at end,
    canceled_at = case when v_cancel then now() else canceled_at end
  where id = v_instance.id
    and organization_id = p_organization_id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
    p_transition_key, v_workflow_from, v_workflow_to, p_actor_user_id,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('adapter', 'capa_atomic')
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

  insert into public.forge_corrective_action_activity (
    organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_capa_id,
    'workflow_' || p_transition_key,
    'CAPA transitioned from ' || p_expected_capa_status || ' to ' || p_to_capa_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'corrective_action',
    p_capa_id,
    'workflow_transition',
    'Workflow transitioned to ' || v_workflow_to || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'corrective_action.lifecycle_transitioned',
    'corrective_action',
    p_capa_id,
    jsonb_build_object('status', p_expected_capa_status, 'workflow_state', v_workflow_from),
    jsonb_build_object(
      'status', p_to_capa_status,
      'workflow_state', v_workflow_to,
      'transition_key', p_transition_key,
      'event_id', v_event_id
    )
  )
  returning id into v_audit_id;

  insert into public.forge_domain_event_outbox (
    organization_id, event_type, resource_type, resource_id, payload
  ) values (
    p_organization_id,
    'capa.lifecycle_transitioned',
    'corrective_action',
    p_capa_id,
    jsonb_build_object(
      'from_status', p_expected_capa_status,
      'to_status', p_to_capa_status,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'audit_id', v_audit_id,
      'activity_id', v_activity_id
    )
  );

  select row_version into v_capa.row_version
  from public.forge_corrective_actions
  where id = p_capa_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_event_id,
    'capa_status', p_to_capa_status,
    'workflow_state', v_workflow_to,
    'instance_id', v_instance.id,
    'audit_id', v_audit_id,
    'row_version', v_capa.row_version
  );
end;
$$;

-- Transactional CAPA field update + optional start_work lifecycle.
create or replace function public.forge_update_capa_transactionally(
  p_organization_id uuid,
  p_capa_id uuid,
  p_expected_row_version bigint,
  p_expected_status text,
  p_actor_user_id uuid,
  p_fields jsonb,
  p_to_status text,
  p_transition_key text,
  p_assignment_changed boolean,
  p_idempotency_key text,
  p_fail_after_fields boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capa public.forge_corrective_actions%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_activity_id bigint;
  v_audit_id bigint;
  v_existing jsonb;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_key text;
  v_new_status text;
  v_task_status text;
  v_result jsonb;
begin
  -- Reject lifecycle keys in the generic field patch.
  foreach v_key in array array[
    'status','row_version','id','organization_id','action_number','created_at','created_by',
    'archived_at','archived_by','completed_at','completed_by','verified_at','verified_by',
    'closed_at','closed_by','linked_task_id'
  ]
  loop
    if v_fields ? v_key then
      return jsonb_build_object(
        'ok', false,
        'error', 'Field patch contains forbidden key: ' || v_key
      );
    end if;
  end loop;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select result into v_existing
    from public.forge_capa_command_idempotency
    where organization_id = p_organization_id
      and capa_id = p_capa_id
      and idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return v_existing || jsonb_build_object('ok', true, 'duplicate', true);
    end if;
  end if;

  select * into v_capa
  from public.forge_corrective_actions
  where organization_id = p_organization_id
    and id = p_capa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Corrective Action not found.');
  end if;

  if v_capa.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived Corrective Actions are read-only.');
  end if;

  if v_capa.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This Corrective Action changed. Refresh and try again.',
      'current_status', v_capa.status,
      'row_version', v_capa.row_version
    );
  end if;

  if v_capa.status is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This Corrective Action changed. Refresh and try again.',
      'current_status', v_capa.status,
      'row_version', v_capa.row_version
    );
  end if;

  if p_to_status is not null then
    if p_expected_status is distinct from 'open' or p_to_status is distinct from 'in_progress'
       or p_transition_key is distinct from 'start_work' then
      return jsonb_build_object(
        'ok', false,
        'error', 'Unsupported form lifecycle transition.'
      );
    end if;
    if nullif(trim(coalesce(v_fields->>'action_plan', v_capa.action_plan, '')), '') is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'Action plan is required to start work.'
      );
    end if;
  end if;

  v_before := to_jsonb(v_capa);
  v_new_status := coalesce(p_to_status, v_capa.status);

  -- Apply whitelisted fields only; NEVER write status from the patch.
  update public.forge_corrective_actions ca
  set
    title = case when v_fields ? 'title' then nullif(v_fields->>'title', '') else ca.title end,
    description = case when v_fields ? 'description' then nullif(v_fields->>'description', '') else ca.description end,
    action_type = case when v_fields ? 'action_type' then nullif(v_fields->>'action_type', '') else ca.action_type end,
    severity = case when v_fields ? 'severity' then nullif(v_fields->>'severity', '') else ca.severity end,
    source_type = case when v_fields ? 'source_type' then nullif(v_fields->>'source_type', '') else ca.source_type end,
    source_id = case when v_fields ? 'source_id' then nullif(v_fields->>'source_id', '') else ca.source_id end,
    source_reference = case
      when v_fields ? 'source_reference' then nullif(v_fields->>'source_reference', '')
      else ca.source_reference
    end,
    location_id = case
      when v_fields ? 'location_id' then nullif(v_fields->>'location_id', '')::uuid
      else ca.location_id
    end,
    division_id = case
      when v_fields ? 'division_id' then nullif(v_fields->>'division_id', '')::uuid
      else ca.division_id
    end,
    assigned_personnel_id = case
      when v_fields ? 'assigned_personnel_id' then nullif(v_fields->>'assigned_personnel_id', '')::uuid
      else ca.assigned_personnel_id
    end,
    assigned_user_id = case
      when v_fields ? 'assigned_user_id' then nullif(v_fields->>'assigned_user_id', '')::uuid
      else ca.assigned_user_id
    end,
    immediate_containment = case
      when v_fields ? 'immediate_containment' then nullif(v_fields->>'immediate_containment', '')
      else ca.immediate_containment
    end,
    root_cause_required = case
      when v_fields ? 'root_cause_required' then coalesce((v_fields->>'root_cause_required')::boolean, ca.root_cause_required)
      else ca.root_cause_required
    end,
    root_cause = case when v_fields ? 'root_cause' then nullif(v_fields->>'root_cause', '') else ca.root_cause end,
    action_plan = case when v_fields ? 'action_plan' then nullif(v_fields->>'action_plan', '') else ca.action_plan end,
    preventive_action = case
      when v_fields ? 'preventive_action' then nullif(v_fields->>'preventive_action', '')
      else ca.preventive_action
    end,
    due_at = case
      when v_fields ? 'due_at' then nullif(v_fields->>'due_at', '')::timestamptz
      else ca.due_at
    end,
    verification_due_at = case
      when v_fields ? 'verification_due_at' then nullif(v_fields->>'verification_due_at', '')::timestamptz
      else ca.verification_due_at
    end,
    effectiveness_review_due_at = case
      when v_fields ? 'effectiveness_review_due_at' then nullif(v_fields->>'effectiveness_review_due_at', '')::timestamptz
      else ca.effectiveness_review_due_at
    end,
    effectiveness_notes = case
      when v_fields ? 'effectiveness_notes' then nullif(v_fields->>'effectiveness_notes', '')
      else ca.effectiveness_notes
    end,
    custom_data = case
      when v_fields ? 'custom_data' then coalesce(v_fields->'custom_data', '{}'::jsonb)
      else ca.custom_data
    end,
    status = v_new_status,
    row_version = ca.row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  where ca.id = p_capa_id
    and ca.organization_id = p_organization_id
    and ca.row_version = p_expected_row_version
    and ca.status = p_expected_status;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This Corrective Action changed. Refresh and try again.'
    );
  end if;

  if coalesce(p_fail_after_fields, false) then
    raise exception 'NX01R2_FORCED_FAILURE';
  end if;

  select * into v_capa
  from public.forge_corrective_actions
  where id = p_capa_id
    and organization_id = p_organization_id;

  v_after := to_jsonb(v_capa);

  -- Optional open→in_progress workflow coupling
  if p_to_status is not null then
    select d.id into v_def_id
    from public.forge_workflow_definitions d
    where d.workflow_key = 'corrective_actions.lifecycle'
      and d.version = 1
      and d.organization_id is null
      and d.is_active = true
    limit 1;

    if v_def_id is null then
      raise exception 'CAPA workflow definition missing.';
    end if;

    select * into v_instance
    from public.forge_workflow_instances
    where organization_id = p_organization_id
      and resource_type = 'corrective_action'
      and resource_id = p_capa_id
      and workflow_definition_id = v_def_id
    for update;

    if not found then
      insert into public.forge_workflow_instances (
        organization_id, workflow_definition_id, workflow_version,
        resource_type, resource_id, current_state_key
      ) values (
        p_organization_id, v_def_id, 1,
        'corrective_action', p_capa_id, 'open'
      )
      returning * into v_instance;

      insert into public.forge_workflow_events (
        organization_id, workflow_instance_id, resource_type, resource_id,
        transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
      ) values (
        p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
        'initialize', null, 'open', p_actor_user_id,
        'Workflow instance created during CAPA form update.',
        jsonb_build_object('source', 'forge_update_capa_transactionally')
      );
    end if;

    if v_instance.current_state_key is distinct from 'open' then
      raise exception 'Workflow state diverges from expected open before start_work.';
    end if;

    update public.forge_workflow_instances
    set current_state_key = 'in_progress', updated_at = now()
    where id = v_instance.id
      and organization_id = p_organization_id;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
      'start_work', 'open', 'in_progress', p_actor_user_id,
      null,
      jsonb_build_object('source', 'capa_form_update', 'adapter', 'capa_transactional')
    )
    returning id into v_event_id;

    if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
      insert into public.forge_workflow_idempotency_keys (
        organization_id, workflow_instance_id, idempotency_key, transition_key, result_event_id
      ) values (
        p_organization_id, v_instance.id, p_idempotency_key, 'start_work', v_event_id
      )
      on conflict (organization_id, workflow_instance_id, idempotency_key) do nothing;
    end if;
  end if;

  -- Linked Task sync is a required invariant of form save when a linked task exists.
  if v_capa.linked_task_id is not null then
    v_task_status := case when v_capa.status = 'in_progress' then 'in_progress' else 'open' end;
    update public.forge_tasks
    set
      title = v_capa.title,
      description = coalesce(v_capa.action_plan, v_capa.description),
      status = case
        when status in ('completed', 'canceled') then status
        else v_task_status
      end,
      priority = case
        when v_capa.severity = 'critical' then 'critical'
        when v_capa.severity = 'high' then 'high'
        when v_capa.severity = 'low' then 'low'
        else 'normal'
      end,
      assigned_personnel_id = v_capa.assigned_personnel_id,
      assigned_user_id = v_capa.assigned_user_id,
      location_id = v_capa.location_id,
      division_id = v_capa.division_id,
      due_at = v_capa.due_at,
      updated_by = p_actor_user_id,
      updated_at = now()
    where organization_id = p_organization_id
      and id = v_capa.linked_task_id;

    insert into public.forge_task_activity (
      organization_id, task_id, activity_type, message, actor_user_id, metadata
    ) values (
      p_organization_id,
      v_capa.linked_task_id,
      'synced_from_corrective_action',
      'Task synchronized from Corrective Action ' || v_capa.action_number || '.',
      p_actor_user_id,
      jsonb_build_object('capa_id', p_capa_id)
    );
  end if;

  insert into public.forge_corrective_action_activity (
    organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_capa_id,
    case when coalesce(p_assignment_changed, false) then 'assignment_changed' else 'updated' end,
    case
      when coalesce(p_assignment_changed, false)
        then 'Corrective Action details and assignment updated.'
      else 'Corrective Action details updated.'
    end,
    p_actor_user_id,
    jsonb_build_object(
      'row_version', v_capa.row_version,
      'transition_key', p_transition_key,
      'event_id', v_event_id
    )
  )
  returning id into v_activity_id;

  if p_to_status is not null then
    insert into public.forge_corrective_action_activity (
      organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata
    ) values (
      p_organization_id,
      p_capa_id,
      'workflow_start_work',
      'CAPA transitioned from open to in_progress.',
      p_actor_user_id,
      jsonb_build_object('event_id', v_event_id, 'transition_key', 'start_work')
    );

    insert into public.forge_record_activity (
      organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
    ) values (
      p_organization_id,
      'corrective_action',
      p_capa_id,
      'workflow_transition',
      'Workflow transitioned to in_progress.',
      p_actor_user_id,
      jsonb_build_object('event_id', v_event_id, 'transition_key', 'start_work')
    );
  end if;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'corrective_action',
    p_capa_id,
    'updated',
    'Corrective Action details updated.',
    p_actor_user_id,
    jsonb_build_object('row_version', v_capa.row_version)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'corrective_action.updated',
    'corrective_action',
    p_capa_id,
    v_before,
    v_after
  )
  returning id into v_audit_id;

  if p_to_status is not null then
    insert into public.forge_creator_audit_log (
      actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
    ) values (
      p_actor_user_id,
      p_organization_id,
      'corrective_action.lifecycle_transitioned',
      'corrective_action',
      p_capa_id,
      jsonb_build_object('status', 'open', 'workflow_state', 'open'),
      jsonb_build_object(
        'status', 'in_progress',
        'workflow_state', 'in_progress',
        'transition_key', 'start_work',
        'event_id', v_event_id
      )
    );

    insert into public.forge_domain_event_outbox (
      organization_id, event_type, resource_type, resource_id, payload
    ) values (
      p_organization_id,
      'capa.lifecycle_transitioned',
      'corrective_action',
      p_capa_id,
      jsonb_build_object(
        'from_status', 'open',
        'to_status', 'in_progress',
        'transition_key', 'start_work',
        'event_id', v_event_id,
        'source', 'form_update'
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'capa_status', v_capa.status,
    'row_version', v_capa.row_version,
    'event_id', v_event_id,
    'activity_id', v_activity_id,
    'audit_id', v_audit_id,
    'transitioned', p_to_status is not null
  );

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    insert into public.forge_capa_command_idempotency (
      organization_id, capa_id, idempotency_key, result
    ) values (
      p_organization_id, p_capa_id, p_idempotency_key, v_result
    )
    on conflict (organization_id, capa_id, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

revoke all on function public.forge_update_capa_transactionally(
  uuid, uuid, bigint, text, uuid, jsonb, text, text, boolean, text, boolean
) from public;
grant execute on function public.forge_update_capa_transactionally(
  uuid, uuid, bigint, text, uuid, jsonb, text, text, boolean, text, boolean
) to service_role;
