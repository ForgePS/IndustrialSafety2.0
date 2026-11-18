-- NX-02H: Observation atomic lifecycle + transactional field updates.
-- Domain status remains SoR. Lifecycle status must never be written via generic field patch.

-- ----------------------------------------------------------------------------
-- Atomic observation + workflow transition
-- Server authorizes first. RPC defensively validates org/resource/state/version.
-- p_fail_after_domain_update raises to force full rollback (tests only).
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_observation_lifecycle_transition(
  p_organization_id uuid,
  p_observation_id uuid,
  p_expected_status text,
  p_expected_row_version bigint,
  p_transition_key text,
  p_to_status text,
  p_actor_user_id uuid,
  p_comment text,
  p_metadata jsonb,
  p_idempotency_key text,
  p_fail_after_domain_update boolean default false,
  p_closure_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs public.forge_observations%rowtype;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
  v_workflow_from text;
  v_workflow_to text;
  v_complete boolean;
  v_activity_id bigint;
  v_audit_id bigint;
  v_transition_exists boolean := false;
  v_closure text;
  v_has_resolution_link boolean := false;
  v_comment text;
begin
  select * into v_obs
  from public.forge_observations
  where organization_id = p_organization_id
    and id = p_observation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Observation not found.');
  end if;

  if v_obs.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived observations cannot transition.');
  end if;

  v_workflow_from := p_expected_status;
  v_workflow_to := p_to_status;
  v_comment := nullif(trim(coalesce(p_comment, '')), '');

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'observations.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'Observation workflow definition missing.');
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'observation'
    and resource_id = p_observation_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1,
      'observation', p_observation_id, v_obs.status
    )
    returning * into v_instance;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'observation', p_observation_id,
      'initialize', null, v_obs.status, p_actor_user_id,
      'Workflow instance created during observation transition.',
      jsonb_build_object('source', 'forge_perform_observation_lifecycle_transition')
    );
  end if;

  -- Idempotency before state guards so retries after success return the original result
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
        'conflict', false,
        'event_id', v_existing,
        'observation_id', p_observation_id,
        'status', v_obs.status,
        'row_version', v_obs.row_version,
        'workflow_state', v_instance.current_state_key,
        'instance_id', v_instance.id
      );
    end if;
  end if;

  if v_obs.status is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'Observation status changed. Reload and try again.',
      'observation_id', p_observation_id,
      'status', v_obs.status,
      'row_version', v_obs.row_version
    );
  end if;

  if v_obs.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This observation changed after you opened it. Refresh before continuing.',
      'observation_id', p_observation_id,
      'status', v_obs.status,
      'row_version', v_obs.row_version
    );
  end if;

  if v_instance.current_state_key is distinct from v_workflow_from then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state diverges from observation status. Reconciliation required.',
      'observation_id', p_observation_id,
      'status', v_obs.status,
      'row_version', v_obs.row_version,
      'workflow_state', v_instance.current_state_key
    );
  end if;

  select exists (
    select 1
    from public.forge_workflow_transitions t
    where t.workflow_definition_id = v_def_id
      and t.transition_key = p_transition_key
      and t.from_state_key = v_workflow_from
      and t.to_state_key = v_workflow_to
      and t.is_active = true
  ) into v_transition_exists;

  if not v_transition_exists then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Invalid observation transition ' || coalesce(p_transition_key, '') ||
        ' from ' || coalesce(v_workflow_from, '') || ' to ' || coalesce(v_workflow_to, '') || '.'
    );
  end if;

  -- Business rules
  if p_transition_key = 'submit' then
    if nullif(trim(coalesce(v_obs.observation_type, '')), '') is null
       or nullif(trim(coalesce(v_obs.description, '')), '') is null
       or v_obs.occurred_at is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'Submit requires observation type, description, and occurred_at.'
      );
    end if;
    if v_obs.location_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'Submit requires a location.'
      );
    end if;
  end if;

  if p_transition_key in ('close_from_action', 'close_no_action') then
    v_closure := nullif(trim(coalesce(p_closure_summary, v_comment, v_obs.closure_summary, '')), '');
    if v_closure is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'A closure summary is required to close this observation.'
      );
    end if;
  end if;

  if p_transition_key = 'close_from_action' then
    select exists (
      select 1
      from public.forge_record_links rl
      where rl.organization_id = p_organization_id
        and rl.archived_at is null
        and rl.source_resource_type = 'observation'
        and rl.source_resource_id = p_observation_id
        and rl.relationship_type in ('generated_capa', 'identified_risk')
    ) into v_has_resolution_link;

    if not v_has_resolution_link
       and length(trim(coalesce(v_comment, ''))) < 20 then
      return jsonb_build_object(
        'ok', false,
        'error',
        'Close from action requires a linked CAPA/risk or a documented resolution comment (20+ characters).'
      );
    end if;
  end if;

  v_complete := p_to_status = 'closed';
  v_closure := nullif(trim(coalesce(p_closure_summary, v_comment, v_obs.closure_summary, '')), '');

  update public.forge_observations o
  set
    status = p_to_status,
    row_version = o.row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    submitted_at = case
      when p_transition_key = 'submit' then coalesce(o.submitted_at, now())
      else o.submitted_at
    end,
    reviewed_at = case
      when p_transition_key in ('begin_review', 'require_action', 'no_action') then now()
      else o.reviewed_at
    end,
    reviewed_by = case
      when p_transition_key in ('begin_review', 'require_action', 'no_action') then p_actor_user_id
      else o.reviewed_by
    end,
    closed_at = case
      when p_transition_key in ('close_from_action', 'close_no_action') then now()
      else o.closed_at
    end,
    closed_by = case
      when p_transition_key in ('close_from_action', 'close_no_action') then p_actor_user_id
      else o.closed_by
    end,
    closure_summary = case
      when p_transition_key in ('close_from_action', 'close_no_action') then v_closure
      else o.closure_summary
    end
  where o.id = p_observation_id
    and o.organization_id = p_organization_id
    and o.row_version = p_expected_row_version
    and o.status = p_expected_status;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This observation changed after you opened it. Refresh before continuing.',
      'observation_id', p_observation_id
    );
  end if;

  if coalesce(p_fail_after_domain_update, false) then
    raise exception 'NX02H_FORCED_FAILURE';
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = v_workflow_to,
    updated_at = now(),
    completed_at = case when v_complete then now() else completed_at end
  where id = v_instance.id
    and organization_id = p_organization_id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_instance.id, 'observation', p_observation_id,
    p_transition_key, v_workflow_from, v_workflow_to, p_actor_user_id,
    v_comment,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('adapter', 'observation_atomic')
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

  insert into public.forge_observation_activity (
    organization_id, observation_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_observation_id,
    'workflow_' || p_transition_key,
    'Observation transitioned from ' || p_expected_status || ' to ' || p_to_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'observation',
    p_observation_id,
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
    'observation.lifecycle_transitioned',
    'observation',
    p_observation_id,
    jsonb_build_object(
      'status', p_expected_status,
      'workflow_state', v_workflow_from,
      'row_version', p_expected_row_version
    ),
    jsonb_build_object(
      'status', p_to_status,
      'workflow_state', v_workflow_to,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'row_version', p_expected_row_version + 1
    )
  )
  returning id into v_audit_id;

  if to_regclass('public.forge_domain_event_outbox') is not null then
    insert into public.forge_domain_event_outbox (
      organization_id, event_type, resource_type, resource_id, payload
    ) values (
      p_organization_id,
      'observation.lifecycle_transitioned',
      'observation',
      p_observation_id,
      jsonb_build_object(
        'from_status', p_expected_status,
        'to_status', p_to_status,
        'transition_key', p_transition_key,
        'event_id', v_event_id,
        'audit_id', v_audit_id,
        'activity_id', v_activity_id
      )
    );
  end if;

  select * into v_obs
  from public.forge_observations
  where id = p_observation_id
    and organization_id = p_organization_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'conflict', false,
    'observation_id', p_observation_id,
    'status', v_obs.status,
    'row_version', v_obs.row_version,
    'event_id', v_event_id,
    'workflow_state', v_workflow_to,
    'instance_id', v_instance.id,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.forge_perform_observation_lifecycle_transition(
  uuid, uuid, text, bigint, text, text, uuid, text, jsonb, text, boolean, text
) from public;
grant execute on function public.forge_perform_observation_lifecycle_transition(
  uuid, uuid, text, bigint, text, text, uuid, text, jsonb, text, boolean, text
) to service_role;

-- ----------------------------------------------------------------------------
-- Transactional observation field update (NEVER writes status)
-- ----------------------------------------------------------------------------

create or replace function public.forge_update_observation_transactionally(
  p_organization_id uuid,
  p_observation_id uuid,
  p_expected_row_version bigint,
  p_actor_user_id uuid,
  p_fields jsonb,
  p_fail_after_fields boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs public.forge_observations%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_key text;
  v_activity_id bigint;
  v_audit_id bigint;
begin
  foreach v_key in array array[
    'status','row_version','id','organization_id','observation_number','created_at','created_by',
    'archived_at','archived_by','submitted_at','reviewed_at','reviewed_by',
    'closed_at','closed_by','reported_by_user_id','reported_by_personnel_id','reporting_mode'
  ]
  loop
    if v_fields ? v_key then
      return jsonb_build_object(
        'ok', false,
        'error', 'Field patch contains forbidden key: ' || v_key
      );
    end if;
  end loop;

  select * into v_obs
  from public.forge_observations
  where organization_id = p_organization_id
    and id = p_observation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Observation not found.');
  end if;

  if v_obs.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived observations are read-only.');
  end if;

  if v_obs.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This observation changed after you opened it. Refresh before saving.',
      'observation_id', p_observation_id,
      'status', v_obs.status,
      'row_version', v_obs.row_version
    );
  end if;

  v_before := to_jsonb(v_obs);

  update public.forge_observations o
  set
    title = case when v_fields ? 'title' then nullif(v_fields->>'title', '') else o.title end,
    description = case
      when v_fields ? 'description' then nullif(v_fields->>'description', '')
      else o.description
    end,
    observation_type = case
      when v_fields ? 'observation_type' then nullif(v_fields->>'observation_type', '')
      else o.observation_type
    end,
    category_key = case
      when v_fields ? 'category_key' then nullif(v_fields->>'category_key', '')
      else o.category_key
    end,
    work_area = case when v_fields ? 'work_area' then nullif(v_fields->>'work_area', '') else o.work_area end,
    occurred_at = case
      when v_fields ? 'occurred_at' then nullif(v_fields->>'occurred_at', '')::timestamptz
      else o.occurred_at
    end,
    immediate_action = case
      when v_fields ? 'immediate_action' then nullif(v_fields->>'immediate_action', '')
      else o.immediate_action
    end,
    location_id = case
      when v_fields ? 'location_id' then nullif(v_fields->>'location_id', '')::uuid
      else o.location_id
    end,
    division_id = case
      when v_fields ? 'division_id' then nullif(v_fields->>'division_id', '')::uuid
      else o.division_id
    end,
    assigned_to_personnel_id = case
      when v_fields ? 'assigned_to_personnel_id' then nullif(v_fields->>'assigned_to_personnel_id', '')::uuid
      else o.assigned_to_personnel_id
    end,
    assigned_to_user_id = case
      when v_fields ? 'assigned_to_user_id' then nullif(v_fields->>'assigned_to_user_id', '')::uuid
      else o.assigned_to_user_id
    end,
    risk_matrix_id = case
      when v_fields ? 'risk_matrix_id' then nullif(v_fields->>'risk_matrix_id', '')::uuid
      else o.risk_matrix_id
    end,
    risk_matrix_version = case
      when v_fields ? 'risk_matrix_version' then nullif(v_fields->>'risk_matrix_version', '')::integer
      else o.risk_matrix_version
    end,
    initial_likelihood_key = case
      when v_fields ? 'initial_likelihood_key' then nullif(v_fields->>'initial_likelihood_key', '')
      else o.initial_likelihood_key
    end,
    initial_severity_key = case
      when v_fields ? 'initial_severity_key' then nullif(v_fields->>'initial_severity_key', '')
      else o.initial_severity_key
    end,
    initial_risk_score = case
      when v_fields ? 'initial_risk_score' then nullif(v_fields->>'initial_risk_score', '')::integer
      else o.initial_risk_score
    end,
    initial_risk_band_key = case
      when v_fields ? 'initial_risk_band_key' then nullif(v_fields->>'initial_risk_band_key', '')
      else o.initial_risk_band_key
    end,
    closure_summary = case
      when v_fields ? 'closure_summary' then nullif(v_fields->>'closure_summary', '')
      else o.closure_summary
    end,
    custom_data = case
      when v_fields ? 'custom_data' then coalesce(v_fields->'custom_data', '{}'::jsonb)
      else o.custom_data
    end,
    row_version = o.row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  where o.id = p_observation_id
    and o.organization_id = p_organization_id
    and o.row_version = p_expected_row_version;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This observation changed after you opened it. Refresh before saving.',
      'observation_id', p_observation_id
    );
  end if;

  if coalesce(p_fail_after_fields, false) then
    raise exception 'NX02H_FIELD_FORCED_FAILURE';
  end if;

  select * into v_obs
  from public.forge_observations
  where id = p_observation_id
    and organization_id = p_organization_id;

  v_after := to_jsonb(v_obs);

  insert into public.forge_observation_activity (
    organization_id, observation_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_observation_id,
    'updated',
    'Observation details updated.',
    p_actor_user_id,
    jsonb_build_object('row_version', v_obs.row_version)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'observation',
    p_observation_id,
    'updated',
    'Observation details updated.',
    p_actor_user_id,
    jsonb_build_object('row_version', v_obs.row_version)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'observation.updated',
    'observation',
    p_observation_id,
    v_before,
    v_after
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'conflict', false,
    'observation_id', p_observation_id,
    'status', v_obs.status,
    'row_version', v_obs.row_version,
    'activity_id', v_activity_id,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.forge_update_observation_transactionally(
  uuid, uuid, bigint, uuid, jsonb, boolean
) from public;
grant execute on function public.forge_update_observation_transactionally(
  uuid, uuid, bigint, uuid, jsonb, boolean
) to service_role;
