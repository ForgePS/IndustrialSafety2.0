-- NX-02R: active-JSA execution gate + transactional JSA revision creation

-- ---------------------------------------------------------------------------
-- Harden forge_perform_jsa_execution_transition: parent must be ACTIVE revision
-- ---------------------------------------------------------------------------
create or replace function public.forge_perform_jsa_execution_transition(
  p_organization_id uuid,
  p_execution_id uuid,
  p_expected_status text,
  p_to_status text,
  p_actor_user_id uuid,
  p_comment text default null,
  p_patch jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
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
  v_jsa public.forge_jsas%rowtype;
  v_root public.forge_jsas%rowtype;
  v_root_id uuid;
  v_allowed boolean := false;
  v_missing_acks integer := 0;
  v_stop_reason text;
  v_stop_requires_revision boolean;
  v_activity_id bigint;
  v_audit_id bigint;
begin
  if p_organization_id is null or p_execution_id is null or p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'organization_id, execution_id, and actor_user_id are required.');
  end if;

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
      'error', 'Execution status changed. Refresh before continuing.',
      'current_status', v_exec.status
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

  -- Parent JSA must remain the ACTIVE revision for activation (and preferred for briefing).
  select * into v_jsa
  from public.forge_jsas
  where organization_id = p_organization_id
    and id = v_exec.jsa_id
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parent JSA not found for execution.');
  end if;

  if p_to_status in ('briefing', 'active') then
    if v_jsa.status is distinct from 'active' then
      return jsonb_build_object(
        'ok', false,
        'error', 'Parent JSA must be ACTIVE to progress this execution. Current status: ' || v_jsa.status || '.'
      );
    end if;

    v_root_id := coalesce(v_jsa.parent_jsa_id, v_jsa.id);
    select * into v_root
    from public.forge_jsas
    where organization_id = p_organization_id
      and id = v_root_id;

    if found
       and v_root.active_version_id is not null
       and v_root.active_version_id is distinct from v_exec.jsa_id then
      return jsonb_build_object(
        'ok', false,
        'error', 'Parent JSA revision is no longer the active controlled version for this lineage.'
      );
    end if;
  end if;

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

-- ---------------------------------------------------------------------------
-- forge_create_jsa_revision — transactional lineage-aware revision creation
-- ---------------------------------------------------------------------------
create or replace function public.forge_create_jsa_revision(
  p_organization_id uuid,
  p_source_jsa_id uuid,
  p_actor_user_id uuid,
  p_change_summary text default null,
  p_idempotency_key text default null,
  p_fail_after text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.forge_jsas%rowtype;
  v_root_id uuid;
  v_next_version integer;
  v_jsa_number text;
  v_new public.forge_jsas%rowtype;
  v_existing_event_id uuid;
  v_step record;
  v_hazard record;
  v_new_step_id uuid;
  v_new_hazard_id uuid;
  v_step_map jsonb := '{}'::jsonb;
  v_hazard_map jsonb := '{}'::jsonb;
  v_activity_id bigint;
  v_audit_id bigint;
  v_revision_id uuid;
begin
  if p_organization_id is null or p_source_jsa_id is null or p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'organization_id, source_jsa_id, and actor_user_id are required.');
  end if;

  select * into v_source
  from public.forge_jsas
  where organization_id = p_organization_id
    and id = p_source_jsa_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Source JSA not found.');
  end if;

  v_root_id := public.forge_jsa_lineage_root_id(p_source_jsa_id);

  -- Lock the root row for version allocation across the entire lineage.
  perform 1
  from public.forge_jsas
  where organization_id = p_organization_id
    and id = v_root_id
  for update;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select (metadata->>'revision_jsa_id')::uuid into v_existing_event_id
    from public.forge_jsa_activity
    where organization_id = p_organization_id
      and jsa_id = v_root_id
      and activity_type = 'revision_created'
      and metadata->>'idempotency_key' = p_idempotency_key
    order by created_at desc
    limit 1;

    if v_existing_event_id is not null then
      select * into v_new
      from public.forge_jsas
      where organization_id = p_organization_id
        and id = v_existing_event_id;

      if found then
        return jsonb_build_object(
          'ok', true,
          'duplicate', true,
          'jsa_id', v_new.id,
          'version', v_new.version,
          'status', v_new.status,
          'root_jsa_id', v_root_id,
          'jsa_number', v_new.jsa_number
        );
      end if;
    end if;
  end if;

  select coalesce(max(j.version), 0) + 1 into v_next_version
  from public.forge_jsas j
  where j.organization_id = p_organization_id
    and (j.id = v_root_id or j.parent_jsa_id = v_root_id);

  v_jsa_number := public.next_forge_jsa_number(p_organization_id);

  insert into public.forge_jsas (
    organization_id, jsa_number, title, description, job_title, task_name, work_area,
    location_id, division_id, prepared_by_personnel_id, effective_at, review_due_at,
    status, version, parent_jsa_id, is_template, risk_matrix_id, risk_matrix_version,
    created_by, updated_by
  ) values (
    p_organization_id, v_jsa_number, v_source.title, v_source.description, v_source.job_title,
    v_source.task_name, v_source.work_area, v_source.location_id, v_source.division_id,
    v_source.prepared_by_personnel_id, null, v_source.review_due_at,
    'draft', v_next_version, v_root_id, false, v_source.risk_matrix_id, v_source.risk_matrix_version,
    p_actor_user_id, p_actor_user_id
  )
  returning * into v_new;

  if p_fail_after = 'after_jsa_insert' then
    raise exception 'NX02R_FORCED_FAILURE_AFTER_JSA_INSERT';
  end if;

  for v_step in
    select * from public.forge_jsa_steps
    where organization_id = p_organization_id and jsa_id = p_source_jsa_id
    order by sort_order, step_number
  loop
    insert into public.forge_jsa_steps (
      organization_id, jsa_id, step_number, title, description, sort_order, created_by
    ) values (
      p_organization_id, v_new.id, v_step.step_number, v_step.title, v_step.description,
      v_step.sort_order, p_actor_user_id
    )
    returning id into v_new_step_id;

    v_step_map := v_step_map || jsonb_build_object(v_step.id::text, v_new_step_id::text);
  end loop;

  if p_fail_after = 'after_steps' then
    raise exception 'NX02R_FORCED_FAILURE_AFTER_STEPS';
  end if;

  for v_hazard in
    select * from public.forge_jsa_hazards
    where organization_id = p_organization_id and jsa_id = p_source_jsa_id
    order by sort_order, created_at
  loop
    v_new_step_id := nullif(v_step_map->>v_hazard.step_id::text, '')::uuid;
    if v_new_step_id is null then
      continue;
    end if;

    insert into public.forge_jsa_hazards (
      organization_id, jsa_id, step_id, hazard_description, category_key,
      likelihood_key, severity_key, risk_score, risk_band_key,
      residual_likelihood_key, residual_severity_key, residual_score, residual_band_key,
      sort_order, created_by
    ) values (
      p_organization_id, v_new.id, v_new_step_id, v_hazard.hazard_description, v_hazard.category_key,
      v_hazard.likelihood_key, v_hazard.severity_key, v_hazard.risk_score, v_hazard.risk_band_key,
      v_hazard.residual_likelihood_key, v_hazard.residual_severity_key, v_hazard.residual_score,
      v_hazard.residual_band_key, v_hazard.sort_order, p_actor_user_id
    )
    returning id into v_new_hazard_id;

    v_hazard_map := v_hazard_map || jsonb_build_object(v_hazard.id::text, v_new_hazard_id::text);
  end loop;

  if p_fail_after = 'after_hazards' then
    raise exception 'NX02R_FORCED_FAILURE_AFTER_HAZARDS';
  end if;

  insert into public.forge_jsa_controls (
    organization_id, jsa_id, hazard_id, control_type, title, description, sort_order, created_by
  )
  select
    p_organization_id,
    v_new.id,
    nullif(v_hazard_map->>c.hazard_id::text, '')::uuid,
    c.control_type,
    c.title,
    c.description,
    c.sort_order,
    p_actor_user_id
  from public.forge_jsa_controls c
  where c.organization_id = p_organization_id
    and c.jsa_id = p_source_jsa_id
    and nullif(v_hazard_map->>c.hazard_id::text, '') is not null;

  if p_fail_after = 'after_controls' then
    raise exception 'NX02R_FORCED_FAILURE_AFTER_CONTROLS';
  end if;

  insert into public.forge_jsa_ppe_items (
    organization_id, jsa_id, label, required, sort_order, created_by
  )
  select
    p_organization_id, v_new.id, p.label, p.required, p.sort_order, p_actor_user_id
  from public.forge_jsa_ppe_items p
  where p.organization_id = p_organization_id
    and p.jsa_id = p_source_jsa_id;

  insert into public.forge_jsa_training_requirements (
    organization_id, jsa_id, training_course_id, required, created_by
  )
  select
    p_organization_id, v_new.id, t.training_course_id, t.required, p_actor_user_id
  from public.forge_jsa_training_requirements t
  where t.organization_id = p_organization_id
    and t.jsa_id = p_source_jsa_id;

  insert into public.forge_jsa_revisions (
    organization_id, jsa_id, version_jsa_id, version, change_summary, created_by
  ) values (
    p_organization_id, v_root_id, v_new.id, v_next_version,
    nullif(trim(coalesce(p_change_summary, '')), ''), p_actor_user_id
  )
  returning id into v_revision_id;

  if p_fail_after = 'after_lineage' then
    raise exception 'NX02R_FORCED_FAILURE_AFTER_LINEAGE';
  end if;

  insert into public.forge_jsa_activity (
    organization_id, jsa_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    v_new.id,
    'revision_created',
    'Revision v' || v_next_version || ' created as draft from ' || v_source.jsa_number || '.',
    p_actor_user_id,
    jsonb_build_object(
      'source_jsa_id', p_source_jsa_id,
      'root_jsa_id', v_root_id,
      'version', v_next_version,
      'revision_jsa_id', v_new.id,
      'idempotency_key', p_idempotency_key,
      'change_summary', nullif(trim(coalesce(p_change_summary, '')), '')
    )
  )
  returning id into v_activity_id;

  -- Also stamp root for idempotent lookup
  insert into public.forge_jsa_activity (
    organization_id, jsa_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    v_root_id,
    'revision_created',
    'Revision v' || v_next_version || ' registered on lineage.',
    p_actor_user_id,
    jsonb_build_object(
      'source_jsa_id', p_source_jsa_id,
      'root_jsa_id', v_root_id,
      'version', v_next_version,
      'revision_jsa_id', v_new.id,
      'idempotency_key', p_idempotency_key
    )
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'jsa.revision_created',
    'jsa',
    v_new.id,
    jsonb_build_object('source_jsa_id', p_source_jsa_id, 'source_version', v_source.version),
    jsonb_build_object('version', v_next_version, 'status', 'draft', 'root_jsa_id', v_root_id)
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'jsa_id', v_new.id,
    'version', v_next_version,
    'status', v_new.status,
    'root_jsa_id', v_root_id,
    'jsa_number', v_new.jsa_number,
    'revision_id', v_revision_id,
    'activity_id', v_activity_id,
    'audit_id', v_audit_id,
    'row_version', v_new.row_version
  );
end;
$$;

revoke all on function public.forge_create_jsa_revision(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.forge_create_jsa_revision(uuid, uuid, uuid, text, text, text) to service_role;

-- Defense: reject non-draft operational inserts via trigger (seed may set session var)
create or replace function public.forge_jsas_enforce_create_draft()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     and new.status is distinct from 'draft'
     and coalesce(current_setting('forge.allow_non_draft_jsa_insert', true), 'off') <> 'on' then
    raise exception 'Operational JSA inserts must start as draft (got %).', new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_jsas_enforce_create_draft on public.forge_jsas;
create trigger forge_jsas_enforce_create_draft
  before insert on public.forge_jsas
  for each row
  execute function public.forge_jsas_enforce_create_draft();
